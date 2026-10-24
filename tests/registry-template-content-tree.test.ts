import {execFileSync} from 'node:child_process';
import {chmod, mkdtemp, mkdir, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {expect, test} from 'vite-plus/test';
import {computeTemplateContentTree} from '../src/lib/registry/template-content-tree.js';

test('matches Git tree hashing for UTF-8 names, nested directories, ordering, and executable files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nosey-content-tree-'));
  const gitDir = `${root}.git`;

  const git = (args: string[]) =>
    execFileSync('git', ['--git-dir', gitDir, '--work-tree', root, ...args], {
      encoding: 'utf8',
    }).trim();

  try {
    execFileSync('git', ['init', '--bare', '--quiet', gitDir]);
    git(['config', 'user.name', 'Nosey test']);
    git(['config', 'user.email', 'nosey@example.invalid']);
    await mkdir(path.join(root, 'item'), {recursive: true});
    await mkdir(path.join(root, 'nested', '深い'), {recursive: true});
    await writeFile(path.join(root, 'é.txt'), Buffer.from([0, 255, 10]));
    await writeFile(path.join(root, 'item.txt'), 'file sorts beside directory\n');
    await writeFile(path.join(root, 'item', 'child.txt'), 'nested\n');
    await writeFile(path.join(root, 'nested', '深い', '実行'), '#!/bin/sh\n');
    await chmod(path.join(root, 'nested', '深い', '実行'), 0o755);
    git(['add', '--all']);

    const expected = git(['write-tree']);
    expect(await computeTemplateContentTree(root)).toBe(expected);
  } finally {
    await rm(root, {recursive: true, force: true});
    await rm(gitDir, {recursive: true, force: true});
  }
});
