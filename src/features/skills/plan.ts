import path from 'node:path';
import {
  discoverProjectSkillAgents,
  generateInstallCommands,
  inspectInstalledSkills,
  validAgents,
  type InstallableSkill,
  type InstallCommands,
} from './install';

export interface InstallPlanSkill {
  id: string;
  action: 'install' | 'installed';
  /** Missing agents that will receive this skill. */
  agents: string[];
}

export interface InstallPlan {
  root: string;
  agents: string[];
  skills: InstallPlanSkill[];
  commands: InstallCommands;
}

/** A project folder or explicit/config setting wins over inferred agent folders. */
export async function resolveInstallAgents(
  root: string,
  explicit: readonly string[] = [],
  configured: readonly string[] = [],
): Promise<string[]> {
  const unique = (values: readonly string[]) => [...new Set(values)];

  if (explicit.length) return unique(explicit);

  if (configured.length) return unique(configured);

  return discoverProjectSkillAgents(root);
}

export function validInstallAgents(agents: readonly string[]): boolean {
  return agents.length > 0 && validAgents(agents);
}

/**
 * Read-only planning shared by the headless command and, when useful, the UI.
 * It never spawns the Skills CLI.
 */
export async function buildInstallPlan(
  root: string,
  skills: readonly InstallableSkill[],
  agents: readonly string[],
  skillsCli = 'skills',
): Promise<InstallPlan> {
  const project = path.resolve(root);
  const statuses = await inspectInstalledSkills(project, skills, agents);

  const annotated: InstallableSkill[] = skills.map((skill) => {
    const installation = statuses.get(skill.id);

    if (installation === undefined) return skill;

    return {...skill, installation};
  });

  const commands = generateInstallCommands(
    annotated.map((skill) => skill.id),
    annotated,
    agents,
    project,
    skillsCli,
  );

  const planSkills = annotated.map((skill) => {
    const installed = new Set(skill.installation?.installedAgents ?? []);
    const missing = agents.filter((agent) => !installed.has(agent));

    return {
      id: skill.id,
      action: missing.length ? ('install' as const) : ('installed' as const),
      agents: missing,
    };
  });

  return {root: project, agents: [...agents], skills: planSkills, commands};
}

/** Recommendation IDs carry no installation meaning; expose the chosen plan cleanly. */
export function installSkillIds(plan: InstallPlan): string[] {
  return plan.skills.flatMap((skill) => (skill.action === 'install' ? [skill.id] : []));
}
