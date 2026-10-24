import {spawn} from 'node:child_process';
import {z} from 'zod';
import {AppError, toAppError} from '../../lib/errors';
import {formatInstallCommand, type InstallInvocation} from './install';

export interface ConfirmedSelection {
  ids: string[];
  commands?: string[];
  execution?: InstallInvocation[];
}

export interface InstallProcessResult {
  exitCode: number;
  output?: string;
}

export interface InstallCommandResult {
  command: string;
  exitCode: number;
  ok: boolean;
  output?: string;
}

export interface InstallExecution {
  results: InstallCommandResult[];
  completed: number;
  total: number;
  exitCode: number;
  error?: AppError;
}

export type InstallRunner = (
  invocation: InstallInvocation,
) => Promise<number | InstallProcessResult>;

const runnerResultSchema = z.union([
  z.number().transform((exitCode) => ({exitCode, output: undefined})),
  z.object({exitCode: z.number(), output: z.string().optional()}),
]);

const defaultWrite = (message: string) => {
  process.stdout.write(message);
};

function runProcess(
  invocation: InstallInvocation,
  capture: boolean,
  maxOutputBytes: number,
): Promise<InstallProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', invocation.args, {
      cwd: invocation.cwd,
      shell: false,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      // The user already reviewed the command; npm may need to download Skills CLI.
      env: {...process.env, npm_config_yes: 'true'},
      detached: process.platform !== 'win32',
    });

    let interrupted: NodeJS.Signals | undefined;
    let output = '';

    const append = (chunk: Buffer) => {
      output += chunk.toString('utf8');

      // Keep the most recent output; CI only needs the failure context.
      if (output.length > maxOutputBytes) output = output.slice(-maxOutputBytes);
    };

    if (capture) {
      child.stdout?.on('data', append);
      child.stderr?.on('data', append);
    }

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
      const exitCode = stopped === 'SIGINT' ? 130 : stopped === 'SIGTERM' ? 143 : (code ?? 1);

      if (capture) {
        resolve({exitCode, output});
      } else {
        resolve({exitCode});
      }
    });
  });
}

/** Called only after Ink exits and restores the terminal. */
export function runInstallCommand(invocation: InstallInvocation): Promise<number> {
  return runProcess(invocation, false, 0).then((result) => result.exitCode);
}

/** JSON consumers receive one document, so child output must not inherit stdout. */
export function captureInstallCommand(
  invocation: InstallInvocation,
  maxOutputBytes = 64 * 1024,
): Promise<InstallProcessResult> {
  return runProcess(invocation, true, maxOutputBytes);
}

export async function executeInstallPlan(
  execution: readonly InstallInvocation[],
  options: {
    run?: InstallRunner;
    write?: (message: string) => void;
    capture?: boolean;
    maxOutputBytes?: number;
  } = {},
): Promise<InstallExecution> {
  const total = execution.length;

  const run: InstallRunner =
    options.run ??
    (options.capture
      ? (invocation) => captureInstallCommand(invocation, options.maxOutputBytes)
      : runInstallCommand);

  const results: InstallCommandResult[] = [];
  let completed = 0;

  for (const invocation of execution) {
    options.write?.('Running: ' + formatInstallCommand(invocation) + '\n');
    let value: number | InstallProcessResult;

    try {
      // Sequential execution is intentional: a partial install is easier to inspect.
      // eslint-disable-next-line no-await-in-loop
      value = await run(invocation);
    } catch (error) {
      const failure = toAppError(error);

      return {
        results,
        completed,
        total,
        exitCode: 1,
        error: new AppError(failure.message, {
          cause: error,
          hint: `${completed}/${total} commands completed. Remaining commands were not run.`,
        }),
      };
    }

    const parsed = runnerResultSchema.parse(value);

    const result: InstallCommandResult = {
      command: formatInstallCommand(invocation),
      exitCode: parsed.exitCode,
      ok: parsed.exitCode === 0,
    };

    if (parsed.output !== undefined) result.output = parsed.output;
    results.push(result);

    if (parsed.exitCode !== 0) return {results, completed, total, exitCode: parsed.exitCode};

    completed++;
  }

  return {results, completed, total, exitCode: 0};
}

/** Printing and execution share the post-UI handoff, including empty selections. */
export async function completeSelection(
  selection: ConfirmedSelection,
  run: InstallRunner = runInstallCommand,
  write: (message: string) => void = defaultWrite,
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

  const outcome = await executeInstallPlan(selection.execution, {run, write});

  if (outcome.error !== undefined) throw outcome.error;

  if (outcome.exitCode !== 0) {
    write(
      `Skills CLI stopped (exit ${outcome.exitCode}). ${outcome.completed}/${outcome.total} commands completed. Remaining commands were not run.\n`,
    );

    return outcome.exitCode;
  }

  write(`Skills CLI completed ${outcome.completed}/${outcome.total} commands.\n`);

  return 0;
}
