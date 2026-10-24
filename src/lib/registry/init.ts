import {z} from 'zod';
import type {Octokit} from 'octokit';
import {errorCode} from '../values.js';

import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {constants as fsConstants} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify, stripVTControlCharacters} from 'node:util';
import {validateRegistry} from './commands.js';
import {authenticatedGithubClient, githubGitEnvironment} from './github.js';
import {readRegistryFile} from './load.js';
import {downloadTemplate, templateRepository, type TemplateTransport} from './template.js';
import {configureRegistryIdentityFiles} from './identity-files.js';
import {trustedTemplateRevision} from './template-source.js';
import {
  assertGeneratedTemplateTree,
  assertTemplateDefaultHead,
  verifyTemplateGuide,
} from './template-provenance.js';

const execFileAsync = promisify(execFile);

// Repository-local variables exported by Git must not redirect initialization,
// staging, commits, or cloning into the caller's repository.
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

export type CommandRunner = (
  command: string,
  args: string[],
  environment?: NodeJS.ProcessEnv,
) => Promise<string | void>;

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
  /** Inject an Octokit client for offline API tests. */
  github?: Octokit;
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

export async function defaultRun(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv = {},
): Promise<string> {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) =>
        !repositoryEnvironmentVariables.has(name.toUpperCase()) &&
        !/^git_config_(?:key|value)_\d+$/i.test(name),
    ),
  );

  env['GIT_TERMINAL_PROMPT'] = '0';
  Object.assign(env, environment);

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
): Promise<string[]> {
  validateRegistryId(registryId);
  await readRegistryFile(directory, 'README.md');
  await validateRegistry(directory);
  const guide = path.join(directory, 'AGENTS.md');
  let guidePolicy: {maintainer: string; downstream: string} | undefined;

  const readGuide = async (filename: string): Promise<Buffer> => {
    const relative = path.relative(directory, filename);
    let parent = path.resolve(directory);

    for (const segment of path.dirname(relative).split(path.sep).filter(Boolean)) {
      parent = path.join(parent, segment);
      const parentInfo = await fs.lstat(parent);

      if (!parentInfo.isDirectory() || parentInfo.isSymbolicLink())
        throw new Error(`Invalid trusted guide parent: ${path.basename(parent)}`);
    }

    const info = await fs.lstat(filename);

    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4 * 1024 * 1024)
      throw new Error(`Invalid trusted guide file: ${path.basename(filename)}`);
    const handle = await fs.open(filename, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);

    try {
      const opened = await handle.stat();

      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== info.dev ||
        opened.ino !== info.ino ||
        opened.size > 4 * 1024 * 1024
      )
        throw new Error(`Trusted guide changed while being opened: ${path.basename(filename)}`);

      return await handle.readFile();
    } finally {
      await handle.close();
    }
  };

  let maintainer: Buffer | undefined;

  try {
    maintainer = await readGuide(guide);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }

  if (maintainer) {
    const sentinel = Buffer.from('<!-- NOSEY-TEMPLATE-MAINTAINER-GUIDE:v1 -->');

    const exactMaintainer = (() => {
      try {
        verifyTemplateGuide(maintainer!, trustedTemplateRevision, 'maintainer');

        return true;
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('maintainer guide hash mismatch'))
          throw error;

        return false;
      }
    })();

    const guideText = maintainer.toString('utf8');

    if (
      !exactMaintainer &&
      (maintainer.includes(sentinel) ||
        /NOSEY-TEMPLATE-MAINTAINER-GUIDE|Registry template agent guide/u.test(guideText))
    )
      throw new Error('Conflicting registry template maintainer guide; refusing replacement');

    if (exactMaintainer) {
      const downstream = await readGuide(
        path.join(directory, '.agents/templates/registry-AGENTS.md'),
      );

      verifyTemplateGuide(downstream, trustedTemplateRevision, 'downstream');

      const decode = (bytes: Buffer, name: string): string => {
        const value = bytes.toString('utf8');

        if (!Buffer.from(value).equals(bytes)) throw new Error(`${name} must be valid UTF-8`);

        return value;
      };

      guidePolicy = {
        maintainer: decode(maintainer, 'AGENTS.md'),
        downstream: decode(downstream, '.agents/templates/registry-AGENTS.md'),
      };
    }
  }

  const {changedFiles} = await configureRegistryIdentityFiles(directory, registryId, {guidePolicy});
  await validateRegistry(directory);

  return changedFiles;
}

const identityFiles = new Set([
  'skills-map.json',
  'skills-manifest.json',
  'README.md',
  'AGENTS.md',
]);

function changedStatusPaths(status: string): string[] {
  return status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));
}

async function assertOnlyExpectedIdentityChanges(
  directory: string,
  runner: CommandRunner,
  expected: Map<string, string>,
): Promise<void> {
  const status =
    (await runner('git', ['-C', directory, 'status', '--porcelain=v1', '--untracked-files=all'])) ??
    '';

  const paths = changedStatusPaths(status);
  const unexpected = paths.filter((file) => !expected.has(file));

  if (unexpected.length)
    throw new Error(
      `Unexpected changes in generated registry clone; preserved for recovery: ${unexpected.join(', ')}`,
    );

  for (const [file, digest] of expected) {
    const contents = await fs.readFile(path.join(directory, file));

    if (createHash('sha256').update(contents).digest('hex') !== digest)
      throw new Error(
        `Configured identity file changed before staging: ${file}; preserved for recovery`,
      );
  }
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

const isNotFound = (cause: unknown) => z.object({status: z.literal(404)}).safeParse(cause).success;

async function releaseEmptyReservation(directory: string): Promise<void> {
  try {
    if ((await fs.readdir(directory)).length === 0) await fs.rmdir(directory);
  } catch {
    // Cleanup must never hide a remote creation result or remove a useful clone.
    return;
  }
}

async function githubPreflight(
  registryId: string,
  runner: CommandRunner,
  github: Octokit,
): Promise<void> {
  const [owner, repository] = registryId.split('/');

  if (
    !owner ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !repository ||
    repository.length > 100
  )
    throw new Error('GitHub registry ID requires a valid GitHub owner and repository name');
  await runner('git', ['--version']);
  await github.rest.users.getAuthenticated();
  await github.rest.users.getByUsername({username: owner});

  const [templateOwner, templateRepo] = templateRepository.split('/');

  const {data: template} = await github.rest.repos.get({
    owner: templateOwner!,
    repo: templateRepo!,
  });

  if (!template.is_template)
    throw new Error('GitHub source repository is unavailable or is not a template');

  await assertTemplateDefaultHead(github, trustedTemplateRevision);

  try {
    await github.rest.repos.get({owner, repo: repository});
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
  github: Octokit,
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
    const [templateOwner, templateRepo] = templateRepository.split('/');
    const [owner, name] = registryId.split('/');
    await github.rest.repos.createUsingTemplate({
      template_owner: templateOwner!,
      template_repo: templateRepo!,
      owner,
      name: name!,
      private: visibility === 'private',
      include_all_branches: false,
    });
    result.githubCreated = true;
    result.creationStatus = 'created';
    result.remoteObserved = true;
  } catch (cause) {
    // Even an observed remote may belong to a concurrent run. Never adopt it.
    result.creationStatus = 'uncertain';

    try {
      const [owner, repo] = registryId.split('/');
      await github.rest.repos.get({owner: owner!, repo: repo!});
      result.remoteObserved = true;
    } catch (inspection) {
      // A 404 cannot establish whether a timed-out create succeeded: permissions
      // and delayed visibility can hide a newly created repository.
      if (isNotFound(inspection)) result.remoteObserved = false;
    }

    await releaseEmptyReservation(destination);
    throw new RegistryInitError(
      `GitHub creation failed; creation status: ${result.creationStatus}. Inspect ${remoteUrl} before retrying. No existing remote was adopted or deleted.\n${commandFailureDetail(cause)}`,
      result,
      cause,
    );
  }

  let stage = 'clone';

  try {
    await runner('git', ['clone', '--', remoteUrl + '.git', destination]);
    result.cloneCompleted = true;
    result.gitInitialized = true;
    stage = 'template readiness';
    result.initialCommit = await readGeneratedHead(destination, runner, wait);
    await assertGeneratedTemplateTree(destination, runner, trustedTemplateRevision);
    stage = 'configuration';
    const changedFiles = await configureRegistryIdentity(destination, registryId);
    result.configured = true;
    const configuredOutputs = new Map<string, string>();

    for (const file of changedFiles) {
      if (!identityFiles.has(file))
        throw new Error(`Configurator reported an unexpected identity output: ${file}`);
      const bytes = await fs.readFile(path.join(destination, file));
      configuredOutputs.set(file, createHash('sha256').update(bytes).digest('hex'));
    }

    await assertOnlyExpectedIdentityChanges(destination, runner, configuredOutputs);
    stage = 'commit';

    if (changedFiles.length) await runner('git', ['-C', destination, 'add', '--', ...changedFiles]);

    const stagedPaths = (
      (await runner('git', ['-C', destination, 'diff', '--cached', '--name-only'])) ?? ''
    )
      .split('\n')
      .filter(Boolean);

    if (
      stagedPaths.some((file) => !configuredOutputs.has(file)) ||
      stagedPaths.length !== configuredOutputs.size
    )
      throw new Error(
        'Git index contains unexpected or missing configured identity files; preserved for recovery',
      );

    for (const [file, digest] of configuredOutputs) {
      const staged = await runner('git', ['-C', destination, 'show', `:${file}`]);

      if (staged === undefined || createHash('sha256').update(staged).digest('hex') !== digest)
        throw new Error(
          `Staged identity file differs from its verified output: ${file}; preserved for recovery`,
        );
    }

    await assertOnlyExpectedIdentityChanges(destination, runner, configuredOutputs);
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
        ? `Clone ${remoteUrl} into a new directory with git clone ${remoteUrl}.git. Inspect the clone, repair its registry identity manually, validate it with nosey registry validate <directory>, then commit and push from that clone.`
        : stage === 'template readiness'
          ? `Inspect this clone at ${destination} and compare its tree with the approved Nosey template. For recovery, create a separate pinned scaffold with nosey registry init <new-directory> --registry-id ${registryId} --no-git, validate and review it, then manually transfer the intended files into the clone before committing and pushing. Do not configure or push a mismatched tree.`
          : stage === 'configuration'
            ? `Inspect this preserved clone at ${destination}, correct the registry data directly, run nosey registry validate ${destination}, then commit and push from the clone. Do not repeat registry init.`
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
        github: dependencies.github,
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
          ? yesNo(await ask('Create and push a GitHub repository? [y/N]: '), false)
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

    const github = createGitHub
      ? (dependencies.github ?? (await authenticatedGithubClient()))
      : undefined;

    let githubRunner = runner;

    if (github) {
      await githubPreflight(registryId, runner, github);
      const environment = await githubGitEnvironment(github, registryId);
      githubRunner = (command, args) => {
        const operation = args[0] === '-C' ? args[2] : args[0];

        return runner(
          command,
          args,
          ['clone', 'fetch', 'push', 'ls-remote'].includes(operation ?? '')
            ? environment
            : undefined,
        );
      };
    }

    const destination = await reserveDestination(directoryInput);

    if (github)
      return await createFromGithub(
        destination,
        registryId,
        visibility ?? 'private',
        github,
        githubRunner,
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
