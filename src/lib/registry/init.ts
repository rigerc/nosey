import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {loadLocalRegistry} from './load.js';
import type {RegistryManifest, RegistryMap} from './types.js';

const execFileAsync = promisify(execFile);
const sourceTemplate = fileURLToPath(new URL('../../../templates/registry/', import.meta.url));
const bundledTemplate = fileURLToPath(new URL('../templates/registry/', import.meta.url));
const templateRoot = existsSync(sourceTemplate) ? sourceTemplate : bundledTemplate;
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
};

type CommandRunner = (command: string, args: string[]) => Promise<void>;

export type RegistryInitDependencies = {
	/** An injected question function for command-line tests. */
	ask?: (question: string) => Promise<string>;
	/** Let an interactive UI display validation without writing over its frame. */
	onValidationError?: (message: string) => void;
	/** An injected command executor for command-line tests. */
	run?: CommandRunner;
	/** Override TTY detection in tests. */
	interactive?: boolean;
	/** Override the packaged template location in tests. */
	templateDirectory?: string;
};

/** Shared by the CLI service and the interactive wizards before a directory is written. */
export function validateRegistryId(id: string): void {
	const parts = id.split('/');
	if (
		parts.length !== 2 ||
		!/^[a-z\d][\w.-]*$/i.test(parts[0] ?? '') ||
		!/^[\w.-]+$/.test(parts[1] ?? '') ||
		parts.some(part => part === '.' || part === '..' || part.endsWith('.'))
	) {
		throw new Error(
			'Registry ID must be owner/repository (for example, acme/agent-skills)',
		);
	}
}

function yesNo(value: string, fallback: boolean): boolean {
	const normalized = value.trim().toLowerCase();
	if (normalized === '') return fallback;
	if (normalized === 'yes' || normalized === 'y') return true;
	if (normalized === 'no' || normalized === 'n') return false;
	throw new Error('Answer y or n');
}

async function defaultRun(command: string, args: string[]): Promise<void> {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) =>
				!repositoryEnvironmentVariables.has(name.toUpperCase()) &&
				!/^git_config_(?:key|value)_\d+$/i.test(name),
		),
	);

	env['GIT_TERMINAL_PROMPT'] = '0';
	await execFileAsync(command, args, {
		timeout: 60_000,
		maxBuffer: 1024 * 1024,
		env,
	});
}

function remapId(id: string, from: string, to: string): string {
	return id.startsWith(from + '/') ? to + id.slice(from.length) : id;
}

async function rewriteRegistryIdentity(
	directory: string,
	registryId: string,
): Promise<void> {
	const settingsPath = path.join(directory, 'registry.json');
	const manifestPath = path.join(directory, 'skills-manifest.json');
	const mapPath = path.join(directory, 'skills-map.json');
	const [settingsText, manifestText, mapText] = await Promise.all([
		fs.readFile(settingsPath, 'utf8'),
		fs.readFile(manifestPath, 'utf8'),
		fs.readFile(mapPath, 'utf8'),
	]);

	const settings = JSON.parse(settingsText) as {
		schemaVersion: number;
		registryId: string;
	};
	const manifest = JSON.parse(manifestText) as RegistryManifest;
	const mapping = JSON.parse(mapText) as RegistryMap;
	const formerId = settings.registryId;
	if (manifest.registryId !== formerId || mapping.registryId !== formerId) {
		throw new Error('Template registry IDs do not match');
	}

	settings.registryId = registryId;
	manifest.registryId = registryId;
	mapping.registryId = registryId;
	for (const skill of manifest.skills) {
		skill.id = remapId(skill.id, formerId, registryId);
	}

	for (const technology of mapping.technologies ?? []) {
		technology.skills = technology.skills.map(id =>
			remapId(id, formerId, registryId),
		);
	}

	for (const association of mapping.technologySkills ?? []) {
		association.skills = association.skills.map(id =>
			remapId(id, formerId, registryId),
		);
	}

	for (const combo of mapping.combinations ?? []) {
		combo.skills = combo.skills.map(id => remapId(id, formerId, registryId));
	}

	for (const association of mapping.combinationSkills ?? []) {
		association.skills = association.skills.map(id =>
			remapId(id, formerId, registryId),
		);
	}

	mapping.frontendBonusSkills = (mapping.frontendBonusSkills ?? []).map(id =>
		remapId(id, formerId, registryId),
	);

	await Promise.all([
		fs.writeFile(settingsPath, JSON.stringify(settings, null, 2) + '\n'),
		fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n'),
		fs.writeFile(mapPath, JSON.stringify(mapping, null, 2) + '\n'),
	]);
}

/** Copy the bundled repository template into a new directory, never overwriting user files. */
export async function scaffoldRegistry(
	directory: string,
	registryId: string,
	templateDirectory = templateRoot,
): Promise<string> {
	validateRegistryId(registryId);
	const destination = path.resolve(directory);
	await fs.mkdir(path.dirname(destination), {recursive: true});
	// Atomic exclusive creation prevents replacing even an existing empty directory.
	await fs.mkdir(destination);
	try {
		// Copy entries into the reserved root, preserving exclusive creation for
		// each entry without treating the root itself as a collision.
		for (const name of await fs.readdir(templateDirectory)) {
			// eslint-disable-next-line no-await-in-loop
			await fs.cp(
				path.join(templateDirectory, name),
				path.join(destination, name),
				{
					recursive: true,
					errorOnExist: true,
					force: false,
				},
			);
		}

		await rewriteRegistryIdentity(destination, registryId);
		await loadLocalRegistry(destination);
	} catch (error: unknown) {
		await fs.rm(destination, {recursive: true, force: true});
		throw error;
	}

	return destination;
}

/** Run the interactive wizard, optionally initializing Git and creating a GitHub remote. */
export async function runRegistryInit(
	options: RegistryInitOptions = {},
	dependencies: RegistryInitDependencies = {},
): Promise<RegistryInitResult> {
	const interactive =
		!options.yes &&
		(dependencies.interactive ??
			Boolean(process.stdin.isTTY && process.stderr.isTTY));
	const reader =
		interactive && !dependencies.ask
			? createInterface({input: process.stdin, output: process.stderr})
			: undefined;
	const ask =
		dependencies.ask ??
		(async (question: string) => reader?.question(question) ?? '');
	const runner = dependencies.run ?? defaultRun;

	try {
		const defaultDirectory =
			interactive && options.directory === undefined
				? await ask('Destination directory [./my-skills-registry]: ')
				: '';
		const directoryInput =
			options.directory ??
			(interactive
				? defaultDirectory.trim() || './my-skills-registry'
				: undefined);
		if (!directoryInput) {
			throw new Error(
				'Specify a destination directory: nosey registry init <directory> --registry-id owner/repo',
			);
		}

		let {registryId} = options;
		if (!registryId && interactive) {
			while (!registryId) {
				// eslint-disable-next-line no-await-in-loop
				const response = await ask('Registry ID (owner/repository): ');
				const answer = response.trim();
				try {
					validateRegistryId(answer);
					registryId = answer;
				} catch (error: unknown) {
					const message =
						error instanceof Error ? error.message : String(error);
					if (dependencies.onValidationError)
						dependencies.onValidationError(message);
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
					? yesNo(
							await ask(
								'Create and push a GitHub repository using gh? [y/N]: ',
							),
							false,
						)
					: false;
		}

		if (createGitHub && !initializeGit) {
			throw new Error('--github requires Git initialization (omit --no-git)');
		}

		let {visibility} = options;
		if (
			visibility !== undefined &&
			visibility !== 'private' &&
			visibility !== 'public'
		) {
			throw new Error('GitHub visibility must be private or public');
		}

		if (visibility && !createGitHub) {
			throw new Error(
				'--visibility requires --github or interactive GitHub creation',
			);
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

		const destination = await scaffoldRegistry(
			directoryInput,
			registryId,
			dependencies.templateDirectory,
		);

		if (initializeGit) {
			try {
				await runner('git', ['init', '--initial-branch=main', destination]);
			} catch (error: unknown) {
				throw new Error(
					'Registry created at ' +
						destination +
						', but Git initialization failed: ' +
						(error instanceof Error ? error.message : String(error)),
				);
			}
		}

		if (createGitHub) {
			try {
				await runner('git', ['-C', destination, 'add', '--all']);
				await runner('git', [
					'-C',
					destination,
					'commit',
					'-m',
					'Initial SkillSense registry',
				]);
				await runner('gh', [
					'repo',
					'create',
					registryId,
					'--source',
					destination,
					'--remote',
					'origin',
					'--push',
					'--' + (visibility ?? 'private'),
				]);
			} catch (error: unknown) {
				throw new Error(
					'Local registry created at ' +
						destination +
						', but GitHub creation failed. Check gh authentication and Git identity, then publish manually. ' +
						(error instanceof Error ? error.message : String(error)),
				);
			}
		}

		return {
			directory: destination,
			registryId,
			gitInitialized: initializeGit,
			githubCreated: createGitHub,
		};
	} finally {
		reader?.close();
	}
}
