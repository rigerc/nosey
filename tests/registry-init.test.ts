import {githubClient} from '../src/lib/registry/github.js';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {test, expect, assert} from 'vite-plus/test';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {registryJson, setAlwaysRecommend, showRegistry} from '../src/lib/registry/commands.js';
import {type JsonObject, isRecord} from '../src/lib/values.js';
import {seedRegistrySkill} from './helpers/registry-fixture.js';
import {configureRegistryIdentity, validateRegistryDestination} from '../src/lib/registry/init.js';
import {runRegistryInit, scaffoldRegistry, fixturePreload} from './helpers/registry-template.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));
const templateSource = fileURLToPath(new URL('./fixtures/registry-template/', import.meta.url));
const manifestAnnotation = './schemas/skills-manifest.schema.json';
const mapAnnotation = './schemas/skills-map.schema.json';

async function readDocument(directory: string, name: string): Promise<JsonObject> {
  const document = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));

  if (!isRecord(document)) throw new Error(name + ' is not an object');

  return document;
}

async function annotateRegistry(directory: string): Promise<void> {
  for (const [name, annotation] of [
    ['skills-manifest.json', manifestAnnotation],
    ['skills-map.json', mapAnnotation],
  ] as const) {
    const document = await readDocument(directory, name);
    document.$schema = annotation;
    await fs.writeFile(path.join(directory, name), JSON.stringify(document, null, 2) + '\n');
  }
}

/** A pre-schema registry: no `schemas/` directory and no annotations. */
async function legacyTemplate(parent: string): Promise<string> {
  const directory = path.join(parent, 'legacy-template');
  await fs.cp(templateSource, directory, {recursive: true});
  await fs.rm(path.join(directory, 'schemas'), {recursive: true, force: true});

  for (const name of ['skills-manifest.json', 'skills-map.json']) {
    const document = await readDocument(directory, name);
    delete document['$schema'];
    await fs.writeFile(path.join(directory, name), JSON.stringify(document, null, 2) + '\n');
  }

  return directory;
}

async function temporary<T>(run: (parent: string) => Promise<T>): Promise<T> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-init-'));

  try {
    return await run(parent);
  } finally {
    await fs.rm(parent, {recursive: true, force: true});
  }
}

test('scaffold starts empty with current generated files and registry maintenance tools', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'nested', 'skills-registry');
    await scaffoldRegistry(destination, 'acme/team-skills');
    const registry = await loadLocalRegistry(destination);
    expect(registry.manifest.registryId).toBe('acme/team-skills');
    expect(registry.map.registryId).toBe('acme/team-skills');
    expect(registry.manifest.skills).toEqual([]);
    expect(registry.map.technologySkills).toEqual([]);
    expect(registry.map.externalSkills).toEqual([]);
    expect(registry.map.alwaysRecommend).toEqual([]);
    await expect(fs.stat(path.join(destination, 'skills/example-testing'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const settings = JSON.parse(
      await fs.readFile(path.join(destination, 'registry.json'), 'utf8'),
    ) as {registryId: string};

    expect(settings.registryId).toBe('acme/team-skills');
    const workflow = await fs.stat(path.join(destination, '.github/workflows/registry-ci.yml'));
    expect(workflow.isFile()).toBe(true);

    for (const name of [
      '.github/workflows/template-sync.yml',
      'scripts/validate-registry.mjs',
      'scripts/template-update.mjs',
      '.agents/prompts/fix-skills-using-agnix.md',
      'scripts/generate-readme.mjs',
      'scripts/generate-readme.test.mjs',
      'scripts/prepare-agnix-sarif.mjs',
      'scripts/prepare-agnix-sarif.test.mjs',
    ]) {
      expect((await fs.stat(path.join(destination, name))).isFile()).toBe(true);
    }

    const script = path.join(destination, 'scripts/generate-manifest.mjs');
    await execFileAsync(process.execPath, [script, '--check'], {
      cwd: destination,
    });
    await execFileAsync(process.execPath, ['scripts/generate-readme.mjs', '--check'], {
      cwd: destination,
    });
    const readme = await fs.readFile(path.join(destination, 'README.md'), 'utf8');
    expect(readme).toContain('Registry: acme/team-skills');
    expect(readme).toContain('No skills are registered.');
  });
});

test('scaffold still remaps populated template skill IDs and regenerates the catalog', async () => {
  await temporary(async (parent) => {
    const template = path.join(parent, 'populated-template');
    await scaffoldRegistry(template, 'example/original');
    await seedRegistrySkill(template);
    const destination = path.join(parent, 'new-registry');
    await scaffoldRegistry(destination, 'acme/renamed', template);
    const loaded = await loadLocalRegistry(destination);
    expect(loaded.manifest.skills[0]?.id).toBe('acme/renamed/example-testing');
    expect(loaded.map.technologySkills[0]?.skills).toEqual(['acme/renamed/example-testing']);
    await execFileAsync(process.execPath, ['scripts/generate-readme.mjs', '--check'], {
      cwd: destination,
    });
    expect(await fs.readFile(path.join(destination, 'README.md'), 'utf8')).toContain(
      'Registry: acme/renamed',
    );
  });
});

test('setup refuses an existing directory without touching its contents', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'existing');
    await fs.mkdir(destination);
    await fs.writeFile(path.join(destination, 'keep.txt'), 'unchanged');
    await expect(scaffoldRegistry(destination, 'acme/team-skills')).rejects.toMatchObject({
      code: 'EEXIST',
      message: expect.stringContaining('Choose a new directory'),
    });
    expect(await fs.readFile(path.join(destination, 'keep.txt'), 'utf8')).toBe('unchanged');
  });
});

test('setup refuses even an existing empty directory', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'existing');
    await fs.mkdir(destination);
    await expect(scaffoldRegistry(destination, 'acme/team-skills')).rejects.toMatchObject({
      code: 'EEXIST',
    });
    expect(await fs.readdir(destination)).toStrictEqual([]);
  });
});

test('destination preflight does not reserve a path and creation rechecks collisions', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'registry');
    await validateRegistryDestination(destination);
    await expect(fs.stat(destination)).rejects.toMatchObject({code: 'ENOENT'});
    await fs.mkdir(destination);
    await expect(scaffoldRegistry(destination, 'acme/skills')).rejects.toMatchObject({
      code: 'EEXIST',
      message: expect.stringContaining('Destination already exists'),
    });
    expect(await fs.readdir(destination)).toStrictEqual([]);
  });
});

test('destination preflight rejects files and dangling symlinks without changing them', async () => {
  await temporary(async (parent) => {
    const file = path.join(parent, 'keep.txt');
    const link = path.join(parent, 'link');
    await fs.writeFile(file, 'unchanged');
    await fs.symlink(path.join(parent, 'missing'), link);

    for (const destination of [file, link]) {
      await expect(validateRegistryDestination(destination)).rejects.toMatchObject({
        code: 'EEXIST',
        message: expect.stringContaining('Choose a new directory'),
      });
    }

    expect(await fs.readFile(file, 'utf8')).toBe('unchanged');
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
  });
});

test('a failed template copy removes the incomplete scaffold', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'registry');
    await expect(
      scaffoldRegistry(destination, 'acme/skills', path.join(parent, 'missing-template')),
    ).rejects.toMatchObject({code: 'ENOENT'});
    await expect(fs.stat(destination)).rejects.toMatchObject({code: 'ENOENT'});
  });
});

for (const repository of ['.github', '.github-private', '_skills']) {
  test(`setup supports repository names beginning with punctuation: ${repository}`, async () => {
    await temporary(async (parent) => {
      const destination = path.join(parent, 'registry');
      await scaffoldRegistry(destination, 'acme/' + repository);
      const registry = await loadLocalRegistry(destination);
      expect(registry.manifest.registryId).toBe('acme/' + repository);
      expect(registry.manifest.skills).toEqual([]);
      await execFileAsync(process.execPath, ['scripts/generate-manifest.mjs', '--check'], {
        cwd: destination,
      });
    });
  });
}

test('invalid registry identifiers never create a destination', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'registry');
    await expect(scaffoldRegistry(destination, '../unsafe')).rejects.toMatchObject({
      message: expect.stringMatching(/Registry ID/),
    });
    await expect(scaffoldRegistry(destination, 'only-one-part')).rejects.toMatchObject({
      message: expect.stringMatching(/Registry ID/),
    });

    for (const registryId of [
      'acme/.',
      'acme/..',
      'acme/../skills',
      'acme/',
      'acme/skills.',
      'acme/skill name',
      'acme/skill\\name',
    ]) {
      await expect(scaffoldRegistry(destination, registryId)).rejects.toMatchObject({
        message: expect.stringMatching(/Registry ID/),
      });
    }

    await expect(fs.stat(destination)).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('interactive wizard creates a local Git repository without publishing', async () => {
  await temporary(async (parent) => {
    const answers = [path.join(parent, 'my-registry'), 'team/my-registry', '', ''];
    const commands: Array<{command: string; args: string[]}> = [];

    const result = await runRegistryInit(
      {},
      {
        interactive: true,
        github: githubClient('test-token', async () => Response.json({login: ''})),
        ask: async () => answers.shift() ?? '',
        async run(command, args) {
          commands.push({command, args});
        },
      },
    );

    expect(result.registryId).toBe('team/my-registry');
    expect(result.gitInitialized).toBe(true);
    expect(result.githubCreated).toBe(false);
    expect(commands).toStrictEqual([
      {
        command: 'git',
        args: ['init', '--initial-branch=main', result.directory],
      },
    ]);
  });
});

test('interactive prompt accepts or overrides the GitHub identity suggestion', async () => {
  await temporary(async (parent) => {
    for (const answer of ['', 'my-org/custom']) {
      const directory = path.join(parent, answer ? 'override' : 'team-skills');
      const questions: string[] = [];

      const result = await runRegistryInit(
        {directory, git: false},
        {
          interactive: true,
          ask: async (question) => {
            questions.push(question);

            return answer;
          },
          github: githubClient('test-token', async () => Response.json({login: 'signed-in'})),
        },
      );

      expect(questions).toEqual([
        `Registry ID (owner/repository) [signed-in/${path.basename(directory)}]: `,
      ]);
      expect(result.registryId).toBe(answer || 'signed-in/team-skills');
    }
  });
});

test('interactive wizard preserves supplied destination and explicit opt-outs', async () => {
  await temporary(async (parent) => {
    const questions: string[] = [];

    const result = await runRegistryInit(
      {
        directory: path.join(parent, 'registry'),
        registryId: 'acme/skills',
        github: false,
      },
      {
        interactive: true,
        async ask(question) {
          questions.push(question);

          return 'n';
        },
        async run() {
          assert.fail('Git must not run');
        },
      },
    );

    expect(questions).toStrictEqual(['Initialize local Git repository? [Y/n]: ']);
    expect(result.gitInitialized).toBe(false);
    expect(result.githubCreated).toBe(false);
  });
});

test('visibility is validated before any filesystem writes', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');
    // SAFETY: this deliberately invalid visibility exercises rejection before any filesystem writes.
    await expect(
      runRegistryInit({
        directory,
        yes: true,
        registryId: 'acme/skills',
        github: true,
        visibility: 'hidden' as 'private',
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/visibility must be private or public/),
    });
    await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('noninteractive mode supports --no-git and requires explicit ID', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');
    await expect(
      runRegistryInit({
        directory,
        yes: true,
        git: false,
      }),
    ).rejects.toMatchObject({message: expect.stringMatching(/--registry-id/)});
    await expect(
      runRegistryInit({
        directory,
        yes: true,
        registryId: 'acme/skills',
        git: false,
        github: true,
      }),
    ).rejects.toMatchObject({message: expect.stringMatching(/requires Git/)});

    const result = await runRegistryInit(
      {
        directory,
        yes: true,
        registryId: 'acme/skills',
        git: false,
      },
      {
        async run() {
          assert.fail('Git must not run');
        },
      },
    );

    expect(result.gitInitialized).toBe(false);
    expect(result.githubCreated).toBe(false);
  });
});

test('CLI init command works without TTY and does not scan a project', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');

    const {stdout} = await execFileAsync(process.execPath, [
      '--import=tsx',
      '--import',
      await fixturePreload(parent),
      cli,
      'registry',
      'init',
      directory,
      '--registry-id',
      'acme/skills',
      '--yes',
      '--no-git',
    ]);

    expect(stdout).toMatch(/Created registry acme\/skills/);
    const registry = await loadLocalRegistry(directory);
    expect(registry.manifest.registryId).toBe('acme/skills');
  });
});

for (const {flags, git} of [
  {flags: ['--git=false'], git: false},
  {flags: ['--no-git', '--git'], git: true},
  {flags: ['--git', '--no-git'], git: false},
  {flags: [], git: true},
]) {
  test(`CLI init respects parsed Git flags: ${flags.join(' ') || 'default'}`, async () => {
    await temporary(async (parent) => {
      const directory = path.join(parent, 'registry');
      await execFileAsync(process.execPath, [
        '--import=tsx',
        '--import',
        await fixturePreload(parent),
        cli,
        'registry',
        'init',
        directory,
        '--registry-id',
        'acme/skills',
        '--yes',
        ...flags,
      ]);

      if (git) {
        const gitDirectory = await fs.stat(path.join(directory, '.git'));
        expect(gitDirectory.isDirectory()).toBe(true);
      } else {
        await expect(fs.stat(path.join(directory, '.git'))).rejects.toMatchObject({
          code: 'ENOENT',
        });
      }
    });
  });
}

test('scan commands reject explicit false initialization flags', async () => {
  for (const flag of ['--git=false', '--no-github', '--yes=false']) {
    await expect(
      execFileAsync(process.execPath, ['--import=tsx', cli, '--json', flag]),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Registry initialization options require/),
    });
  }
});

test('scaffold creates registry documents without schema files or annotations', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'registry');
    await scaffoldRegistry(destination, 'acme/team-skills');
    await expect(fs.stat(path.join(destination, 'schemas'))).rejects.toMatchObject({
      code: 'ENOENT',
    });

    for (const name of ['skills-manifest.json', 'skills-map.json']) {
      const document = await readDocument(destination, name);
      expect(Object.hasOwn(document, '$schema')).toBe(false);
      expect(document.registryId).toBe('acme/team-skills');
    }
  });
});

test('a legacy template stays unannotated and never gains a dangling reference', async () => {
  await temporary(async (parent) => {
    const source = await legacyTemplate(parent);
    const destination = path.join(parent, 'legacy-registry');
    await fs.cp(source, destination, {recursive: true});
    await configureRegistryIdentity(destination, 'acme/team-skills');

    expect(Object.hasOwn(await readDocument(destination, 'skills-manifest.json'), '$schema')).toBe(
      false,
    );
    expect(Object.hasOwn(await readDocument(destination, 'skills-map.json'), '$schema')).toBe(
      false,
    );
    await expect(fs.stat(path.join(destination, 'schemas'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await execFileAsync(process.execPath, ['scripts/generate-manifest.mjs', '--check'], {
      cwd: destination,
    });
  });
});

test('custom and non-string annotations survive an identity rewrite', async () => {
  await temporary(async (parent) => {
    const source = path.join(parent, 'custom-template');
    await fs.cp(templateSource, source, {recursive: true});
    const manifest = await readDocument(source, 'skills-manifest.json');
    manifest['$schema'] = 'https://example.com/custom.json';
    await fs.writeFile(
      path.join(source, 'skills-manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    );
    const map = await readDocument(source, 'skills-map.json');
    map['$schema'] = 3;
    await fs.writeFile(path.join(source, 'skills-map.json'), JSON.stringify(map, null, 2) + '\n');

    const destination = path.join(parent, 'custom-registry');
    await scaffoldRegistry(destination, 'acme/team-skills', source);

    expect((await readDocument(destination, 'skills-manifest.json'))['$schema']).toBe(
      'https://example.com/custom.json',
    );
    expect((await readDocument(destination, 'skills-map.json'))['$schema']).toBe(3);
  });
});

test('identity rewrite remaps local IDs and leaves annotations and external IDs untouched', async () => {
  await temporary(async (parent) => {
    const source = path.join(parent, 'populated');
    await scaffoldRegistry(source, 'example/original');
    await annotateRegistry(source);
    await seedRegistrySkill(source);

    const mapPath = path.join(source, 'skills-map.json');
    const map = await readDocument(source, 'skills-map.json');
    map['externalSkills'] = [
      {
        id: 'acme/upstream-skills/example-testing',
        name: 'External testing',
        source: 'acme/upstream-skills',
        skill: 'example-testing',
      },
    ];
    map['schemaVersion'] = 2;
    map['alwaysRecommend'] = ['acme/upstream-skills/example-testing'];
    await fs.writeFile(mapPath, JSON.stringify(map, null, 2) + '\n');

    const destination = path.join(parent, 'renamed');
    await scaffoldRegistry(destination, 'acme/renamed', source);
    const rewritten = await readDocument(destination, 'skills-map.json');

    expect(rewritten['$schema']).toBe(mapAnnotation);
    expect(rewritten['alwaysRecommend']).toEqual(['acme/upstream-skills/example-testing']);
    expect(rewritten['externalSkills']).toEqual(map['externalSkills']);

    const manifest = await readDocument(destination, 'skills-manifest.json');

    expect(manifest['$schema']).toBe(manifestAnnotation);
    expect((await loadLocalRegistry(destination)).manifest.skills[0]?.id).toBe(
      'acme/renamed/example-testing',
    );
  });
});

test('shared document writes never invent or leak an annotation', async () => {
  await temporary(async (parent) => {
    const annotated = path.join(parent, 'annotated');
    await scaffoldRegistry(annotated, 'acme/team-skills');
    await annotateRegistry(annotated);
    await seedRegistrySkill(annotated);

    const shown = registryJson(await showRegistry(annotated));

    expect(shown).not.toContain('$schema');

    const before = await readDocument(annotated, 'skills-map.json');
    await setAlwaysRecommend(annotated, ['acme/team-skills/example-testing']);
    const after = await readDocument(annotated, 'skills-map.json');

    expect(after['$schema']).toBe(before['$schema']);
    expect(after['alwaysRecommend']).toEqual(['acme/team-skills/example-testing']);

    const legacy = await legacyTemplate(parent);
    const destination = path.join(parent, 'legacy-writes');
    await fs.cp(legacy, destination, {recursive: true});
    await configureRegistryIdentity(destination, 'acme/legacy-skills');
    await seedRegistrySkill(destination);
    await setAlwaysRecommend(destination, ['acme/legacy-skills/example-testing']);

    expect(Object.hasOwn(await readDocument(destination, 'skills-map.json'), '$schema')).toBe(
      false,
    );
  });
});
