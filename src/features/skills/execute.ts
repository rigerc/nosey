import {spawn} from 'node:child_process';
import {AppError, toAppError} from '../../lib/errors';
import {formatInstallCommand, type InstallInvocation} from './install';

export interface ConfirmedSelection {
  ids: string[];
  commands?: string[];
  execution?: InstallInvocation[];
}

/** Called only after Ink exits and restores the terminal. */
export function runInstallCommand(invocation: InstallInvocation): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', invocation.args, {
      cwd: invocation.cwd,
      shell: false,
      stdio: 'inherit',
      // The user already reviewed the command; npm may need to download Skills CLI.
      env: {...process.env, npm_config_yes: 'true'},
      detached: process.platform !== 'win32',
    });

    let interrupted: NodeJS.Signals | undefined;

    const forward = (signal: NodeJS.Signals) => {
      interrupted = signal;

      if (!child.pid) return;

      // A separate process group lets cancellation reach npx and its descendants.
      try {
        if (process.platform === 'win32') child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch {
        if (!child.killed) child.kill(signal);
      }
    };

    const onInterrupt = () => forward('SIGINT');
    const onTerminate = () => forward('SIGTERM');

    const cleanup = () => {
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
    };

    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    child.once('error', (cause) => {
      cleanup();
      reject(new AppError('Could not start Skills CLI: ' + cause.message, {cause}));
    });
    child.once('close', (code, signal) => {
      cleanup();
      const stopped = interrupted ?? signal;
      resolve(stopped === 'SIGINT' ? 130 : stopped === 'SIGTERM' ? 143 : (code ?? 1));
    });
  });
}

/** Printing and execution share the post-UI handoff, including empty selections. */
export async function completeSelection(
  selection: ConfirmedSelection,
  run = runInstallCommand,
  write: (message: string) => void = (message) => {
    process.stdout.write(message);
  },
): Promise<number> {
  if (selection.execution === undefined) {
    if (selection.commands !== undefined)
      write(
        selection.commands.length
          ? selection.commands.join('\n') + '\n'
          : 'No installation commands necessary.\n',
      );
    else write(selection.ids.length ? selection.ids.join('\n') + '\n' : 'No skills selected.\n');

    return 0;
  }

  if (!selection.execution.length) {
    write('No installation commands necessary.\n');

    return 0;
  }

  let completed = 0;

  for (const invocation of selection.execution) {
    write('Running: ' + formatInstallCommand(invocation) + '\n');
    let code: number;

    try {
      code = await run(invocation);
    } catch (error) {
      throw new AppError(toAppError(error).message, {
        cause: error,
        hint: `${completed}/${selection.execution.length} commands completed. Remaining commands were not run.`,
      });
    }

    if (code !== 0) {
      write(
        `Skills CLI stopped (exit ${code}). ${completed}/${selection.execution.length} commands completed. Remaining commands were not run.\n`,
      );

      return code;
    }

    completed++;
  }

  write(`Skills CLI completed ${completed}/${selection.execution.length} commands.\n`);

  return 0;
}
