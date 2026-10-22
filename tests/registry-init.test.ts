import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {test, expect, assert} from 'vite-plus/test';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {
  runRegistryInit,
  scaffoldRegistry,
  validateRegistryDestination,
} from '../src/lib/registry/init.js';

const execFileAsync = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

async function temporary<T>(run: (parent: string) => Promise<T>): Promise<T> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-init-'));

  try {
    return await run(parent);
  } finally {
    await fs.rm(parent, {recursive: true, force: true});
  }
}

test('scaffold rewrites all template IDs and retains the manifest workflow', async () => {
  await temporary(async (parent) => {
    const destination = path.join(parent, 'nested', 'skills-registry');
    await scaffoldRegistry(destination, 'acme/team-skills');
    const registry = await loadLocalRegistry(destination);
    expect(registry.manifest.registryId).toBe('acme/team-skills');
    expect(registry.map.registryId).toBe('acme/team-skills');
    expect(registry.manifest.skills.map((skill) => skill.id)).toStrictEqual([
      'acme/team-skills/example-testing',
    ]);
    expect(registry.map.technologySkills[0]?.skills).toStrictEqual([
      'acme/team-skills/example-testing',
    ]);

    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const settings = JSON.parse(
      await fs.readFile(path.join(destination, 'registry.json'), 'utf8'),
    ) as {registryId: string};

    expect(settings.registryId).toBe('acme/team-skills');
    const workflow = await fs.stat(path.join(destination, '.github/workflows/update-manifest.yml'));
    expect(workflow.isFile()).toBe(true);

    const script = path.join(destination, 'scripts/generate-manifest.mjs');
    await execFileAsync(process.execPath, [script, '--check'], {
      cwd: destination,
    });
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
      expect(registry.manifest.skills[0]?.id).toBe('acme/' + repository + '/example-testing');
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
          assert.fail('Git and gh must not run');
        },
      },
    );

    expect(questions).toStrictEqual(['Initialize local Git repository? [Y/n]: ']);
    expect(result.gitInitialized).toBe(false);
    expect(result.githubCreated).toBe(false);
  });
});

test('GitHub publication is explicitly selected and defaults to private', async () => {
  await temporary(async (parent) => {
    const commands: Array<{command: string; args: string[]}> = [];

    const result = await runRegistryInit(
      {
        directory: path.join(parent, 'project'),
        registryId: 'acme/team-skills',
        git: true,
        github: true,
        yes: true,
      },
      {
        async run(command, args) {
          commands.push({command, args});
        },
      },
    );

    expect(result.githubCreated).toBe(true);
    expect(commands.map((item) => item.command)).toStrictEqual(['git', 'git', 'git', 'gh']);
    expect(commands[2]?.args).toStrictEqual([
      '-C',
      result.directory,
      'commit',
      '-m',
      'chore(registry): initialize Nosey registry',
    ]);
    expect(commands[commands.length - 1]?.args).toStrictEqual([
      'repo',
      'create',
      'acme/team-skills',
      '--source',
      result.directory,
      '--remote',
      'origin',
      '--push',
      '--private',
    ]);
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

test('a failed GitHub operation leaves the scaffold for manual publishing', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');
    await expect(
      runRegistryInit(
        {
          directory,
          yes: true,
          registryId: 'acme/skills',
          github: true,
        },
        {
          async run(command) {
            if (command === 'gh') throw new Error('not authenticated');
          },
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Local registry created.*GitHub creation failed/),
    });
    const registry = await loadLocalRegistry(directory);
    expect(registry.manifest.registryId).toBe('acme/skills');
  });
});

test('commit hook errors are identified before contacting GitHub and preserve the local result', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');
    const commands: string[] = [];

    const error = await runRegistryInit(
      {directory, registryId: 'acme/skills', github: true, yes: true},
      {
        async run(command, args) {
          commands.push(command);

          if (args.includes('commit')) {
            throw Object.assign(new Error('Command failed: git commit'), {
              stdout:
                '\u001b[31mInvalid commit message format\u001b[0m\nExpected: <type>(<scope>): <subject>',
              stderr: '',
            });
          }
        },
      },
    ).catch((reason) => reason);

    expect(error).toMatchObject({
      name: 'RegistryInitError',
      result: {directory, registryId: 'acme/skills', gitInitialized: true, githubCreated: false},
    });
    expect(error.message).toContain('initial Git commit failed');
    expect(error.message).toContain('Invalid commit message format');
    expect(error.message).toContain('GitHub was not contacted');
    expect(error.message).not.toContain('Command failed:');
    expect(error.message).not.toContain('\u001b');
    expect(commands).not.toContain('gh');
    expect((await loadLocalRegistry(directory)).manifest.registryId).toBe('acme/skills');
  });
});

test('the initial commit passes a conventional commit hook before GitHub publication', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');
    const hooks = path.join(parent, 'hooks');
    const gitConfig = path.join(parent, 'gitconfig');
    await fs.mkdir(hooks);
    await fs.writeFile(
      path.join(hooks, 'commit-msg'),
      [
        '#!/bin/sh',
        'if ! head -n 1 "$1" | grep -Eq "^[a-z]+\\([a-z-]+\\): .+"; then',
        '  echo "Invalid commit message format. Expected: <type>(<scope>): <subject>" >&2',
        '  exit 1',
        'fi',
        '',
      ].join('\n'),
      {mode: 0o755},
    );
    await fs.writeFile(gitConfig, '[core]\n\thooksPath = ' + JSON.stringify(hooks) + '\n');

    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: gitConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Registry Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Registry Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };

    let published = false;
    await runRegistryInit(
      {directory, registryId: 'acme/skills', github: true, yes: true},
      {
        async run(command, args) {
          if (command === 'gh') published = true;
          else await execFileAsync(command, args, {env});
        },
      },
    );
    expect(published).toBe(true);

    const {stdout} = await execFileAsync('git', ['-C', directory, 'log', '-1', '--format=%s'], {
      env,
    });

    expect(stdout.trim()).toBe('chore(registry): initialize Nosey registry');
  });
});

test('GitHub errors include gh diagnostics and preserve the created local registry', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');

    const error = await runRegistryInit(
      {directory, registryId: 'acme/skills', github: true, yes: true},
      {
        async run(command) {
          if (command === 'gh')
            throw Object.assign(new Error('Command failed: gh repo create'), {
              stderr: 'GraphQL: Name already exists on this account',
            });
        },
      },
    ).catch((reason) => reason);

    expect(error).toMatchObject({
      name: 'RegistryInitError',
      result: {directory, registryId: 'acme/skills', gitInitialized: true, githubCreated: false},
    });
    expect(error.message).toContain('GitHub creation failed');
    expect(error.message).toContain('Name already exists');
    expect(error.message).toContain('gh auth status');
    expect(error.message).not.toContain('Command failed:');
    expect((await loadLocalRegistry(directory)).manifest.registryId).toBe('acme/skills');
  });
});

test('CLI init command works without TTY and does not scan a project', async () => {
  await temporary(async (parent) => {
    const directory = path.join(parent, 'registry');

    const {stdout} = await execFileAsync(process.execPath, [
      '--import=tsx',
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

test('Git and GitHub commands isolate repository environment overrides', async () => {
  await temporary(async (parent) => {
    const other = path.join(parent, 'other');
    const directory = path.join(parent, 'registry');
    const ghEnvironment = path.join(parent, 'gh-env.json');
    const preload = path.join(parent, 'mock-gh.mjs');

    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
      GIT_CONFIG_GLOBAL: os.devNull,
      GIT_CONFIG_SYSTEM: os.devNull,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 'Registry Init Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Registry Init Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
    };

    await execFileAsync('git', ['init', '--initial-branch=main', other], {env});
    await fs.writeFile(path.join(other, 'baseline.txt'), 'original repository');
    await execFileAsync('git', ['-C', other, 'add', '--all'], {env});
    await execFileAsync('git', ['-C', other, 'commit', '-m', 'Original commit'], {env});
    const originalHead = await execFileAsync('git', ['-C', other, 'rev-parse', 'HEAD'], {env});
    const originalIndex = await fs.readFile(path.join(other, '.git', 'index'));
    await fs.writeFile(path.join(other, 'private.txt'), 'must stay uncommitted');
    // Mock only gh; Git runs normally so incorrect repository writes are observable.
    await fs.writeFile(
      preload,
      [
        "import childProcess from 'node:child_process';",
        "import fs from 'node:fs';",
        "import {syncBuiltinESMExports} from 'node:module';",
        'const originalExecFile = childProcess.execFile;',
        'childProcess.execFile = (command, args, options, callback) => {',
        "  if (command !== 'gh') return originalExecFile(command, args, options, callback);",
        '  fs.writeFileSync(process.env.SKILLSENSE_TEST_GH_ENV, JSON.stringify(options.env));',
        "  callback(null, '', '');",
        '};',
        'syncBuiltinESMExports();',
      ].join('\n'),
    );

    const overrides = {
      GIT_DIR: path.join(other, '.git'),
      GIT_WORK_TREE: other,
      GIT_COMMON_DIR: path.join(other, '.git'),
      GIT_INDEX_FILE: path.join(other, '.git', 'index'),
      GIT_OBJECT_DIRECTORY: path.join(other, '.git', 'objects'),
      GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(other, '.git', 'objects'),
      GIT_PREFIX: 'unrelated/',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.worktree',
      GIT_CONFIG_VALUE_0: other,
    };

    await execFileAsync(
      process.execPath,
      [
        '--import=tsx',
        '--import',
        preload,
        cli,
        'registry',
        'init',
        directory,
        '--registry-id',
        'acme/skills',
        '--yes',
        '--github',
      ],
      {env: {...env, ...overrides, SKILLSENSE_TEST_GH_ENV: ghEnvironment}},
    );

    const {stdout: files} = await execFileAsync(
      'git',
      ['-C', directory, 'ls-tree', '-r', '--name-only', 'HEAD'],
      {env},
    );

    expect(files.includes('skills-manifest.json')).toBe(true);
    expect(files.includes('.github/workflows/update-manifest.yml')).toBe(true);
    expect(files.includes('private.txt')).toBe(false);
    expect(files.includes('baseline.txt')).toBe(false);
    const currentHead = await execFileAsync('git', ['-C', other, 'rev-parse', 'HEAD'], {env});
    expect(currentHead.stdout).toBe(originalHead.stdout);
    expect(await fs.readFile(path.join(other, '.git', 'index'))).toStrictEqual(originalIndex);

    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const publishedEnv = JSON.parse(await fs.readFile(ghEnvironment, 'utf8')) as Record<
      string,
      string
    >;

    for (const name of Object.keys(overrides)) expect(publishedEnv[name]).toBe(undefined);
    expect(publishedEnv['GIT_AUTHOR_NAME']).toBe(env.GIT_AUTHOR_NAME);
    expect(publishedEnv['GIT_TERMINAL_PROMPT']).toBe('0');
  });
});
