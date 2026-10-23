import {execFile} from 'node:child_process';
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {afterEach, beforeEach, expect, test} from 'vite-plus/test';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));
const tsx = import.meta.resolve('tsx');
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nosey-schema-'));
});

afterEach(async () => {
  await rm(root, {recursive: true, force: true});
});

function command(...args: string[]) {
  return exec(process.execPath, ['--import', tsx, cli, ...args], {
    cwd: root,
    env: {...process.env, XDG_CONFIG_HOME: root, APPDATA: root, NO_COLOR: '1'},
  });
}

test('schema outputs canonical JSON from any working directory without creating files', async () => {
  for (const [name, filename] of [
    ['skills-map', 'skills-map.schema.json'],
    ['manifest', 'skills-manifest.schema.json'],
  ] as const) {
    const expected = JSON.parse(
      await readFile(new URL('../schemas/registry/' + filename, import.meta.url), 'utf8'),
    );

    const {stdout, stderr} = await command('schema', name);

    expect(JSON.parse(stdout)).toEqual(expected);
    expect(stdout.endsWith('\n')).toBe(true);
    expect(stderr).toBe('');
  }

  expect(await readdir(root)).toEqual([]);
});

test('schema aliases and output flags work independently of configuration', async () => {
  const config = join(root, 'invalid.json');
  await writeFile(config, '{ invalid configuration');
  const map = await command('schema', 'skills-map');
  const manifest = await command('schema', 'manifest');

  for (const name of ['skill-map', 'map', 'skills-manifest']) {
    const result = await command('schema', name, '--plain', '--json', '--config', config);
    expect(result.stdout).toBe(name === 'skills-manifest' ? manifest.stdout : map.stdout);
    expect(result.stderr).toBe('');
  }

  expect(await readdir(root)).toEqual(['invalid.json']);
});

test('invalid schema arguments fail with exit code 2 and no schema output', async () => {
  for (const args of [
    [],
    ['unknown'],
    ['manifest', 'extra'],
    ['manifest', '--setup'],
    ['manifest', '--skills-only'],
    ['manifest', '--explain'],
    ['manifest', '--screen', 'settings'],
    ['manifest', '--depth', '1'],
    ['manifest', '--max-files', '1'],
    ['manifest', '--no-frontend-bonus'],
    ['manifest', '--registry', './missing'],
    ['manifest', '--global'],
    ['manifest', '--project'],
    ['manifest', '--ref', 'main'],
    ['manifest', '--yes'],
  ]) {
    await expect(command('schema', ...args)).rejects.toMatchObject({code: 2, stdout: ''});
  }

  expect(await readdir(root)).toEqual([]);
});
