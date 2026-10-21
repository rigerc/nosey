import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vite-plus/test';
import {runCommand} from '../src/commands';

describe('headless commands', () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = 0;
    for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true});
  });

  function fixture(name: string) {
    const dir = mkdtempSync(join(tmpdir(), 'ink-commands-'));
    dirs.push(dir);
    return join(dir, name);
  }

  it('reports defaults as healthy JSON without starting Ink', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runCommand('doctor', [], {configFile: fixture('missing.json'), json: true})).toBe(
      true,
    );
    const report = JSON.parse(String(log.mock.calls[0]![0]));
    expect(report.ok).toBe(true);
    expect(report.checks.map((check: {name: string}) => check.name)).toEqual([
      'node',
      'configuration',
    ]);
    expect(report.checks[1].detail).toContain('defaults in use');
  });

  it('fails with exit code 1 when configuration is invalid', async () => {
    const file = fixture('invalid.json');
    writeFileSync(file, '{ bad json');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runCommand('doctor', [], {configFile: file, json: true})).toBe(true);
    expect(JSON.parse(String(log.mock.calls[0]![0])).ok).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it('rejects extra positional arguments and preserves unknown-command handling', async () => {
    await expect(runCommand('doctor', ['extra'], {})).rejects.toThrow('positional arguments');
    expect(await runCommand('unknown', [], {})).toBe(false);
  });
});
