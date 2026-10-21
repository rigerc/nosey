import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {test, expect} from 'vite-plus/test';
import {scaffoldRegistry} from '../src/lib/registry/init.js';
import {
  buildRegistry,
  editRegistry,
  setAlwaysRecommend,
  type RegistryEntry,
} from '../src/lib/registry/commands.js';
import type {LoadedRegistry} from '../src/lib/registry/types.js';

const exec = promisify(execFile);
const tsx = import.meta.resolve('tsx');
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

type CommandError = Error & {code: number; stdout: string; stderr: string};
type CommandResult = {stdout: string; stderr: string};

async function fixture<T>(
  run: (context: {
    root: string;
    registry: string;
    projectConfig: string;
    globalConfig: string;
    cacheDirectory: string;
    command: (...args: string[]) => Promise<CommandResult>;
  }) => Promise<T>,
): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-commands-'));
  const registry = path.join(root, 'team-skills');
  const configHome = path.join(root, 'config');
  try {
    await scaffoldRegistry(registry, 'acme/skills');
    return await run({
      root,
      registry,
      projectConfig: path.join(root, '.nosey.json'),
      globalConfig: path.join(configHome, 'nosey/registries.json'),
      cacheDirectory: path.join(root, 'cache/skillsense/registries'),
      async command(...args) {
        const {stdout, stderr} = await exec(process.execPath, ['--import', tsx, cli, ...args], {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            XDG_CONFIG_HOME: configHome,
            APPDATA: configHome,
            XDG_CACHE_HOME: path.join(root, 'cache'),
            LOCALAPPDATA: path.join(root, 'cache'),
          },
        });
        return {stdout, stderr};
      },
    });
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

async function jsonFile(filename: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(filename, 'utf8')) as Record<string, unknown>;
}

test('add is idempotent, preserves unrelated settings and stores relative local paths', async () => {
  await fixture(async ({command, projectConfig, registry}) => {
    const original = {schemaVersion: 1, registries: [], other: {keep: true}};
    await fs.writeFile(projectConfig, JSON.stringify(original));
    await command('registry', 'add', './team-skills');
    const {stdout} = await command('registry', 'add', registry);
    expect(stdout).toMatch(/already configured/);
    expect(await jsonFile(projectConfig)).toStrictEqual({
      ...original,
      registries: [{type: 'local', path: 'team-skills'}],
    });
    const scan = await command('.', '--json', '--no-frontend-bonus');
    expect(scan.stderr.includes('registry warning')).toBe(false);
  });
});

test('concurrent configuration edits preserve every successful change', async () => {
  await fixture(async ({root, projectConfig}) => {
    const sources = Array.from({length: 10}, (_, index) => path.join(root, 'registry-' + index));
    const options = {root, scope: 'project' as const};
    await Promise.all(sources.map((source) => editRegistry('add', source, options)));
    const added = await jsonFile(projectConfig);
    expect((added.registries as unknown[]).length).toBe(sources.length);
    await Promise.all(sources.map((source) => editRegistry('remove', source, options)));
    expect((await jsonFile(projectConfig)).registries).toStrictEqual([]);
    expect(
      (await fs.readdir(root)).filter((name) => name.endsWith('.lock') || name.endsWith('.tmp')),
    ).toStrictEqual([]);
  });
});

test('configuration locks are released after errors and idempotent edits', async () => {
  await fixture(async ({root, registry, projectConfig}) => {
    const options = {root, scope: 'project' as const};
    const lock = projectConfig + '.lock';
    await fs.writeFile(projectConfig, '{invalid');
    await expect(editRegistry('add', registry, options)).rejects.toThrow();
    await expect(fs.stat(lock)).rejects.toMatchObject({code: 'ENOENT'});
    await fs.rm(projectConfig);
    await editRegistry('add', registry, options);
    const duplicates = await Promise.all(
      Array.from({length: 4}, () => editRegistry('add', registry, options)),
    );
    expect(duplicates.every((result) => !result.changed)).toBe(true);
    expect((await jsonFile(projectConfig)).registries).toHaveLength(1);
    await editRegistry('remove', registry, options);
    await expect(editRegistry('remove', registry, options)).rejects.toThrow(/not configured/);
    await expect(fs.stat(lock)).rejects.toMatchObject({code: 'ENOENT'});
    await editRegistry('add', registry, options);
    expect((await jsonFile(projectConfig)).registries).toHaveLength(1);
  });
});

test('separate CLI processes preserve simultaneous configuration updates', async () => {
  await fixture(async ({command, projectConfig}) => {
    await fs.writeFile(
      projectConfig,
      JSON.stringify({schemaVersion: 1, registries: [], keep: true}),
    );
    const sources = Array.from({length: 6}, (_, index) => './registry-' + index);
    await Promise.all(sources.map((source) => command('registry', 'add', source)));
    const document = await jsonFile(projectConfig);
    expect(document.keep).toBe(true);
    expect(
      (document.registries as Array<{path: string}>).map((entry) => entry.path).sort(),
    ).toStrictEqual(sources.map((source) => source.slice(2)).sort());
    await Promise.all(sources.map((source) => command('registry', 'remove', source)));
    expect((await jsonFile(projectConfig)).registries).toStrictEqual([]);
  });
});

test('build refuses symlink manifests without overwriting their targets', async () => {
  await fixture(async ({command, root, registry}) => {
    const outside = path.join(root, 'outside.json');
    const manifest = path.join(registry, 'skills-manifest.json');
    await fs.writeFile(outside, 'keep this file');
    await fs.rm(manifest);
    await fs.symlink(outside, manifest);
    await expect(command('registry', 'build', registry)).rejects.toThrow(/regular file/);
    expect(await fs.readFile(outside, 'utf8')).toBe('keep this file');
    expect((await fs.lstat(manifest)).isSymbolicLink()).toBe(true);
  });
});

test('list includes both scopes and refs, --global lists only global entries without fetching', async () => {
  await fixture(async ({command, projectConfig, globalConfig, registry}) => {
    const remote = 'https://example.invalid/team/skills.git';
    await command('registry', 'add', remote, '--global', '--ref', 'v1');
    await command('registry', 'add', registry);
    const {stdout} = await command('registry', 'list', '--json');
    const {registries} = JSON.parse(stdout) as {registries: RegistryEntry[]};
    expect(registries).toStrictEqual([
      {
        scope: 'global',
        configPath: globalConfig,
        spec: {type: 'git', url: remote, ref: 'v1'},
      },
      {
        scope: 'project',
        configPath: projectConfig,
        spec: {type: 'local', path: registry},
      },
    ]);
    const global = await command('registry', 'list', '--global', '--json');
    expect((JSON.parse(global.stdout) as {registries: unknown[]}).registries.length).toBe(1);
    const human = await command('registry', 'list');
    expect(human.stdout).toMatch(/\[global].*#v1/);
    expect(human.stdout).toMatch(/\[project]/);
  });
});

test('empty list has readable text and structured JSON', async () => {
  await fixture(async ({command}) => {
    const human = await command('registry', 'list');
    const json = await command('registry', 'list', '--json');
    expect(human.stdout).toMatch(/No registries configured/);
    expect(JSON.parse(json.stdout)).toStrictEqual({registries: []});
  });
});

test('remove changes only the selected scope and preserves files and unrelated settings', async () => {
  await fixture(async ({command, projectConfig, globalConfig, registry}) => {
    await fs.writeFile(
      projectConfig,
      JSON.stringify({schemaVersion: 1, registries: [], keep: 'yes'}),
    );
    await command('registry', 'add', registry);
    await command('registry', 'add', registry, '--global');
    await command('registry', 'remove', './team-skills');
    expect(await jsonFile(projectConfig)).toStrictEqual({
      schemaVersion: 1,
      registries: [],
      keep: 'yes',
    });
    const global = await jsonFile(globalConfig);
    expect((global['registries'] as unknown[]).length).toBe(1);
    const manifest = await fs.stat(path.join(registry, 'skills-manifest.json'));
    expect(manifest.isFile()).toBe(true);
    await command('registry', 'remove', registry, '--global');
    const remaining = await jsonFile(globalConfig);
    expect(remaining['registries']).toStrictEqual([]);
    const before = await fs.readFile(projectConfig, 'utf8');
    await expect(command('registry', 'remove', registry)).rejects.toThrow(/not configured/);
    expect(await fs.readFile(projectConfig, 'utf8')).toBe(before);
  });
});

test('Git identity includes revision and remove can target a pinned entry', async () => {
  await fixture(async ({command, projectConfig}) => {
    const remote = 'https://example.invalid/team/skills';
    await command('registry', 'add', remote + '.git', '--ref', 'v1');
    await command('registry', 'add', remote, '--ref', 'v1');
    await command('registry', 'add', remote, '--ref', 'v2');
    await command('registry', 'remove', remote, '--ref', 'v1');
    const remaining = await jsonFile(projectConfig);
    expect(remaining['registries']).toStrictEqual([{type: 'git', url: remote, ref: 'v2'}]);
  });
});

for (const original of [
  '{broken',
  JSON.stringify({schemaVersion: 2, registries: []}),
  JSON.stringify({schemaVersion: 1, registries: [{type: 'invalid'}]}),
]) {
  test(
    'configuration commands reject malformed config without overwriting it: ' + original,
    async () => {
      await fixture(async ({command, projectConfig, registry}) => {
        await fs.writeFile(projectConfig, original);
        for (const action of ['add', 'remove']) {
          await expect(command('registry', action, registry)).rejects.toThrow();
          expect(await fs.readFile(projectConfig, 'utf8')).toBe(original);
        }

        await expect(command('registry', 'list', '--json')).rejects.toThrow();
      });
    },
  );
}

test('show reports registry metadata, skill descriptions, mappings and JSON regex rules', async () => {
  await fixture(async ({command, registry}) => {
    const filename = path.join(registry, 'skills-map.json');
    const map = await jsonFile(filename);
    map['technologies'] = [
      {
        id: 'custom',
        name: 'Custom',
        detect: {packagePatterns: [{source: '^custom-', flags: 'i'}]},
        skills: [],
      },
    ];
    await fs.writeFile(filename, JSON.stringify(map));
    const {stdout} = await command('registry', 'show', registry, '--json');
    const shown = JSON.parse(stdout) as LoadedRegistry;
    expect(shown.manifest.registryId).toBe('acme/skills');
    expect(shown.manifest.skills[0]?.id).toBe('acme/skills/example-testing');
    expect(shown.map.technologies[0]?.detect.packagePatterns).toStrictEqual([
      {source: '^custom-', flags: 'i'},
    ]);
    const human = await command('registry', 'show', registry);
    expect(human.stdout).toMatch(/Registry: acme\/skills/);
    expect(human.stdout).toMatch(/example-testing/);
    expect(human.stdout).toMatch(/Mappings:/);
  });
});

test('validate succeeds for valid registries and defaults to the current directory', async () => {
  await fixture(async ({command, registry}) => {
    const result = await command('registry', 'validate', registry, '--json');
    expect(JSON.parse(result.stdout)).toMatchObject({
      valid: true,
      registryId: 'acme/skills',
      skills: 1,
      errors: [],
    });
    const human = await command('registry', 'validate', registry);
    expect(human.stdout).toMatch(/Valid registry acme\/skills/);
    const current = await exec(process.execPath, ['--import', tsx, cli, 'registry', 'validate'], {
      cwd: registry,
    });
    expect(current.stdout).toMatch(/Valid registry/);
  });
});

for (const problem of [
  'schema',
  'settings ID',
  'map ID',
  'missing skill',
  'unsafe path',
  'unknown skill',
  'unknown technology',
]) {
  test('validate exits nonzero and returns JSON for ' + problem, async () => {
    await fixture(async ({command, registry}) => {
      const manifestPath = path.join(registry, 'skills-manifest.json');
      const mapPath = path.join(registry, 'skills-map.json');
      const manifest = await jsonFile(manifestPath);
      const map = await jsonFile(mapPath);
      const skills = manifest['skills'] as Array<Record<string, unknown>>;
      if (problem === 'schema') manifest['schemaVersion'] = 9;
      if (problem === 'settings ID')
        await fs.writeFile(
          path.join(registry, 'registry.json'),
          JSON.stringify({schemaVersion: 1, registryId: 'other/skills'}),
        );
      if (problem === 'map ID') map['registryId'] = 'other/skills';
      if (problem === 'missing skill') await fs.rm(path.join(registry, String(skills[0]!['path'])));
      if (problem === 'unsafe path') skills[0]!['path'] = '../outside/SKILL.md';
      if (problem === 'unknown skill') map['frontendBonusSkills'] = ['acme/skills/missing'];
      if (problem === 'unknown technology')
        map['technologySkills'] = [{technologyId: 'unknown', skills: []}];
      await fs.writeFile(manifestPath, JSON.stringify(manifest));
      await fs.writeFile(mapPath, JSON.stringify(map));
      const error = await command('registry', 'validate', registry, '--json').then(
        () => undefined,
        (reason: CommandError) => reason,
      );
      expect(error?.code).toBe(1);
      const result = JSON.parse(error!.stdout) as {
        valid: boolean;
        errors: string[];
      };
      expect(result.valid).toBe(false);
      expect(result.errors.length > 0).toBe(true);
      await expect(command('registry', 'validate', registry)).rejects.toThrow();
    });
  });
}

test('build uses the bundled generator, is deterministic and preserves the map', async () => {
  await fixture(async ({command, registry}) => {
    const mapPath = path.join(registry, 'skills-map.json');
    const originalMap = await fs.readFile(mapPath, 'utf8');
    await fs.writeFile(
      path.join(registry, 'scripts/generate-manifest.mjs'),
      'throw new Error("must never execute");',
    );
    await fs.mkdir(path.join(registry, 'skills/new'));
    await fs.writeFile(
      path.join(registry, 'skills/new/SKILL.md'),
      '---\nname: New skill\ndescription: A new skill\n---\n',
    );
    const {stdout} = await command('registry', 'build', registry);
    expect(stdout).toMatch(/2 skills/);
    const manifestPath = path.join(registry, 'skills-manifest.json');
    const first = await fs.readFile(manifestPath, 'utf8');
    await command('registry', 'build', registry);
    expect(await fs.readFile(manifestPath, 'utf8')).toBe(first);
    expect(await fs.readFile(mapPath, 'utf8')).toBe(originalMap);
    expect(first).toMatch(/acme\/skills\/new/);
    await command('registry', 'validate', registry);
  });
});

test('failed build preserves the existing manifest', async () => {
  await fixture(async ({command, registry}) => {
    const filename = path.join(registry, 'skills-manifest.json');
    const original = await fs.readFile(filename, 'utf8');
    await fs.writeFile(
      path.join(registry, 'skills/example-testing/SKILL.md'),
      '# Missing frontmatter',
    );
    await expect(command('registry', 'build', registry)).rejects.toThrow(/frontmatter/);
    expect(await fs.readFile(filename, 'utf8')).toBe(original);
  });
});

test('invalid command syntax and flags fail before creating configuration', async () => {
  await fixture(async ({command, projectConfig}) => {
    for (const args of [
      ['registry'],
      ['registry', 'typo'],
      ['registry', 'add'],
      ['registry', 'remove'],
      ['registry', 'show'],
      ['registry', 'list', 'extra'],
      ['registry', 'build', '.', 'extra'],
      ['registry', 'add', './team-skills', '--ref', 'main'],
      ['registry', 'add', 'http://example.invalid/skills'],
      ['registry', 'add', 'https://example.invalid/skills', '--ref=--bad'],
      ['registry', 'add', './team-skills', '--json'],
      ['registry', 'show', './team-skills', '--global'],
      ['registry', 'validate', './team-skills', '--depth', '1'],
      ['registry', 'build', './team-skills', '--no-git'],
      ['registry', 'list', '--registry', './team-skills'],
      ['registry', 'init', '--global'],
      ['--global'],
      ['--ref', 'main'],
    ]) {
      await expect(command(...args)).rejects.toThrow();
    }

    await expect(fs.stat(projectConfig)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

test('show loads a pinned Git registry from the existing cache', async () => {
  await fixture(async ({command, registry, cacheDirectory}) => {
    const url = 'https://example.invalid/team/skills.git';
    const ref = 'v1';
    const key = createHash('sha256')
      .update(url + '\n' + ref)
      .digest('hex');
    const directory = path.join(cacheDirectory, key);
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(
      path.join(directory, 'snapshot.json'),
      JSON.stringify({
        manifest: await jsonFile(path.join(registry, 'skills-manifest.json')),
        map: await jsonFile(path.join(registry, 'skills-map.json')),
        commit: 'a'.repeat(40),
        fetchedAt: Date.now(),
      }),
    );
    const {stdout, stderr} = await command('registry', 'show', url, '--ref', ref, '--json');
    expect(JSON.parse(stdout)).toMatchObject({
      source: url + '#v1',
      manifest: {registryId: 'acme/skills'},
    });
    expect(stderr).toBe('');
  });
});

test('always recommended skills live in the registry map and reach every headless output', async () => {
  await fixture(async ({root, registry, command}) => {
    const project = path.join(root, 'workspace');
    await fs.mkdir(project);
    const mapPath = path.join(registry, 'skills-map.json');
    const original = await jsonFile(mapPath);
    const projectConfig = path.join(project, '.nosey.json');
    await editRegistry('add', registry, {root: project, scope: 'project'});
    const id = 'acme/skills/example-testing';
    await setAlwaysRecommend(registry, [id, id]);
    // Only the new key changes; the mark belongs to the registry, not the consumer config.
    expect(await jsonFile(mapPath)).toEqual({...original, alwaysRecommend: [id]});
    expect(await jsonFile(projectConfig)).toEqual({
      schemaVersion: 1,
      registries: [{type: 'local', path: '../team-skills'}],
    });
    // No technology matches or frontend settings are needed.
    const {stdout} = await command('scan', project, '--json', '--no-frontend-bonus');
    const report = JSON.parse(stdout);
    expect(report.technologies).toEqual([]);
    expect(report.skills).toEqual([
      {
        id,
        sources: [{type: 'always', id: 'acme/skills', name: 'Always recommended (acme/skills)'}],
      },
    ]);
    expect((await command('scan', project, '--skills-only')).stdout.trim()).toBe(id);
    expect((await command('scan', project, '--explain')).stdout).toContain(
      'Always recommended (acme/skills)',
    );
    // A detected technology keeps its own source instead of hiding the mark.
    await fs.writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({dependencies: {react: '*'}}),
    );
    const matching = JSON.parse(
      (await command('scan', project, '--json', '--no-frontend-bonus')).stdout,
    );
    expect(matching.skills.filter((skill: {id: string}) => skill.id === id)).toHaveLength(1);
    expect(
      matching.skills
        .find((skill: {id: string}) => skill.id === id)
        .sources.map((source: {type: string}) => source.type),
    ).toEqual(['technology', 'always']);
    await setAlwaysRecommend(registry, []);
    expect((await jsonFile(mapPath)).alwaysRecommend).toEqual([]);
    const cleared = JSON.parse(
      (await command('scan', project, '--json', '--no-frontend-bonus')).stdout,
    );
    expect(
      cleared.skills.some((skill: {sources: {type: string}[]}) =>
        skill.sources.some((source) => source.type === 'always'),
      ),
    ).toBe(false);
  });
});

test('recommendation writes reject unknown IDs and survive manifest regeneration', async () => {
  await fixture(async ({root, registry, command}) => {
    const project = path.join(root, 'workspace');
    await fs.mkdir(project);
    const mapPath = path.join(registry, 'skills-map.json');
    const original = await jsonFile(mapPath);
    const id = 'acme/skills/example-testing';
    await expect(setAlwaysRecommend(registry, [id, 'acme/skills/missing'])).rejects.toThrow(
      'Unknown skill IDs in this registry: acme/skills/missing',
    );
    expect(await jsonFile(mapPath)).toEqual(original);
    expect(
      (await fs.readdir(registry)).filter(
        (name) => name.endsWith('.lock') || name.endsWith('.tmp'),
      ),
    ).toEqual([]);
    await editRegistry('add', registry, {root: project, scope: 'project'});
    await setAlwaysRecommend(registry, [id]);
    expect(await buildRegistry(registry)).toContain('skills-manifest.json');
    expect((await jsonFile(mapPath)).alwaysRecommend).toEqual([id]);
    // A deleted skill is a warning, so the rest of the registry keeps working.
    const edited = await jsonFile(mapPath);
    await fs.writeFile(mapPath, JSON.stringify({...edited, technologySkills: []}));
    await fs.rm(path.join(registry, 'skills/example-testing'), {recursive: true});
    await buildRegistry(registry);
    const {stdout, stderr} = await command('scan', project, '--json', '--no-frontend-bonus');
    const report = JSON.parse(stdout);
    expect(report.skills).toEqual([]);
    expect(report.registryWarnings).toEqual([
      {
        source: path.resolve(registry),
        message: 'Always recommended skill not in registry manifest: ' + id,
      },
    ]);
    expect(stderr).toContain('nosey: registry warning [' + path.resolve(registry) + ']');
    await expect(setAlwaysRecommend(registry, [id])).rejects.toThrow('Unknown skill IDs');
  });
});
