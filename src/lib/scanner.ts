import fs from 'node:fs/promises';
import path from 'node:path';
import {TextCache} from './text-cache.js';

const ignored = new Set([
	'.git',
	'.hg',
	'.svn',
	'node_modules',
	'.pnpm-store',
	'.yarn',
	'.next',
	'.nuxt',
	'.output',
	'.svelte-kit',
	'.astro',
	'.expo',
	'dist',
	'build',
	'coverage',
	'.venv',
	'venv',
	'env',
	'__pycache__',
	'.tox',
	'.mypy_cache',
	'.pytest_cache',
	'.ruff_cache',
	'.gradle',
	'.dart_tool',
	'.terraform',
	'.turbo',
	'.cache',
	'target',
	'vendor',
	'.idea',
	'.vs',
	'Pods',
	'DerivedData',
]);

export type ScanOptions = {
	/** Maximum directory depth to descend into. */
	depth?: number;
	/** Maximum number of files to collect before truncating the walk. */
	maxFiles?: number;
	/** Files larger than this are never read as content. */
	maxReadBytes?: number;
	/** Maximum retained text bytes; zero disables the read cache. */
	maxCacheBytes?: number;
};

export type SkippedFile = {file: string} & (
	| {reason: 'too-large'; sizeBytes: number; limitBytes: number}
	| {reason: 'unreadable' | 'missing'}
);

/** A bounded, read-only view over a project directory. */
export type ProjectTree = {
	root: string;
	files: string[];
	directories: string[];
	read: (relative: string) => Promise<string | undefined>;
	truncated: boolean;
	skippedFiles: SkippedFile[];
};

/** Walk bounded project trees, never following symlinks or scanning dependencies. */
export async function scanProject(
	root = '.',
	{
		depth = 8,
		maxFiles = 20_000,
		maxReadBytes = 512 * 1024,
		maxCacheBytes = 8 * 1024 * 1024,
	}: ScanOptions = {},
): Promise<ProjectTree> {
	const directory = path.resolve(root);
	const stat = await fs.stat(directory);
	if (!stat.isDirectory()) {
		throw new Error(`Not a directory: ${directory}`);
	}

	const files: string[] = [];
	const directories: string[] = [];
	const cache = new TextCache(maxCacheBytes);
	const skippedFiles: SkippedFile[] = [];
	const skipped = new Set<string>();
	const fileSet = new Set<string>();
	let truncated = false;

	// Breadth-first traversal keeps root and workspace manifests ahead of deep data.
	const queue = [{relative: '', level: 0}];
	for (let index = 0; index < queue.length; index++) {
		const current = queue[index];
		if (!current) continue;
		const {relative, level} = current;
		let entries;
		try {
			// eslint-disable-next-line no-await-in-loop
			entries = await fs.readdir(path.join(directory, relative), {
				withFileTypes: true,
			});
		} catch (error: unknown) {
			const {code} = error as NodeJS.ErrnoException;
			if (code === 'EACCES' || code === 'EPERM') {
				skippedFiles.push({file: relative || '.', reason: 'unreadable'});
				continue;
			}

			throw error;
		}

		const priority = (name: string) =>
			/^(?:package\.json|pyproject\.toml|composer\.(?:json|lock)|go\.mod|Cargo\.toml|Gemfile(?:\.lock)?|Pipfile|setup\.cfg|mix\.exs|requirements[-\w.]*\.txt)$/.test(
				name,
			);
		entries.sort(
			(a, b) =>
				Number(priority(b.name)) - Number(priority(a.name)) ||
				a.name.localeCompare(b.name),
		);
		for (const entry of entries) {
			if (entry.isSymbolicLink()) continue;
			const rel = relative ? `${relative}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (ignored.has(entry.name)) continue;
				directories.push(rel);
				if (level < depth) queue.push({relative: rel, level: level + 1});
				else truncated = true;
			} else if (entry.isFile()) {
				if (files.length >= maxFiles) {
					truncated = true;
					continue;
				}

				files.push(rel);
				fileSet.add(rel);
			}
		}

		if (files.length >= maxFiles && index + 1 < queue.length) {
			truncated = true;
			break;
		}
	}

	async function read(relative: string): Promise<string | undefined> {
		const cached = cache.get(relative);
		if (cached !== undefined) return cached;
		if (skipped.has(relative)) return undefined;
		if (!fileSet.has(relative)) return undefined;

		const full = path.join(directory, relative);
		try {
			const fileStat = await fs.stat(full);
			if (fileStat.size > maxReadBytes) {
				skipped.add(relative);
				skippedFiles.push({
					file: relative,
					reason: 'too-large',
					sizeBytes: fileStat.size,
					limitBytes: maxReadBytes,
				});
				return undefined;
			}

			const content = await fs.readFile(full, 'utf8');
			cache.set(relative, content);
			return content;
		} catch (error: unknown) {
			const {code} = error as NodeJS.ErrnoException;
			if (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT') {
				skipped.add(relative);
				skippedFiles.push({
					file: relative,
					reason: code === 'ENOENT' ? 'missing' : 'unreadable',
				});
				return undefined;
			}

			throw error;
		}
	}

	return {root: directory, files, directories, read, truncated, skippedFiles};
}

/** A path matches when it is identical to, or ends with, the requested path. */
export function matchesPath(actual: string, requested: string): boolean {
	return actual === requested || actual.endsWith(`/${requested}`);
}
