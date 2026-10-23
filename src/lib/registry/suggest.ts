import path from 'node:path';
import type {Octokit} from 'octokit';
import {authenticatedGithubClient} from './github.js';
import {validateRegistryId} from './init.js';

/** The repository segment derived from the destination directory. */
export function registryName(directory: string): string {
  const name = path
    .basename(path.resolve(directory))
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[\W.]+|[\W.]+$/g, '');

  return name || 'my-skills-registry';
}

/**
 * `owner/repository` for the wizard's ID step, where the owner is the account
 * authenticated with Octokit and the repository is the destination directory.
 * Undefined when authentication is unavailable or the result is not a valid ID.
 */
export async function suggestRegistryId(
  directory: string,
  dependencies: {github?: Octokit} = {},
): Promise<string | undefined> {
  let owner: string;

  try {
    const github = dependencies.github ?? (await authenticatedGithubClient());

    const {data} = await github.rest.users.getAuthenticated({
      request: {signal: AbortSignal.timeout(5_000)},
    });

    owner = data.login.trim();
  } catch {
    return undefined;
  }

  if (!/^[a-z\d][\w.-]*$/i.test(owner)) return undefined;
  const suggestion = owner + '/' + registryName(directory);

  try {
    validateRegistryId(suggestion);
  } catch {
    return undefined;
  }

  return suggestion;
}
