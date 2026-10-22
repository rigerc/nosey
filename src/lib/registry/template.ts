import {createHash} from 'node:crypto';
import {existsSync, type Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

const sourceTemplate = fileURLToPath(new URL('../../../templates/registry/', import.meta.url));
const bundledTemplate = fileURLToPath(new URL('../templates/registry/', import.meta.url));
export const templateRoot = existsSync(sourceTemplate) ? sourceTemplate : bundledTemplate;

/**
 * Only files maintained by the Nosey template are upgradeable. Registry content,
 * the map, generated manifest, README, and registry settings are never copied.
 */
const managedRoots = [
  '.agnix.toml',
  '.agents/prompts',
  '.github/workflows',
  'scripts',
  'schemas',
];

export type TemplateFile = {path: string; content: Buffer; hash: string; mode: number};

export function hashFile(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function templateVersion(root = templateRoot): Promise<number> {
  const settings = z
    .object({templateVersion: z.number().int().positive()})
    .parse(JSON.parse(await fs.readFile(path.join(root, 'registry.json'), 'utf8')));

  return settings.templateVersion;
}

/** Enumerate only shipped regular files; never dereference template symlinks. */
export async function managedTemplateFiles(root = templateRoot): Promise<TemplateFile[]> {
  const files: TemplateFile[] = [];

  const visit = async (relative: string): Promise<void> => {
    const filename = path.join(root, relative);
    let stat: Stats;

    try {
      stat = await fs.lstat(filename);
    } catch (error: unknown) {
      if (isMissing(error)) return;
      throw error;
    }

    if (stat.isDirectory()) {
      const children = (await fs.readdir(filename)).sort();

      for (const child of children) {
        // eslint-disable-next-line no-await-in-loop
        await visit(path.posix.join(relative, child));
      }

      return;
    }

    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Unsafe registry template entry: ' + relative);
    }

    const content = await fs.readFile(filename);
    files.push({path: relative, content, hash: hashFile(content), mode: stat.mode & 0o777});
  };

  for (const relative of managedRoots) {
    // eslint-disable-next-line no-await-in-loop
    await visit(relative);
  }

  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Record the exact scaffolded file hashes, including custom template fixtures. */
export async function recordTemplateBaseline(directory: string, root = templateRoot): Promise<void> {
  const configPath = path.join(directory, 'registry.json');
  const settings = z
    .object({schemaVersion: z.literal(1), registryId: z.string()})
    .passthrough()
    .parse(JSON.parse(await fs.readFile(configPath, 'utf8')));
  const hashes: Record<string, string> = {};

  for (const file of await managedTemplateFiles(root)) {
    // eslint-disable-next-line no-await-in-loop
    hashes[file.path] = hashFile(await fs.readFile(path.join(directory, file.path)));
  }

  await fs.writeFile(
    configPath,
    JSON.stringify(
      {...settings, templateVersion: await templateVersion(root), templateFiles: hashes},
      null,
      2,
    ) + '\n',
  );
}
