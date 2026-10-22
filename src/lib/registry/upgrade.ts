import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {loadLocalRegistry} from './load.js';
import {
  hashFile,
  isMissing,
  managedTemplateFiles,
  templateRoot,
  templateVersion,
  type TemplateFile,
} from './template.js';

export type UpgradeAction = 'added' | 'updated' | 'unchanged' | 'skipped';
export type UpgradeEntry = {path: string; action: UpgradeAction; reason?: string};

export type UpgradeResult = {
  directory: string;
  fromVersion: number | null;
  targetVersion: number;
  dryRun: boolean;
  complete: boolean;
  files: UpgradeEntry[];
};

type PlannedFile = UpgradeEntry & {
  content: Buffer;
  originalHash?: string;
};

/**
 * Inspect a path one component at a time. A managed file or its parent must
 * never be a symlink, even if it would resolve inside the registry.
 */
async function readManagedFile(root: string, relative: string): Promise<Buffer | undefined> {
  const parts = relative.split('/');
  let current = root;

  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;

    try {
      // eslint-disable-next-line no-await-in-loop
      stat = await fs.lstat(current);
    } catch (error: unknown) {
      if (isMissing(error)) return undefined;
      throw error;
    }

    if (stat.isSymbolicLink()) throw new Error('Template path is a symlink: ' + relative);

    if (index !== parts.length - 1 && !stat.isDirectory()) {
      throw new Error('Template parent is not a directory: ' + relative);
    }

    if (index === parts.length - 1 && !stat.isFile()) {
      throw new Error('Template target is not a regular file: ' + relative);
    }
  }

  return fs.readFile(current);
}

function planFile(file: TemplateFile, current: Buffer | undefined, baseline?: string): PlannedFile {
  if (current && hashFile(current) === file.hash) {
    return {path: file.path, content: file.content, action: 'unchanged'};
  }

  if (!current && baseline) {
    return {
      path: file.path,
      content: file.content,
      action: 'skipped',
      reason: 'previously managed file was removed locally',
    };
  }

  if (!current) {
    return {path: file.path, content: file.content, action: 'added'};
  }

  const originalHash = hashFile(current);

  if (baseline && originalHash === baseline) {
    return {path: file.path, content: file.content, originalHash, action: 'updated'};
  }

  return {
    path: file.path,
    content: file.content,
    originalHash,
    action: 'skipped',
    reason: baseline ? 'locally modified' : 'unknown original version',
  };
}

async function atomicReplace(filename: string, content: Buffer): Promise<void> {
  const temporary = filename + '.' + randomUUID() + '.tmp';

  try {
    await fs.writeFile(temporary, content, {flag: 'wx', mode: 0o600});
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, {force: true});
  }
}

/**
 * Upgrade template-maintained files only. Without a recorded baseline, existing
 * differing files are never overwritten, including in pre-versioned registries.
 * No registry content, generated files or README prose is changed.
 */
export async function upgradeRegistry(
  directory: string,
  options: {dryRun?: boolean; templateDirectory?: string} = {},
): Promise<UpgradeResult> {
  const root = await fs.realpath(path.resolve(directory));
  const registry = await loadLocalRegistry(root);
  const settingsPath = path.join(root, 'registry.json');
  const settingsInfo = await fs.lstat(settingsPath);

  if (!settingsInfo.isFile() || settingsInfo.isSymbolicLink())
    throw new Error('registry.json must be a regular file');

  const settings = z
    .object({
      schemaVersion: z.literal(1),
      registryId: z.string(),
      templateVersion: z.number().int().positive().optional(),
      templateFiles: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
    })
    .passthrough()
    .parse(JSON.parse(await fs.readFile(settingsPath, 'utf8')));

  if (settings.registryId !== registry.manifest.registryId)
    throw new Error('registry.json and manifest registryId do not match');

  const source = options.templateDirectory ?? templateRoot;
  const latest = await templateVersion(source);

  if (settings.templateVersion !== undefined && settings.templateVersion > latest) {
    throw new Error('Registry template is newer than bundled template; refusing downgrade');
  }

  const template = await managedTemplateFiles(source);
  const baseline = settings.templateFiles ?? {};
  const planned: PlannedFile[] = [];

  // Determine every change before writing anything, including unsafe paths.
  for (const file of template) {
    // eslint-disable-next-line no-await-in-loop
    const current = await readManagedFile(root, file.path);
    planned.push(planFile(file, current, baseline[file.path]));
  }

  const result: UpgradeResult = {
    directory: root,
    fromVersion: settings.templateVersion ?? null,
    targetVersion: latest,
    dryRun: Boolean(options.dryRun),
    complete: planned.every((item) => item.action !== 'skipped'),
    files: planned.map(({path: filename, action, reason}) => ({
      path: filename,
      action,
      ...(reason ? {reason} : {}),
    })),
  };

  if (options.dryRun) return result;

  const hashes = {...baseline};

  for (const file of planned) {
    if (file.action === 'skipped') continue;

    if (file.action === 'unchanged') {
      hashes[file.path] = hashFile(file.content);
      continue;
    }

    // Recheck before each write to avoid trampling concurrent edits.
    // eslint-disable-next-line no-await-in-loop
    const current = await readManagedFile(root, file.path);

    if (file.action === 'added') {
      if (current) throw new Error('Template target appeared during upgrade: ' + file.path);
      // eslint-disable-next-line no-await-in-loop
      await fs.mkdir(path.dirname(path.join(root, file.path)), {recursive: true});
      // eslint-disable-next-line no-await-in-loop
      await fs.writeFile(path.join(root, file.path), file.content, {flag: 'wx'});
    } else {
      if (!current || hashFile(current) !== file.originalHash) {
        throw new Error('Template target changed during upgrade: ' + file.path);
      }

      // eslint-disable-next-line no-await-in-loop
      await atomicReplace(path.join(root, file.path), file.content);
    }

    hashes[file.path] = hashFile(file.content);
  }

  // Never report the new version as fully installed while conflicts remain.
  const updatedSettings = {
    ...settings,
    ...(result.complete ? {templateVersion: latest} : {}),
    templateFiles: hashes,
  };

  if (JSON.stringify(updatedSettings) !== JSON.stringify(settings)) {
    await atomicReplace(
      settingsPath,
      Buffer.from(JSON.stringify(updatedSettings, null, 2) + '\n'),
    );
  }

  return result;
}
