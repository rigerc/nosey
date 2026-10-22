import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vite-plus/test';
import {App, type AppOptions} from '../src/app';
import {renderToString} from 'ink';
import stringWidth from 'string-width';
import {appConfig, resolveConfig, type Config} from '../src/config';
import {defaultScan} from '../src/features/skills/context';
import type {Report} from '../src/lib/detect';
import {loadConfig, saveConfig} from '../src/lib/config';
import {mount, press} from './helpers/terminal';

const report: Report = {
  project: '/work/example',
  scannedFiles: 12,
  truncated: false,
  skippedFiles: [],
  technologies: [{id: 'react', name: 'React', evidence: [], skills: ['demo/one', 'demo/two']}],
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
    expect(resolveConfig<Config>(appConfig.fields, {}, {env: {}}).values.compactMode).toBe(false);
    saveConfig({compactMode: true}, path);
    expect(loadConfig(path).config.compactMode).toBe(true);
    expect(readFileSync(path, 'utf8')).toContain('"compactMode": true');
    expect(
      resolveConfig(appConfig.fields, loadConfig(path).config, {env: {}}).values.compactMode,
    ).toBe(true);
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

  it('marks installed skills and prints JSON commands only for missing agents', async () => {
    const {options} = setup();
    const onConfirm = vi.fn();
    const installationReport: Report = {
      ...report,
      inspectedAgents: ['codex', 'claude-code'],
      skills: [
        {
          id: 'acme/skills/alpha',
          sources: [{type: 'technology', id: 'react', name: 'React'}],
          installation: {installedAgents: ['codex'], unverifiedAgents: []},
        },
        {id: 'acme/skills/beta', sources: [{type: 'technology', id: 'react', name: 'React'}]},
      ],
    };
    const app = await mount(
      <App
        options={{
          ...options,
          report: installationReport,
          onConfirm,
          skillsCli: {enabled: true, defaultAgents: ['codex', 'claude-code']},
        }}
      />,
    );
    expect(app.lastFrame()).toContain('Partial 1/2');
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Print installation commands and exit?');
    expect(app.lastFrame()).toContain('npx skills add acme/skills');
    expect(app.lastFrame()).toContain('--skill alpha');
    expect(app.lastFrame()).toContain('--agent claude-code');
    expect(app.lastFrame()).not.toContain('--agent codex');
    expect(app.lastFrame()).toMatch(/--yes\s+--json/);
    await press(app, '\r'); // No by default.
    expect(onConfirm).not.toHaveBeenCalled();
    await press(app, '\r');
    await press(app, 'y');
    await press(app, '\r');
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toEqual(['acme/skills/alpha']);
    expect(onConfirm.mock.calls[0]?.[1]).toEqual([
      expect.stringContaining('--agent claude-code --yes --json'),
    ]);
  });

  it('blocks command confirmation without configured agents and Escape returns to browse', async () => {
    const {options} = setup();
    const onConfirm = vi.fn();
    const app = await mount(
      <App
        options={{
          ...options,
          onConfirm,
          report: {
            ...report,
            skills: [
              {
                id: 'acme/skills/alpha',
                sources: [{type: 'technology', id: 'react', name: 'React'}],
              },
            ],
          },
          skillsCli: {enabled: true, defaultAgents: []},
        }}
      />,
    );
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Choose default agents in Settings');
    expect(app.lastFrame()).not.toContain('Print installation commands and exit?');
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('Suggested skills');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('omits install commands for skills already installed for all configured agents', async () => {
    const {options} = setup();
    const onConfirm = vi.fn();
    const app = await mount(
      <App
        options={{
          ...options,
          onConfirm,
          report: {
            ...report,
            skills: [
              {
                id: 'acme/skills/alpha',
                sources: [{type: 'technology', id: 'react', name: 'React'}],
                installation: {installedAgents: ['claude-code'], unverifiedAgents: []},
              },
            ],
          },
          skillsCli: {enabled: true, defaultAgents: ['claude-code']},
        }}
      />,
    );
    expect(app.lastFrame()).toContain('[Installed]');
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('No installation commands are needed');
    await press(app, 'y');
    await press(app, '\r');
    expect(onConfirm).toHaveBeenCalledWith(['acme/skills/alpha'], []);
  });

  it('fits a populated compact list and long project path in 24-row terminals', () => {
    const {options} = setup();
    const descriptors = ['columns', 'rows'].map((key) =>
      Object.getOwnPropertyDescriptor(process.stdout, key),
    );
    const populated = {
      ...report,
      skills: Array.from({length: 30}, (_, index) => ({
        id: `very-long-team/shared-agent-skills/skill-${index + 1}`,
        sources: report.skills[0]!.sources,
      })),
    };
    try {
      Object.defineProperty(process.stdout, 'rows', {value: 24, configurable: true});
      for (const columns of [40, 60, 80, 96, 120]) {
        Object.defineProperty(process.stdout, 'columns', {value: columns, configurable: true});
        const out = renderToString(
          <App
            options={{
              ...options,
              report: populated,
              scan: {...options.scan!, root: '/workspace/' + 'long-directory/'.repeat(20)},
            }}
          />,
          {columns},
        );
        expect(out.split('\n').length, out).toBeLessThanOrEqual(24);
        for (const line of out.split('\n')) expect(stringWidth(line)).toBeLessThanOrEqual(columns);
        expect(out).toContain('[q] quit');
        expect(out).toContain('[enter] review');
        if (columns === 40) expect(out).toContain('skill-1');
        expect(out).not.toContain('Registries');
        expect(out).not.toContain('Commands');
      }
    } finally {
      ['columns', 'rows'].forEach((key, index) => {
        const descriptor = descriptors[index];
        if (descriptor) Object.defineProperty(process.stdout, key, descriptor);
        else Reflect.deleteProperty(process.stdout, key);
      });
    }
  });

  it('keeps full IDs when selecting abbreviated names in a narrow terminal', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
    Object.defineProperty(process.stdout, 'columns', {value: 40, configurable: true});
    const {options} = setup();
    const id = 'very-long-team/shared-agent-skills/composition-patterns';
    const onConfirm = vi.fn();
    try {
      const app = await mount(
        <App
          options={{
            ...options,
            onConfirm,
            report: {...report, skills: [{id, sources: report.skills[0]!.sources}]},
          }}
        />,
      );
      expect(app.lastFrame()).toContain('composition-patterns');
      await press(app, ' ');
      await press(app, '\r');
      await press(app, '\r'); // Confirmation still defaults to No.
      expect(onConfirm).not.toHaveBeenCalled();
      await press(app, '\r');
      await press(app, 'y');
      await press(app, '\r');
      expect(onConfirm).toHaveBeenCalledExactlyOnceWith([id]);
    } finally {
      if (descriptor) Object.defineProperty(process.stdout, 'columns', descriptor);
      else Reflect.deleteProperty(process.stdout, 'columns');
    }
  });

  it('preserves the full application shell when disabled or started on another screen', async () => {
    const {options} = setup();
    const fullScan = await mount(<App options={{...options, compactMode: false}} />);
    expect(fullScan.lastFrame()).toContain('Registries');
    expect(fullScan.lastFrame()).toContain('Suggested skills');
    const settings = await mount(<App options={{...options, screen: 'settings'}} />);
    expect(settings.lastFrame()).toContain('Registries');
    expect(settings.lastFrame()).toContain('Configuration');
  });

  it('surfaces partial-scan warnings without adding full-screen panels', async () => {
    const {options} = setup();
    const partial: Report = {
      ...report,
      truncated: true,
      skippedFiles: [{file: 'broken', reason: 'unreadable'}],
    };
    const app = await mount(<App options={{...options, report: partial}} />);
    expect(app.lastFrame()).toContain('Partial scan');
    expect(app.lastFrame()).toContain('Scan limit reached');
    expect(app.lastFrame()).toContain('skipped inputs');
    expect(app.lastFrame()).not.toContain('Suggested skills  0/');
  });
});
