import {AppError} from '../lib/errors';
import {inspectEnvironment} from './doctor';
import {runInstall, type InstallCommandOptions} from './install';
import {runScan, type ScanCommandOptions} from './scan';
import {registryInitOptions, runRegistry, type RegistryCommandOptions} from './registry';
import {runSchema} from './schema';

export interface CommandOptions
  extends ScanCommandOptions, RegistryCommandOptions, InstallCommandOptions {
  configFile?: string;
}

/** Register headless commands here; do not import Ink or React in command handlers. */
export async function runCommand(
  name: string,
  args: string[],
  options: CommandOptions,
): Promise<boolean> {
  if (
    name !== 'registry' &&
    name !== 'install' &&
    registryInitOptions.some((key) => options[key] !== undefined)
  )
    throw new AppError('Registry initialization options require: nosey registry init', {
      exitCode: 2,
    });

  if (name === 'install') {
    const registryOnly = ['registryId', 'git', 'github', 'visibility'] as const;

    if (registryOnly.some((key) => options[key] !== undefined))
      throw new AppError('Registry initialization options require: nosey registry init', {
        exitCode: 2,
      });
  }

  if (
    name !== 'registry' &&
    (options.global !== undefined || options.project !== undefined || options.ref !== undefined)
  )
    throw new AppError('--global, --project and --ref require a registry subcommand', {
      exitCode: 2,
    });

  if (name === 'scan') {
    await runScan(args, options);

    return true;
  }

  if (name === 'install') {
    await runInstall(args, options);

    return true;
  }

  if (name === 'registry') {
    await runRegistry(args, options);

    return true;
  }

  if (name === 'schema') {
    runSchema(args);

    return true;
  }

  if (name !== 'doctor') return false;

  if (args.length) throw new AppError('doctor does not accept positional arguments', {exitCode: 2});

  const report = inspectEnvironment(options.configFile);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const check of report.checks)
      console.log(`${check.ok ? 'OK' : 'FAIL'}  ${check.name}: ${check.detail}`);
  }

  if (!report.ok) process.exitCode = 1;

  return true;
}
