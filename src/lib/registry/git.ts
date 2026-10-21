import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import type {RegistrySpec} from './config.js';
import {parseManifest, parseMap} from './validate.js';
import type {LoadedRegistry, RegistryWarning} from './types.js';

const runProcess = promisify(execFile);
const defaultTtlHours = 24;
const gitTimeoutMs = 45_000;
type GitSpec = Extract<RegistrySpec, {type: 'git'}>;

type CachedSnapshot = {
	manifest: unknown;
	map: unknown;
	commit: string;
	fetchedAt: number;
};

export type GitSnapshot = {
	loaded: LoadedRegistry;
	commit: string;
};

export type GitFetch = (source: GitSpec) => Promise<GitSnapshot>;
export type GitLoadOptions = {
	cacheDirectory?: string;
	now?: number;
	fetcher?: GitFetch;
};
export type GitLoadResult = {
	loaded: LoadedRegistry;
	warnings: RegistryWarning[];
};

export function validateSource(spec: GitSpec): void {
	if (
		!/^(https:\/\/|ssh:\/\/|git@[^:]+:)/.test(spec.url) ||
		/^https:\/\/[^/]*@/.test(spec.url) ||
		/[\r\n\0]/.test(spec.url)
	) {
		throw new Error('Git registry requires an HTTPS or SSH Git URL');
	}

	if (
		spec.ref !== undefined &&
		(!/^[\w./-]+$/.test(spec.ref) ||
			spec.ref.startsWith('-') ||
			spec.ref.includes('..') ||
			spec.ref.endsWith('/') ||
			spec.ref.includes('@{'))
	) {
		throw new Error('Invalid Git revision');
	}
}

function defaultCacheDirectory(namespace: 'nosey' | 'skillsense' = 'nosey'): string {
	if (process.platform === 'win32') {
		return path.join(
			process.env['LOCALAPPDATA'] ?? os.tmpdir(),
			namespace,
			'registries',
		);
	}

	const homeCache =
		process.platform === 'darwin'
			? path.join(os.homedir(), 'Library', 'Caches')
			: path.join(os.homedir(), '.cache');
	return path.join(
		process.env['XDG_CACHE_HOME'] ?? homeCache,
		namespace,
		'registries',
	);
}

function cacheKey(spec: GitSpec): string {
	return createHash('sha256')
		.update(spec.url + '\n' + (spec.ref ?? 'HEAD'))
		.digest('hex');
}

function safeMessage(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replaceAll(
		/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/g,
		'$1[REDACTED]@',
	);
}

async function git(args: string[], cwd?: string): Promise<string> {
	const env = {...process.env};
	env['GIT_TERMINAL_PROMPT'] = '0';
	env['GIT_CONFIG_NOSYSTEM'] = '1';
	try {
		const {stdout} = await runProcess('git', args, {
			cwd,
			encoding: 'utf8',
			timeout: gitTimeoutMs,
			maxBuffer: 4 * 1024 * 1024,
			env,
		});
		return stdout.trimEnd();
	} catch (error: unknown) {
		throw new Error('Git registry operation failed: ' + safeMessage(error));
	}
}

/** Retrieve Git blobs from a bare repository, without checkout or executing repository files. */
export const fetchGitSnapshot: GitFetch = async source => {
	validateSource(source);
	const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-git-'));
	try {
		await git(['init', '--bare', '--quiet', temporary]);
		const prefix = ['--git-dir=' + temporary];
		await git([
			...prefix,
			'-c',
			'protocol.file.allow=never',
			'fetch',
			'--quiet',
			'--depth=1',
			source.url,
			source.ref ?? 'HEAD',
		]);
		const commit = await git([...prefix, 'rev-parse', 'FETCH_HEAD']);
		const [manifestText, mapText] = await Promise.all([
			git([...prefix, 'show', commit + ':skills-manifest.json']),
			git([...prefix, 'show', commit + ':skills-map.json']),
		]);
		const manifest = parseManifest(JSON.parse(manifestText) as unknown);
		const map = parseMap(JSON.parse(mapText) as unknown);
		if (manifest.registryId !== map.registryId)
			throw new Error('Manifest and map registryId do not match');

		for (const skill of manifest.skills) {
			// Read Git tree metadata, not working-tree paths; symlinks are never followed.
			// eslint-disable-next-line no-await-in-loop
			const entry = await git([...prefix, 'ls-tree', commit, '--', skill.path]);
			if (!/^100(?:644|755) blob [a-f\d]{40,64}\t/.test(entry)) {
				throw new Error(
					'Missing or nonregular skill in Git tree: ' + skill.path,
				);
			}
		}

		return {
			loaded: {
				manifest,
				map,
				source: source.url + '#' + (source.ref ?? 'HEAD'),
			},
			commit,
		};
	} finally {
		await fs.rm(temporary, {force: true, recursive: true});
	}
};

function restore(snapshot: CachedSnapshot, source: string): LoadedRegistry {
	const manifest = parseManifest(snapshot.manifest);
	const map = parseMap(snapshot.map);
	if (manifest.registryId !== map.registryId)
		throw new Error('Cached registryId mismatch');
	if (
		typeof snapshot.commit !== 'string' ||
		!/^[a-f\d]{40,64}$/.test(snapshot.commit) ||
		!Number.isFinite(snapshot.fetchedAt)
	)
		throw new Error('Invalid cached registry metadata');
	return {manifest, map, source};
}

export async function loadGitRegistry(
	spec: GitSpec,
	options: GitLoadOptions = {},
): Promise<GitLoadResult> {
	validateSource(spec);
	const now = options.now ?? Date.now();
	const directory = path.join(
		options.cacheDirectory ?? defaultCacheDirectory(),
		cacheKey(spec),
	);
	const filename = path.join(directory, 'snapshot.json');
	const source = spec.url + '#' + (spec.ref ?? 'HEAD');
	let previous: LoadedRegistry | undefined;
	let fetchedAt = 0;
	// Preserve offline access to SkillSense caches without writing to their paths.
	const filenames = options.cacheDirectory
		? [filename]
		: [filename, path.join(defaultCacheDirectory('skillsense'), cacheKey(spec), 'snapshot.json')];
	for (const candidate of filenames) {
		try {
			// eslint-disable-next-line no-await-in-loop
			const raw = JSON.parse(await fs.readFile(candidate, 'utf8')) as CachedSnapshot;
			previous = restore(raw, source);
			fetchedAt = raw.fetchedAt;
			break;
		} catch {
			// A missing or corrupt entry cannot block a remote refresh.
		}
	}

	const ttl = (spec.refreshHours ?? defaultTtlHours) * 60 * 60 * 1000;
	if (previous && now - fetchedAt >= 0 && now - fetchedAt < ttl) {
		return {loaded: previous, warnings: []};
	}

	try {
		const snapshot = await (options.fetcher ?? fetchGitSnapshot)(spec);
		// Enforce the same on-disk schema for injected/test fetchers as for real Git.
		const jsonMap = JSON.parse(
			JSON.stringify(snapshot.loaded.map, (_key: string, value: unknown) =>
				value instanceof RegExp
					? {source: value.source, flags: value.flags}
					: value,
			),
		) as unknown;
		const validated = restore(
			{
				manifest: snapshot.loaded.manifest,
				map: jsonMap,
				commit: snapshot.commit,
				fetchedAt: now,
			},
			source,
		);
		await fs.mkdir(directory, {recursive: true});
		const temporary = path.join(
			directory,
			'snapshot-' + randomUUID() + '.json',
		);
		try {
			await fs.writeFile(
				temporary,
				JSON.stringify({
					manifest: validated.manifest,
					// Keep regexes as JSON rules; the validated map contains RegExp objects.
					map: jsonMap,
					commit: snapshot.commit,
					fetchedAt: now,
				}) + '\n',
			);
			await fs.rename(temporary, filename);
		} finally {
			await fs.rm(temporary, {force: true});
		}

		return {loaded: validated, warnings: []};
	} catch (error: unknown) {
		if (!previous) throw error;
		return {
			loaded: previous,
			warnings: [
				{
					source,
					message:
						'Remote refresh failed; using cached registry: ' +
						safeMessage(error),
				},
			],
		};
	}
}
