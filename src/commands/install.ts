import {appConfig, resolveConfig} from '../config';
import {AppError} from '../lib/errors';
import {loadConfig} from '../lib/config';
import {detectProject} from '../lib/detect';
import {resolveRegistries} from '../lib/registry/resolve';
import {
  SKILLS_CLI_AGENTS,
  validAgents,
  validSkillsCliPackage,
  type InstallableSkill,
} from '../features/skills/install';
import {
  buildInstallPlan,
  installSkillIds,
  resolveInstallAgents,
  validInstallAgents,
  type InstallPlan,
  type InstallPlanSkill,
} from '../features/skills/plan';
import {
  completeSelection,
  executeInstallPlan,
  type InstallCommandResult,
  type InstallExecution,
} from '../features/skills/execute';
import type {ScanCommandOptions} from './scan';

export interface InstallCommandOptions extends ScanCommandOptions {
  agent?: string[];
  yes?: boolean;
  dryRun?: boolean;
  skillsCli?: string;
  configFile?: string;
}

interface InstallResultDocument {
  project: string;
  agents: string[];
  skills: InstallPlanSkill[];
  commands: string[];
  executed: boolean;
  ok: boolean;
  results: InstallCommandResult[];
  error?: string;
  hint?: string;
}

const supportedAgents = SKILLS_CLI_AGENTS.map((agent) => agent.value).join(', ');

function emptyExecution(): InstallExecution {
  return {results: [], completed: 0, total: 0, exitCode: 0};
}

function formatPlan(plan: InstallPlan): string {
  const lines = [
    `Project: ${plan.root}`,
    `Agents: ${plan.agents.join(', ')}`,
    '',
    `Skills (${plan.skills.length})`,
  ];

  if (!plan.skills.length) lines.push('  None recommended');

  for (const skill of plan.skills)
    lines.push(`  ${skill.action === 'installed' ? 'installed' : 'install  '} ${skill.id}`);

  lines.push('', `Commands (${plan.commands.commands.length})`);

  if (!plan.commands.commands.length) lines.push('  No installation commands necessary.');
  else for (const command of plan.commands.commands) lines.push('  ' + command);

  return lines.join('\n') + '\n';
}

function loadDefaultAgents(configFile?: string): string[] {
  const {config, error} = loadConfig(configFile);

  if (error !== undefined)
    throw new AppError('Cannot read configuration', {hint: error, exitCode: 2});

  return resolveConfig(appConfig.fields, config).values.skillsCli?.defaultAgents ?? [];
}

function explicitAgents(values: readonly string[] | undefined): string[] {
  const agents = [...new Set(values ?? [])];

  if (agents.length && !validAgents(agents))
    throw new AppError('Unsupported --agent value', {
      exitCode: 2,
      hint: `Supported agents: ${supportedAgents}`,
    });

  return agents;
}

/** Headless planning and opt-in installation; never mounts Ink or prompts. */
export async function runInstall(args: string[], options: InstallCommandOptions): Promise<void> {
  if (args.length > 1) throw new AppError('Expected at most one project path', {exitCode: 2});

  if (options.skillsOnly)
    throw new AppError('--skills-only cannot be used with install', {exitCode: 2});

  if (options.dryRun && options.yes)
    throw new AppError('--dry-run and --yes are mutually exclusive', {exitCode: 2});

  const depth = options.depth ?? 8;
  const maxFiles = options.maxFiles ?? 20_000;

  if (!Number.isSafeInteger(depth) || depth < 0)
    throw new AppError('--depth requires a non-negative integer', {exitCode: 2});

  if (!Number.isSafeInteger(maxFiles) || maxFiles < 1)
    throw new AppError('--max-files requires a positive integer', {exitCode: 2});

  const skillsCli = options.skillsCli ?? 'skills';

  if (!validSkillsCliPackage(skillsCli))
    throw new AppError('--skills-cli requires an npm package name with an optional version', {
      exitCode: 2,
    });

  const root = args[0] ?? '.';
  const configured = loadDefaultAgents(options.configFile);
  const explicit = explicitAgents(options.agent);
  const agents = await resolveInstallAgents(root, explicit, configured);

  if (!validInstallAgents(agents))
    throw new AppError('No target agents found for skill installation', {
      exitCode: 2,
      hint: `Pass --agent <id> or configure skillsCli.defaultAgents. Supported: ${supportedAgents}`,
    });

  const resolved = await resolveRegistries(root, options.registry ?? []);

  for (const warning of resolved.warnings)
    process.stderr.write(`nosey: registry warning [${warning.source}]: ${warning.message}\n`);

  const report = await detectProject(root, {
    depth,
    maxFiles,
    frontendBonus: options.frontendBonus,
    registry: resolved.registry,
    registryWarnings: resolved.warnings,
  });

  const sourced: InstallableSkill[] = report.skills.map((skill) => ({
    ...skill,
    installSource: resolved.registry.skillInstallSources?.get(skill.id),
  }));

  const plan = await buildInstallPlan(root, sourced, agents, skillsCli);

  if (plan.commands.errors.length)
    throw new AppError('Cannot plan skill installation', {
      exitCode: 1,
      hint: plan.commands.errors.join('\n'),
    });

  const execute = Boolean(options.yes) && !options.dryRun;

  if (!options.json) {
    process.stdout.write(formatPlan(plan));

    if (!execute || !plan.commands.invocations.length) return;

    process.exitCode = await completeSelection({
      ids: installSkillIds(plan),
      commands: plan.commands.commands,
      execution: plan.commands.invocations,
    });

    return;
  }

  const execution =
    execute && plan.commands.invocations.length
      ? await executeInstallPlan(plan.commands.invocations, {capture: true})
      : emptyExecution();

  const document: InstallResultDocument = {
    project: plan.root,
    agents: plan.agents,
    skills: plan.skills,
    commands: plan.commands.commands,
    executed: execute,
    ok: execution.error === undefined && execution.exitCode === 0,
    results: execution.results,
  };

  if (execution.error !== undefined) {
    document.error = execution.error.message;

    if (execution.error.hint !== undefined) document.hint = execution.error.hint;
  }

  process.stdout.write(JSON.stringify(document, null, 2) + '\n');

  if (!document.ok) process.exitCode = execution.error === undefined ? execution.exitCode : 1;
}
