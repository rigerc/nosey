import {z} from 'zod';
import {errorCode} from '../values.js';

import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify, stripVTControlCharacters} from 'node:util';
import {validateRegistry} from './commands.js';
import {configureTool} from './tools.js';
import {readRegistryFile} from './load.js';
import {downloadTemplate, templateRepository, type TemplateTransport} from './template.js';

const execFileAsync = promisify(execFile);

// Repository-local variables exported by Git must not redirect initialization,
// staging, commits, or the Git commands gh runs into the caller's repository.
const repositoryEnvironmentVariables = new Set([
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_OBJECT_DIRECTORY',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_INDEX_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_PREFIX',
  'GIT_SHALLOW_FILE',
  'GIT_COMMON_DIR',
  'GIT_INTERNAL_SUPER_PREFIX',
]);

export type RegistryInitOptions = {
  directory?: string;
  registryId?: string;
  yes?: boolean;
  git?: boolean;
  github?: boolean;
  visibility?: 'public' | 'private';
};

export type RegistryInitResult = {
  directory: string;
  registryId: string;
  gitInitialized: boolean;
  githubCreated: boolean;
  creationStatus?: 'not-requested' | 'not-created' | 'created' | 'uncertain';
  remoteUrl?: string;
  remoteObserved?: boolean;
  cloneCompleted?: boolean;
  configured?: boolean;
  pushCompleted?: boolean;
  templateCommit?: string;
  initialCommit?: string;
};

/** A scaffold exists and must not be created again after a later setup failure. */
export class RegistryInitError extends Error {
  constructor(
    message: string,
    readonly result: RegistryInitResult,
    cause: unknown,
  ) {
    super(message, {cause});
    this.name = 'RegistryInitError';
  }
}

function commandFailureDetail(cause: unknown): string {
  const parsed = z
    .object({stderr: z.string().optional(), stdout: z.string().optional()})
    .safeParse(cause);

  const output = parsed.success
    ? [parsed.data.stderr, parsed.data.stdout].filter((value) => value?.trim()).join('\n')
    : '';

  return stripVTControlCharacters(
    output || (cause instanceof Error ? cause.message : String(cause)),
  ).trim();
}

export type CommandRunner = (command: string, args: string[]) => Promise<string | void>;

export type RegistryInitDependencies = {
  /** An injected question function for command-line tests. */
  ask?: (question: string) => Promise<string>;
  /** Let an interactive UI display validation without writing over its frame. */
  onValidationError?: (message: string) => void;
  /** An injected command executor for command-line tests. */
  run?: CommandRunner;
  /** Override template-generation retry delays in tests. */
  wait?: (milliseconds: number) => Promise<void>;
  /** Override TTY detection in tests. */
  interactive?: boolean;
  /** Offline fixture only; never selected from user data or environment. */
  templateDirectory?: string;
  transport?: TemplateTransport;
};

/** Shared by the CLI service and the interactive wizards before a directory is written. */
export function validateRegistryId(id: string): void {
  const parts = id.split('/');

  if (
    parts.length !== 2 ||
    !/^[a-z\d][\w.-]*$/i.test(parts[0] ?? '') ||
    !/^[\w.-]+$/.test(parts[1] ?? '') ||
    parts.some((part) => part === '.' || part === '..' || part.endsWith('.'))
  ) {
    throw new Error('Registry ID must be owner/repository (for example, acme/agent-skills)');
  }
}

function yesNo(value: string, fallback: boolean): boolean {
  const normalized = value.trim().toLowerCase();

  if (normalized === '') return fallback;

  if (normalized === 'yes' || normalized === 'y') return true;

  if (normalized === 'no' || normalized === 'n') return false;
  throw new Error('Answer y or n');
}

export async function defaultRun(command: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !repositoryEnvironmentVariables.has(name.toUpperCase()) &&
        !/^git_config_(?:key|value)_\d+$/i.test(name),
    ),
  );

  env['GIT_TERMINAL_PROMPT'] = '0';
  env['GH_PROMPT_DISABLED'] = '1';
  env['GH_HOST'] = 'github.com';

  const {stdout} = await execFileAsync(command, args, {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    env,
  });

  return stdout;
}

/** Validate with Nosey's parsers and execute only packaged first-party tools. */
export async function configureRegistryIdentity(
  directory: string,
  registryId: string,
): Promise<void> {
  validateRegistryId(registryId);
  await readRegistryFile(directory, 'registry.json');
  await readRegistryFile(directory, 'README.md');
  await validateRegistry(directory);
  await execFileAsync(process.execPath, [configureTool, registryId, '--root', directory], {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  await validateRegistry(directory);
}

function destinationExistsError(destination: string): Error {
  return Object.assign(
    new Error(
      `Destination already exists: ${destination}. Choose a new directory. To use an existing registry, add it from Registries instead.`,
    ),
    {code: 'EEXIST'},
  );
}

/** Read-only preflight for the wizard; exclusive creation still guards against races. */
export async function validateRegistryDestination(directory: string): Promise<void> {
  const destination = path.resolve(directory);

  try {
    await fs.lstat(destination);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    throw error;
  }

  throw destinationExistsError(destination);
}

async function reserveDestination(directory: string): Promise<string> {
  const destination = path.resolve(directory);
  await fs.mkdir(path.dirname(destination), {recursive: true});

  try {
    await fs.mkdir(destination);
  } catch (error) {
    if (errorCode(error) === 'EEXIST') throw destinationExistsError(destination);
    throw error;
  }

  return destination;
}

async function populateLocal(
  destination: string,
  registryId: string,
  dependencies: RegistryInitDependencies,
): Promise<string | undefined> {
  let commit: string | undefined;

  if (dependencies.templateDirectory) {
    // Tests use representative fixtures. Production always resolves and downloads an exact commit.
    for (const name of await fs.readdir(dependencies.templateDirectory)) {
      if (name.toLowerCase() === '.git') continue;
      // eslint-disable-next-line no-await-in-loop
      await fs.cp(path.join(dependencies.templateDirectory, name), path.join(destination, name), {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
    }
  } else {
    commit = await downloadTemplate(destination, dependencies.transport);
  }

  await configureRegistryIdentity(destination, registryId);

  return commit;
}

/** Fetch the template into an exclusively created local destination. */
export async function scaffoldRegistry(
  directory: string,
  registryId: string,
  templateDirectory?: string,
  transport?: TemplateTransport,
): Promise<string> {
  validateRegistryId(registryId);
  const destination = await reserveDestination(directory);

  try {
    await populateLocal(destination, registryId, {templateDirectory, transport});
  } catch (error) {
    await fs.rm(destination, {recursive: true, force: true});
    throw error;
  }

  return destination;
}

const isNotFound = (cause: unknown) => /(?:HTTP 404|\(404\))/.test(commandFailureDetail(cause));

async function releaseEmptyReservation(directory: string): Promise<void> {
  try {
    if ((await fs.readdir(directory)).length === 0) await fs.rmdir(directory);
  } catch {
    // Cleanup must never hide a remote creation result or remove a useful clone.
    return;
  }
}

async function githubPreflight(registryId: string, runner: CommandRunner): Promise<void> {
  const [owner, repository] = registryId.split('/');

  if (
    !owner ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !repository ||
    repository.length > 100
  )
    throw new Error('GitHub registry ID requires a valid GitHub owner and repository name');
  await runner('git', ['--version']);
  await runner('gh', ['auth', 'status', '--hostname', 'github.com']);
  await runner('gh', ['api', 'users/' + owner, '--jq', '.login']);

  const template = await runner('gh', [
    'api',
    'repos/' + templateRepository,
    '--jq',
    '.is_template',
  ]);

  if (template?.trim() !== 'true')
    throw new Error('GitHub source repository is unavailable or is not a template');

  try {
    await runner('gh', ['api', 'repos/' + registryId, '--jq', '.html_url']);
  } catch (cause) {
    if (isNotFound(cause)) return;
    throw new Error(
      'Could not check the destination GitHub repository: ' + commandFailureDetail(cause),
      {cause},
    );
  }

  throw new Error(
    'GitHub repository already exists: ' + registryId + '. It was not adopted or changed.',
  );
}

/** GitHub can accept a template creation before its first commit is available. */
async function readGeneratedHead(
  destination: string,
  runner: CommandRunner,
  wait: (milliseconds: number) => Promise<void>,
): Promise<string | undefined> {
  try {
    return (await runner('git', ['-C', destination, 'rev-parse', '--verify', 'HEAD']))?.trim();
  } catch {
    // Confirm this is a valid clone before waiting on the remote's generation.
    await runner('git', ['-C', destination, 'symbolic-ref', 'HEAD']);
  }

  for (let attempt = 0; attempt < 11; attempt++) {
    if (attempt > 0) {
      // eslint-disable-next-line no-await-in-loop
      await wait(3000);
    }

    // eslint-disable-next-line no-await-in-loop
    const refs = await runner('git', [
      '-C',
      destination,
      'ls-remote',
      '--symref',
      'origin',
      'HEAD',
    ]);

    const branch = refs?.match(/^ref: refs\/heads\/(.+)\tHEAD$/m)?.[1];

    if (branch && /^[a-f\d]{40,64}\tHEAD$/m.test(refs ?? '')) {
      // eslint-disable-next-line no-await-in-loop
      await runner('git', ['check-ref-format', '--branch', branch]);
      // eslint-disable-next-line no-await-in-loop
      await runner('git', [
        '-C',
        destination,
        'fetch',
        'origin',
        `refs/heads/${branch}:refs/remotes/origin/${branch}`,
      ]);
      // eslint-disable-next-line no-await-in-loop
      await runner('git', [
        '-C',
        destination,
        'checkout',
        '-b',
        branch,
        '--track',
        `origin/${branch}`,
      ]);

      return (await runner('git', ['-C', destination, 'rev-parse', '--verify', 'HEAD']))?.trim();
    }
  }

  throw new Error(
    'GitHub template generation has not provided a default-branch commit after 30 seconds.',
  );
}

async function createFromGithub(
  destination: string,
  registryId: string,
  visibility: string,
  runner: CommandRunner,
  wait: (milliseconds: number) => Promise<void>,
): Promise<RegistryInitResult> {
  const remoteUrl = 'https://github.com/' + registryId;

  const result: RegistryInitResult = {
    directory: destination,
    registryId,
    gitInitialized: false,
    githubCreated: false,
    creationStatus: 'not-created',
    remoteUrl,
    cloneCompleted: false,
    configured: false,
    pushCompleted: false,
  };

  try {
    await runner('gh', [
      'repo',
      'create',
      registryId,
      '--template',
      templateRepository,
      '--' + visibility,
    ]);
    result.githubCreated = true;
    result.creationStatus = 'created';
    result.remoteObserved = true;
  } catch (cause) {
    // Even an observed remote may belong to a concurrent run. Never adopt it.
    result.creationStatus = 'uncertain';

    try {
      await runner('gh', ['api', 'repos/' + registryId, '--jq', '.html_url']);
      result.remoteObserved = true;
    } catch (inspection) {
      // A 404 cannot establish whether a timed-out create succeeded: permissions
      // and delayed visibility can hide a newly created repository.
      if (isNotFound(inspection)) result.remoteObserved = false;
    }

    await releaseEmptyReservation(destination);
    throw new RegistryInitError(
      `GitHub creation failed; creation status: ${result.creationStatus}. Inspect ${remoteUrl} with gh repo view ${registryId} before retrying. No existing remote was adopted or deleted.\n${commandFailureDetail(cause)}`,
      result,
      cause,
    );
  }

  let stage = 'clone';

  try {
    await runner('gh', ['repo', 'clone', registryId, destination]);
    result.cloneCompleted = true;
    result.gitInitialized = true;
    stage = 'template readiness';
    result.initialCommit = await readGeneratedHead(destination, runner, wait);
    stage = 'configuration';
    await configureRegistryIdentity(destination, registryId);
    result.configured = true;
    stage = 'commit';
    await runner('git', ['-C', destination, 'add', '--all']);
    await runner('git', [
      '-C',
      destination,
      'commit',
      '--allow-empty',
      '-m',
      'chore(registry): configure registry identity',
    ]);
    stage = 'push';
    await runner('git', ['-C', destination, 'push', 'origin', 'HEAD']);
    result.pushCompleted = true;
  } catch (cause) {
    await releaseEmptyReservation(destination);

    const recovery =
      stage === 'clone'
        ? `Clone ${remoteUrl} into a new directory with gh repo clone ${registryId}, then configure its registry identity.`
        : stage === 'template readiness'
          ? 'Once GitHub finishes generating the template, run git fetch origin in this clone and check out its default branch. Then configure the registry identity, validate, commit, and push.'
          : stage === 'configuration'
            ? 'Correct the registry data or use a Nosey version that supports its schemaVersion, then run the packaged registry-tools/configure-registry.mjs with --root pointing at this clone. Validate before committing and pushing.'
            : stage === 'commit'
              ? 'Check Git identity and commit hooks, commit the configured files, then push origin HEAD from this directory.'
              : 'Retry git push origin HEAD from this directory.';

    throw new RegistryInitError(
      `GitHub repository created at ${remoteUrl}, but ${stage} failed. Local work at ${destination} was preserved when present. ${recovery} Do not repeat registry init --github.\n${commandFailureDetail(cause)}`,
      result,
      cause,
    );
  }

  return result;
}

/** Run the interactive wizard, optionally initializing Git and creating a GitHub remote. */
export async function runRegistryInit(
  options: RegistryInitOptions = {},
  dependencies: RegistryInitDependencies = {},
): Promise<RegistryInitResult> {
  const interactive =
    !options.yes &&
    (dependencies.interactive ?? Boolean(process.stdin.isTTY && process.stderr.isTTY));

  const reader =
    interactive && !dependencies.ask
      ? createInterface({input: process.stdin, output: process.stderr})
      : undefined;

  const ask = dependencies.ask ?? (async (question: string) => reader?.question(question) ?? '');
  const runner = dependencies.run ?? defaultRun;

  try {
    const defaultDirectory =
      interactive && options.directory === undefined
        ? await ask('Destination directory [./my-skills-registry]: ')
        : '';

    const directoryInput =
      options.directory ??
      (interactive ? defaultDirectory.trim() || './my-skills-registry' : undefined);

    if (!directoryInput) {
      throw new Error(
        'Specify a destination directory: nosey registry init <directory> --registry-id owner/repo',
      );
    }

    let {registryId} = options;

    if (!registryId && interactive) {
      const {suggestRegistryId} = await import('./suggest.js');

      const suggestion = await suggestRegistryId(directoryInput, {
        run: async (command, args) => (await runner(command, args)) ?? '',
      });

      while (!registryId) {
        // eslint-disable-next-line no-await-in-loop
        const response = await ask(
          `Registry ID (owner/repository)${suggestion ? ' [' + suggestion + ']' : ''}: `,
        );

        const answer = response.trim() || suggestion || '';

        try {
          validateRegistryId(answer);
          registryId = answer;
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);

          if (dependencies.onValidationError) dependencies.onValidationError(message);
          else process.stderr.write(message + '\n');
        }
      }
    }

    if (!registryId) throw new Error('Specify --registry-id owner/repo');
    validateRegistryId(registryId);

    let initializeGit = options.git;

    if (initializeGit === undefined) {
      initializeGit = interactive
        ? yesNo(await ask('Initialize local Git repository? [Y/n]: '), true)
        : true;
    }

    let createGitHub = options.github;

    if (createGitHub === undefined) {
      createGitHub =
        interactive && initializeGit
          ? yesNo(await ask('Create and push a GitHub repository using gh? [y/N]: '), false)
          : false;
    }

    if (createGitHub && !initializeGit) {
      throw new Error('--github requires Git initialization (omit --no-git)');
    }

    let {visibility} = options;

    if (visibility !== undefined && visibility !== 'private' && visibility !== 'public') {
      throw new Error('GitHub visibility must be private or public');
    }

    if (visibility && !createGitHub) {
      throw new Error('--visibility requires --github or interactive GitHub creation');
    }

    if (createGitHub && !visibility) {
      const response = interactive
        ? await ask('GitHub visibility [private/public] (default private): ')
        : '';

      const answer = response.trim().toLowerCase();

      if (answer && answer !== 'private' && answer !== 'public') {
        throw new Error('GitHub visibility must be private or public');
      }

      visibility = answer === 'public' ? 'public' : 'private';
    }

    await validateRegistryDestination(directoryInput);

    if (createGitHub) await githubPreflight(registryId, runner);
    const destination = await reserveDestination(directoryInput);

    if (createGitHub)
      return await createFromGithub(
        destination,
        registryId,
        visibility ?? 'private',
        runner,
        dependencies.wait ?? delay,
      );

    const result: RegistryInitResult = {
      directory: destination,
      registryId,
      gitInitialized: false,
      githubCreated: false,
      creationStatus: 'not-requested',
      cloneCompleted: false,
      configured: false,
      pushCompleted: false,
    };

    try {
      result.templateCommit = await populateLocal(destination, registryId, dependencies);
      result.configured = true;
    } catch (cause) {
      await fs.rm(destination, {recursive: true, force: true});
      throw cause;
    }

    if (initializeGit) {
      try {
        await runner('git', ['init', '--initial-branch=main', destination]);
        result.gitInitialized = true;
      } catch (cause) {
        throw new RegistryInitError(
          `Registry created at ${destination}, but Git initialization failed. Run git init in this directory.\n${commandFailureDetail(cause)}`,
          result,
          cause,
        );
      }
    }

    return result;
  } finally {
    reader?.close();
  }
}
