import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, expect, test, vi} from 'vite-plus/test';
import {
  authenticatedGithubClient,
  githubClient,
  githubGitEnvironment,
} from '../src/lib/registry/github.js';
import {defaultRun} from '../src/lib/registry/init.js';

afterEach(() => vi.unstubAllEnvs());

test('environment tokens take precedence without requiring GitHub CLI', async () => {
  vi.stubEnv('PATH', '');
  vi.stubEnv('GITHUB_TOKEN', ' preferred-token ');
  vi.stubEnv('GH_TOKEN', 'secondary-token');
  expect(await (await authenticatedGithubClient()).auth()).toMatchObject({
    token: 'preferred-token',
  });

  vi.stubEnv('GITHUB_TOKEN', ' ');
  expect(await (await authenticatedGithubClient()).auth()).toMatchObject({
    token: 'secondary-token',
  });
});

test('a signed-in GitHub CLI is used only to retrieve a credential', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-credential-'));

  try {
    await fs.writeFile(
      path.join(root, 'gh'),
      '#!/bin/sh\n[ "$*" = "auth token --hostname github.com" ] || exit 2\nprintf cli-token\n',
      {mode: 0o700},
    );
    vi.stubEnv('PATH', root);
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '');
    expect(await (await authenticatedGithubClient()).auth()).toMatchObject({token: 'cli-token'});
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('missing credentials report the supported authentication options', async () => {
  vi.stubEnv('PATH', '');
  vi.stubEnv('GITHUB_TOKEN', '');
  vi.stubEnv('GH_TOKEN', '');
  await expect(authenticatedGithubClient()).rejects.toThrow(
    /GITHUB_TOKEN or GH_TOKEN.*gh auth login/,
  );
});

test('HTTPS credentials reach Git through temporary configuration scoped to the repository', async () => {
  const environment = await githubGitEnvironment(githubClient('test-token'), 'acme/skills');
  const key = 'http.https://github.com/acme/skills.git.extraheader';

  const authorization =
    'AUTHORIZATION: basic ' + Buffer.from('x-access-token:test-token').toString('base64');

  expect(environment).toMatchObject({GIT_CONFIG_KEY_0: key, GIT_CONFIG_KEY_1: key});
  expect(await defaultRun('git', ['config', '--get-all', key], environment)).toBe(
    '\n' + authorization + '\n',
  );
});

test('each API request has its own deadline and respects caller cancellation', async () => {
  const signals: AbortSignal[] = [];

  const github = githubClient('test-token', async (input, init) => {
    const {signal} = new Request(input, init);
    signals.push(signal);
    signal.throwIfAborted();

    return Response.json({login: 'acme'});
  });

  await github.rest.users.getAuthenticated();
  await github.rest.users.getAuthenticated();
  expect(signals[0]).not.toBe(signals[1]);
  expect(signals.every((signal) => !signal.aborted)).toBe(true);
  await expect(
    github.rest.users.getAuthenticated({
      request: {signal: AbortSignal.abort(new Error('request cancelled'))},
    }),
  ).rejects.toThrow('request cancelled');
  expect(signals).toHaveLength(3);
});
