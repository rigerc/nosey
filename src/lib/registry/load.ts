import fs from 'node:fs/promises';
import path from 'node:path';
import {parseManifest, parseMap} from './validate.js';
import type {LoadedRegistry} from './types.js';

function within(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);

  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Only fixed root files are read; registry data cannot select another path. */
export async function readRegistryFile(
  directory: string,
  name: 'registry.json' | 'skills-manifest.json' | 'skills-map.json' | 'README.md',
): Promise<string> {
  const filename = path.join(directory, name);
  const info = await fs.lstat(filename);

  if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) {
    throw new Error('Invalid registry file: ' + name);
  }

  return fs.readFile(filename, 'utf8');
}

export async function loadLocalRegistry(directory: string): Promise<LoadedRegistry> {
  const root = await fs.realpath(path.resolve(directory));

  const [manifestText, mapText] = await Promise.all([
    readRegistryFile(root, 'skills-manifest.json'),
    readRegistryFile(root, 'skills-map.json'),
  ]);

  const manifest = parseManifest(JSON.parse(manifestText));
  const map = parseMap(JSON.parse(mapText));

  if (manifest.registryId !== map.registryId) {
    throw new Error('Manifest and map registryId do not match');
  }

  // Bound filesystem operations even for large manifests.
  for (const skill of manifest.skills) {
    const filename = path.join(root, skill.path);
    // eslint-disable-next-line no-await-in-loop
    const actual = await fs.realpath(filename);

    if (!within(root, actual)) throw new Error('Skill escapes registry: ' + skill.path);
    // eslint-disable-next-line no-await-in-loop
    const info = await fs.lstat(filename);

    if (!info.isFile() || info.isSymbolicLink()) {
      throw new Error('Skill is not a regular file: ' + skill.path);
    }
  }

  return {manifest, map, source: path.resolve(directory)};
}
