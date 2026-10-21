import {AppError} from '../lib/errors';
import {brandMarkAnsi} from '../lib/brand';
import {APP_NAME} from '../lib/config';
import {noColor} from '../lib/terminal';
import {inspectEnvironment} from './doctor';

export interface CommandOptions {
  configFile?: string;
  json?: boolean;
}

/** Register headless commands here; do not import Ink or React in command handlers. */
export function runCommand(name: string, args: string[], options: CommandOptions): boolean {
  if (name !== 'doctor') return false;
  if (args.length) throw new AppError('doctor does not accept positional arguments', {exitCode: 2});

  const report = inspectEnvironment(options.configFile);
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `${brandMarkAnsi({color: !noColor() && Boolean(process.stdout.isTTY)})}  ${APP_NAME}`,
    );
    for (const check of report.checks)
      console.log(`${check.ok ? 'OK' : 'FAIL'}  ${check.name}: ${check.detail}`);
  }
  if (!report.ok) process.exitCode = 1;
  return true;
}
