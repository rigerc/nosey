import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {test, expect} from 'vite-plus/test';
import type {CommandRunner} from '../src/lib/registry/init.js';
import {githubClient} from '../src/lib/registry/github.js';
import {
  assertGeneratedTemplateTree,
  assertTemplateDefaultHead,
  templateArchiveUrl,
  validateTrustedTemplateRevision,
  verifyTemplateGuide,
  type TrustedTemplateRevision,
} from '../src/lib/registry/template-provenance.js';
import {trustedTemplateRevision} from '../src/lib/registry/template-source.js';

const commit = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const guide = Buffer.from('trusted downstream guide\n');
const digest = createHash('sha256').update(guide).digest('hex');

const revision: TrustedTemplateRevision = {
  commit,
  tree,
  maintainerGuideSha256: 'c'.repeat(64),
  downstreamGuideSha256: digest,
};

test('approved guide digests match the bytes in the pinned template submodule', async () => {
  const root = path.resolve('template/registry/scripts/test/fixtures/identity/v1');

  const [maintainer, downstream] = await Promise.all([
    readFile(path.join(root, 'maintainer-guide.md')),
    readFile(path.join(root, 'downstream-guide.md')),
  ]);

  expect(createHash('sha256').update(maintainer).digest('hex')).toBe(
    trustedTemplateRevision.maintainerGuideSha256,
  );
  expect(createHash('sha256').update(downstream).digest('hex')).toBe(
    trustedTemplateRevision.downstreamGuideSha256,
  );
});

test('trusted provenance validates Git object and guide hash shapes', () => {
  expect(validateTrustedTemplateRevision(revision).commit).toBe(commit);
  expect(templateArchiveUrl(revision)).toBe(
    `https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/${commit}`,
  );
  expect(() => validateTrustedTemplateRevision({...revision, tree: 'bad'})).toThrow(/tree/);
  expect(() =>
    validateTrustedTemplateRevision({...revision, maintainerGuideSha256: 'a'.repeat(40)}),
  ).toThrow(/SHA-256/);
});

test('guide verification is bounded and compares bytes only to explicit trusted hashes', () => {
  expect(() => verifyTemplateGuide(guide, revision, 'downstream')).not.toThrow();
  expect(() => verifyTemplateGuide(Buffer.from('modified'), revision, 'downstream')).toThrow(
    /hash mismatch/,
  );
  expect(() =>
    verifyTemplateGuide(Buffer.alloc(4 * 1024 * 1024 + 1), revision, 'downstream'),
  ).toThrow(/4 MiB/);
});

test('GitHub preflight accepts exact default HEAD and rejects drift before any create request', async () => {
  const requests: string[] = [];
  let headSha = commit;

  const github = githubClient('fake', async (input, init) => {
    const request = new Request(input, init);
    requests.push(request.method + ' ' + new URL(request.url).pathname);

    if (request.url.endsWith('/repos/rigerc/nosey-registry-template'))
      return Response.json({default_branch: 'main', is_template: true});

    if (request.url.endsWith('/branches/main')) return Response.json({commit: {sha: headSha}});

    if (request.method === 'POST') return Response.json({id: 1}, {status: 201});
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  });

  await expect(assertTemplateDefaultHead(github, revision)).resolves.toBeUndefined();
  headSha = 'd'.repeat(40);
  await expect(assertTemplateDefaultHead(github, revision)).rejects.toThrow(
    /no remote was created/,
  );
  expect(requests.every((request) => request.startsWith('GET '))).toBe(true);
});

test('generated clone gate accepts matching clean tree, including unrelated commit history', async () => {
  const calls: string[][] = [];

  const runner: CommandRunner = async (_command, args) => {
    calls.push(args);

    if (args.includes('status')) return '';

    if (args.includes('rev-parse')) return tree;
    throw new Error('unexpected command');
  };

  await expect(assertGeneratedTemplateTree('/clone', runner, revision)).resolves.toBe(tree);
  expect(calls.map((args) => args.at(-1))).toEqual([
    '--untracked-files=all',
    'HEAD^{tree}',
    '--untracked-files=all',
  ]);
});

test('generated clone gate rejects dirty and wrong-tree clones before subsequent work', async () => {
  const dirty: CommandRunner = async () => '?? surprise\n';
  await expect(assertGeneratedTemplateTree('/clone', dirty, revision)).rejects.toThrow(/dirty/);

  const wrongTree: CommandRunner = async (_command, args) =>
    args.includes('status') ? '' : 'e'.repeat(40);

  await expect(assertGeneratedTemplateTree('/clone', wrongTree, revision)).rejects.toThrow(
    /does not match approved/,
  );
});

test('generated clone gate rechecks actual worktree status after reading HEAD tree', async () => {
  const root = await import('node:fs/promises').then(({mkdtemp}) =>
    mkdtemp(path.join(process.env['TMPDIR'] ?? '/tmp', 'nosey-tree-race-')),
  );

  const {defaultRun} = await import('../src/lib/registry/init.js');
  const directory = path.join(root, 'clone');

  try {
    await import('node:fs/promises').then(({mkdir}) => mkdir(directory));
    await defaultRun('git', ['init', directory]);
    await defaultRun('git', [
      '-C',
      directory,
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'test: seed',
    ]);
    let injected = false;

    const runner: CommandRunner = async (command, args) => {
      const result = await defaultRun(command, args);

      if (!injected && args.includes('rev-parse')) {
        injected = true;
        await import('node:fs/promises').then(({writeFile}) =>
          writeFile(path.join(directory, 'surprise.txt'), 'race'),
        );
      }

      return result;
    };

    await expect(
      assertGeneratedTemplateTree(directory, runner, {
        ...revision,
        tree: (await defaultRun('git', ['-C', directory, 'rev-parse', 'HEAD^{tree}'])).trim(),
      }),
    ).rejects.toThrow(/changed during template verification/);
    expect(injected).toBe(true);
  } finally {
    await import('node:fs/promises').then(({rm}) => rm(root, {recursive: true, force: true}));
  }
});
