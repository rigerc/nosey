import process from 'node:process';
import {
	buildRegistry,
	editRegistry,
	listRegistries,
	registryJson,
	showRegistry,
	validateRegistry,
	type RegistryEntry,
} from './commands.js';
import type {LoadedRegistry} from './types.js';

const usage =
	'Expected: nosey registry <init|list|add|remove|show|validate|build>';
const allowedOptions: Record<string, string[]> = {
	list: ['json', 'global'],
	add: ['global', 'ref'],
	remove: ['global', 'project', 'ref'],
	show: ['json', 'ref'],
	validate: ['json'],
	build: [],
};

type CommandFlags = {json: boolean; global?: boolean; project?: boolean; ref?: string};

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
			const source =
				spec.type === 'local' ? spec.path : `${spec.url}#${spec.ref ?? 'HEAD'}`;
			return `[${scope}] ${source} (${configPath})\n`;
		})
		.join('');
}

function formatRegistry(loaded: LoadedRegistry): string {
	const skills = loaded.manifest.skills
		.map(skill => {
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

export async function runRegistryCommand(
	args: string[],
	flags: CommandFlags,
): Promise<void> {
	const [command = '', source] = args;
	validateArguments(command, args);
	if (flags.global && flags.project) throw new Error('--global and --project cannot be combined');
	switch (command) {
		case 'list': {
			const entries = await listRegistries(process.cwd(), flags.global);
			process.stdout.write(
				flags.json ? registryJson({registries: entries}) : formatList(entries),
			);
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
			const action =
				command === 'add' ? 'Added registry to' : 'Removed registry from';
			process.stdout.write(
				`${result.changed ? action : 'Registry already configured in'} ${
					result.configPath
				}\n`,
			);
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
			process.stdout.write(
				flags.json ? registryJson(loaded) : formatRegistry(loaded),
			);
			break;
		}

		default: {
			throw new Error(usage);
		}
	}
}
