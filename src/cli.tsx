#!/usr/bin/env node
import {isThemeName, resolveThemeName} from './theme/resolve';
import {render, renderToString} from 'ink';
import meow from 'meow';
import {App, PlainView, type AppOptions} from './app';
import {runCommand} from './commands';
import {completeSelection, type ConfirmedSelection} from './features/skills/execute';
import {registryInitOptions, validateRegistryInit} from './commands/registry';
import {appConfig, resolveConfig, type Config} from './config';
import {ConfigSetup} from './demos/ConfigSetup';
import {APP_NAME, APP_THEME_ENV, loadConfig} from './lib/config';
import {AppError, toAppError} from './lib/errors';
import {logger} from './lib/logger';
import {isInteractive, noColor, supportsUnicode} from './lib/terminal';
import {isScreenId, screenIds} from './screens';

const cli = meow(
  `
  Usage
    $ ${APP_NAME} [options]
    $ ${APP_NAME} scan [path] [--json | --skills-only | --explain]
    $ ${APP_NAME} [path] [--json | --skills-only | --explain]
    $ ${APP_NAME} registry <init|list|add|remove|show|validate|build|refresh>
    $ ${APP_NAME} doctor [--json] [--config path]
    $ ${APP_NAME} --setup [--config path]

  Options
    --theme <name>   nosey | dark | light | contrast | mono | auto
    --screen <id>    ${screenIds.join(' | ')}
    --ascii          Use ASCII symbols and borders
    --config <path>  Read/write a specific JSON configuration file
    --setup          Open the interactive configuration wizard
    --plain          Print once and exit (also the default when piped or in CI)
    --json           JSON output for scans, registries, and diagnostics
    --skills-only    Print only suggested skill IDs
    --explain        Include detection evidence in scan reports
    --no-interactive Run a headless scan (scan commands always run headlessly)
    --no-frontend-bonus Disable frontend bonus suggestions
    --registry <source> Add a local or Git skill registry (repeatable)
    --depth <n>      Maximum scan depth (default: 8)
    --max-files <n>  Maximum scanned files (default: 20000)
    --global         List/refresh only global registries (add/remove are global by default)
    --project        Remove a legacy project-scoped registry reference
    --ref <revision> Select a Git registry revision (add/show/refresh)
    --registry-id <id> owner/repository for registry init
    --yes            Noninteractive registry initialization
    --no-git         Skip Git initialization for a registry
    --github         Create a GitHub registry repository with gh
    --visibility <level> private | public for GitHub creation
    --debug          Write logs to a file and show stack traces

  Environment
    NO_COLOR=1       Force the mono theme
    ${APP_THEME_ENV}    Default theme
    CLI_ASCII=1      Force ASCII symbols
`,
  {
    importMeta: import.meta,
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
      interactive: {type: 'boolean'},
      frontendBonus: {type: 'boolean'},
      registry: {type: 'string', isMultiple: true},
      depth: {type: 'number'},
      maxFiles: {type: 'number'},
      global: {type: 'boolean'},
      project: {type: 'boolean'},
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

function presentation(screen: string, root: string): AppOptions {
  const {flags} = cli;
  const {config, error} = loadConfig(flags.config);

  if (error) logger.error('config:', error);

  if (flags.setup && error)
    throw new AppError('Cannot edit invalid configuration', {hint: error, exitCode: 2});

  const configFlags: Partial<Config> = {
    theme: flags.theme === 'auto' || isThemeName(flags.theme) ? flags.theme : undefined,
    ascii: flags.ascii ? true : undefined,
  };

  const resolved = resolveConfig(appConfig.fields, config, {flags: configFlags});

  return {
    theme: resolveThemeName({
      flag: flags.theme,
      env: process.env[APP_THEME_ENV],
      config: config.theme,
      noColor: noColor(),
    }),
    ascii: resolved.values.ascii ?? !supportsUnicode(),
    compactMode: resolved.values.compactMode ?? false,
    debug: Boolean(flags.debug),
    screen,
    configFile: flags.config,
    configFlags,
    skillsCli: resolved.values.skillsCli,
    registrySettings: resolved.values.registries,
    scan: {
      root,
      depth: flags.depth ?? 8,
      maxFiles: flags.maxFiles ?? 20_000,
      frontendBonus: flags.frontendBonus ?? true,
      registry: flags.registry ?? [],
      explain: Boolean(flags.explain),
    },
  };
}

async function showApp(options: AppOptions) {
  let selection: ConfirmedSelection | undefined;
  await render(
    <App
      options={{
        ...options,
        onConfirm: (ids, commands, execution) => {
          selection = {
            ids,
            commands,
            execution:
              options.skillsCli?.enabled && options.skillsCli.execute ? execution : undefined,
          };
        },
      }}
    />,
  ).waitUntilExit();

  if (selection) process.exitCode = await completeSelection(selection);
}

async function main() {
  const {flags, input} = cli;
  logger.setDebug(Boolean(flags.debug));

  const allowed = new Set([
    'theme',
    'screen',
    'ascii',
    'config',
    'setup',
    'plain',
    'json',
    'debug',
    'skillsOnly',
    'explain',
    'interactive',
    'frontendBonus',
    'registry',
    'depth',
    'maxFiles',
    'global',
    'project',
    'ref',
    'registryId',
    'yes',
    'git',
    'github',
    'visibility',
  ]);

  for (const key of Object.keys(flags))
    if (!allowed.has(key))
      throw new AppError(
        'Unknown option: --' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()),
        {exitCode: 2},
      );

  if (flags.theme && !appConfig.fields[0]?.options?.some((option) => option.value === flags.theme))
    throw new AppError('--theme requires a supported theme', {exitCode: 2});

  if (flags.json && flags.skillsOnly)
    throw new AppError('--json and --skills-only are mutually exclusive', {exitCode: 2});

  if (!Number.isSafeInteger(flags.depth ?? 8) || (flags.depth ?? 8) < 0)
    throw new AppError('--depth requires a non-negative integer', {exitCode: 2});

  if (!Number.isSafeInteger(flags.maxFiles ?? 20_000) || (flags.maxFiles ?? 20_000) < 1)
    throw new AppError('--max-files requires a positive integer', {exitCode: 2});

  const interactive =
    isInteractive() &&
    flags.interactive !== false &&
    !flags.plain &&
    !flags.json &&
    !flags.skillsOnly;

  if (input[0] === 'doctor') {
    if (
      flags.setup ||
      flags.plain ||
      flags.screen !== 'home' ||
      flags.skillsOnly ||
      flags.explain ||
      flags.depth !== undefined ||
      flags.maxFiles !== undefined ||
      (flags.registry?.length ?? 0) > 0
    )
      throw new AppError('Invalid doctor arguments', {exitCode: 2});
    await runCommand('doctor', input.slice(1), {...flags, configFile: flags.config});

    return;
  }

  if (input[0] === 'registry') {
    if (flags.setup || flags.skillsOnly || flags.explain)
      throw new AppError('Scan and setup flags cannot be used with registry subcommands', {
        exitCode: 2,
      });

    if (input[1] === 'init') {
      validateRegistryInit(input.slice(1), flags);

      if (interactive && !flags.yes) {
        const options = presentation('registry-setup', '.');
        options.registryInit = {
          directory: input[2],
          registryId: flags.registryId,
          git: flags.git,
          github: flags.github,
          visibility:
            flags.visibility === 'public' || flags.visibility === 'private'
              ? flags.visibility
              : undefined,
        };
        await showApp(options);

        return;
      }
    }

    if (input.length === 1 && interactive) {
      await showApp(presentation('registry', '.'));

      return;
    }

    await runCommand('registry', input.slice(1), flags);

    return;
  }

  if (registryInitOptions.some((key) => flags[key] !== undefined))
    throw new AppError('Registry initialization options require: nosey registry init', {
      exitCode: 2,
    });

  if (flags.global !== undefined || flags.project !== undefined || flags.ref !== undefined)
    throw new AppError('--global, --project and --ref require a registry subcommand', {
      exitCode: 2,
    });
  const explicitScan = input[0] === 'scan';
  const paths = explicitScan ? input.slice(1) : input;

  if (paths.length > 1) throw new AppError('Expected at most one project path', {exitCode: 2});

  if (!isScreenId(flags.screen))
    throw new AppError('Unknown screen ' + flags.screen, {exitCode: 2});
  const root = paths[0] ?? '.';
  const options = presentation(flags.screen, root);

  if (flags.setup) {
    if (input.length || !interactive)
      throw new AppError(
        'Configuration wizard requires an interactive terminal without a scan command',
        {exitCode: 2},
      );
    await render(<ConfigSetup options={options} />).waitUntilExit();

    return;
  }

  if (explicitScan && flags.screen !== 'home')
    throw new AppError('Headless scan cannot be combined with --screen', {exitCode: 2});

  if (
    !['home', 'skills'].includes(flags.screen) &&
    !flags.json &&
    !flags.skillsOnly &&
    !interactive
  ) {
    if (flags.screen === 'registry-setup')
      throw new AppError(
        'Registry initialization wizard requires an interactive terminal; use registry init <path> --registry-id owner/repo --yes',
        {exitCode: 2},
      );
    process.stdout.write(
      renderToString(<PlainView options={options} />, {columns: process.stdout.columns || 80}) +
        '\n',
    );

    return;
  }

  if (explicitScan || !interactive) {
    await runCommand('scan', paths, flags);

    return;
  }

  await showApp(options);
}

main().catch((error) => {
  const err = toAppError(error);
  process.stderr.write(err.message + (err.hint ? '\n' + err.hint : '') + '\n');
  process.exitCode = err.exitCode;
});
