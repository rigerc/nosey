import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';
import {parseConfig} from '../src/lib/registry/config.js';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {validateRegistry} from '../src/lib/registry/commands.js';
import {mergeRegistries} from '../src/lib/registry/merge.js';
import {type JsonObject, isRecord} from '../src/lib/values.js';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

type RegistrySpec = {
  registryId: string;
  mapRegistryId?: string;
  mapSchemaVersion?: 1 | 2;
  skillFiles?: string[];
  settingsRegistryId?: string;
  map?: JsonObject;
};

function skillId(registryId: string, file: string): string {
  return registryId + '/' + path.posix.dirname(file).slice('skills/'.length);
}

async function writeRegistry(directory: string, spec: RegistrySpec): Promise<void> {
  const files = spec.skillFiles ?? [];

  await fs.mkdir(directory, {recursive: true});

  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    await fs.mkdir(path.join(directory, path.posix.dirname(file)), {recursive: true});
    // eslint-disable-next-line no-await-in-loop
    await fs.writeFile(path.join(directory, file), '# skill\n');
  }

  const manifest = {
    $schema: './schemas/skills-manifest.schema.json',
    schemaVersion: 1,
    registryId: spec.registryId,
    skills: files.map((file) => ({id: skillId(spec.registryId, file), name: file, path: file})),
  };

  const map = {
    $schema: './schemas/skills-map.schema.json',
    schemaVersion: spec.mapSchemaVersion ?? 1,
    registryId: spec.mapRegistryId ?? spec.registryId,
    ...spec.map,
  };

  await fs.writeFile(
    path.join(directory, 'skills-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  await fs.writeFile(path.join(directory, 'skills-map.json'), JSON.stringify(map, null, 2) + '\n');

  if (spec.settingsRegistryId !== undefined) {
    await fs.writeFile(
      path.join(directory, 'registry.json'),
      JSON.stringify({schemaVersion: 1, registryId: spec.settingsRegistryId}, null, 2) + '\n',
    );
  }
}

async function temporaryRegistry<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-registry-integration-'));

  try {
    return await run(directory);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
}

test('invalid config entries do not discard valid entries', () => {
  const warnings: string[] = [];

  const sources = parseConfig(
    {
      schemaVersion: 1,
      registries: [
        {type: 'local', path: './valid'},
        {type: 'git', url: 42},
        {type: 'local', path: './also-valid'},
      ],
    },
    '/tmp/project/.skillsense.json',
    (index, message) => {
      warnings.push(`${index}: ${message}`);
    },
  );

  expect(sources.length).toBe(2);
  expect(warnings.length).toBe(1);
  expect(warnings[0]!).toMatch(/^1:/);
});

test('CLI uses a local registry in JSON and skills-only outputs', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-cli-registry-'));

  try {
    const project = path.join(folder, 'project');
    const registry = path.join(folder, 'registry');
    await fs.mkdir(project);
    await fs.mkdir(path.join(registry, 'skills/example'), {recursive: true});
    await fs.writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({
        dependencies: {react: '^19'},
      }),
    );
    await fs.writeFile(path.join(registry, 'skills/example/SKILL.md'), '# example\n');
    await fs.writeFile(
      path.join(registry, 'skills-manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        registryId: 'example/testing',
        skills: [
          {
            id: 'example/testing/example',
            name: 'example',
            path: 'skills/example/SKILL.md',
          },
        ],
      }),
    );
    await fs.writeFile(
      path.join(registry, 'skills-map.json'),
      JSON.stringify({
        schemaVersion: 1,
        registryId: 'example/testing',
        technologySkills: [{technologyId: 'react', skills: ['example/testing/example']}],
      }),
    );

    const {stdout} = await run(process.execPath, [
      '--import=tsx',
      cli,
      project,
      '--registry',
      registry,
      '--json',
    ]);

    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const report = JSON.parse(stdout) as {skills: Array<{id: string}>};
    expect(report.skills.some((skill) => skill.id === 'example/testing/example')).toBe(true);

    const only = await run(process.execPath, [
      '--import=tsx',
      cli,
      project,
      '--registry',
      registry,
      '--skills-only',
    ]);

    expect(only.stdout.split('\n').includes('example/testing/example')).toBe(true);
  } finally {
    await fs.rm(folder, {recursive: true, force: true});
  }
});

test('registry documents must agree on registryId', async () => {
  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {registryId: 'acme/one', mapRegistryId: 'acme/two'});

    await expect(loadLocalRegistry(directory)).rejects.toThrow(
      'Manifest and map registryId do not match',
    );
  });

  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {
      registryId: 'acme/one',
      settingsRegistryId: 'acme/other',
    });

    await expect(validateRegistry(directory)).rejects.toThrow(
      'registry.json and manifest registryId do not match',
    );
  });
});

test('skill files must exist and stay inside the registry', async () => {
  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {
      registryId: 'acme/skills',
      skillFiles: ['skills/missing/SKILL.md'],
    });
    await fs.rm(path.join(directory, 'skills/missing/SKILL.md'));

    await expect(loadLocalRegistry(directory)).rejects.toMatchObject({code: 'ENOENT'});
  });

  await temporaryRegistry(async (directory) => {
    const registry = path.join(directory, 'registry');
    const outside = path.join(directory, 'outside.md');
    await writeRegistry(registry, {registryId: 'acme/skills'});
    await fs.writeFile(outside, '# outside\n');
    await fs.mkdir(path.join(registry, 'skills/escape'), {recursive: true});
    await fs.symlink(outside, path.join(registry, 'skills/escape/SKILL.md'));
    const manifestPath = path.join(registry, 'skills-manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

    if (!isRecord(manifest)) throw new Error('manifest is not an object');

    manifest['skills'] = [
      {id: 'acme/skills/escape', name: 'escape', path: 'skills/escape/SKILL.md'},
    ];
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

    await expect(loadLocalRegistry(registry)).rejects.toThrow(
      /Skill (escapes registry|is not a regular file)/,
    );
  });
});

test('dangling references fail full registry validation', async () => {
  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {
      registryId: 'acme/skills',
      map: {technologySkills: [{technologyId: 'react', skills: ['acme/skills/unknown']}]},
    });

    await expect(validateRegistry(directory)).rejects.toThrow(
      'Skill not declared in registry: acme/skills/unknown',
    );
  });

  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {
      registryId: 'acme/skills',
      map: {technologySkills: [{technologyId: 'not-a-technology', skills: []}]},
    });

    await expect(validateRegistry(directory)).rejects.toThrow(
      'Unknown technology reference: not-a-technology',
    );
  });

  await temporaryRegistry(async (directory) => {
    await writeRegistry(directory, {
      registryId: 'acme/skills',
      map: {combinationSkills: [{combinationId: 'not-a-combination', skills: []}]},
    });

    await expect(validateRegistry(directory)).rejects.toThrow(
      'Unknown combination reference: not-a-combination',
    );
  });
});

test('conflicting external identities are reported per registry', async () => {
  await temporaryRegistry(async (root) => {
    const first = path.join(root, 'first');
    const second = path.join(root, 'second');

    const registries: Array<[string, string]> = [
      [first, 'acme/upstream-skills'],
      [second, 'other/upstream-skills'],
    ];

    for (const [directory, source] of registries) {
      // eslint-disable-next-line no-await-in-loop
      await writeRegistry(directory, {
        registryId: directory === first ? 'acme/one' : 'acme/two',
        mapSchemaVersion: 2,
        map: {
          externalSkills: [
            {
              id: 'acme/shared-skills/review',
              name: 'Review',
              source,
              skill: 'review',
            },
          ],
        },
      });
    }

    const merged = mergeRegistries([
      await loadLocalRegistry(first),
      await loadLocalRegistry(second),
    ]);

    expect(merged.warnings.map((warning) => warning.message)).toContain(
      'Conflicting external skill ID: acme/shared-skills/review',
    );
    expect(merged.registry.registryIds).toEqual(['acme/one']);
  });
});
