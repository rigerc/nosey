import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test, expect, vi} from 'vite-plus/test';
import {
  defaultRun,
  RegistryInitError,
  runRegistryInit,
  type CommandRunner,
} from '../src/lib/registry/init.js';
import {templateRepository} from '../src/lib/registry/template.js';
import {templateDirectory} from './helpers/registry-template.js';

type Call = {command: string; args: string[]};

const git = (args: string[]) =>
  defaultRun('git', [
    '-c',
    'user.name=Registry Test',
    '-c',
    'user.email=test@example.invalid',
    ...args,
  ]);

async function fixture(
  run: (context: {
    root: string;
    directory: string;
    calls: Call[];
    runner: CommandRunner;
  }) => Promise<void>,
  fail = '',
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-github-'));
  const directory = path.join(root, 'registry');
  const calls: Call[] = [];
  let created = false;

  const runner: CommandRunner = async (command, args) => {
    calls.push({command, args});
    const operation = args[0] === 'repo' ? args[1] : args[2];

    if (fail && (operation === fail || args[0] === fail || args.includes(fail)))
      throw Object.assign(new Error('stage failed: ' + fail), {
        stderr: '\u001b[31mdiagnostic\u001b[0m',
      });

    if (command === 'git') return git(args);

    if (args[0] === 'api' && args[1] === 'repos/' + templateRepository) return 'true\n';

    if (args[0] === 'api' && args[1] === 'repos/acme/skills') {
      if (!created) throw new Error('gh: Not Found (HTTP 404)');

      return 'https://github.com/acme/skills';
    }

    if (operation === 'create') {
      created = true;

      return '';
    }

    if (operation === 'clone') {
      expect(args[3]).toBe(directory);
      expect(await fs.readdir(directory)).toEqual([]);
      await fs.cp(templateDirectory, directory, {recursive: true});
      await git(['init', '--initial-branch=trunk', directory]);
      await git(['-C', directory, 'add', '--all']);
      await git(['-C', directory, 'commit', '-m', 'chore(registry): initialize template']);
      const remote = path.join(root, 'remote.git');
      await git(['init', '--bare', remote]);
      await git(['-C', directory, 'remote', 'add', 'origin', remote]);

      return '';
    }

    return '';
  };

  try {
    await run({root, directory, calls, runner});
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

for (const visibility of ['private', 'public'] as const) {
  test(`GitHub ${visibility} creation preserves template history and pushes the current branch`, async () => {
    await fixture(async ({directory, calls, runner}) => {
      const result = await runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true, visibility},
        {run: runner},
      );

      expect(result).toMatchObject({
        githubCreated: true,
        creationStatus: 'created',
        cloneCompleted: true,
        configured: true,
        pushCompleted: true,
      });
      expect(result.initialCommit).toMatch(/^[a-f\d]{40}$/);
      expect(result.templateCommit).toBeUndefined(); // An observed upstream HEAD is not clone provenance.

      const mutations = calls.filter(
        (call) =>
          call.args[0] === 'repo' ||
          call.args.includes('add') ||
          call.args.includes('commit') ||
          call.args.includes('push'),
      );

      expect(mutations.map((call) => call.args)).toEqual([
        ['repo', 'create', 'acme/skills', '--template', templateRepository, '--' + visibility],
        ['repo', 'clone', 'acme/skills', directory],
        ['-C', directory, 'add', '--all'],
        [
          '-C',
          directory,
          'commit',
          '--allow-empty',
          '-m',
          'chore(registry): configure registry identity',
        ],
        ['-C', directory, 'push', 'origin', 'HEAD'],
      ]);
      expect((await git(['-C', directory, 'branch', '--show-current'])).trim()).toBe('trunk');
      expect((await git(['-C', directory, 'rev-list', '--count', 'HEAD'])).trim()).toBe('2');
      expect((await git(['-C', directory, 'rev-parse', 'HEAD~1'])).trim()).toBe(
        result.initialCommit,
      );
      expect(
        JSON.parse(await fs.readFile(path.join(directory, 'registry.json'), 'utf8')).registryId,
      ).toBe('acme/skills');
      expect(
        calls.some((call) => call.args.includes('--source') || call.args.includes('--force')),
      ).toBe(false);
    });
  });
}

test('an initially empty clone waits for generated template history before configuring', async () => {
  await fixture(async ({root, directory, calls, runner}) => {
    const remote = path.join(root, 'generated.git');
    await git(['init', '--bare', '--initial-branch=trunk', remote]);
    let waits = 0;

    const wrapped: CommandRunner = async (command, args) => {
      if (command === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
        calls.push({command, args});
        await git(['clone', '--', remote, directory]);

        return '';
      }

      return runner(command, args);
    };

    const wait = async () => {
      waits++;

      if (waits === 2) {
        // Model GitHub completing generation after two readiness checks found no commit.
        const seed = path.join(root, 'template-seed');
        await fs.cp(templateDirectory, seed, {recursive: true});
        await git(['init', '--initial-branch=trunk', seed]);
        await git(['-C', seed, 'add', '--all']);
        await git(['-C', seed, 'commit', '-m', 'chore(registry): generate template']);
        await git(['-C', seed, 'push', remote, 'HEAD']);
      }
    };

    const result = await runRegistryInit(
      {directory, registryId: 'acme/skills', github: true, yes: true},
      {run: wrapped, wait},
    );

    expect(result).toMatchObject({cloneCompleted: true, configured: true, pushCompleted: true});
    expect(result.initialCommit).toMatch(/^[a-f\d]{40}$/);
    expect((await git(['-C', directory, 'rev-list', '--count', 'HEAD'])).trim()).toBe('2');
    expect((await git(['-C', directory, 'branch', '--show-current'])).trim()).toBe('trunk');
    expect(waits).toBe(2);
    expect(
      calls.filter((call) => call.args[0] === 'repo' && call.args[1] === 'create'),
    ).toHaveLength(1);
  });
});

for (const failure of ['pending', 'network']) {
  test(`template readiness ${failure} preserves the clone without configuring or recreating`, async () => {
    await fixture(async ({root, directory, calls, runner}) => {
      const remote = path.join(root, 'empty.git');
      await git(['init', '--bare', '--initial-branch=main', remote]);

      const wrapped: CommandRunner = async (command, args) => {
        if (command === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
          calls.push({command, args});

          return git(['clone', '--', remote, directory]);
        }

        if (failure === 'network' && args.includes('ls-remote')) {
          throw new Error('Could not resolve host');
        }

        return runner(command, args);
      };

      const wait = vi.fn(async () => {});

      const error = await runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true},
        {run: wrapped, wait},
      ).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(RegistryInitError);

      if (!(error instanceof RegistryInitError)) throw new Error('Expected init error');
      expect(error.result).toMatchObject({
        githubCreated: true,
        cloneCompleted: true,
        gitInitialized: true,
        configured: false,
        pushCompleted: false,
      });
      expect(error.message).toContain('template readiness failed');
      expect(error.message).not.toContain('clone failed');
      expect(error.message).toContain('Do not repeat registry init --github');
      expect(error.message).toContain(
        failure === 'pending' ? 'after 30 seconds' : 'Could not resolve host',
      );
      expect(wait).toHaveBeenCalledTimes(failure === 'pending' ? 10 : 0);
      expect(await fs.readdir(directory)).toEqual(['.git']);
      expect(calls.filter((call) => call.args[1] === 'create')).toHaveLength(1);
      expect(calls.some((call) => call.args.includes('commit') || call.args.includes('push'))).toBe(
        false,
      );
    });
  });
}

for (const stage of ['clone', 'commit', 'push']) {
  test(`${stage} failure retains remote creation and reports independent completion states`, async () => {
    await fixture(async ({directory, calls, runner}) => {
      const error = await runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true},
        {run: runner},
      ).catch((cause: unknown) => cause);

      expect(error).toBeInstanceOf(RegistryInitError);

      if (!(error instanceof RegistryInitError)) throw new Error('Expected init error');
      expect(error.result).toMatchObject({
        githubCreated: true,
        creationStatus: 'created',
        cloneCompleted: stage !== 'clone',
        configured: stage !== 'clone',
        pushCompleted: false,
      });
      expect(error.message).toContain(stage + ' failed');
      expect(error.message).toContain('Do not repeat registry init --github');
      expect(error.message).toContain('diagnostic');
      expect(error.message).not.toContain('\u001b');

      if (stage === 'clone')
        await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
      else expect((await fs.stat(path.join(directory, '.git'))).isDirectory()).toBe(true);
      expect(calls.filter((call) => call.args[1] === 'create')).toHaveLength(1);
    }, stage);
  });
}

test('unsupported clone is retained unchanged and never staged or pushed', async () => {
  await fixture(async ({directory, calls, runner}) => {
    const wrapped: CommandRunner = async (command, args) => {
      const output = await runner(command, args);

      if (args[0] === 'repo' && args[1] === 'clone') {
        const filename = path.join(directory, 'skills-map.json');
        const map = JSON.parse(await fs.readFile(filename, 'utf8'));
        await fs.writeFile(filename, JSON.stringify({...map, schemaVersion: 999}));
      }

      return output;
    };

    await expect(
      runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true},
        {run: wrapped},
      ),
    ).rejects.toMatchObject({
      result: {githubCreated: true, cloneCompleted: true, configured: false, pushCompleted: false},
      message: expect.stringContaining('Unsupported skills-map.json schemaVersion'),
    });
    expect(
      JSON.parse(await fs.readFile(path.join(directory, 'registry.json'), 'utf8')).registryId,
    ).toBe('example/agent-skills');
    expect(calls.some((call) => call.args.includes('add') || call.args.includes('push'))).toBe(
      false,
    );
  });
});

test('GitHub initialization works without schemas or scripts in the template clone', async () => {
  await fixture(async ({directory, runner}) => {
    const wrapped: CommandRunner = async (command, args) => {
      const output = await runner(command, args);

      if (args[0] === 'repo' && args[1] === 'clone') {
        await fs.rm(path.join(directory, 'schemas'), {recursive: true, force: true});
        await fs.rm(path.join(directory, 'scripts'), {recursive: true});
      }

      return output;
    };

    const result = await runRegistryInit(
      {directory, registryId: 'acme/skills', github: true, yes: true},
      {run: wrapped},
    );

    expect(result).toMatchObject({githubCreated: true, configured: true, pushCompleted: true});
    await expect(fs.stat(path.join(directory, 'schemas'))).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('a clone failure keeps useful files already written by gh', async () => {
  await fixture(async ({directory, runner}) => {
    const wrapped: CommandRunner = async (command, args) => {
      if (args[0] === 'repo' && args[1] === 'clone') {
        await fs.writeFile(path.join(directory, 'recovery.txt'), 'partial work');
        throw new Error('clone interrupted');
      }

      return runner(command, args);
    };

    await expect(
      runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true},
        {run: wrapped},
      ),
    ).rejects.toMatchObject({
      result: {githubCreated: true, cloneCompleted: false, configured: false, pushCompleted: false},
    });
    expect(await fs.readFile(path.join(directory, 'recovery.txt'), 'utf8')).toBe('partial work');
  });
});

test('concurrent initializers cannot create two remotes for one local destination', async () => {
  await fixture(async ({directory, calls, runner}) => {
    const options = {directory, registryId: 'acme/skills', github: true, yes: true};

    const attempts = await Promise.allSettled([
      runRegistryInit(options, {run: runner}),
      runRegistryInit(options, {run: runner}),
    ]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(
      calls.filter((call) => call.args[0] === 'repo' && call.args[1] === 'create'),
    ).toHaveLength(1);
  });
});

for (const observed of [true, false]) {
  test(`failed creation remains uncertain when remote observed=${observed}`, async () => {
    await fixture(async ({directory, calls, runner}) => {
      let attempted = false;

      const wrapped: CommandRunner = async (command, args) => {
        if (args[0] === 'repo' && args[1] === 'create') {
          attempted = true;
          throw new Error('request timed out');
        }

        if (attempted && args[0] === 'api') {
          if (!observed) throw new Error('Not Found (HTTP 404)');

          return 'https://github.com/acme/skills';
        }

        return runner(command, args);
      };

      await expect(
        runRegistryInit(
          {directory, registryId: 'acme/skills', github: true, yes: true},
          {run: wrapped},
        ),
      ).rejects.toMatchObject({
        result: {
          githubCreated: false,
          creationStatus: 'uncertain',
          remoteObserved: observed,
          cloneCompleted: false,
          pushCompleted: false,
        },
      });
      expect(calls.some((call) => call.args[1] === 'clone' || call.args[1] === 'delete')).toBe(
        false,
      );
      await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
    });
  });
}

for (const failure of [
  '--version',
  'auth',
  'users/acme',
  'repos/' + templateRepository,
  'repos/acme/skills',
]) {
  test(`preflight failure at ${failure} does not create local or remote state`, async () => {
    await fixture(async ({directory, calls, runner}) => {
      await expect(
        runRegistryInit(
          {directory, registryId: 'acme/skills', github: true, yes: true},
          {run: runner},
        ),
      ).rejects.toThrow();
      await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
      expect(calls.some((call) => call.args[1] === 'create')).toBe(false);
    }, failure);
  });
}

test('existing remotes and invalid --github --no-git fail before reserving a destination', async () => {
  await fixture(async ({directory, runner}) => {
    await expect(
      runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, git: false, yes: true},
        {run: runner},
      ),
    ).rejects.toThrow(/requires Git/);

    const collision: CommandRunner = (command, args) =>
      args[1] === 'repos/acme/skills'
        ? Promise.resolve('https://github.com/acme/skills')
        : runner(command, args);

    await expect(
      runRegistryInit(
        {directory, registryId: 'acme/skills', github: true, yes: true},
        {run: collision},
      ),
    ).rejects.toThrow(/already exists/);
    await expect(fs.stat(directory)).rejects.toMatchObject({code: 'ENOENT'});
  });
});

test('default command runner isolates caller repository variables', async () => {
  await fixture(async ({root, directory}) => {
    const other = path.join(root, 'other');
    await git(['init', other]);
    vi.stubEnv('GIT_DIR', path.join(other, '.git'));
    vi.stubEnv('GIT_WORK_TREE', other);
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', 'core.worktree');
    vi.stubEnv('GIT_CONFIG_VALUE_0', other);

    try {
      await defaultRun('git', ['init', directory]);
      expect((await fs.stat(path.join(directory, '.git'))).isDirectory()).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
