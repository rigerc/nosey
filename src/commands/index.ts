import {AppError} from '../lib/errors';
import {inspectEnvironment} from './doctor';
import {runScan, type ScanCommandOptions} from './scan';
import {registryInitOptions, runRegistry, type RegistryCommandOptions} from './registry';

export interface CommandOptions extends ScanCommandOptions, RegistryCommandOptions {
  configFile?: string;
}

/** Register headless commands here; do not import Ink or React in command handlers. */
export async function runCommand(
  name: string,
  args: string[],
  options: CommandOptions,
): Promise<boolean> {
  if (name !== 'registry' && registryInitOptions.some((key) => options[key] !== undefined))
    throw new AppError('Registry initialization options require: nosey registry init', {
      exitCode: 2,
    });
  if (name !== 'registry' && (options.global !== undefined || options.ref !== undefined))
    throw new AppError('--global and --ref require a registry subcommand', {exitCode: 2});
  if (name === 'scan') {
    await runScan(args, options);
    return true;
  }
  if (name === 'registry') {
    await runRegistry(args, options);
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
