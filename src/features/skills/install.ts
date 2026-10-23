import {z} from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {SuggestedSkill} from '../../lib/detect';
import type {SkillInstallSource} from '../../lib/registry/types';

/** CLI identifiers, not display names. All paths are project-local. */
export const SKILLS_CLI_AGENTS = [
  {value: 'claude-code', label: 'Claude Code', directory: '.claude/skills'},
  {value: 'codex', label: 'Codex', directory: '.agents/skills'},
  {value: 'cursor', label: 'Cursor', directory: '.agents/skills'},
  {value: 'opencode', label: 'OpenCode', directory: '.agents/skills'},
  {value: 'gemini-cli', label: 'Gemini CLI', directory: '.agents/skills'},
  {value: 'github-copilot', label: 'GitHub Copilot', directory: '.agents/skills'},
  {value: 'cline', label: 'Cline', directory: '.agents/skills'},
  {value: 'windsurf', label: 'Windsurf', directory: '.windsurf/skills'},
  {value: 'roo', label: 'Roo Code', directory: '.roo/skills'},
  {value: 'kiro-cli', label: 'Kiro CLI', directory: '.kiro/skills'},
  {value: 'continue', label: 'Continue', directory: '.continue/skills'},
  {value: 'augment', label: 'Augment', directory: '.augment/skills'},
  {value: 'aider-desk', label: 'AiderDesk', directory: '.aider-desk/skills'},
  {value: 'goose', label: 'Goose', directory: '.goose/skills'},
] as const;

export type SkillsCliAgent = (typeof SKILLS_CLI_AGENTS)[number]['value'];

export type SkillInstallation = {
  installedAgents: string[];
  unverifiedAgents: string[];
};

export type InstallableSkill = Pick<SuggestedSkill, 'id'> & {
  installation?: SkillInstallation;
  installSource?: SkillInstallSource;
};

const directories = new Map<string, string>(
  SKILLS_CLI_AGENTS.map((agent) => [agent.value, agent.directory]),
);

const safeIdentifier = /^[A-Za-z0-9_.@-]+$/;

// Recommendation IDs retain their catalog slugs; Skills CLI selects frontmatter names.
const builtInInstallNames = new Map([
  ['vercel-labs/agent-skills/react-best-practices', 'vercel-react-best-practices'],
  ['vercel-labs/agent-skills/composition-patterns', 'vercel-composition-patterns'],
]);

export function validAgents(agents: readonly string[]): boolean {
  return agents.every((agent) => directories.has(agent)) && new Set(agents).size === agents.length;
}

export function skillSource(skill: InstallableSkill): SkillInstallSource | undefined {
  if (skill.installSource) return skill.installSource;
  const parts = skill.id.split('/');
  const [owner, repository, name] = parts;

  if (
    parts.length !== 3 ||
    !owner ||
    !repository ||
    !name ||
    !parts.every((part) => safeIdentifier.test(part))
  )
    return;

  return {source: owner + '/' + repository, name: builtInInstallNames.get(skill.id) ?? name};
}

/** Canonicalize GitHub shorthand and URLs; keep local paths separate. */
function normalizedSource(source: string, root: string): string {
  const github =
    /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/#]+?)(?:\.git)?(?:\/)?$/i.exec(source);

  if (github) return github[1]!.toLowerCase();

  if (/^[^/]+\/[^/]+$/.test(source) && !source.startsWith('.')) return source.toLowerCase();

  if (!source.includes('://') && !source.startsWith('git@')) return path.resolve(root, source);

  return source.replace(/\.git$/, '');
}

const lockEntrySchema = z.object({
  source: z.string(),
  sourceUrl: z.string().optional(),
  skillPath: z.string().optional(),
});

type LockEntry = z.infer<typeof lockEntrySchema>;

function lockMatches(
  value: LockEntry | undefined,
  expected: SkillInstallSource,
  root: string,
): boolean {
  if (!value) return false;

  const actual = normalizedSource(value.source, root);
  const wanted = normalizedSource(expected.source, root);

  if (
    actual !== wanted &&
    (value.sourceUrl === undefined || normalizedSource(value.sourceUrl, root) !== wanted)
  )
    return false;

  // The lock is keyed by the declared name. Its source path may use a different folder name.
  return true;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);

  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
  );
}

/** Inspect actual local agent skill directories, without inferring installed agents from home. */
export async function discoverProjectSkillAgents(projectRoot: string): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const found: string[] = [];
  const seen = new Set<string>();

  for (const agent of SKILLS_CLI_AGENTS) {
    if (seen.has(agent.directory)) continue;
    seen.add(agent.directory);
    const directory = path.join(root, agent.directory);

    try {
      const [actual, info] = await Promise.all([fs.realpath(directory), fs.stat(directory)]);

      if (info.isDirectory() && inside(root, actual)) found.push(agent.value);
    } catch {
      // No local skills directory for this agent.
    }
  }

  return found;
}

/**
 * Read-only project inspection. A same-named folder is not proof of provenance:
 * without a matching project lock entry it is reported as unverified, not installed.
 * Symlinks resolving outside the project are ignored.
 */
export async function inspectInstalledSkills(
  projectRoot: string,
  skills: readonly InstallableSkill[],
  agents: readonly string[],
): Promise<Map<string, SkillInstallation>> {
  const root = path.resolve(projectRoot);
  const lock = new Map<string, LockEntry>();

  try {
    const document = z
      .object({skills: z.record(z.string(), z.json())})
      .parse(JSON.parse(await fs.readFile(path.join(root, 'skills-lock.json'), 'utf8')));

    for (const [name, raw] of Object.entries(document.skills)) {
      const parsed = lockEntrySchema.safeParse(raw);

      if (parsed.success) lock.set(name, parsed.data);
    }
  } catch {
    // Missing/invalid project lock leaves existing files unverified.
  }

  const statuses = new Map<string, SkillInstallation>();

  for (const skill of skills) {
    const installedAgents: string[] = [];
    const unverifiedAgents: string[] = [];
    const origin = skillSource(skill);

    if (!origin || !safeIdentifier.test(origin.name)) continue;

    for (const agent of new Set(agents)) {
      const directory = directories.get(agent);

      if (!directory) continue;
      const file = path.join(root, directory, origin.name, 'SKILL.md');

      try {
        const [actual, info] = await Promise.all([fs.realpath(file), fs.stat(file)]);

        if (!info.isFile() || !inside(root, actual)) continue;

        if (lockMatches(lock.get(origin.name), origin, root)) installedAgents.push(agent);
        else unverifiedAgents.push(agent);
      } catch {
        // Not present in this project's agent-specific directory.
      }
    }

    statuses.set(skill.id, {installedAgents, unverifiedAgents});
  }

  return statuses;
}

export function installationLabel(
  installation: SkillInstallation | undefined,
  agents: readonly string[],
): string {
  if (!installation || agents.length === 0) return '';
  const count = installation.installedAgents.length;

  if (count === agents.length) return 'Installed';

  if (count) return 'Partial ' + count + '/' + agents.length;

  if (installation.unverifiedAgents.length) return 'Present (unverified)';

  return 'Not installed';
}

/** Seed each scan with the same fully installed skills identified by its labels. */
export function installedSkillIds(
  skills: readonly InstallableSkill[],
  agents: readonly string[],
): string[] {
  return skills.flatMap((skill) =>
    installationLabel(skill.installation, agents) === 'Installed' ? [skill.id] : [],
  );
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;

  return "'" + value.replaceAll("'", "'\\''") + "'";
}

export interface InstallInvocation {
  cwd: string;
  args: string[];
}

export type ConfirmSelection = (
  ids: string[],
  commands?: string[],
  execution?: InstallInvocation[],
) => void;

/** Planning never invokes the CLI. Each command targets only missing agents in the project. */
export interface InstallCommands {
  commands: string[];
  invocations: InstallInvocation[];
  errors: string[];
}

export function generateInstallCommands(
  selectedIds: readonly string[],
  available: readonly InstallableSkill[],
  agents: readonly string[],
  projectRoot: string,
): InstallCommands {
  if (selectedIds.length === 0) return {commands: [], invocations: [], errors: []};

  if (!agents.length)
    return {
      commands: [],
      invocations: [],
      errors: ['Choose default agents in Settings > Skills CLI.'],
    };

  if (!validAgents(agents))
    return {
      commands: [],
      invocations: [],
      errors: ['Invalid or duplicate Skills CLI agent settings.'],
    };
  const byId = new Map(available.map((skill) => [skill.id, skill]));
  const groups = new Map<string, {source: string; agents: string[]; skills: string[]}>();
  const errors: string[] = [];

  for (const id of new Set(selectedIds)) {
    const skill = byId.get(id);

    if (!skill) {
      errors.push('Unknown selected skill: ' + id);
      continue;
    }

    const origin = skillSource(skill);

    if (
      !origin ||
      !origin.source ||
      origin.source.startsWith('-') ||
      origin.name.startsWith('-') ||
      !safeIdentifier.test(origin.name) ||
      /#[^#]+$/.test(origin.source) ||
      /[\r\n\0]/.test(origin.source)
    ) {
      errors.push('Cannot resolve a supported install source for ' + id);
      continue;
    }

    const installed = new Set(skill.installation?.installedAgents ?? []);
    const missing = agents.filter((agent) => !installed.has(agent));

    if (!missing.length) continue;
    const key = JSON.stringify([origin.source, missing]);
    const group = groups.get(key) ?? {source: origin.source, agents: missing, skills: []};

    if (!group.skills.includes(origin.name)) group.skills.push(origin.name);
    groups.set(key, group);
  }

  if (errors.length) return {commands: [], invocations: [], errors};

  const invocations = [...groups.values()].map((group) => ({
    cwd: path.resolve(projectRoot),
    args: [
      'skills',
      'add',
      group.source,
      ...group.skills.flatMap((name) => ['--skill', name]),
      ...group.agents.flatMap((agent) => ['--agent', agent]),
      '--yes',
      '--json',
    ],
  }));

  const commands = invocations.map(formatInstallCommand);

  return {commands, invocations, errors};
}

export function formatInstallCommand(invocation: InstallInvocation): string {
  return (
    'cd ' + shellQuote(invocation.cwd) + ' && npx ' + invocation.args.map(shellQuote).join(' ')
  );
}
