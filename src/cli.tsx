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
import {isScreenId, screenIds} from './screens';
import {resolveThemeName} from './theme/resolve';

const cli = meow(
  `
${brandMarkAnsi({color: !noColor() && Boolean(process.stdout.isTTY)})}  ${APP_NAME}
${brandTagline}

  Usage
    $ ${APP_NAME} [options]
    $ ${APP_NAME} doctor [--json] [--config path]
    $ ${APP_NAME} --setup [--config path]

  Options
    --theme <name>   nosey | dark | light | contrast | mono | auto
    --screen <id>    ${screenIds.join(' | ')}
    --ascii          Use ASCII symbols and borders
    --config <path>  Read/write a specific JSON configuration file
    --setup          Open the interactive configuration wizard
    --plain          Print once and exit (also the default when piped or in CI)
    --json           JSON output for headless commands (doctor)
    --debug          Write logs to a file and show stack traces

  Environment
    NO_COLOR=1       Force the mono theme
    ${APP_THEME_ENV}    Default theme
    CLI_ASCII=1      Force ASCII symbols
`,
  {
    importMeta: import.meta,
    // The banner below already carries the tagline from package.json.
    description: false,
    flags: {
      theme: {type: 'string'},
      screen: {type: 'string', default: 'home'},
      ascii: {type: 'boolean'},
      config: {type: 'string'},
      setup: {type: 'boolean'},
      plain: {type: 'boolean'},
      json: {type: 'boolean'},
      debug: {type: 'boolean'},
    },
  },
);

async function main() {
  const {flags, input} = cli;
  logger.setDebug(Boolean(flags.debug));

  if (input.length > 0) {
    if (flags.setup || flags.plain)
      throw new AppError('Subcommands cannot be combined with --setup or --plain', {exitCode: 2});
    if (runCommand(input[0]!, input.slice(1), {configFile: flags.config, json: flags.json})) return;
    throw new AppError(`Unknown command "${input[0]}"`, {
      exitCode: 2,
      hint: `Run ${APP_NAME} --help for available commands.`,
    });
  }
  if (flags.json)
    throw new AppError('--json requires a headless subcommand (e.g. doctor)', {exitCode: 2});
  if (!isScreenId(flags.screen))
    throw new AppError(`Unknown screen "${flags.screen}"`, {
      exitCode: 2,
      hint: `Try one of: ${screenIds.join(', ')}`,
    });

  const {config, error} = loadConfig(flags.config);
  if (error) logger.error('config:', error);
  if (flags.setup && error)
    throw new AppError('Cannot edit invalid configuration', {hint: error, exitCode: 2});

  const configFlags: Partial<Config> = {
    theme:
      flags.theme && appConfig.fields[0]?.options?.some((item) => item.value === flags.theme)
        ? (flags.theme as Config['theme'])
        : undefined,
    ascii: flags.ascii ? true : undefined,
  };
  const resolved = resolveConfig(appConfig.fields, config, {flags: configFlags});
  const options: AppOptions = {
    theme: resolveThemeName({
      flag: flags.theme,
      env: process.env[APP_THEME_ENV],
      config: config.theme,
      noColor: noColor(),
    }),
    ascii: resolved.values.ascii ?? !supportsUnicode(),
    debug: Boolean(flags.debug),
    screen: flags.screen,
    configFile: flags.config,
    configFlags,
  };
  logger.debug('options', options);

  if (flags.setup && (flags.plain || !isInteractive()))
    throw new AppError('Configuration wizard requires an interactive terminal', {
      exitCode: 2,
      hint: `Run ${APP_NAME} --setup in a TTY, or edit the JSON config directly.`,
    });

  if (flags.plain || !isInteractive()) {
    console.log(
      renderToString(<PlainView options={options} />, {
        columns: process.stdout.columns || 80,
      }),
    );
    return;
  }

  await render(
    flags.setup ? <ConfigSetup options={options} /> : <App options={options} />,
  ).waitUntilExit();
}

main().catch((error: unknown) => {
  const err = toAppError(error);
  console.error(`${err.message}${err.hint ? `\n${err.hint}` : ''}`);
  process.exitCode = err.exitCode;
});
