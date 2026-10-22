import {execFile} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterEach, expect, test, vi} from 'vite-plus/test';
import {completeSelection, runInstallCommand} from '../src/features/skills/execute';
import {generateInstallCommands} from '../src/features/skills/install';

const exec = promisify(execFile);
const roots: string[] = [];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'nosey-execution-'));
  roots.push(root);

  return root;
}

function fakeNpx(root: string, program: string) {
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'npx'), '#!' + process.execPath + '\n' + program, {mode: 0o755});

  return bin + path.delimiter + process.env.PATH;
}

afterEach(() => {
  vi.unstubAllEnvs();

  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

test('printing commands or IDs and empty execution plans never start a process', async () => {
  const run = vi.fn(runInstallCommand);
  const write = vi.fn<(message: string) => void>();
  expect(await completeSelection({ids: ['demo/skill'], commands: ['print this']}, run, write)).toBe(
    0,
  );
  expect(write).toHaveBeenLastCalledWith('print this\n');
  await completeSelection({ids: ['demo/skill']}, run, write);
  expect(write).toHaveBeenLastCalledWith('demo/skill\n');
  await completeSelection({ids: []}, run, write);
  expect(write).toHaveBeenLastCalledWith('No skills selected.\n');
  await completeSelection({ids: [], execution: []}, run, write);
  expect(write).toHaveBeenLastCalledWith('No installation commands necessary.\n');
  expect(run).not.toHaveBeenCalled();
});

test('executes sequentially and stops after the first failing command', async () => {
  const root = fixture();
  const invocations = ['first', 'second', 'third'].map((name) => ({cwd: root, args: [name]}));
  const completed: string[] = [];

  const run = vi.fn(async (invocation: {cwd: string; args: string[]}) => {
    // The previous command must finish before the next starts.
    expect(completed).toHaveLength(invocations.indexOf(invocation));
    await Promise.resolve();
    completed.push(invocation.args[0]!);

    return completed.length === 2 ? 7 : 0;
  });

  const write = vi.fn<(message: string) => void>();
  expect(await completeSelection({ids: [], execution: invocations}, run, write)).toBe(7);
  expect(completed).toEqual(['first', 'second']);
  expect(write).toHaveBeenLastCalledWith(expect.stringContaining('1/3 commands completed'));
});

test('reports success and does not hide startup errors or partial completion', async () => {
  const invocation = {cwd: fixture(), args: ['skills', 'add', 'demo/skills']};
  const write = vi.fn<(message: string) => void>();
  const run = vi.fn(async () => 0);
  expect(await completeSelection({ids: [], execution: [invocation]}, run, write)).toBe(0);
  expect(write).toHaveBeenLastCalledWith('Skills CLI completed 1/1 commands.\n');
  run.mockRejectedValueOnce(new Error('executable missing'));
  await expect(
    completeSelection({ids: [], execution: [invocation]}, run, write),
  ).rejects.toMatchObject({
    message: 'executable missing',
    exitCode: 1,
    hint: expect.stringContaining('0/1'),
  });
});

test('runs literal arguments in the project directory and handles npm bootstrap without a shell', async () => {
  const root = fixture();
  const project = path.join(root, "project ' $(touch injected)");
  mkdirSync(project);
  const record = path.join(root, 'record.json');
  vi.stubEnv(
    'PATH',
    fakeNpx(
      root,
      `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(record)}, JSON.stringify({cwd: process.cwd(), args: process.argv.slice(2), yes: process.env.npm_config_yes}));
  `,
    ),
  );
  const source = "./local ' $(touch injected); registry";

  const plan = generateInstallCommands(
    ['team/skills/alpha'],
    [{id: 'team/skills/alpha', installSource: {source, name: 'alpha'}}],
    ['codex'],
    project,
  );

  expect(plan.errors).toEqual([]);
  expect(await runInstallCommand(plan.invocations[0]!)).toBe(0);
  expect(JSON.parse(readFileSync(record, 'utf8'))).toEqual({
    cwd: project,
    args: ['skills', 'add', source, '--skill', 'alpha', '--agent', 'codex', '--yes', '--json'],
    yes: 'true',
  });
  expect(existsSync(path.join(project, 'injected'))).toBe(false);
});

test('reports an unavailable npx executable', async () => {
  vi.stubEnv('PATH', fixture());
  await expect(runInstallCommand({cwd: fixture(), args: ['skills']})).rejects.toThrow(
    'Could not start Skills CLI',
  );
});

test('Ctrl+C cancels the process group, returns 130, and skips remaining commands', async () => {
  const root = fixture();
  const marker = path.join(root, 'descendant-cancelled');

  const descendant = `
    process.on('SIGINT', () => {require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'cancelled'); process.exit(0);});
    process.send('ready');
    setInterval(() => {}, 1000);
  `;

  const searchPath = fakeNpx(
    root,
    `
    const child = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
    process.on('SIGINT', () => setTimeout(() => process.exit(0), 100));
    child.on('message', () => process.kill(process.ppid, 'SIGINT'));
  `,
  );

  const driver = path.join(root, 'driver.mjs');
  writeFileSync(
    driver,
    `
    import {completeSelection} from ${JSON.stringify(path.resolve('src/features/skills/execute.ts'))};
    const invocation = {cwd: ${JSON.stringify(root)}, args: ['skills']};
    const before = process.listenerCount('SIGINT');
    const code = await completeSelection({ids: [], execution: [invocation, invocation]});
    if (process.listenerCount('SIGINT') !== before) throw new Error('Leaked SIGINT handler');
    console.log('RESULT=' + code);
  `,
  );

  const result = await exec(process.execPath, ['--import=tsx', driver], {
    env: {...process.env, PATH: searchPath},
    timeout: 15_000,
  });

  expect(result.stdout).toContain('RESULT=130');
  expect(result.stdout).toContain('0/2 commands completed');
  expect(result.stdout.match(/Running:/g)).toHaveLength(1);
  expect(readFileSync(marker, 'utf8')).toBe('cancelled');
});
