import {randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open, lstat, rename, rm} from 'node:fs/promises';
import path from 'node:path';
import {errorCode, type JsonValue} from '../values.js';
import type {RegistryManifest} from './types.js';
import {parseManifest} from './validate.js';
import {transformRegistryIdentity, type GuidePolicy, type IdentityInput} from './identity.js';

const limits = new Map([
  ['skills-map.json', 4 * 1024 * 1024],
  ['skills-manifest.json', 4 * 1024 * 1024],
  ['README.md', 4 * 1024 * 1024],
  ['AGENTS.md', 4 * 1024 * 1024],
]);

export type IdentityFileOptions = {
  guidePolicy?: GuidePolicy;
  /** Trusted test seam. Never populate this from registry data or environment variables. */
  beforeRename?: (completedRenames: number, target: string) => void | Promise<void>;
  /** Trusted test seam for exercising recovery when an individual restore fails. */
  beforeRestore?: (target: string) => void | Promise<void>;
};

type Change = {
  target: string;
  original: Buffer;
  output: Buffer;
  staged?: string;
  backup?: string;
  preserveBackup?: boolean;
};

async function fixedRegularFile(filename: string, maxBytes: number): Promise<Buffer> {
  const info = await lstat(filename);

  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error(`${path.basename(filename)} must be a regular file without links`);
  }

  if (info.size > maxBytes)
    throw new Error(`${path.basename(filename)} exceeds the ${maxBytes}-byte limit`);
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);

  try {
    const opened = await handle.stat();

    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maxBytes ||
      opened.dev !== info.dev ||
      opened.ino !== info.ino
    ) {
      throw new Error(`${path.basename(filename)} changed while being opened`);
    }

    const bytes = Buffer.alloc(opened.size);
    let offset = 0;

    while (offset < bytes.length) {
      const {bytesRead} = await handle.read(bytes, offset, bytes.length - offset, offset);

      if (!bytesRead) throw new Error(`${path.basename(filename)} changed while being read`);
      offset += bytesRead;
    }

    return bytes;
  } finally {
    await handle.close();
  }
}

async function verifySkillPaths(root: string, manifest: RegistryManifest): Promise<void> {
  for (const skill of manifest.skills) {
    const relative = skill.path;
    const parts = relative.split('/');

    if (
      relative.includes('\\') ||
      path.posix.isAbsolute(relative) ||
      parts.some((part) => !part || part === '.' || part === '..') ||
      !relative.startsWith('skills/') ||
      !relative.endsWith('/SKILL.md')
    ) {
      throw new Error(`Unsafe registry path: ${relative}`);
    }

    let current = root;

    for (let index = 0; index < parts.length; index++) {
      current = path.join(current, parts[index]!);
      const info = await lstat(current);
      const final = index === parts.length - 1;

      if (info.isSymbolicLink() || (final ? !info.isFile() : !info.isDirectory())) {
        throw new Error(`Unsafe registry path: ${relative}`);
      }

      if (final && info.nlink !== 1)
        throw new Error(`Linked registry path is not allowed: ${relative}`);
    }
  }
}

async function stage(filename: string, data: Buffer, mode: number): Promise<string> {
  const temporary = `${filename}.nosey-${randomUUID()}.tmp`;
  const handle = await open(temporary, 'wx', mode);

  try {
    await handle.chmod(mode);
    await handle.writeFile(data);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporary, {force: true});
    throw error;
  }

  await handle.close();

  return temporary;
}

/** Reads, validates, stages, and transactionally replaces only the fixed registry identity files. */
export async function configureRegistryIdentityFiles(
  registryRoot: string,
  registryId: string,
  options: IdentityFileOptions = {},
): Promise<{changedFiles: string[]}> {
  const rootInfo = await lstat(registryRoot);

  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
    throw new Error('Registry root must be a real directory');

  const names = ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'];
  const input = new Map<string, Buffer>();

  for (const name of names) {
    const filename = path.join(registryRoot, name);

    try {
      const maxBytes = limits.get(name);

      if (maxBytes === undefined) throw new Error(`No size limit configured for ${name}`);
      input.set(name, await fixedRegularFile(filename, maxBytes));
    } catch (error) {
      if (name === 'AGENTS.md' && errorCode(error) === 'ENOENT') continue;
      throw error;
    }
  }

  const requiredInput = (name: string): Buffer => {
    const bytes = input.get(name);

    if (!bytes) throw new Error(`Missing required file ${name}`);

    return bytes;
  };

  const decodeText = (name: string): string => {
    const bytes = requiredInput(name);
    const text = bytes.toString('utf8');

    if (!Buffer.from(text).equals(bytes)) throw new Error(`${name} must be valid UTF-8`);

    return text;
  };

  const parseJson = (name: string): JsonValue => {
    try {
      // SAFETY: JSON.parse accepts only the JSON value grammar represented by JsonValue.
      return JSON.parse(decodeText(name)) as JsonValue;
    } catch (error) {
      throw new Error(`${name} is not valid JSON: ${String(error)}`);
    }
  };

  const map = parseJson('skills-map.json');
  const manifest = parseJson('skills-manifest.json');
  const parsedManifest = parseManifest(manifest);
  await verifySkillPaths(registryRoot, parsedManifest);

  const transformInput: IdentityInput = {
    map,
    manifest,
    readme: decodeText('README.md'),
    registryId,
  };

  const guideBytes = input.get('AGENTS.md');

  if (guideBytes) transformInput.agentGuide = decodeText('AGENTS.md');

  if (options.guidePolicy) transformInput.guidePolicy = options.guidePolicy;
  const result = transformRegistryIdentity(transformInput);

  const outputText = new Map<string, string>();
  outputText.set('skills-map.json', `${JSON.stringify(result.map, null, 2)}\n`);
  outputText.set('skills-manifest.json', `${JSON.stringify(result.manifest, null, 2)}\n`);
  outputText.set('README.md', result.readme);

  if (result.agentGuide !== undefined) outputText.set('AGENTS.md', result.agentGuide);
  const changes: Change[] = [];

  for (const [name, text] of outputText) {
    const original = requiredInput(name);
    const output = Buffer.from(text);
    const maxBytes = limits.get(name);

    if (maxBytes === undefined) throw new Error(`No size limit configured for ${name}`);

    if (output.length > maxBytes)
      throw new Error(`${name} output exceeds the ${maxBytes}-byte limit`);

    if (!original.equals(output))
      changes.push({target: path.join(registryRoot, name), original, output});
  }

  if (!changes.length) return {changedFiles: []};

  try {
    for (const change of changes) {
      const info = await lstat(change.target);

      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new Error(`${path.basename(change.target)} changed to an unsafe file`);
      change.staged = await stage(change.target, change.output, info.mode & 0o777);
      change.backup = await stage(change.target, change.original, info.mode & 0o777);
    }

    const replaced: Change[] = [];

    try {
      for (const change of changes) {
        await options.beforeRename?.(replaced.length, path.basename(change.target));
        await rename(change.staged!, change.target);
        change.staged = undefined;
        replaced.push(change);
      }
    } catch (error) {
      const restoreFailures: string[] = [];

      for (const change of replaced.reverse()) {
        try {
          await options.beforeRestore?.(path.basename(change.target));
          await rename(change.backup!, change.target);
          change.backup = undefined;
        } catch (restoreError) {
          change.preserveBackup = true;
          restoreFailures.push(
            `${path.basename(change.target)}: ${String(restoreError)} (original preserved at ${change.backup})`,
          );
        }
      }

      if (restoreFailures.length)
        throw new Error(
          `Registry identity update failed: ${String(error)}. Rollback was incomplete; recover these originals manually: ${restoreFailures.join('; ')}`,
        );

      throw error;
    }
  } finally {
    const temporaryFiles: string[] = [];

    for (const change of changes) {
      if (change.staged !== undefined) temporaryFiles.push(change.staged);

      if (change.backup !== undefined && !change.preserveBackup) temporaryFiles.push(change.backup);
    }

    await Promise.all(temporaryFiles.map((file) => rm(file, {force: true})));
  }

  return {changedFiles: changes.map((change) => path.basename(change.target))};
}
