import {
  jsonValueSchema,
  errorCode,
  jsonObjectSchema,
  type JsonObject,
  type JsonValue,
} from '../values.js';
import {z} from 'zod';

import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {setTimeout as delay} from 'node:timers/promises';
import {
  globalConfigPath,
  projectConfigPath,
  parseConfig,
  registryIdentity,
  parseRegistrySource,
  type RegistrySpec,
} from './config.js';
import {loadLocalRegistry} from './load.js';
import {loadGitRegistry, validateSource} from './git.js';
import {mergeRegistries} from './merge.js';
import type {LoadedRegistry} from './types.js';

type ConfigDocument = JsonObject & {registries: JsonValue[]};

export type RegistryScope = 'project' | 'global';

export type RegistryEntry = {
  scope: RegistryScope;
  configPath: string;
  spec: RegistrySpec;
};

function configPath(scope: RegistryScope, root: string): string {
  return scope === 'global' ? globalConfigPath() : projectConfigPath(root);
}

async function readConfig(filename: string): Promise<ConfigDocument> {
  let text: string;

  try {
    text = await fs.readFile(filename, 'utf8');
  } catch (error: unknown) {
    if (errorCode(error) === 'ENOENT') {
      return {schemaVersion: 1, registries: []};
    }

    throw error;
  }

  const document = jsonObjectSchema.parse(JSON.parse(text));
  // Strict parsing prevents a mutation from silently dropping invalid entries.
  parseConfig(document, filename);

  return z
    .object({registries: z.array(jsonValueSchema)})
    .catchall(jsonValueSchema)
    .parse(document);
}

/** Write JSON atomically so a crash never leaves a partial file. */
async function writeJsonFile(filename: string, document: JsonObject): Promise<void> {
  await fs.mkdir(path.dirname(filename), {recursive: true});
  const temporary = filename + '.' + randomUUID() + '.tmp';

  try {
    await fs.writeFile(temporary, JSON.stringify(document, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, {force: true});
  }
}

/** Serialize the whole transaction across both UI calls and CLI processes. */
async function withConfigLock<T>(filename: string, update: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(filename), {recursive: true});
  // Canonicalize the parent so paths through directory symlinks share a lock.
  const parent = await fs.realpath(path.dirname(filename));
  const lockDirectory = path.join(parent, path.basename(filename) + '.lock');
  const deadline = Date.now() + 10_000;

  while (true) {
    try {
      await fs.mkdir(lockDirectory);
      break;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out waiting for registry configuration lock: ${lockDirectory}. If no registry edit is running, remove this lock directory and retry.`,
        );
      }

      await delay(25);
    }
  }

  try {
    return await update();
  } finally {
    await fs.rmdir(lockDirectory);
  }
}

export function commandSource(source: string, ref?: string): RegistrySpec {
  const spec = parseRegistrySource(source);

  if (spec.type === 'git') {
    if (ref !== undefined) spec.ref = ref;
    validateSource(spec);
  } else if (ref !== undefined) {
    throw new Error('--ref requires a Git registry');
  }

  return spec;
}

export async function listRegistries(root: string, globalOnly = false): Promise<RegistryEntry[]> {
  const scopes: RegistryScope[] = globalOnly ? ['global'] : ['global', 'project'];
  const entries: RegistryEntry[] = [];

  for (const scope of scopes) {
    const filename = configPath(scope, root);
    // eslint-disable-next-line no-await-in-loop
    const document = await readConfig(filename);
    entries.push(
      ...parseConfig(document, filename).map(({spec}) => ({
        scope,
        configPath: filename,
        spec,
      })),
    );
  }

  return entries;
}

export async function editRegistry(
  action: 'add' | 'remove',
  source: string,
  options: {root: string; scope: RegistryScope; ref?: string},
): Promise<{changed: boolean; configPath: string}> {
  const spec = commandSource(source, options.ref);
  const filename = configPath(options.scope, options.root);

  return withConfigLock(filename, async () => {
    const document = await readConfig(filename);
    const entries = parseConfig(document, filename);
    const key = registryIdentity(spec);
    const matches = entries.map((entry) => registryIdentity(entry.spec) === key);

    if (action === 'add' && matches.includes(true)) {
      return {changed: false, configPath: filename};
    }

    if (action === 'remove') {
      if (!matches.includes(true)) throw new Error('Registry is not configured in ' + filename);
      document.registries = document.registries.filter((_entry, index) => !matches[index]);
    } else {
      const stored =
        spec.type === 'local'
          ? {
              ...spec,
              path: path.relative(path.dirname(filename), spec.path) || '.',
            }
          : spec;

      document.registries.push(stored);
    }

    await writeJsonFile(filename, document);

    return {changed: true, configPath: filename};
  });
}

/**
 * Mark individual skills in the registry's shared mapping metadata.
 * The map is versioned with the registry, so the marks reach every consumer.
 */
export async function setAlwaysRecommend(
  directory: string,
  skills: readonly string[],
): Promise<void> {
  const root = await fs.realpath(path.resolve(directory));
  const filename = path.join(root, 'skills-map.json');
  await withConfigLock(filename, async () => {
    // Loading first validates both registry files before anything is written.
    const loaded = await loadLocalRegistry(root);

    const available = new Set([
      ...loaded.manifest.skills.map((skill) => skill.id),
      ...(loaded.map.externalSkills ?? []).map((skill) => skill.id),
    ]);

    const requested = [...new Set(skills)];
    const unknown = requested.filter((id) => !available.has(id));

    if (unknown.length > 0) {
      throw new Error('Unknown skill IDs in this registry: ' + unknown.join(', '));
    }

    const document = jsonObjectSchema.parse(JSON.parse(await fs.readFile(filename, 'utf8')));
    document.alwaysRecommend = requested;
    await writeJsonFile(filename, document);
  });
}

export async function showRegistry(source: string, ref?: string): Promise<LoadedRegistry> {
  const spec = commandSource(source, ref);

  if (spec.type === 'local') return loadLocalRegistry(spec.path);
  const result = await loadGitRegistry(spec);

  for (const warning of result.warnings) {
    process.stderr.write('nosey: ' + warning.message + '\n');
  }

  return result.loaded;
}

export async function validateRegistry(directory: string): Promise<LoadedRegistry> {
  const loaded = await loadLocalRegistry(directory);
  const merged = mergeRegistries([loaded]);

  if (merged.warnings.length > 0) {
    throw new Error(merged.warnings.map((warning) => warning.message).join('\n'));
  }

  return loaded;
}

export function registryJson<T>(value: T): string {
  return (
    JSON.stringify(
      value,
      (_key: string, item) =>
        item instanceof RegExp ? {source: item.source, flags: item.flags} : item,
      2,
    ) + '\n'
  );
}
