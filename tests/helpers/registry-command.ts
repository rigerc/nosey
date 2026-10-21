import process from 'node:process';
import {vi} from 'vite-plus/test';
import {runRegistryCommand} from '../../src/lib/registry/cli.js';

type Result = {stdout: string; stderr: string};

/**
 * Invoke the real registry dispatcher without restarting Node and loading tsx
 * for each assertion. The fixture supplies the same cwd and XDG paths used by
 * the subprocess tests. This is intentionally only for serial tests: callers
 * testing process isolation or competing writers must spawn real processes.
 */
export async function runRegistryInProcess(
  args: string[],
  fixture: {root: string; configHome: string; cacheHome: string},
): Promise<Result> {
  if (args[0] !== 'registry') throw new Error('Expected registry command');

  const savedArgv = process.argv;
  const savedExitCode = process.exitCode;
  const environment = {
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
    APPDATA: process.env.APPDATA,
    XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
  };
  Object.assign(process.env, {
    XDG_CONFIG_HOME: fixture.configHome,
    APPDATA: fixture.configHome,
    XDG_CACHE_HOME: fixture.cacheHome,
    LOCALAPPDATA: fixture.cacheHome,
  });
  process.argv = [process.execPath, 'nosey', ...args];
  process.exitCode = 0;

  let stdout = '';
  let stderr = '';
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(fixture.root);
  const out = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    stdout += String(chunk);
    return true;
  });
  const err = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    stderr += String(chunk);
    return true;
  });

  try {
    const positional: string[] = [];
    const flags: {json: boolean; global?: boolean; project?: boolean; ref?: string} = {
      json: false,
    };
    for (let i = 1; i < args.length; i++) {
      const value = args[i]!;
      if (value === '--json') flags.json = true;
      else if (value === '--global') flags.global = true;
      else if (value === '--project') flags.project = true;
      else if (value === '--ref') flags.ref = args[++i];
      else if (value.startsWith('--ref=')) flags.ref = value.slice('--ref='.length);
      else if (!value.startsWith('--')) positional.push(value);
    }

    await runRegistryCommand(positional, flags);
    if (process.exitCode !== undefined && process.exitCode !== 0) {
      throw Object.assign(new Error(stderr || stdout), {
        code: process.exitCode,
        stdout,
        stderr,
      });
    }
    return {stdout, stderr};
  } finally {
    err.mockRestore();
    out.mockRestore();
    cwd.mockRestore();
    process.argv = savedArgv;
    process.exitCode = savedExitCode;
    for (const key of Object.keys(environment) as Array<keyof typeof environment>) {
      const previous = environment[key];
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
  }
}
