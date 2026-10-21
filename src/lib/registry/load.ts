import fs from 'node:fs/promises';
import path from 'node:path';
import {parseManifest, parseMap} from './validate.js';
import type {LoadedRegistry} from './types.js';

function within(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative !== '..' &&
		!relative.startsWith('..' + path.sep) &&
		!path.isAbsolute(relative)
	);
}

export async function loadLocalRegistry(
	directory: string,
): Promise<LoadedRegistry> {
	const root = await fs.realpath(path.resolve(directory));
	for (const name of ['skills-manifest.json', 'skills-map.json']) {
		// Registry metadata must be regular files and reasonably sized.
		// eslint-disable-next-line no-await-in-loop
		const info = await fs.lstat(path.join(root, name));
		if (
			!info.isFile() ||
			info.isSymbolicLink() ||
			info.size > 4 * 1024 * 1024
		) {
			throw new Error('Invalid registry file: ' + name);
		}
	}

	const [manifestText, mapText] = await Promise.all([
		fs.readFile(path.join(root, 'skills-manifest.json'), 'utf8'),
		fs.readFile(path.join(root, 'skills-map.json'), 'utf8'),
	]);
	const manifest = parseManifest(JSON.parse(manifestText) as unknown);
	const map = parseMap(JSON.parse(mapText) as unknown);
	if (manifest.registryId !== map.registryId) {
		throw new Error('Manifest and map registryId do not match');
	}

	// Bound filesystem operations even for large manifests.
	for (const skill of manifest.skills) {
		const filename = path.join(root, skill.path);
		// eslint-disable-next-line no-await-in-loop
		const actual = await fs.realpath(filename);
		if (!within(root, actual))
			throw new Error('Skill escapes registry: ' + skill.path);
		// eslint-disable-next-line no-await-in-loop
		const info = await fs.lstat(filename);
		if (!info.isFile() || info.isSymbolicLink()) {
			throw new Error('Skill is not a regular file: ' + skill.path);
		}
	}

	return {manifest, map, source: path.resolve(directory)};
}
