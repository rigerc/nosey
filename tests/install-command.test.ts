import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterEach, expect, test} from 'vite-plus/test';
import {generateInstallCommands} from '../src/features/skills/install';
import {buildInstallPlan} from '../src/features/skills/plan';

const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));
const tsx = import.meta.resolve('tsx');
const roots: string[] = [];

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nosey-install-'));
  roots.push(root);
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({dependencies: {react: '^19', next: '^15'}}),
  );

  return root;
}

function fakeNpx(root: string, program: string): string {
  const bin = path.join(root, 'bin');
  mkdirSync(bin, {recursive: true});
  writeFileSync(path.join(bin, 'npx'), '#' + '!' + process.execPath + '\n' + program, {
    mode: 0o755,
  });

  return bin + path.delimiter + process.env.PATH;
}

function run(root: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', tsx, cli, ...args],
      {
        cwd: root,
        env: {
          ...process.env,
          XDG_CONFIG_HOME: path.join(root, 'config'),
          APPDATA: path.join(root, 'config'),
          ...env,
        },
        timeout: 30_000,
      },
      (error, stdout, stderr) => {
        resolve({code: error === null ? 0 : Number(error.code ?? 1), stdout, stderr});
      },
    );
  });
}

function installProgram(record: string): string {
  return `
    const fs = require('node:fs');
    const path = require('node:path');
    const args = process.argv.slice(2);
    fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({cwd: process.cwd(), args}) + '\\n');
    const skills = [];
    const agents = [];
    for (let index = 0; index < args.length; index++) {
      if (args[index] === '--skill') skills.push(args[++index]);
      if (args[index] === '--agent') agents.push(args[++index]);
    }
    const source = args[2];
    const directories = {codex: '.agents/skills', 'claude-code': '.claude/skills'};
    const lockPath = path.join(process.cwd(), 'skills-lock.json');
    let lock = {version: 1, skills: {}};
    try { lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
    for (const name of skills) {
      for (const agent of agents) {
        const directory = directories[agent];
        if (!directory) continue;
        const folder = path.join(process.cwd(), directory, name);
        fs.mkdirSync(folder, {recursive: true});
        fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\\nname: ' + name + '\\n---\\n');
        lock.skills[name] = {source, sourceType: 'github'};
      }
    }
    fs.writeFileSync(lockPath, JSON.stringify(lock));
    process.stdout.write('fake npx noise\\n');
  `;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

test('prints a plan without spawning the Skills CLI', async () => {
  const root = fixture();
  const marker = path.join(root, 'spawned');

  const env = {
    PATH: fakeNpx(root, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'yes')`),
  };

  const json = await run(root, ['install', '.', '--agent', 'codex', '--json'], env);

  expect(json.code).toBe(0);
  const document = JSON.parse(json.stdout);
  expect(document.executed).toBe(false);
  expect(document.commands.length).toBeGreaterThan(0);
  expect(document.commands[0]).toContain('npx skills add');
  expect(document.skills.every((skill: {action: string}) => skill.action === 'install')).toBe(true);
  expect(existsSync(marker)).toBe(false);

  const text = await run(root, ['install', '.', '--agent', 'codex'], env);
  expect(text.code).toBe(0);
  expect(text.stdout).toContain('Agents: codex');
  expect(text.stdout).toContain('Commands (');
  expect(existsSync(marker)).toBe(false);
});

test('executes captured commands and makes a second run idempotent', async () => {
  const root = fixture();
  const record = path.join(root, 'npx.jsonl');
  const env = {PATH: fakeNpx(root, installProgram(record))};
  const first = await run(root, ['install', '.', '--agent', 'codex', '--yes', '--json'], env);

  expect(first.code).toBe(0);
  const document = JSON.parse(first.stdout);
  expect(document.executed).toBe(true);
  expect(document.ok).toBe(true);
  expect(document.results).toHaveLength(document.commands.length);
  expect(document.results.every((result: {ok: boolean}) => result.ok)).toBe(true);
  expect(document.results[0].output).toContain('fake npx noise');
  expect(readFileSync(record, 'utf8').trim().split('\n')).toHaveLength(document.commands.length);

  const second = await run(root, ['install', '.', '--agent', 'codex', '--yes', '--json'], env);
  expect(second.code).toBe(0);
  const repeated = JSON.parse(second.stdout);
  expect(repeated.commands).toEqual([]);
  expect(repeated.results).toEqual([]);
  expect(repeated.skills.every((skill: {action: string}) => skill.action === 'installed')).toBe(
    true,
  );
  expect(readFileSync(record, 'utf8').trim().split('\n')).toHaveLength(document.commands.length);
});

test('stops after a failing command and reports captured output as JSON', async () => {
  const root = fixture();

  const env = {
    PATH: fakeNpx(root, `process.stdout.write('boom\\n'); process.exit(7);`),
  };

  const result = await run(root, ['install', '.', '--agent', 'codex', '--yes', '--json'], env);

  expect(result.code).toBe(7);
  const document = JSON.parse(result.stdout);
  expect(document.ok).toBe(false);
  expect(document.results).toHaveLength(1);
  expect(document.results[0]).toMatchObject({exitCode: 7, ok: false});
  expect(document.results[0].output).toContain('boom');
});

test('requires an agent and honors config and explicit precedence', async () => {
  const root = fixture();
  const missing = await run(root, ['install', '.', '--json']);
  expect(missing.code).toBe(2);
  expect(missing.stdout).toBe('');
  expect(missing.stderr).toContain('No target agents');

  mkdirSync(path.join(root, 'config', 'nosey'), {recursive: true});
  writeFileSync(
    path.join(root, 'config', 'nosey', 'config.json'),
    JSON.stringify({skillsCli: {defaultAgents: ['claude-code']}}),
  );
  const configured = await run(root, ['install', '.', '--json']);
  expect(configured.code).toBe(0);
  expect(JSON.parse(configured.stdout).agents).toEqual(['claude-code']);

  const explicit = await run(root, ['install', '.', '--agent', 'codex', '--json']);
  expect(explicit.code).toBe(0);
  expect(JSON.parse(explicit.stdout).agents).toEqual(['codex']);
});

test('rejects invalid flags and configuration before planning', async () => {
  const root = fixture();

  for (const args of [
    ['install', '.', '--agent', 'unknown', '--json'],
    ['install', '.', '--skills-cli', 'skills;rm', '--json'],
    ['install', '.', '--yes', '--dry-run', '--json'],
    ['install', '.', '--skills-only', '--json'],
    ['install', '.', '--screen', 'settings', '--json'],
    ['install', '.', '--global', '--json'],
    ['install', '.', '--registry-id', 'acme/skills', '--json'],
    ['install', '.', '--depth', '-1', '--json'],
  ]) {
    const result = await run(root, args);
    expect(result.code).toBe(2);
  }

  mkdirSync(path.join(root, 'config', 'nosey'), {recursive: true});
  writeFileSync(path.join(root, 'config', 'nosey', 'config.json'), '{ bad json');
  const invalid = await run(root, ['install', '.', '--agent', 'codex', '--json']);
  expect(invalid.code).toBe(2);
  expect(invalid.stderr).toContain('Cannot read configuration');
});

test('rejects missing/non-directory project paths and scan-only options', async () => {
  const root = fixture();
  const file = path.join(root, 'not-a-directory');
  writeFileSync(file, 'hello');

  for (const args of [
    ['install', 'missing-project', '--agent', 'codex', '--json'],
    ['install', file, '--agent', 'codex', '--json'],
    ['install', '.', '--agent', 'codex', '--explain', '--json'],
    ['install', '.', 'extra-path', '--agent', 'codex', '--json'],
  ]) {
    const result = await run(root, args);
    expect(result.code).toBe(2);
    expect(result.stdout).toBe('');
  }
});

test('discovers local agents and deduplicates explicit agent flags', async () => {
  const root = fixture();
  mkdirSync(path.join(root, '.agents', 'skills'), {recursive: true});
  const discovered = await run(root, ['install', '.', '--json']);
  expect(discovered.code).toBe(0);
  expect(JSON.parse(discovered.stdout).agents).toEqual(['codex']);

  const explicit = await run(root, [
    'install',
    '.',
    '--agent',
    'claude-code',
    '--agent',
    'claude-code',
    '--json',
  ]);

  expect(explicit.code).toBe(0);
  expect(JSON.parse(explicit.stdout).agents).toEqual(['claude-code']);
});

test('sorts recommended skills before generating commands', async () => {
  const root = fixture();

  const plan = await buildInstallPlan(
    root,
    [{id: 'zeta/skills/z'}, {id: 'alpha/skills/a'}],
    ['codex'],
  );

  expect(plan.skills.map((skill) => skill.id)).toEqual(['alpha/skills/a', 'zeta/skills/z']);
  expect(plan.commands.commands.map((command) => command.includes('alpha/skills'))).toEqual([
    true,
    false,
  ]);
});

test('runs a pinned Skills CLI in text mode only with --yes', async () => {
  const root = fixture();
  const record = path.join(root, 'pinned-npx.jsonl');
  const env = {PATH: fakeNpx(root, installProgram(record))};

  const preview = await run(
    root,
    ['install', '.', '--agent', 'codex', '--skills-cli', 'skills@1.2.3'],
    env,
  );

  expect(preview.code).toBe(0);
  expect(preview.stdout).toContain('npx skills@1.2.3 add');
  expect(existsSync(record)).toBe(false);

  const executed = await run(
    root,
    ['install', '.', '--agent', 'codex', '--skills-cli', 'skills@1.2.3', '--yes'],
    env,
  );

  expect(executed.code).toBe(0);
  expect(executed.stdout).toContain('Skills CLI completed');

  const calls = readFileSync(record, 'utf8')
    .trim()
    .split(String.fromCharCode(10))
    .map((line) => JSON.parse(line));

  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call: {args: string[]}) => call.args[0] === 'skills@1.2.3')).toBe(true);
});

test('pins the Skills CLI package without changing the default', () => {
  const root = fixture();

  const pinned = generateInstallCommands(
    ['acme/skills/alpha'],
    [{id: 'acme/skills/alpha'}],
    ['codex'],
    root,
    'skills@1.2.3',
  );

  expect(pinned.commands[0]).toContain('npx skills@1.2.3 add');
  expect(
    generateInstallCommands(
      ['acme/skills/alpha'],
      [{id: 'acme/skills/alpha'}],
      ['codex'],
      root,
      '--global',
    ).errors,
  ).toHaveLength(1);
});

test('partially installed skills target only the missing agents', async () => {
  const root = fixture();
  mkdirSync(path.join(root, '.agents/skills/alpha'), {recursive: true});
  writeFileSync(path.join(root, '.agents/skills/alpha/SKILL.md'), '---\nname: alpha\n---\n');
  writeFileSync(
    path.join(root, 'skills-lock.json'),
    JSON.stringify({version: 1, skills: {alpha: {source: 'acme/skills', sourceType: 'github'}}}),
  );

  const plan = await buildInstallPlan(root, [{id: 'acme/skills/alpha'}], ['codex', 'claude-code']);

  expect(plan.skills).toEqual([
    {id: 'acme/skills/alpha', action: 'install', agents: ['claude-code']},
  ]);
  expect(plan.commands.commands[0]).toContain('--agent claude-code');
  expect(plan.commands.commands[0]).not.toContain('--agent codex');
});
