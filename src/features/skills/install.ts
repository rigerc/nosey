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

export function validAgents(agents: readonly string[]): boolean {
  return agents.every((agent) => directories.has(agent)) && new Set(agents).size === agents.length;
}

export function skillSource(skill: InstallableSkill): SkillInstallSource | undefined {
  if (skill.installSource) return skill.installSource;
  const parts = skill.id.split('/');
  const [owner, repository, name] = parts;
  if (parts.length !== 3 || !owner || !repository || !name ||
      !parts.every((part) => safeIdentifier.test(part))) return;
  return {source: owner + '/' + repository, name};
}

/** Canonicalize GitHub shorthand and URLs; keep local paths separate. */
function normalizedSource(source: string, root: string): string {
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/#]+?)(?:\.git)?(?:\/)?$/i.exec(source);
  if (github) return github[1]!.toLowerCase();
  if (/^[^/]+\/[^/]+$/.test(source) && !source.startsWith('.')) return source.toLowerCase();
  if (!source.includes('://') && !source.startsWith('git@')) return path.resolve(root, source);
  return source.replace(/\.git$/, '');
}

function lockMatches(entry: unknown, expected: SkillInstallSource, root: string): boolean {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const value = entry as Record<string, unknown>;
  if (typeof value.source !== 'string') return false;
  const actual = normalizedSource(value.source, root);
  const wanted = normalizedSource(expected.source, root);
  if (actual !== wanted && (typeof value.sourceUrl !== 'string' ||
      normalizedSource(value.sourceUrl, root) !== wanted)) return false;
  if (typeof value.skillPath === 'string') {
    const parent = path.posix.basename(path.posix.dirname(value.skillPath));
    if (parent !== expected.name) return false;
  }
  return true;
}

function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' &&
    !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
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
  let lock: Record<string, unknown> = {};
  try {
    const json: unknown = JSON.parse(await fs.readFile(path.join(root, 'skills-lock.json'), 'utf8'));
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      const entries = (json as {skills?: unknown}).skills;
      if (entries && typeof entries === 'object' && !Array.isArray(entries))
        lock = entries as Record<string, unknown>;
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
        if (lockMatches(lock[origin.name], origin, root)) installedAgents.push(agent);
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

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@+-]+$/.test(value)) return value;
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Never invokes the CLI. Each command targets only missing agents in the project. */
export function generateInstallCommands(
  selectedIds: readonly string[],
  available: readonly InstallableSkill[],
  agents: readonly string[],
  projectRoot: string,
): {commands: string[]; errors: string[]} {
  if (selectedIds.length === 0) return {commands: [], errors: []};
  if (!agents.length) return {commands: [], errors: ['Choose default agents in Settings > Skills CLI.']};
  if (!validAgents(agents)) return {commands: [], errors: ['Invalid or duplicate Skills CLI agent settings.']};
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
    if (!origin || !origin.source || !safeIdentifier.test(origin.name) ||
        /#[^#]+$/.test(origin.source) || /[\r\n\0]/.test(origin.source)) {
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
  if (errors.length) return {commands: [], errors};
  const commands = [...groups.values()].map((group) => {
    const args = [
      'npx', 'skills', 'add', shellQuote(group.source),
      ...group.skills.flatMap((name) => ['--skill', shellQuote(name)]),
      ...group.agents.flatMap((agent) => ['--agent', shellQuote(agent)]),
      '--yes', '--json',
    ];
    return 'cd ' + shellQuote(path.resolve(projectRoot)) + ' && ' + args.join(' ');
  });
  return {commands, errors};
}
