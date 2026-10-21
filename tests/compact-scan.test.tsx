import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vite-plus/test';
import {App, type AppOptions} from '../src/app';
import {appConfig, resolveConfig} from '../src/config';
import {defaultScan} from '../src/features/skills/context';
import type {Report} from '../src/lib/detect';
import {loadConfig, saveConfig} from '../src/lib/config';
import {mount, press} from './helpers/terminal';

const report: Report = {
  project: '/work/example',
  scannedFiles: 12,
  truncated: false,
  skippedFiles: [],
  technologies: [
    {id: 'react', name: 'React', evidence: [], skills: ['demo/one', 'demo/two']},
  ],
  combinations: [],
  frontendDetected: true,
  agents: [],
  skills: [
    {id: 'demo/one', sources: [{type: 'technology', id: 'react', name: 'React'}]},
    {id: 'demo/two', sources: [{type: 'technology', id: 'react', name: 'React'}]},
  ],
  summary: {technologies: 1, combinations: 0, suggestedSkills: 2, technologiesWithoutSkills: 0},
};
const directories: string[] = [];
function setup(): {options: AppOptions; path: string} {
  const dir = mkdtempSync(join(tmpdir(), 'nosey-compact-'));
  directories.push(dir);
  const path = join(dir, 'settings.json');
  return {
    path,
    options: {
      theme: 'mono',
      ascii: true,
      debug: false,
      compactMode: true,
      screen: 'home',
      static: true,
      report,
      scan: {...defaultScan, root: dir},
      configFile: path,
    },
  };
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, {recursive: true, force: true});
});

describe('compact Scan setting', () => {
  it('defaults to disabled and persists as a typed setting', () => {
    const {path} = setup();
    expect(resolveConfig(appConfig.fields, {}, {env: {}}).values.compactMode).toBe(false);
    saveConfig({compactMode: true}, path);
    expect(loadConfig(path).config.compactMode).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('"compactMode": true');
    expect(resolveConfig(appConfig.fields, loadConfig(path).config, {env: {}}).values.compactMode).toBe(true);
    expect(() => saveConfig({compactMode: 'yes' as unknown as boolean}, path)).toThrow();
  });

  it('opens a minimal direct-launch view and confirms selected skills in report order', async () => {
    const {options} = setup();
    const onConfirm = vi.fn();
    const app = await mount(<App options={{...options, onConfirm}} />);
    expect(app.lastFrame()).toContain('nosey / scan');
    expect(app.lastFrame()).toContain('12 files / 1 technologies / 2 skills');
    expect(app.lastFrame()).toContain('demo/one');
    expect(app.lastFrame()).not.toContain('Registries');
    expect(app.lastFrame()).not.toContain('Commands');
    await press(app, '\u001b[B');
    await press(app, ' ');
    await press(app, '\u001b[A');
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Review selection');
    await press(app, '\r'); // No is the default.
    expect(onConfirm).not.toHaveBeenCalled();
    await press(app, '\r');
    await press(app, 'y');
    await press(app, '\r');
    expect(onConfirm).toHaveBeenCalledExactlyOnceWith(['demo/one', 'demo/two']);
  });

  it('preserves the full application shell when disabled or started on another screen', async () => {
    const {options} = setup();
    const fullScan = await mount(<App options={{...options, compactMode: false}} />);
    expect(fullScan.lastFrame()).toContain('Registries');
    expect(fullScan.lastFrame()).toContain('Project');
    const settings = await mount(<App options={{...options, screen: 'settings'}} />);
    expect(settings.lastFrame()).toContain('Registries');
    expect(settings.lastFrame()).toContain('Configuration');
  });

  it('surfaces partial-scan warnings without adding full-screen panels', async () => {
    const {options} = setup();
    const partial: Report = {...report, truncated: true, skippedFiles: [{path: 'broken', reason: 'error'}]};
    const app = await mount(<App options={{...options, report: partial}} />);
    expect(app.lastFrame()).toContain('Partial scan');
    expect(app.lastFrame()).toContain('Scan limit reached');
    expect(app.lastFrame()).toContain('skipped inputs');
    expect(app.lastFrame()).not.toContain('Suggested skills  0/');
  });
});
