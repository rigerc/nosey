import {mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {afterEach, expect, test} from 'vite-plus/test';
import {appConfig, resolveConfig, type Config} from '../src/config';
import {loadConfig, saveConfig} from '../src/lib/config';
import {
  generateInstallCommands,
  inspectInstalledSkills,
  installationLabel,
} from '../src/features/skills/install';

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nosey-skills-cli-'));
  roots.push(root);

  return root;
}

function skillFile(root: string, agentDir: string, name: string): string {
  const folder = path.join(root, agentDir, name);
  mkdirSync(folder, {recursive: true});
  const file = path.join(folder, 'SKILL.md');
  writeFileSync(file, '---\nname: ' + name + '\n---\n# Skill\n');

  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {force: true, recursive: true});
});

test('Skills CLI is opt-in with validated default agent choices', () => {
  const config = resolveConfig<Config>(appConfig.fields, {}).values;
  expect(config.skillsCli).toEqual({enabled: false, execute: false, defaultAgents: []});
  expect(
    appConfig.schema.safeParse({
      skillsCli: {
        enabled: true,
        defaultAgents: ['claude-code', 'codex'],
      },
    }).success,
  ).toBe(true);
  expect(appConfig.schema.safeParse({skillsCli: {defaultAgents: ['unknown-agent']}}).success).toBe(
    false,
  );
  expect(appConfig.schema.safeParse({skillsCli: {defaultAgents: ['codex', 'codex']}}).success).toBe(
    false,
  );
});

test('groups selected skills and prints nonexecuting project-only JSON commands', () => {
  const root = fixture();

  const suggestions = [
    {id: 'vercel-labs/agent-skills/react-best-practices'},
    {id: 'vercel-labs/agent-skills/composition-patterns'},
    {id: 'antfu/skills/vite'},
  ];

  const result = generateInstallCommands(
    suggestions.map((s) => s.id),
    suggestions,
    ['claude-code', 'codex'],
    root,
  );

  expect(result.errors).toEqual([]);
  expect(result.commands).toHaveLength(2);
  expect(result.commands[0]).toContain(
    'cd ' + root + ' && npx skills add vercel-labs/agent-skills',
  );
  expect(result.commands[0]).toContain('--skill react-best-practices --skill composition-patterns');
  expect(result.commands[0]).toContain('--agent claude-code --agent codex --yes --json');
  expect(result.commands.join('\n')).not.toMatch(/--global| -g |--all/);
});

test('deduplicates selection and only generates commands for missing agents', () => {
  const root = fixture();

  const chosen = [
    {
      id: 'acme/skills/alpha',
      installation: {installedAgents: ['codex'], unverifiedAgents: []},
    },
  ];

  const result = generateInstallCommands(
    ['acme/skills/alpha', 'acme/skills/alpha'],
    chosen,
    ['codex', 'claude-code'],
    root,
  );

  expect(result.errors).toEqual([]);
  expect(result.commands).toHaveLength(1);
  expect(result.commands[0]).toContain('--agent claude-code');
  expect(result.commands[0]).not.toContain('--agent codex');
  expect(generateInstallCommands(['acme/skills/alpha'], chosen, ['codex'], root).commands).toEqual(
    [],
  );
});

test('rejects unresolved sources and invalid agent settings without partial output', () => {
  const root = fixture();
  expect(generateInstallCommands(['missing'], [], ['codex'], root).errors).toEqual([
    'Unknown selected skill: missing',
  ]);
  expect(generateInstallCommands(['a/b/one'], [{id: 'a/b/one'}], [], root).errors).toEqual([
    'Choose default agents in Settings > Skills CLI.',
  ]);
  expect(
    generateInstallCommands(['a/b/one'], [{id: 'a/b/one'}], ['invalid'], root).commands,
  ).toEqual([]);
  expect(
    generateInstallCommands(
      ['a/b/one', 'broken'],
      [{id: 'a/b/one'}, {id: 'broken'}],
      ['codex'],
      root,
    ).commands,
  ).toEqual([]);
  expect(
    generateInstallCommands(
      ['a/b/one'],
      [
        {
          id: 'a/b/one',
          installSource: {source: 'https://github.com/acme/skills#v1', name: 'one'},
        },
      ],
      ['codex'],
      root,
    ).errors,
  ).toHaveLength(1);
});

test('shell-quotes project paths without changing scope', () => {
  const root = path.join(fixture(), "it's a project");
  const plan = generateInstallCommands(['a/b/one'], [{id: 'a/b/one'}], ['codex'], root);
  expect(plan.commands[0]).toContain("cd '");
  expect(plan.commands[0]).toContain("'\\''");
  expect(plan.commands[0]).toContain(' --yes --json');
});

test('marks a skill installed only when both local files and matching lock provenance exist', async () => {
  const root = fixture();
  skillFile(root, '.agents/skills', 'alpha');
  skillFile(root, '.claude/skills', 'alpha');
  writeFileSync(
    path.join(root, 'skills-lock.json'),
    JSON.stringify({
      version: 1,
      skills: {
        alpha: {
          source: 'acme/skills',
          sourceType: 'github',
          skillPath: 'skills/alpha/SKILL.md',
        },
      },
    }),
  );
  const [skill] = [{id: 'acme/skills/alpha'}];
  const statuses = await inspectInstalledSkills(root, [skill], ['codex', 'claude-code']);
  const status = statuses.get(skill.id);
  expect(status?.installedAgents).toEqual(['codex', 'claude-code']);
  expect(installationLabel(status, ['codex', 'claude-code'])).toBe('Installed');
});

test('reports mismatched provenance as unverified instead of installed', async () => {
  const root = fixture();
  skillFile(root, '.agents/skills', 'alpha');
  writeFileSync(
    path.join(root, 'skills-lock.json'),
    JSON.stringify({
      version: 1,
      skills: {alpha: {source: 'other/repo', sourceType: 'github'}},
    }),
  );

  const result = await inspectInstalledSkills(
    root,
    [{id: 'acme/skills/alpha'}],
    ['codex', 'claude-code'],
  );

  expect(result.get('acme/skills/alpha')).toEqual({
    installedAgents: [],
    unverifiedAgents: ['codex'],
  });
  expect(installationLabel(result.get('acme/skills/alpha'), ['codex', 'claude-code'])).toBe(
    'Present (unverified)',
  );
});

test('ignores symlinks to global or external skill directories', async () => {
  const root = fixture();
  const external = fixture();
  skillFile(external, 'skills', 'alpha');
  mkdirSync(path.join(root, '.agents/skills/alpha'), {recursive: true});
  symlinkSync(
    path.join(external, 'skills/alpha/SKILL.md'),
    path.join(root, '.agents/skills/alpha/SKILL.md'),
  );
  writeFileSync(
    path.join(root, 'skills-lock.json'),
    JSON.stringify({
      version: 1,
      skills: {alpha: {source: 'acme/skills'}},
    }),
  );
  const result = await inspectInstalledSkills(root, [{id: 'acme/skills/alpha'}], ['codex']);
  expect(result.get('acme/skills/alpha')?.installedAgents).toEqual([]);
  expect(result.get('acme/skills/alpha')?.unverifiedAgents).toEqual([]);
});

test('supports project-local GitHub URL provenance and partial agent status', async () => {
  const root = fixture();
  skillFile(root, '.claude/skills', 'alpha');
  writeFileSync(
    path.join(root, 'skills-lock.json'),
    JSON.stringify({
      version: 1,
      skills: {
        alpha: {
          source: 'https://github.com/acme/skills.git',
          sourceType: 'github',
        },
      },
    }),
  );

  const result = await inspectInstalledSkills(
    root,
    [{id: 'acme/skills/alpha'}],
    ['claude-code', 'codex'],
  );

  expect(installationLabel(result.get('acme/skills/alpha'), ['claude-code', 'codex'])).toBe(
    'Partial 1/2',
  );
});

test('execution defaults off for existing configs and persists independently', () => {
  const config = resolveConfig<Config>(appConfig.fields, {
    skillsCli: {enabled: true, defaultAgents: ['codex']},
  }).values;

  expect(config.skillsCli?.execute).toBe(false);
  const file = path.join(fixture(), 'config.json');
  saveConfig({skillsCli: {...config.skillsCli, execute: true}}, file);
  expect(loadConfig(file).config.skillsCli?.execute).toBe(true);
  expect(appConfig.schema.safeParse({skillsCli: {execute: 'yes'}}).success).toBe(false);
});

test('rejects sources and skill names that could be interpreted as options', () => {
  for (const origin of [
    {source: '--global', name: 'alpha'},
    {source: 'team/skills', name: '--all'},
  ]) {
    const plan = generateInstallCommands(
      ['demo'],
      [{id: 'demo', installSource: origin}],
      ['codex'],
      fixture(),
    );

    expect(plan.errors).toHaveLength(1);
    expect(plan.commands).toEqual([]);
    expect(plan.invocations).toEqual([]);
  }
});
