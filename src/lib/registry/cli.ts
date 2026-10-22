import process from 'node:process';
import {
  buildRegistry,
  commandSource,
  editRegistry,
  listRegistries,
  registryJson,
  showRegistry,
  validateRegistry,
  type RegistryEntry,
} from './commands.js';
import type {LoadedRegistry} from './types.js';
import {loadGitRegistry} from './git.js';
import {upgradeRegistry} from './upgrade.js';

const usage = 'Expected: nosey registry <init|list|add|remove|show|validate|build|refresh|upgrade>';

interface AllowedOptions {
  [key: string]: string[];
}

const allowedOptions: AllowedOptions = {
  list: ['json', 'global'],
  add: ['global', 'ref'],
  remove: ['global', 'project', 'ref'],
  show: ['json', 'ref'],
  validate: ['json'],
  build: [],
  refresh: ['json', 'global', 'ref'],
  upgrade: ['json', 'dry-run'],
};

type CommandFlags = {
  json: boolean;
  global?: boolean;
  project?: boolean;
  ref?: string;
  dryRun?: boolean;
};

function validateArguments(command: string, args: string[]): void {
  if (!Object.hasOwn(allowedOptions, command)) throw new Error(usage);
  const allowed = allowedOptions[command]!;

  // Inspect explicit options so default scan flags don't leak into subcommands.
  for (const argument of process.argv.slice(2)) {
    if (argument === '--') break;

    if (!argument.startsWith('--')) continue;
    const name = argument.slice(2).split('=')[0]!.replace(/^no-/, '');

    if (!allowed.includes(name)) {
      throw new Error(`--${name} cannot be used with registry ${command}`);
    }
  }

  if (args.length > (command === 'list' ? 1 : 2)) {
    throw new Error(`Too many arguments for registry ${command}`);
  }

  if (['add', 'remove', 'show'].includes(command) && args[1] === undefined) {
    throw new Error(`Expected: nosey registry ${command} <source>`);
  }
}

function formatList(entries: RegistryEntry[]): string {
  if (entries.length === 0) return 'No registries configured.\n';

  return entries
    .map(({scope, configPath, spec}) => {
      const source = spec.type === 'local' ? spec.path : `${spec.url}#${spec.ref ?? 'HEAD'}`;

      return `[${scope}] ${source} (${configPath})\n`;
    })
    .join('');
}

function formatRegistry(loaded: LoadedRegistry): string {
  const skills = loaded.manifest.skills
    .map((skill) => {
      const description = skill.description ? `\n    ${skill.description}` : '';

      return `  ${skill.id} — ${skill.name} (${skill.path})${description}\n`;
    })
    .join('');

  return `Registry: ${loaded.manifest.registryId}\nSource: ${
    loaded.source
  }\nSkills:\n${skills}Mappings:\n${registryJson(loaded.map)}`;
}

async function runValidate(directory: string, json: boolean): Promise<void> {
  try {
    const loaded = await validateRegistry(directory);
    process.stdout.write(
      json
        ? registryJson({
            valid: true,
            source: loaded.source,
            registryId: loaded.manifest.registryId,
            skills: loaded.manifest.skills.length,
            errors: [],
          })
        : `Valid registry ${loaded.manifest.registryId} (${loaded.manifest.skills.length} skills).\n`,
    );
  } catch (error: unknown) {
    if (!json) throw error;
    process.stdout.write(
      registryJson({
        valid: false,
        source: directory,
        errors: [error instanceof Error ? error.message : String(error)],
      }),
    );
    process.exitCode = 1;
  }
}

/** Force a remote fetch, even while the 24-hour cache is fresh. */
interface RefreshResult {
  source: string;
  status: 'initialized' | 'updated' | 'unchanged' | 'cached' | 'error';
  commit?: string;
  message?: string;
}

async function runRefresh(source: string | undefined, flags: CommandFlags): Promise<void> {
  if (!source && flags.ref !== undefined)
    throw new Error('--ref requires a Git source for registry refresh');

  const specs = source
    ? [commandSource(source, flags.ref)]
    : (await listRegistries(process.cwd(), flags.global))
        .values()
        .map((entry) => entry.spec)
        .filter((spec) => spec.type === 'git')
        .toArray();

  if (specs.some((spec) => spec.type !== 'git'))
    throw new Error('Registry refresh requires a Git registry URL');

  const results: RefreshResult[] = [];

  for (const spec of specs) {
    if (spec.type !== 'git') continue;
    const name = spec.url + '#' + (spec.ref ?? 'HEAD');

    try {
      // eslint-disable-next-line no-await-in-loop
      const refreshed = await loadGitRegistry(spec, {forceRefresh: true});
      const warning = refreshed.warnings.map((item) => item.message).join('; ');

      const result: RefreshResult = {
        source: name,
        status: warning
          ? 'cached'
          : refreshed.updated
            ? 'updated'
            : refreshed.hadCache
              ? 'unchanged'
              : 'initialized',
        commit: refreshed.commit,
      };

      if (warning) result.message = warning;
      results.push(result);
    } catch (error: unknown) {
      results.push({
        source: name,
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (flags.json) {
    process.stdout.write(registryJson({registries: results}));
  } else {
    if (!results.length) process.stdout.write('No Git registries configured.\n');

    for (const item of results) {
      process.stdout.write(
        item.source +
          ': ' +
          item.status +
          (item.commit ? ' (' + item.commit.slice(0, 12) + ')' : '') +
          '\n',
      );

      if (item.message) process.stderr.write('nosey: ' + item.message + '\n');
    }
  }

  if (results.some((item) => item.status === 'cached' || item.status === 'error'))
    process.exitCode = 1;
}

export async function runRegistryCommand(args: string[], flags: CommandFlags): Promise<void> {
  const [command = '', source] = args;
  validateArguments(command, args);

  if (flags.global && flags.project) throw new Error('--global and --project cannot be combined');

  switch (command) {
    case 'list': {
      const entries = await listRegistries(process.cwd(), flags.global);
      process.stdout.write(flags.json ? registryJson({registries: entries}) : formatList(entries));
      break;
    }

    case 'add':
    case 'remove': {
      const result = await editRegistry(command, source!, {
        root: process.cwd(),
        // Additions and ordinary removals are global. --project only removes legacy entries.
        scope: command === 'add' || !flags.project ? 'global' : 'project',
        ref: flags.ref,
      });

      const action = command === 'add' ? 'Added registry to' : 'Removed registry from';
      process.stdout.write(
        `${result.changed ? action : 'Registry already configured in'} ${result.configPath}\n`,
      );
      break;
    }

    case 'refresh': {
      await runRefresh(source, flags);
      break;
    }

    case 'upgrade': {
      const result = await upgradeRegistry(source ?? '.', {dryRun: flags.dryRun});
      if (flags.json) {
        process.stdout.write(registryJson(result));
      } else {
        process.stdout.write(
          'Registry template ' + (result.dryRun ? 'preview' : 'upgrade') +
            ' (' + (result.fromVersion ?? 'legacy') + ' → ' + result.targetVersion + ')\n',
        );
        for (const file of result.files) {
          if (file.action === 'unchanged') continue;
          process.stdout.write(
            file.action + ': ' + file.path + (file.reason ? ' (' + file.reason + ')' : '') + '\n',
          );
        }
        process.stdout.write(result.complete ? 'Template is current.\n' : 'Conflicts require manual merging; no customized files were overwritten.\n');
      }
      if (!result.complete) process.exitCode = 1;
      break;
    }

    case 'build': {
      process.stdout.write(await buildRegistry(source ?? '.'));
      break;
    }

    case 'validate': {
      await runValidate(source ?? '.', flags.json);
      break;
    }

    case 'show': {
      const loaded = await showRegistry(source!, flags.ref);
      process.stdout.write(flags.json ? registryJson(loaded) : formatRegistry(loaded));
      break;
    }

    default: {
      throw new Error(usage);
    }
  }
}
