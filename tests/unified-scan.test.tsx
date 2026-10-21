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

function scanApp(onConfirm = vi.fn()) {
  const dir = mkdtempSync(join(tmpdir(), 'nosey-combined-scan-'));
  directories.push(dir);
  writeFileSync(join(dir, 'package.json'), JSON.stringify({dependencies: {react: '^19'}}));
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
    await press(terminal, 'f');
    expect(terminal.lastFrame()).toContain('Filter skills:');
    // Each of these keys is a shortcut when the filter is not focused.
    for (const character of ['q', 't', 'g', 'r', '1', '?', 'f', '/']) {
      await press(terminal, character);
    }
    const frame = terminal.lastFrame() ?? '';
    expect(frame).toContain('Filter skills: qtgr1?f/');
    expect(frame).toContain('Project scan');
    expect(frame).not.toContain('Review selection');
    expect(frame).not.toContain('Skill registries');
    await press(terminal, '\u001b');
    await expect.poll(() => terminal.lastFrame()).not.toContain('Filter skills:');
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
});
