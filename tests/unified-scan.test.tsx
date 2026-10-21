import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vite-plus/test';
import {App} from '../src/app';
import {mount, press} from './helpers/terminal';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, {recursive: true, force: true});
});

function scanApp(onConfirm = vi.fn(), dependencies: Record<string, string> = {react: '^19'}) {
  const dir = mkdtempSync(join(tmpdir(), 'nosey-combined-scan-'));
  directories.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({dependencies}));
  const app = <App options={{
    theme: 'mono', ascii: true, debug: false, screen: 'home',
    scan: {root: dir, depth: 8, maxFiles: 20000, frontendBonus: false, registry: [], explain: true},
    onConfirm,
  }} />;
  return {app, onConfirm};
}

describe('combined scan and skill selection', () => {
  it('renders scan results and a MultiSelect picker in the same screen', async () => {
    const {app} = scanApp();
    const terminal = await mount(app);
    await expect.poll(() => terminal.lastFrame()).toContain('Suggested skills');
    const frame = terminal.lastFrame() ?? '';
    expect(frame).toContain('Project scan');
    expect(frame).toContain('Detected technologies');
    expect(frame).toContain('React');
    expect(frame).toContain('unique skills selected');
    expect(frame).toContain('[ ]');
    expect(frame).not.toContain('enter browse skills');
  });

  it('search typing never triggers global or scan hotkeys', async () => {
    const {app} = scanApp();
    const terminal = await mount(app);
    await expect.poll(() => terminal.lastFrame()).toContain('Suggested skills');
    // The old 'f' shortcut unexpectedly opened search while navigating.
    await press(terminal, 'f');
    expect(terminal.lastFrame()).not.toContain('Filter skills:');
    await press(terminal, '/');
    expect(terminal.lastFrame()).toContain('Filter skills:');
    // Each of these keys is a shortcut when the filter is not focused.
    for (const character of ['q', 't', 'g', 'r', '1', '?', 'f', '/', 'd']) {
      await press(terminal, character);
    }
    const frame = terminal.lastFrame() ?? '';
    expect(frame).toContain('Filter skills: qtgr1?f/d');
    expect(frame).toContain('Project scan');
    expect(frame).not.toContain('Review selection');
    expect(frame).not.toContain('Skill registries');
    await press(terminal, '\u001b');
    await expect.poll(() => terminal.lastFrame()).not.toContain('Filter skills:');
    expect(terminal.lastFrame()).toContain('Suggested skills');

    // 'd' inspects the currently highlighted skill directly, never opens a second search.
    await press(terminal, 'd');
    expect(terminal.lastFrame()).toContain('b or esc back');
    expect(terminal.lastFrame()).not.toContain('Search:');
    await press(terminal, 'b');
    expect(terminal.lastFrame()).toContain('Suggested skills');
  });

  it('filters the same MultiSelect and preserves selection after clearing the filter', async () => {
    const {app} = scanApp();
    const terminal = await mount(app);
    await expect.poll(() => terminal.lastFrame()).toContain('Suggested skills');
    await press(terminal, '/');
    await press(terminal, 'react');
    expect(terminal.lastFrame()).toContain('Filter skills: react');
    await press(terminal, '\r');
    expect(terminal.lastFrame()).toContain('Filter: react');
    await press(terminal, ' ');
    expect(terminal.lastFrame()).toContain('1 of ');
    await press(terminal, 'c');
    expect(terminal.lastFrame()).not.toContain('Filter: react');
    expect(terminal.lastFrame()).toContain('1 of ');
    await press(terminal, '\r');
    expect(terminal.lastFrame()).toContain('Review selection');
    await press(terminal, 'n');
    await press(terminal, '\r');
    expect(terminal.lastFrame()).toContain('Suggested skills');
    expect(terminal.lastFrame()).toContain('1 of ');
  });
  it('groups skills by technology with blank lines and unique selection counts', async () => {
    const {app} = scanApp(vi.fn(), {react: '^19', next: '^15'});
    const terminal = await mount(app);
    await expect.poll(() => terminal.lastFrame()).toContain('Next.js (1)');
    const lines = (terminal.lastFrame() ?? '').split('\n');
    const react = lines.findIndex((line) => line.includes('React (2)'));
    const next = lines.findIndex((line) => line.includes('Next.js (1)'));
    expect(react).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThan(react);
    const between = lines.slice(react + 1, next);
    expect(between.some((line) => line.includes('react-best-practices'))).toBe(true);
    expect(between.some((line) => line.trim() === '')).toBe(true);
    // Search filters entire groups without discarding other selected skills.
    await press(terminal, '/');
    await press(terminal, 'next');
    await press(terminal, '\r');
    const filtered = terminal.lastFrame() ?? '';
    expect(filtered).toContain('Next.js (1)');
    expect(filtered).not.toContain('React (2)');
  });

});
