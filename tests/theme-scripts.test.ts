import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vite-plus/test';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function withProject(
  fn: (fixture: {
    root: string;
    run: (...args: string[]) => {status: number | null; stdout: string; stderr: string};
  }) => void,
) {
  const root = mkdtempSync(join(tmpdir(), 'ink-theme-edit-'));
  try {
    mkdirSync(join(root, 'scripts'), {recursive: true});
    mkdirSync(join(root, 'src/theme'), {recursive: true});
    copyFileSync(join(projectRoot, 'scripts/theme.mjs'), join(root, 'scripts/theme.mjs'));
    for (const file of ['palettes.json', 'defaults.json']) {
      copyFileSync(join(projectRoot, 'src/theme', file), join(root, 'src/theme', file));
    }
    fn({
      root,
      run: (...args) =>
        spawnSync(process.execPath, [join(root, 'scripts/theme.mjs'), ...args], {
          cwd: tmpdir(),
          encoding: 'utf8',
        }),
    });
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
}

function json(root: string, filename: string) {
  return JSON.parse(readFileSync(join(root, 'src/theme', filename), 'utf8'));
}

describe('project theme customization scripts', () => {
  it('lists existing palettes, semantic tokens, and the project default', () => {
    withProject(({run}) => {
      const result = run('list');
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain('Project default: auto');
      expect(result.stdout).toContain('dark:');
      expect(result.stdout).toContain('primary:');
      expect(result.stdout).toContain('mono: no colors');
    });
  });

  it('edits one palette token without changing other palettes or tokens', () => {
    withProject(({root, run}) => {
      const before = json(root, 'palettes.json');
      const result = run('token', 'dark', 'primary', '#AABBCC');
      expect(result.status, result.stderr).toBe(0);
      const after = json(root, 'palettes.json');
      expect(after.dark.primary).toBe('#AABBCC');
      expect(after.dark.accent).toBe(before.dark.accent);
      expect(after.light).toEqual(before.light);
      expect(after.contrast).toEqual(before.contrast);
      const again = run('token', 'dark', 'primary', '#AABBCC');
      expect(again.status).toBe(0);
      expect(again.stdout).toContain('Unchanged');
    });
  });

  it('accepts ANSI colors and enforces the contrast and mono invariants', () => {
    withProject(({root, run}) => {
      expect(run('token', 'contrast', 'focus', 'cyanBright').status).toBe(0);
      expect(json(root, 'palettes.json').contrast.focus).toBe('cyanBright');
      const before = readFileSync(join(root, 'src/theme/palettes.json'), 'utf8');
      for (const args of [
        ['token', 'contrast', 'focus', '#abcdef'],
        ['token', 'mono', 'primary', '#abcdef'],
        ['token', 'dark', 'invalid', '#abcdef'],
        ['token', 'invalid', 'primary', '#abcdef'],
        ['token', 'dark', 'primary', 'not-a-color'],
        ['token', 'dark', 'primary', '#123'],
        ['token', 'dark', 'primary'],
      ]) {
        const result = run(...args);
        expect(result.status).not.toBe(0);
        expect(readFileSync(join(root, 'src/theme/palettes.json'), 'utf8')).toBe(before);
      }
    });
  });

  it('changes the project default, supports auto and rejects invalid names', () => {
    withProject(({root, run}) => {
      expect(run('default', 'light').status).toBe(0);
      expect(json(root, 'defaults.json').defaultTheme).toBe('light');
      expect(run('default', 'mono').status).toBe(0);
      expect(json(root, 'defaults.json').defaultTheme).toBe('mono');
      expect(run('default', 'auto').status).toBe(0);
      expect(json(root, 'defaults.json').defaultTheme).toBe('auto');
      const before = readFileSync(join(root, 'src/theme/defaults.json'), 'utf8');
      expect(run('default', 'invalid').status).not.toBe(0);
      expect(run('default').status).not.toBe(0);
      expect(readFileSync(join(root, 'src/theme/defaults.json'), 'utf8')).toBe(before);
    });
  });

  it('rejects malformed JSON and invalid invocations without corrupting files', () => {
    withProject(({root, run}) => {
      const path = join(root, 'src/theme/palettes.json');
      writeFileSync(path, '{not json');
      expect(run('token', 'dark', 'primary', '#ffffff').status).not.toBe(0);
      expect(readFileSync(path, 'utf8')).toBe('{not json');
      expect(run('default', 'light').status).not.toBe(0);
      expect(run('something').status).not.toBe(0);
      expect(run('--help').status).toBe(0);
    });
  });
});
