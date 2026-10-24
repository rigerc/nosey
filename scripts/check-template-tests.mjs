#!/usr/bin/env node

import {spawnSync} from 'node:child_process';
import {copyFile, lstat, mkdir, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = path.join(root, 'template/registry');
const expectedCommit = '65521cd55cade0bca67c0083b2960876ba924e09';
const expectedTree = '66889743d2c7dc4b5f5584232e62db19b60b23bd';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    ...options,
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status}):\n${result.stderr || result.stdout}`,
    );
  }

  return result.stdout;
}

const actualCommit = run('git', ['-C', template, 'rev-parse', 'HEAD']).trim();
const actualTree = run('git', ['-C', template, 'rev-parse', 'HEAD^{tree}']).trim();

if (actualCommit !== expectedCommit || actualTree !== expectedTree) {
  throw new Error(`Refusing unexpected template pin ${actualCommit} (${actualTree})`);
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'nosey-template-tests-'));

try {
  const archivedTemplate = path.join(temporaryRoot, 'nosey-registry-template');
  const schemaFixture = path.join(temporaryRoot, 'nosey', 'schemas', 'registry');
  await mkdir(archivedTemplate, {recursive: true});
  await mkdir(schemaFixture, {recursive: true});

  const archive = path.join(temporaryRoot, 'template.tar');
  run('git', ['-C', template, 'archive', '--format=tar', `--output=${archive}`, expectedCommit]);
  run('tar', ['-xf', archive, '-C', archivedTemplate]);

  for (const name of ['skills-manifest.schema.json', 'skills-map.schema.json']) {
    const source = path.join(root, 'schemas/registry', name);

    if (!(await lstat(source)).isFile())
      throw new Error(`Expected a regular proposed schema file: ${source}`);
    await copyFile(source, path.join(schemaFixture, name));
  }

  const tests = run(process.execPath, ['--test', '--test-reporter=tap'], {cwd: archivedTemplate});
  process.stdout.write(tests);

  const value = (label) => {
    const match = tests.match(new RegExp(`^# ${label} (\\d+)$`, 'm'));

    if (!match) throw new Error(`Could not read the Node test runner ${label} summary`);

    return Number(match[1]);
  };

  const total = value('tests');
  const passed = value('pass');
  const failed = value('fail');
  const cancelled = value('cancelled');
  const skipped = value('skipped');

  if (failed || cancelled || skipped || total !== passed) {
    throw new Error(
      `Template suite must pass with no skips (tests=${total}, pass=${passed}, fail=${failed}, cancelled=${cancelled}, skipped=${skipped})`,
    );
  }

  process.stdout.write(
    `Isolated full template suite: ${passed}/${total} passed; skipped=${skipped}; pin=${actualCommit}; tree=${actualTree}\n`,
  );
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}
