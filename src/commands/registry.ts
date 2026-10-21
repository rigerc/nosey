import {AppError} from '../lib/errors';
import {runRegistryCommand} from '../lib/registry/cli';
import {runRegistryInit} from '../lib/registry/init';

export interface RegistryCommandOptions {
  json?: boolean;
  global?: boolean;
  ref?: string;
  registryId?: string;
  yes?: boolean;
  git?: boolean;
  github?: boolean;
  visibility?: string;
}

export const registryInitOptions = ['registryId', 'yes', 'git', 'github', 'visibility'] as const;

export async function runRegistry(args: string[], options: RegistryCommandOptions): Promise<void> {
  if (args[0] !== 'init') {
    if (registryInitOptions.some((key) => options[key] !== undefined))
      throw new AppError('Registry initialization options require: nosey registry init', {
        exitCode: 2,
      });
    await runRegistryCommand(args, {
      json: Boolean(options.json),
      global: options.global,
      ref: options.ref,
    });
    return;
  }

  validateRegistryInit(args, options);

  const result = await runRegistryInit(
    {
      directory: args[1],
      registryId: options.registryId,
      yes: true,
      git: options.git,
      github: options.github,
      visibility: options.visibility as 'private' | 'public' | undefined,
    },
    {interactive: false},
  );
  process.stdout.write(`Created registry ${result.registryId} at ${result.directory}\n`);
}

export function validateRegistryInit(args: string[], options: RegistryCommandOptions): void {
  // Validate all explicit flags before the initializer can create files or run Git.
  const allowed = new Set(['registry-id', 'yes', 'git', 'github', 'visibility', 'interactive']);
  for (const argument of process.argv.slice(2)) {
    if (argument === '--') break;
    if (!argument.startsWith('--')) continue;
    const name = argument.slice(2).split('=')[0]!.replace(/^no-/, '');
    if (!allowed.has(name))
      throw new AppError(`--${name} cannot be used with registry init`, {exitCode: 2});
  }
  if (args.length > 2) throw new AppError('Expected registry init <directory>', {exitCode: 2});
  if (options.visibility && !['private', 'public'].includes(options.visibility))
    throw new AppError('--visibility requires private or public', {exitCode: 2});
}
