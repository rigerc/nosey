import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {afterEach, beforeEach, expect, test} from 'vite-plus/test';
import type {Report} from '../src/lib/detect';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));
const tsx = import.meta.resolve('tsx');
let root: string;
const manifest = JSON.stringify({dependencies: {react: '^19', next: '^15'}});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nosey-scan-'));
  await writeFile(join(root, 'package.json'), manifest);
});

afterEach(async () => {
  await rm(root, {recursive: true, force: true});
});

function command(...args: string[]) {
  return exec(process.execPath, ['--import', tsx, cli, ...args], {
    cwd: root,
    env: {...process.env, XDG_CONFIG_HOME: join(root, 'config'), APPDATA: join(root, 'config')},
  });
}

test('explicit scan, path alias, and JSON-only invocation share the same engine', async () => {
  const explicit = await command('scan', '.', '--json');
  const alias = await command('.', '--json');
  const implicit = await command('--json');
  expect(explicit.stderr).toBe('');
  expect(alias.stdout).toBe(explicit.stdout);
  expect(implicit.stdout).toBe(explicit.stdout);
  // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
  const report = JSON.parse(explicit.stdout) as Report;
  expect(report.technologies.map((technology) => technology.id)).toEqual(
    expect.arrayContaining(['react', 'nextjs']),
  );
  expect(report.skills.length).toBeGreaterThan(0);
  expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(manifest);
  expect(await readdir(root)).toEqual(['package.json']);
});

test('scan reports evidence and supports plain, skills-only, and no-interactive modes', async () => {
  // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
  const report = JSON.parse((await command('scan', '--json')).stdout) as Report;
  const skills = await command('scan', '--skills-only');
  expect(skills.stdout.trim().split('\n')).toEqual(report.skills.map((skill) => skill.id));
  const plain = await command('scan', '--plain', '--explain');
  const noninteractive = await command('scan', '--no-interactive', '--explain');
  expect(plain.stdout).toBe(noninteractive.stdout);
  expect(plain.stdout).toContain('Project: ' + root);
  expect(plain.stdout).toContain('package.json');
  expect(plain.stdout).toContain('no skills were installed');
});

test('invalid scan inputs fail before creating registry files', async () => {
  for (const args of [
    ['scan', '--json', '--skills-only'],
    ['scan', '--depth', '-1'],
    ['scan', '--max-files', '0'],
    ['scan', '.', 'extra'],
    ['scan', '--setup'],
    ['scan', '--screen', 'settings'],
    ['scan', '--global'],
    ['scan', '--no-github'],
    ['registry', 'init', './registry', '--registry-id', 'acme/skills', '--depth', '1'],
  ]) {
    await expect(command(...args)).rejects.toMatchObject({code: 2});
  }

  expect(await readdir(root)).toEqual(['package.json']);
});

test('ASCII plain reports use ASCII decorations and retain detection evidence', async () => {
  const normal = await command('scan', '--plain', '--explain');
  const ascii = await command('--plain', '--ascii', '--explain');
  expect(ascii.stderr).toBe('');
  expect(ascii.stdout).toBe(
    normal.stdout.replaceAll('•', '-').replaceAll('↳', '->').replaceAll('—', '-'),
  );
  expect(ascii.stdout).toContain('  - React');
  expect(ascii.stdout).toContain('      -> packages: react (package.json)');
});

test('execution-enabled config leaves headless scans as reports without installation', async () => {
  const config = join(root, 'execution.json');
  await writeFile(
    config,
    JSON.stringify({skillsCli: {enabled: true, execute: true, defaultAgents: ['codex']}}),
  );
  const before = await readdir(root);
  const plain = await command('scan', '--plain', '--config', config);
  expect(plain.stdout).toContain('no skills were installed');
  const json = await command('--json', '--config', config);
  expect(JSON.parse(json.stdout).skills.length).toBeGreaterThan(0);
  expect(await readdir(root)).toEqual(before);
});

test('Codex MCP config feeds JSON, plain evidence and skills-only output without starting servers', async () => {
  await mkdir(join(root, '.codex'));

  const toml =
    '[mcp_servers.browser]\ncommand="npx"\nargs=["@playwright/mcp@latest"]\n[mcp_servers.browser.env]\nAPI_KEY="private-mcp-key"\n';

  await writeFile(join(root, '.codex/config.toml'), toml);
  const json = await command('scan', '--json');
  // SAFETY: assertions verify the report produced by this controlled CLI fixture.
  const report = JSON.parse(json.stdout) as Report;
  expect(report.mcpServers).toContainEqual(
    expect.objectContaining({file: '.codex/config.toml', name: 'browser', status: 'configured'}),
  );
  expect(json.stdout).not.toContain('private-mcp-key');
  const plain = await command('scan', '--plain', '--explain', '--ascii');
  expect(plain.stdout).toContain('MCP servers (1; configuration only)');
  expect(plain.stdout).toContain('mcp: browser (.codex/config.toml)');
  const skills = await command('scan', '--skills-only');
  expect(skills.stdout).toContain('anthropics/skills/webapp-testing');
  expect(await readFile(join(root, '.codex/config.toml'), 'utf8')).toBe(toml);
  expect(json.stderr + plain.stderr + skills.stderr).toBe('');
});
