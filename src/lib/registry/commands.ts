import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
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
import {parseManifest} from './validate.js';
import type {LoadedRegistry} from './types.js';

const run = promisify(execFile);
const sourceGenerator = fileURLToPath(
  new URL('../../../templates/registry/scripts/generate-manifest.mjs', import.meta.url),
);
const bundledGenerator = fileURLToPath(
  new URL('../templates/registry/scripts/generate-manifest.mjs', import.meta.url),
);
const generator = existsSync(sourceGenerator) ? sourceGenerator : bundledGenerator;

type ConfigDocument = Record<string, unknown> & {registries: unknown[]};
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {schemaVersion: 1, registries: []};
    }

    throw error;
  }

  const document = JSON.parse(text) as unknown;
  // Strict parsing prevents a mutation from silently dropping invalid entries.
  parseConfig(document, filename);
  return document as ConfigDocument;
}

async function writeConfig(filename: string, document: ConfigDocument): Promise<void> {
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
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
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

    await writeConfig(filename, document);
    return {changed: true, configPath: filename};
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
  // The registry.json file is optional for existing hand-authored registries.
  const settingsPath = path.join(directory, 'registry.json');
  try {
    const info = await fs.lstat(settingsPath);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 4 * 1024 * 1024) {
      throw new Error('Invalid registry file: registry.json');
    }

    const settings = JSON.parse(await fs.readFile(settingsPath, 'utf8')) as unknown;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      throw new Error('registry.json must be an object');
    }

    const header = parseManifest({...settings, skills: []});
    if (header.registryId !== loaded.manifest.registryId) {
      throw new Error('registry.json and manifest registryId do not match');
    }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const merged = mergeRegistries([loaded]);
  if (merged.warnings.length > 0) {
    throw new Error(merged.warnings.map((warning) => warning.message).join('\n'));
  }

  return loaded;
}

export async function buildRegistry(directory: string): Promise<string> {
  // Always run the packaged generator, never code from the target registry.
  const {stdout} = await run(process.execPath, [generator], {
    cwd: path.resolve(directory),
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  return stdout;
}

export function registryJson(value: unknown): string {
  return (
    JSON.stringify(
      value,
      (_key: string, item: unknown) =>
        item instanceof RegExp ? {source: item.source, flags: item.flags} : item,
      2,
    ) + '\n'
  );
}
