import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {expect, test} from 'vite-plus/test';
import {z} from 'zod';
import {scaffoldRegistry} from '../src/lib/registry/init.js';
import {hashFile, templateRoot} from '../src/lib/registry/template.js';
import {upgradeRegistry} from '../src/lib/registry/upgrade.js';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

async function fixture<T>(run: (root: string, registry: string) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-registry-upgrade-'));

  try {
    const registry = path.join(root, 'registry');
    await scaffoldRegistry(registry, 'acme/team-skills');

    return await run(root, registry);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

const settingsSchema = z
  .object({
    registryId: z.string(),
    templateVersion: z.number().optional(),
    templateFiles: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

async function settingsOf(registry: string) {
  return settingsSchema.parse(
    JSON.parse(await fs.readFile(path.join(registry, 'registry.json'), 'utf8')),
  );
}

async function nextTemplate(root: string): Promise<string> {
  const latest = path.join(root, 'next-template');
  await fs.cp(templateRoot, latest, {recursive: true});
  const settings = await settingsOf(latest);
  await fs.writeFile(
    path.join(latest, 'registry.json'),
    JSON.stringify({...settings, templateVersion: 2}, null, 2) + '\n',
  );

  return latest;
}

test('init records a template version and exact hashes for owned files', async () => {
  await fixture(async (_root, registry) => {
    const settings = await settingsOf(registry);
    const tracked = settings.templateFiles ?? {};

    expect(settings['templateVersion']).toBe(1);
    expect(tracked['scripts/generate-manifest.mjs']).toBe(
      hashFile(await fs.readFile(path.join(registry, 'scripts/generate-manifest.mjs'))),
    );
    expect(tracked['scripts/generate-readme.mjs']).toMatch(/^[a-f0-9]{64}$/);
    expect(tracked['schemas/skills-map.schema.json']).toMatch(/^[a-f0-9]{64}$/);
    expect(tracked['.github/workflows/agnix.yml']).toMatch(/^[a-f0-9]{64}$/);
    expect(tracked['.agents/prompts/fix-skills-using-agnix.md']).toMatch(/^[a-f0-9]{64}$/);
    expect(tracked['skills-map.json']).toBeUndefined();
    expect(tracked['README.md']).toBeUndefined();
  });
});

test('upgrade previews and replaces only untouched files, while retaining registry content', async () => {
  await fixture(async (root, registry) => {
    const template = await nextTemplate(root);
    const script = 'scripts/generate-readme.mjs';
    const customized = 'scripts/generate-manifest.mjs';
    const newFile = '.github/workflows/new-template-job.yml';
    const customText = '// local change: preserve this script\n';
    const mapBefore = await fs.readFile(path.join(registry, 'skills-map.json'));
    const readmeBefore = await fs.readFile(path.join(registry, 'README.md'));

    await fs.writeFile(path.join(registry, customized), customText);
    await fs.writeFile(path.join(template, script), '// new upstream version\n');
    await fs.writeFile(path.join(template, customized), '// replaced upstream version\n');
    await fs.writeFile(path.join(template, newFile), 'name: new-template-job\n');

    const config = await settingsOf(registry);
    await fs.writeFile(
      path.join(registry, 'registry.json'),
      JSON.stringify({...config, customProperty: {retained: true}}, null, 2) + '\n',
    );

    const before = await fs.readFile(path.join(registry, 'registry.json'));
    const dryRun = await upgradeRegistry(registry, {templateDirectory: template, dryRun: true});

    expect(dryRun.fromVersion).toBe(1);
    expect(dryRun.targetVersion).toBe(2);
    expect(dryRun.files).toContainEqual({path: script, action: 'updated'});
    expect(dryRun.files).toContainEqual({path: newFile, action: 'added'});
    expect(dryRun.files).toContainEqual({
      path: customized,
      action: 'skipped',
      reason: 'locally modified',
    });
    expect(await fs.readFile(path.join(registry, 'registry.json'))).toEqual(before);
    await expect(fs.stat(path.join(registry, newFile))).rejects.toMatchObject({code: 'ENOENT'});

    const applied = await upgradeRegistry(registry, {templateDirectory: template});
    expect(applied.complete).toBe(false);
    expect(await fs.readFile(path.join(registry, script), 'utf8')).toBe(
      '// new upstream version\n',
    );
    expect(await fs.readFile(path.join(registry, customized), 'utf8')).toBe(customText);
    expect(await fs.readFile(path.join(registry, newFile), 'utf8')).toBe(
      'name: new-template-job\n',
    );
    expect(await fs.readFile(path.join(registry, 'skills-map.json'))).toEqual(mapBefore);
    expect(await fs.readFile(path.join(registry, 'README.md'))).toEqual(readmeBefore);

    const after = await settingsOf(registry);
    expect(after['customProperty']).toEqual({retained: true});
    expect(after['templateVersion']).toBe(1);
    expect(after.templateFiles?.[script]).toBe(
      hashFile(Buffer.from('// new upstream version\n')),
    );

    const rerun = await upgradeRegistry(registry, {templateDirectory: template});
    expect(rerun.files.find((file) => file.path === script)?.action).toBe('unchanged');
    expect(rerun.files.find((file) => file.path === newFile)?.action).toBe('unchanged');

    // Manually resolve the conflict and rerun; the release is then marked current.
    await fs.writeFile(path.join(registry, customized), '// replaced upstream version\n');
    const resolved = await upgradeRegistry(registry, {templateDirectory: template});
    expect(resolved.complete).toBe(true);
    expect((await settingsOf(registry))['templateVersion']).toBe(2);
  });
});

test('legacy registries add missing files but never overwrite untracked scripts', async () => {
  await fixture(async (root, registry) => {
    const template = await nextTemplate(root);
    const settings = await settingsOf(registry);
    delete settings['templateVersion'];
    delete settings['templateFiles'];
    await fs.writeFile(
      path.join(registry, 'registry.json'),
      JSON.stringify(settings, null, 2) + '\n',
    );
    await fs.writeFile(path.join(registry, 'scripts/generate-readme.mjs'), '// legacy changes\n');
    await fs.writeFile(path.join(template, '.github/workflows/added.yml'), 'name: added\n');

    const result = await upgradeRegistry(registry, {templateDirectory: template});
    expect(result.fromVersion).toBe(null);
    expect(result.complete).toBe(false);
    expect(result.files).toContainEqual({
      path: 'scripts/generate-readme.mjs',
      action: 'skipped',
      reason: 'unknown original version',
    });
    expect(await fs.readFile(path.join(registry, 'scripts/generate-readme.mjs'), 'utf8')).toBe(
      '// legacy changes\n',
    );
    expect(await fs.readFile(path.join(registry, '.github/workflows/added.yml'), 'utf8')).toBe(
      'name: added\n',
    );
    expect((await settingsOf(registry))['templateVersion']).toBeUndefined();
  });
});

test('deleted managed files are not silently restored', async () => {
  await fixture(async (_root, registry) => {
    const relative = '.agents/prompts/fix-skills-using-agnix.md';
    await fs.rm(path.join(registry, relative));
    const result = await upgradeRegistry(registry);
    expect(result.complete).toBe(false);
    expect(result.files).toContainEqual({
      path: relative,
      action: 'skipped',
      reason: 'previously managed file was removed locally',
    });
    await expect(fs.stat(path.join(registry, relative))).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('unsafe symlinks abort the entire upgrade before writes', async () => {
  await fixture(async (root, registry) => {
    const target = path.join(root, 'outside');
    await fs.mkdir(target);
    await fs.rm(path.join(registry, '.agents/prompts'), {recursive: true});
    await fs.symlink(target, path.join(registry, '.agents/prompts'), 'dir');
    const configBefore = await fs.readFile(path.join(registry, 'registry.json'));

    await expect(upgradeRegistry(registry)).rejects.toThrow(/symlink/);
    expect(await fs.readFile(path.join(registry, 'registry.json'))).toEqual(configBefore);
    expect(await fs.readdir(target)).toEqual([]);
  });
});

test('upgrade CLI supports JSON dry-run with no writes', async () => {
  await fixture(async (_root, registry) => {
    const before = await fs.readFile(path.join(registry, 'registry.json'));

    const {stdout} = await execute(process.execPath, [
      '--import',
      'tsx',
      cli,
      'registry',
      'upgrade',
      registry,
      '--dry-run',
      '--json',
    ]);

    const output = JSON.parse(stdout);
    expect(output).toMatchObject({
      directory: registry,
      fromVersion: 1,
      targetVersion: 1,
      dryRun: true,
      complete: true,
    });
    expect(await fs.readFile(path.join(registry, 'registry.json'))).toEqual(before);
  });
});
