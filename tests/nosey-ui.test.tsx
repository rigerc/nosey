import {mkdtempSync, existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative, dirname} from 'node:path';
import {renderToString} from 'ink';
import stringWidth from 'string-width';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vite-plus/test';
import {App, type AppOptions} from '../src/app';
import {defaultScan} from '../src/features/skills/context';
import type {Report} from '../src/lib/detect';
import {scaffoldRegistry} from '../src/lib/registry/init';
import * as registryInit from '../src/lib/registry/init';
import {themeNames} from '../src/theme/tokens';
import {mount, press, settle} from './helpers/terminal';

// Illustrative results exercise presentation and selection, not detection quality.
const report: Report = {
  project: '/work/atlas',
  scannedFiles: 1284,
  truncated: false,
  skippedFiles: [],
  frontendDetected: true,
  agents: [],
  technologies: [
    {
      id: 'react',
      name: 'React',
      skills: ['acme/skills/alpha', 'acme/skills/beta'],
      evidence: ['package.json: react'],
    },
    {
      id: 'typescript',
      name: 'TypeScript',
      skills: ['acme/skills/alpha', 'acme/skills/gamma'],
      evidence: ['package.json: typescript'],
    },
  ],
  combinations: [],
  skills: [
    {
      id: 'acme/skills/alpha',
      sources: [
        {type: 'technology', id: 'react', name: 'React'},
        {type: 'technology', id: 'typescript', name: 'TypeScript'},
      ],
    },
    {id: 'acme/skills/beta', sources: [{type: 'technology', id: 'react', name: 'React'}]},
    {
      id: 'acme/skills/gamma',
      sources: [{type: 'technology', id: 'typescript', name: 'TypeScript'}],
    },
  ],
  summary: {technologies: 2, combinations: 0, suggestedSkills: 3, technologiesWithoutSkills: 0},
};
let root: string;
let options: AppOptions;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'nosey-ui-'));
  options = {
    theme: 'mono',
    ascii: true,
    debug: false,
    screen: 'home',
    report,
    scan: {...defaultScan, root},
    configFile: join(root, 'appearance.json'),
  };
});
afterEach(() => {
  rmSync(root, {recursive: true, force: true});
  vi.unstubAllEnvs();
});

describe('Nosey scan interaction', () => {
  it('shows installed status and prints only missing project agent commands', async () => {
    const confirmed = vi.fn();
    const app = await mount(<App options={{
      ...options,
      onConfirm: confirmed,
      skillsCli: {enabled: true, defaultAgents: ['codex', 'claude-code']},
      report: {...report, skills: report.skills.map((skill) => skill.id.endsWith('/alpha') ? ({
        ...skill, installation: {installedAgents: ['codex'], unverifiedAgents: []},
      }) : skill)},
    }} />);
    expect(app.lastFrame()).toContain('Partial 1/2');
    await press(app, ' '); // alpha
    await press(app, '\r'); // review
    expect(app.lastFrame()).toContain('npx skills add acme/skills');
    expect(app.lastFrame()).toContain('--agent claude-code');
    expect(app.lastFrame()).not.toContain('--agent codex');
    expect(app.lastFrame()).toContain('--yes');
    expect(app.lastFrame()).toContain('--json');
    await press(app, 'y');
    await press(app, '\r');
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(confirmed.mock.calls[0]?.[0]).toEqual(['acme/skills/alpha']);
    expect(confirmed.mock.calls[0]?.[1]).toEqual([
      expect.stringContaining('--agent claude-code --yes --json'),
    ]);
  });

  it('does not allow printing commands before default agents are configured', async () => {
    const confirmed = vi.fn();
    const app = await mount(<App options={{
      ...options, onConfirm: confirmed,
      skillsCli: {enabled: true, defaultAgents: []},
    }} />);
    await press(app, ' ');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Choose default agents in Settings');
    expect(confirmed).not.toHaveBeenCalled();
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('Suggested skills');
  });

  it('routes rapid filter input to the newly opened editor', async () => {
    const app = await mount(<App options={{...options, static: true, theme: 'nosey'}} />);
    app.stdin.write('/');
    app.stdin.write('t');
    app.stdin.write('q');
    await settle();
    await settle();
    expect(app.lastFrame(), app.lastFrame()).toContain('Filter: tq_');
    expect(app.lastFrame()).not.toContain('Runtime theme preview only');
  });

  it('routes rapid command-menu input and close shortcuts across mode changes', async () => {
    const app = await mount(<App options={{...options, static: true}} />);
    app.stdin.write('\u000b');
    app.stdin.write('sett');
    await settle();
    await settle();
    expect(app.lastFrame()).toContain('Search: sett');
    expect(app.lastFrame()).toContain('Settings');
    app.stdin.write('\u000b');
    app.stdin.write('/');
    app.stdin.write('beta');
    await settle();
    await settle();
    expect(app.lastFrame(), app.lastFrame()).toContain('Filter: beta_');
  });

  it('groups results by technology, skips headings when navigating, and shares checkbox state', async () => {
    const confirm = vi.fn();
    const app = await mount(<App options={{...options, onConfirm: confirm}} />);
    expect(app.lastFrame()).toContain('React  0/2');
    await press(app, ' '); // React / alpha
    await press(app, '\u001b[B');
    await press(app, ' '); // React / beta
    expect(app.lastFrame()).toContain('2 selected of 3 suggested');
    await press(app, '\u001b[B'); // TypeScript / same alpha, not the heading
    expect(app.lastFrame()).toContain('TypeScript  1/2');
    expect(app.lastFrame()).toContain('> [x] acme/skills/alpha');
    await press(app, ' '); // unchecks alpha in both technology groups
    expect(app.lastFrame()).toContain('1 selected of 3 suggested');
    await press(app, '\u001b[F');
    await press(app, ' '); // gamma
    await press(app, '\r');
    await press(app, 'Y');
    await press(app, '\r');
    expect(confirm).toHaveBeenCalledExactlyOnceWith(['acme/skills/beta', 'acme/skills/gamma']);
  });
  it('shows only available footer shortcuts and prevents menu shortcuts leaking into text', async () => {
    const app = await mount(<App options={options} />);
    expect(app.lastFrame()).toContain('[space] select');
    expect(app.lastFrame()).toContain('[ctrl+k] commands');
    await press(app, '/');
    expect(app.lastFrame()).toContain('[ctrl+u] clear text');
    expect(app.lastFrame()).not.toContain('[space] select');
    expect(app.lastFrame()).not.toContain('[q] quit');
    await press(app, '\u000b'); // Ctrl+K is inert in the filter editor
    expect(app.lastFrame()).not.toContain('Search:');
    await press(app, 'q1t');
    expect(app.lastFrame()).toContain('Filter: q1t');
    await press(app, '\u001b');
    await press(app, '\u000b');
    expect(app.lastFrame()).toContain('Commands');
    await press(app, '\u000b');
    expect(app.lastFrame()).not.toContain('Commands');
    expect(app.lastFrame()).toContain('React  0/2');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('[y/n] choose');
    expect(app.lastFrame()).not.toContain('[space] select');
    expect(app.lastFrame()).not.toContain('[pageup/down] page');
    await press(app, '\r'); // No returns to browse
    expect(app.lastFrame()).toContain('[space] select');
  });
  it('retains hidden selections, filter and cursor across tabs and the command menu', async () => {
    const app = await mount(<App options={options} />);
    await press(app, ' '); // alpha
    await press(app, '/');
    await press(app, 'beta');
    await press(app, '\r');
    await press(app, ' '); // beta, alpha remains selected outside the filter
    expect(app.lastFrame()).toContain('2 selected of 3 suggested');
    await press(app, '\t');
    await settle();
    expect(app.lastFrame()).toContain('Registry references');
    await press(app, '\t');
    expect(app.lastFrame()).toContain('Configuration');
    await press(app, '1');
    expect(app.lastFrame()).toContain('2 selected of 3 suggested');
    expect(app.lastFrame()).toContain('Filter: beta');
    await press(app, '\u000b');
    await press(app, 'help');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('CLI / safety');
    await press(app, '1');
    expect(app.lastFrame()).toContain('Filter: beta');
    expect(app.lastFrame()).toContain('2 selected of 3 suggested');
    await press(app, '\u000b');
    await press(app, 'review selection');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Review selection');
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('Filter: beta');
  });
  it('captures shortcut characters in filter input and restores the previous filter on cancel', async () => {
    const confirm = vi.fn();
    const app = await mount(<App options={{...options, onConfirm: confirm}} />);
    await press(app, 'f');
    await press(app, 'q1t/?gf');
    await press(app, '\t');
    expect(app.lastFrame()).toContain('Filter: q1t/?gf');
    expect(app.lastFrame()).toContain('No suggestions match this filter');
    expect(confirm).not.toHaveBeenCalled();
    await press(app, '\u0015');
    expect(app.lastFrame()).toContain('skill or technology');
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('acme/skills/alpha');
  });
  it('reviews all selections in report order with No as default and confirms only once', async () => {
    const confirm = vi.fn();
    const app = await mount(<App options={{...options, onConfirm: confirm}} />);
    await press(app, '\u001b[B');
    await press(app, ' '); // beta first
    await press(app, '\u001b[A');
    await press(app, ' '); // alpha second
    await press(app, '/');
    await press(app, 'not-found');
    await press(app, '\r');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Review selection');
    expect(app.lastFrame()).toContain('acme/skills/alpha');
    await press(app, '\r'); // default No
    expect(confirm).not.toHaveBeenCalled();
    expect(app.lastFrame()).toContain('Suggested skills');
    await press(app, '\r');
    await press(app, 'y');
    await press(app, '\r');
    expect(confirm).toHaveBeenCalledExactlyOnceWith(['acme/skills/alpha', 'acme/skills/beta']);
  });
  it('keeps zero selection explicit and uses details with literal detection evidence', async () => {
    const confirm = vi.fn();
    const app = await mount(<App options={{...options, onConfirm: confirm}} />);
    await press(app, 'd');
    await press(app, 'alpha');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Skill detail');
    expect(app.lastFrame()).toContain('package.json: react');
    await press(app, 'b');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('No skills selected');
    await press(app, '\u001b');
    expect(confirm).not.toHaveBeenCalled();
    await press(app, '\r');
    await press(app, 'y');
    await press(app, '\r');
    expect(confirm).toHaveBeenCalledExactlyOnceWith([]);
  });
  it('deduplicates skills shared by technology groups', async () => {
    const app = await mount(<App options={options} />);
    await press(app, 'g');
    await press(app, '\r');
    await press(app, '\u001b[B');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('3 selected of 3 suggested');
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('Suggested skills');
  });
  it('keeps settings drafts across navigation, and saves only to the selected config file', async () => {
    const app = await mount(<App options={options} />);
    await press(app, '3');
    await press(app, '\r');
    await press(app, '\u001b[B');
    await press(app, '\r');
    await press(app, '\u001b');
    expect(app.lastFrame()).toContain('UNSAVED');
    expect(existsSync(options.configFile!)).toBe(false);
    await press(app, '4');
    await press(app, '3');
    expect(app.lastFrame()).toContain('UNSAVED');
    await press(app, 's');
    expect(JSON.parse(readFileSync(options.configFile!, 'utf8'))).toMatchObject({ascii: true});
    expect(existsSync(join(root, '.nosey.json'))).toBe(false);
  });
});

describe('Registry UI writes', () => {
  it('shows publication failures without truncation and returns without recreating local files', async () => {
    const destination = join(root, 'partial-registry');
    const init = vi.spyOn(registryInit, 'runRegistryInit').mockImplementation(async () => {
      await scaffoldRegistry(destination, 'acme/partial');
      throw new registryInit.RegistryInitError(
        `Local registry created at ${destination}, but the initial Git commit failed.\nInvalid commit message format\nExpected: <type>(<scope>): <subject>`,
        {
          directory: destination,
          registryId: 'acme/partial',
          gitInitialized: true,
          githubCreated: false,
        },
        new Error('hook rejected'),
      );
    });
    try {
      const app = await mount(
        <App
          options={{
            ...options,
            screen: 'registry-setup',
            registryInit: {
              directory: destination,
              registryId: 'acme/partial',
              git: true,
              github: true,
            },
          }}
        />,
      );
      await press(app, '\r'); // destination
      await press(app, '\r'); // identity
      await press(app, '\r'); // Git
      await press(app, '\r'); // GitHub
      await press(app, '\r'); // private visibility
      expect(app.lastFrame()).toContain('Create this registry?');
      await press(app, 'y');
      await press(app, '\r');
      await settle();
      await vi.waitFor(() => expect(app.lastFrame()).toContain('Registry created locally'));
      expect(app.lastFrame()).toContain('Invalid commit message format');
      expect(app.lastFrame()).toContain('Expected: <type>(<scope>): <subject>');
      expect(app.lastFrame()).not.toContain('Create this registry?');
      expect(existsSync(join(destination, 'skills-manifest.json'))).toBe(true);
      await press(app, '\r');
      expect(app.lastFrame()).toContain('Registry references');
      expect(init).toHaveBeenCalledTimes(1);
    } finally {
      init.mockRestore();
    }
  });
  it('keeps an existing destination editable and explains how to recover', async () => {
    const app = await mount(
      <App options={{...options, screen: 'registry-setup', registryInit: {directory: root}}} />,
    );
    await press(app, '\r');
    await settle();
    expect(app.lastFrame()).toContain('Destination already exists');
    expect(app.lastFrame()).toContain('Choose a new directory');
    expect(app.lastFrame()).toContain('Directory:');
    expect(app.lastFrame()).not.toContain('Owner/repository');
    await press(app, '\u0015'); // clear and choose a fresh relative destination
    await press(app, 'fresh-registry');
    await press(app, '\r');
    await settle();
    expect(app.lastFrame()).toContain('Owner/repository');
    expect(app.lastFrame()).not.toContain('Destination already exists');
    expect(existsSync(join(root, 'fresh-registry'))).toBe(false);
  });
  it('uses the scanned root, validates before add and removes only after explicit confirmation', async () => {
    const registry = join(root, 'team-skills');
    await scaffoldRegistry(registry, 'acme/team');
    const globalConfig = join(root, 'config', 'nosey', 'registries.json');
    vi.stubEnv('XDG_CONFIG_HOME', join(root, 'config'));
    vi.stubEnv('APPDATA', join(root, 'config'));
    const app = await mount(<App options={{...options, screen: 'registry'}} />);
    await settle();
    await press(app, 'a');
    await press(app, './team-skills');
    await press(app, '\r');
    await settle();
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Add this registry reference?'));
    expect(app.lastFrame()).toContain(globalConfig);
    expect(existsSync(join(root, '.nosey.json'))).toBe(false);
    await press(app, 'y');
    await press(app, '\r');
    await settle();
    expect(JSON.parse(readFileSync(globalConfig, 'utf8')).registries[0]).toEqual({
      type: 'local',
      path: relative(dirname(globalConfig), registry),
    });
    expect(existsSync(join(root, '.nosey.json'))).toBe(false);
    await press(app, '\r');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('acme/team'));
    await vi.waitFor(() => expect(app.lastFrame()).not.toContain('Working on registry'));
    await press(app, 'd');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Remove reference from'));
    await press(app, '\r'); // default No
    await vi.waitFor(() => expect(app.lastFrame()).not.toContain('Remove reference from'));
    expect(JSON.parse(readFileSync(globalConfig, 'utf8')).registries).toHaveLength(1);
    await press(app, 'd');
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Remove reference from'));
    await press(app, 'y');
    await press(app, '\r');
    await vi.waitFor(() =>
      expect(JSON.parse(readFileSync(globalConfig, 'utf8')).registries).toEqual([]),
      {timeout: 3000},
    );
    expect(existsSync(join(registry, 'skills-manifest.json'))).toBe(true);
  });
  it('filters, reviews, restores and clears always recommended skills without saving cancelled drafts', async () => {
    const registry = join(root, 'team-skills');
    await scaffoldRegistry(registry, 'acme/team');
    const configPath = join(root, '.nosey.json');
    const mapPath = join(registry, 'skills-map.json');
    const original = {schemaVersion: 1, registries: [{type: 'local', path: 'team-skills'}]};
    writeFileSync(configPath, JSON.stringify(original));
    const app = await mount(<App options={{...options, screen: 'registry'}} />);
    await settle();
    await press(app, '\r');
    await settle();
    await press(app, 'a');
    expect(app.lastFrame()).toContain('Always recommend');
    await press(app, ' ');
    await press(app, '/');
    await press(app, 'no-match');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('No skills match');
    await press(app, 's');
    expect(app.lastFrame()).toContain('acme/team/example-testing');
    expect(app.lastFrame()).toContain(mapPath);
    expect(app.lastFrame()).toContain('1 skill will always be recommended');
    expect(JSON.parse(readFileSync(mapPath, 'utf8')).alwaysRecommend).toEqual([]);
    await press(app, '\r'); // default No retains the draft
    expect(app.lastFrame()).toContain('No skills match');
    await press(app, 's');
    await press(app, 'y');
    await press(app, '\r');
    await settle();
    const saved = JSON.parse(readFileSync(mapPath, 'utf8'));
    expect(saved.alwaysRecommend).toEqual(['acme/team/example-testing']);
    expect(JSON.parse(readFileSync(configPath, 'utf8'))).toEqual(original);
    await vi.waitFor(() => expect(app.lastFrame()).toContain('1 always'));
    await press(app, 'a');
    expect(app.lastFrame()).toContain('[x]');
    await press(app, ' ');
    await press(app, '\u001b'); // Cancel draft
    expect(JSON.parse(readFileSync(mapPath, 'utf8'))).toEqual(saved);
    await press(app, 'a');
    expect(app.lastFrame()).toContain('[x]');
    await press(app, ' ');
    await press(app, 's');
    expect(app.lastFrame()).toContain('0 skills will always be recommended');
    await press(app, 'y');
    await press(app, '\r');
    await settle();
    await vi.waitFor(() =>
      expect(JSON.parse(readFileSync(mapPath, 'utf8')).alwaysRecommend).toEqual([]),
    );
  });
  it('initialization writes nothing until the final confirmation and cancels from review', async () => {
    const destination = join(root, 'new-registry');
    const app = await mount(
      <App
        options={{
          ...options,
          screen: 'registry-setup',
          registryInit: {directory: destination, registryId: 'acme/new'},
        }}
      />,
    );
    await press(app, '\r');
    await press(app, '\r'); // destination, ID
    await press(app, 'n');
    await press(app, '\r'); // no Git; skip GitHub
    expect(app.lastFrame()).toContain('Create this registry?');
    expect(existsSync(destination)).toBe(false);
    await press(app, '\u0018'); // Ctrl+X cancel
    expect(existsSync(destination)).toBe(false);
    expect(app.lastFrame()).toContain('Registry references');
  });
  it('creates the reviewed registry once, with Git and GitHub disabled when declined', async () => {
    const destination = join(root, 'created-registry');
    const app = await mount(
      <App
        options={{
          ...options,
          screen: 'registry-setup',
          registryInit: {directory: destination, registryId: 'acme/created'},
        }}
      />,
    );
    await press(app, '\r');
    await press(app, '\r');
    await press(app, 'n');
    await press(app, '\r');
    expect(app.lastFrame()).toContain('Create this registry?');
    expect(existsSync(destination)).toBe(false);
    await press(app, 'y');
    await press(app, '\r');
    await settle();
    await vi.waitFor(() => expect(app.lastFrame()).toContain('Registry created'));
    expect(JSON.parse(readFileSync(join(destination, 'registry.json'), 'utf8')).registryId).toBe(
      'acme/created',
    );
    expect(existsSync(join(destination, '.git'))).toBe(false);
    await press(app, '\r'); // Return to Registries, not another creation
    expect(app.lastFrame()).toContain('Registry references');
  });
});

describe('terminal presentation', () => {
  for (const columns of [40, 60, 80, 96, 120])
    for (const theme of themeNames) {
      it(`fits the successful scan at ${columns} columns in ${theme}`, () => {
        const descriptor = Object.getOwnPropertyDescriptor(process.stdout, 'columns');
        Object.defineProperty(process.stdout, 'columns', {value: columns, configurable: true});
        try {
          const out = renderToString(<App options={{...options, theme, static: true}} />, {
            columns,
          });
          expect(out).toContain(':^) nosey');
          expect(out).toContain('READ-ONLY');
          for (const line of out.split('\n'))
            expect(stringWidth(line)).toBeLessThanOrEqual(columns);
          expect(out).not.toMatch(/[✔✖⚠ℹ❯█░─╭╮╰╯│]/);
        } finally {
          if (descriptor) Object.defineProperty(process.stdout, 'columns', descriptor);
          else Reflect.deleteProperty(process.stdout, 'columns');
        }
      });
    }
  it('labels partial scans, skipped inputs, and registry warnings explicitly', () => {
    const out = renderToString(
      <App
        options={{
          ...options,
          static: true,
          report: {
            ...report,
            truncated: true,
            skippedFiles: [{file: 'manifest.json', reason: 'unreadable'}],
            registryWarnings: [{source: 'team', message: 'offline'}],
          },
        }}
      />,
      {columns: 80},
    );
    expect(out).toContain('Partial scan');
    expect(out).toContain('skipped inputs');
    expect(out).toContain('offline');
  });
});
