import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import {test, expect} from 'vite-plus/test';
import {validateRegistry} from '../src/lib/registry/commands.js';
import {scaffoldRegistry} from '../src/lib/registry/init.js';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {templateDirectory} from './helpers/registry-template.js';

const exec = promisify(execFile);

async function inTemporary(run: (directory: string) => Promise<void>): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-template-contract-'));

  try {
    await run(root);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

async function templateCommand(directory: string, filename: string, ...args: string[]) {
  return exec(process.execPath, ['scripts/' + filename, ...args], {
    cwd: directory,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
}

test('standalone template generator and Nosey agree on nested skills', async () => {
  await inTemporary(async (root) => {
    await fs.cp(templateDirectory, root, {recursive: true});
    const folder = path.join(root, 'skills/nested/review');
    await fs.mkdir(folder, {recursive: true});
    await fs.writeFile(
      path.join(folder, 'SKILL.md'),
      [
        '---',
        'name: review',
        'description: >',
        '  Review project code',
        '  for correctness.',
        '---',
        '',
        '# Review',
      ].join('\n'),
    );

    const mapFile = path.join(root, 'skills-map.json');
    const map = JSON.parse(await fs.readFile(mapFile, 'utf8'));
    map.technologySkills = [
      {technologyId: 'react', skills: ['example/agent-skills/nested/review']},
    ];
    await fs.writeFile(mapFile, JSON.stringify(map, null, 2) + '\n');

    await templateCommand(root, 'generate-manifest.mjs');
    await templateCommand(root, 'generate-readme.mjs');
    await templateCommand(root, 'generate-manifest.mjs', '--check');
    await templateCommand(root, 'generate-readme.mjs', '--check');
    await templateCommand(root, 'validate-registry.mjs');

    const local = await loadLocalRegistry(root);
    const validated = await validateRegistry(root);

    expect(local.manifest.skills).toEqual([
      {
        id: 'example/agent-skills/nested/review',
        name: 'review',
        path: 'skills/nested/review/SKILL.md',
        description: 'Review project code for correctness.',
      },
    ]);
    expect(validated.manifest.skills).toEqual(local.manifest.skills);
    expect(local.map.technologySkills[0]?.skills).toEqual(['example/agent-skills/nested/review']);
    expect(await fs.readFile(path.join(root, 'README.md'), 'utf8')).toContain(
      'Review project code for correctness.',
    );
  });
});

test('template generator checks freshness without modifying a stale manifest', async () => {
  await inTemporary(async (root) => {
    await fs.cp(templateDirectory, root, {recursive: true});
    const folder = path.join(root, 'skills/review');
    await fs.mkdir(folder, {recursive: true});
    await fs.writeFile(
      path.join(folder, 'SKILL.md'),
      '---\nname: review\ndescription: Review code.\n---\n',
    );

    const before = await fs.readFile(path.join(root, 'skills-manifest.json'), 'utf8');
    await expect(templateCommand(root, 'generate-manifest.mjs', '--check')).rejects.toThrow();
    expect(await fs.readFile(path.join(root, 'skills-manifest.json'), 'utf8')).toBe(before);

    await templateCommand(root, 'generate-manifest.mjs');
    await templateCommand(root, 'generate-manifest.mjs', '--check');
    await templateCommand(root, 'validate-registry.mjs');
  });
});

test('template validator and Nosey both reject unknown recommendations', async () => {
  await inTemporary(async (root) => {
    await fs.cp(templateDirectory, root, {recursive: true});
    const filename = path.join(root, 'skills-map.json');
    const map = JSON.parse(await fs.readFile(filename, 'utf8'));
    map.alwaysRecommend = ['example/agent-skills/missing'];
    await fs.writeFile(filename, JSON.stringify(map, null, 2) + '\n');

    await expect(templateCommand(root, 'validate-registry.mjs')).rejects.toThrow();
    await expect(validateRegistry(root)).rejects.toThrow(/unknown skill|not declared in registry/i);
  });
});

test('Nosey scaffold preserves template provenance and update workflows', async () => {
  await inTemporary(async (parent) => {
    const registry = path.join(parent, 'generated');
    const stateFile = path.join('.template', 'state.json');
    const before = await fs.readFile(path.join(templateDirectory, stateFile), 'utf8');
    await scaffoldRegistry(registry, 'acme/integration', templateDirectory);
    const after = await fs.readFile(path.join(registry, stateFile), 'utf8');

    expect(after).toBe(before);
    expect(JSON.parse(after)).toMatchObject({
      schemaVersion: 1,
      source: 'rigerc/nosey-registry-template',
    });

    for (const filename of [
      '.github/workflows/registry-ci.yml',
      '.github/workflows/template-sync.yml',
      'scripts/template-update.mjs',
      'scripts/validate-registry.mjs',
    ]) {
      expect((await fs.stat(path.join(registry, filename))).isFile()).toBe(true);
    }

    await templateCommand(registry, 'generate-manifest.mjs', '--check');
    await templateCommand(registry, 'generate-readme.mjs', '--check');
    await templateCommand(registry, 'validate-registry.mjs');

    const loaded = await validateRegistry(registry);
    expect(loaded.manifest.registryId).toBe('acme/integration');
    expect(loaded.map.registryId).toBe('acme/integration');
    expect(loaded.manifest.skills).toEqual([]);
  });
});
