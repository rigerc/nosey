#!/usr/bin/env node
import {render, renderToString} from 'ink';
import meow from 'meow';
import {App, PlainView, type AppOptions} from './app';
import {runCommand} from './commands';
import {appConfig, resolveConfig, type Config} from './config';
import {ConfigSetup} from './demos/ConfigSetup';
import {APP_NAME, APP_THEME_ENV, loadConfig} from './lib/config';
import {brandMarkAnsi, brandTagline} from './lib/brand';
import {AppError, toAppError} from './lib/errors';
import {logger} from './lib/logger';
import {isInteractive, noColor, supportsUnicode} from './lib/terminal';
import {detectProject} from './lib/detect.js';
import {formatReport} from './lib/report';
import {resolveRegistries} from './lib/registry/resolve.js';
import {runRegistryCommand} from './lib/registry/cli.js';
import {runRegistryInit, type RegistryInitOptions} from './lib/registry/init.js';
import {isScreenId, screenIds} from './screens';
import {resolveThemeName} from './theme/resolve';

const cli = meow(
  [
    brandMarkAnsi({color: !noColor() && Boolean(process.stdout.isTTY)}) + '  ' + APP_NAME,
    brandTagline, '',
    'Usage',
    '  nosey [path] [--json | --skills-only | --no-interactive]',
    '  nosey registry [init|list|add|remove|show|validate|build]',
    '  nosey doctor [--json]',
    'Options',
    '  --json               Print a structured detection report',
    '  --skills-only        Print only suggested skill IDs',
    '  --explain            Include detection evidence in text output',
    '  --no-interactive     Print report without the skill picker',
    '  --no-frontend-bonus Disable frontend bonus suggestions',
    '  --registry SOURCE    Add registry source (repeatable)',
    '  --depth N            Maximum scan depth (default: 8)',
    '  --max-files N        Maximum files (default: 20000)',
    '  --theme NAME         nosey|dark|light|contrast|mono|auto',
    '  --screen ID          ' + screenIds.join('|'),
    '  --ascii             ASCII terminal symbols',
    '  --plain             Print without the interactive UI',
    '  --setup             Open application settings wizard',
    '  --config PATH       Nosey application settings JSON path',
    '  --global            Use global scope for registry add/list/remove',
    '  --ref REVISION      Pin a Git registry revision',
    '  --registry-id ID    owner/repository for registry init',
    '  --yes               Noninteractive registry initialization',
    '  --no-git            Do not initialize a local Git repository',
    '  --github            Create a GitHub repository (requires gh)',
    '  --visibility LEVEL  private|public for GitHub initialization',
  ].join('\n'),
  {
    importMeta: import.meta,
    description: false,
    booleanDefault: undefined,
    flags: {
      theme: {type: 'string'},
      screen: {type: 'string', default: 'home'},
      ascii: {type: 'boolean'},
      config: {type: 'string'},
      setup: {type: 'boolean'},
      plain: {type: 'boolean'},
      json: {type: 'boolean'},
      skillsOnly: {type: 'boolean'},
      explain: {type: 'boolean'},
      interactive: {type: 'boolean', default: true},
      frontendBonus: {type: 'boolean', default: true},
      registry: {type: 'string', isMultiple: true},
      depth: {type: 'number', default: 8},
      maxFiles: {type: 'number', default: 20_000},
      global: {type: 'boolean'},
      ref: {type: 'string'},
      registryId: {type: 'string'},
      yes: {type: 'boolean'},
      git: {type: 'boolean'},
      github: {type: 'boolean'},
      visibility: {type: 'string'},
      debug: {type: 'boolean'},
    },
  },
);

function validate() {
  const allowed = new Set([
    'theme', 'screen', 'ascii', 'config', 'setup', 'plain', 'json', 'skillsOnly',
    'explain', 'interactive', 'frontendBonus', 'registry', 'depth', 'maxFiles',
    'global', 'ref', 'registryId', 'yes', 'git', 'github', 'visibility', 'debug',
  ]);
  for (const key of Object.keys(cli.flags)) {
    if (!allowed.has(key))
      throw new AppError('Unknown option: --' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), {exitCode: 2});
  }
  if (cli.flags.theme && !appConfig.fields[0]?.options?.some((entry) => entry.value === cli.flags.theme))
    throw new AppError('--theme requires a supported theme', {exitCode: 2});
  if (cli.flags.json && cli.flags.skillsOnly)
    throw new AppError('--json and --skills-only cannot be combined', {exitCode: 2});
  if (!Number.isSafeInteger(cli.flags.depth) || cli.flags.depth < 0)
    throw new AppError('--depth requires a non-negative integer', {exitCode: 2});
  if (!Number.isSafeInteger(cli.flags.maxFiles) || cli.flags.maxFiles < 1)
    throw new AppError('--max-files requires a positive integer', {exitCode: 2});
  if (cli.flags.visibility && !['private', 'public'].includes(cli.flags.visibility))
    throw new AppError('--visibility requires private or public', {exitCode: 2});
}
function initOptions(directory?: string): RegistryInitOptions {
  return {
    directory,
    registryId: cli.flags.registryId,
    yes: cli.flags.yes,
    git: cli.flags.git,
    github: cli.flags.github,
    visibility: cli.flags.visibility as 'private' | 'public' | undefined,
  };
}
function presentation(screen: string, root: string, registryInit?: RegistryInitOptions): AppOptions {
  const {flags} = cli;
  const {config, error} = loadConfig(flags.config);
  if (error) logger.error('config:', error);
  if (flags.setup && error)
    throw new AppError('Cannot edit invalid configuration', {hint: error, exitCode: 2});
  const configFlags: Partial<Config> = {
    theme: flags.theme && appConfig.fields[0]?.options?.some((entry) => entry.value === flags.theme)
      ? flags.theme as Config['theme'] : undefined,
    ascii: flags.ascii ? true : undefined,
  };
  const resolved = resolveConfig(appConfig.fields, config, {flags: configFlags});
  return {
    theme: resolveThemeName({
      flag: flags.theme, env: process.env[APP_THEME_ENV],
      config: config.theme, noColor: noColor(),
    }),
    ascii: resolved.values.ascii ?? !supportsUnicode(),
    debug: Boolean(flags.debug), screen,
    configFile: flags.config, configFlags, registryInit,
    scan: {
      root, depth: flags.depth, maxFiles: flags.maxFiles,
      frontendBonus: flags.frontendBonus,
      registry: flags.registry ?? [], explain: Boolean(flags.explain),
    },
  };
}
async function showApp(options: AppOptions) {
  let confirmed: string[] | undefined;
  await render(<App options={{...options, onConfirm: (ids) => { confirmed = ids; }}} />).waitUntilExit();
  if (confirmed) process.stdout.write(confirmed.length ? confirmed.join('\n') + '\n' : 'No skills selected.\n');
}
async function main() {
  const {flags, input} = cli;
  logger.setDebug(Boolean(flags.debug));
  validate();
  if (input[0] === 'doctor') {
    if (flags.setup || flags.plain || input.length !== 1)
      throw new AppError('Invalid doctor arguments', {exitCode: 2});
    runCommand('doctor', [], {configFile: flags.config, json: flags.json});
    return;
  }
  if (input[0] === 'registry') {
    if (flags.setup || flags.skillsOnly || flags.explain)
      throw new AppError('Scan and setup flags cannot be used with registry subcommands', {exitCode: 2});
    if (input[1] === 'init') {
      if (flags.global !== undefined || flags.ref !== undefined || flags.json || flags.skillsOnly || flags.explain || (flags.registry?.length ?? 0) > 0)
        throw new AppError('Registry init does not accept scan or registry-selection flags', {exitCode: 2});
      if (input.length > 3) throw new AppError('Expected registry init [directory]', {exitCode: 2});
      const options = initOptions(input[2]);
      if (isInteractive() && flags.interactive && !flags.yes) {
        await showApp(presentation('registry-setup', '.', options));
      } else {
        const result = await runRegistryInit({...options, yes: true}, {interactive: false});
        process.stdout.write('Created registry ' + result.registryId + ' at ' + result.directory + '\n');
      }
      return;
    }
    if (input.length === 1 && isInteractive() && flags.interactive && !flags.json) {
      await showApp(presentation('registry', '.'));
      return;
    }
    await runRegistryCommand(input.slice(1), {json: Boolean(flags.json), global: flags.global, ref: flags.ref});
    return;
  }
  if (flags.registryId !== undefined || flags.yes !== undefined || flags.git !== undefined ||
      flags.github !== undefined || flags.visibility !== undefined)
    throw new AppError('Registry initialization options require: nosey registry init', {exitCode: 2});
  if (flags.global !== undefined || flags.ref !== undefined)
    throw new AppError('--global and --ref require a registry subcommand', {exitCode: 2});
  if (input.length > 1) throw new AppError('Expected at most one project path', {exitCode: 2});
  const root = input[0] ?? '.';
  if (!isScreenId(flags.screen))
    throw new AppError('Unknown screen ' + flags.screen, {exitCode: 2});
  if (flags.setup && (!isInteractive() || flags.plain))
    throw new AppError('Configuration wizard requires an interactive terminal', {exitCode: 2});
  const options = presentation(flags.screen, root);
  if (flags.setup) {
    await render(<ConfigSetup options={options} />).waitUntilExit();
    return;
  }
  if (flags.screen !== 'home' && (flags.plain || !isInteractive())) {
    process.stdout.write(renderToString(<PlainView options={options} />, {
      columns: process.stdout.columns || 80,
    }) + '\n');
    return;
  }
  if (flags.plain || flags.json || flags.skillsOnly || !flags.interactive || !isInteractive()) {
    const resolved = await resolveRegistries(root, flags.registry ?? []);
    for (const warning of resolved.warnings)
      process.stderr.write('nosey: registry warning [' + warning.source + ']: ' + warning.message + '\n');
    const report = await detectProject(root, {
      depth: flags.depth, maxFiles: flags.maxFiles,
      frontendBonus: flags.frontendBonus,
      registry: resolved.registry, registryWarnings: resolved.warnings,
    });
    const result = flags.json ? JSON.stringify(report, null, 2)
      : flags.skillsOnly ? report.skills.map((skill) => skill.id).join('\n')
      : formatReport(report, Boolean(flags.explain));
    process.stdout.write(result + '\n');
    return;
  }
  await showApp(options);
}
main().catch((error: unknown) => {
  const err = toAppError(error);
  process.stderr.write('nosey: ' + err.message + (err.hint ? '\n' + err.hint : '') + '\n');
  process.exitCode = err.exitCode;
});
