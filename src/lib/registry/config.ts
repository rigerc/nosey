import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type {RegistryWarning} from './types.js';

export type RegistrySpec =
	| {type: 'local'; path: string}
	| {type: 'git'; url: string; ref?: string; refreshHours?: number};

export type ConfiguredRegistry = {spec: RegistrySpec; source: string};

function configDirectory(): string {
	if (process.platform === 'win32') {
		return (
			process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming')
		);
	}

	return process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
}

export function globalConfigPath(): string {
	return path.join(configDirectory(), 'nosey', 'registries.json');
}

export function projectConfigPath(projectRoot: string): string {
	return path.join(path.resolve(projectRoot), '.nosey.json');
}

function parseEntry(input: unknown, base: string): RegistrySpec {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('Registry must be an object');
	}

	const value = input as Record<string, unknown>;
	if (
		value['type'] === 'local' &&
		typeof value['path'] === 'string' &&
		value['path'].length > 0
	) {
		return {type: 'local', path: path.resolve(base, value['path'])};
	}

	if (
		value['type'] === 'git' &&
		typeof value['url'] === 'string' &&
		value['url'].length > 0
	) {
		const entry: RegistrySpec = {type: 'git', url: value['url']};
		if (value['ref'] !== undefined) {
			if (typeof value['ref'] !== 'string' || !value['ref'])
				throw new Error('Invalid registry ref');
			entry.ref = value['ref'];
		}

		if (value['refreshHours'] !== undefined) {
			if (
				typeof value['refreshHours'] !== 'number' ||
				!Number.isFinite(value['refreshHours']) ||
				value['refreshHours'] < 0
			)
				throw new Error('Invalid refreshHours');
			entry.refreshHours = value['refreshHours'];
		}

		return entry;
	}

	throw new Error('Expected registry type "local" with path or "git" with URL');
}

export function parseConfig(
	value: unknown,
	source: string,
	onEntryError?: (index: number, message: string) => void,
): ConfiguredRegistry[] {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Configuration must be an object');
	}

	const record = value as Record<string, unknown>;
	if (record['schemaVersion'] !== 1)
		throw new Error('Unsupported configuration schemaVersion');
	if (!Array.isArray(record['registries']))
		throw new Error('registries must be an array');
	const valid: ConfiguredRegistry[] = [];
	for (const [index, entry] of record['registries'].entries()) {
		try {
			valid.push({spec: parseEntry(entry, path.dirname(source)), source});
		} catch (error: unknown) {
			if (!onEntryError) throw error;
			onEntryError(
				index,
				error instanceof Error ? error.message : String(error),
			);
		}
	}

	return valid;
}

function isGitUrl(value: string): boolean {
	return /^(https?:\/\/|ssh:\/\/|git@)/.test(value);
}

export function registryIdentity(spec: RegistrySpec): string {
	return spec.type === 'local'
		? 'local:' + path.normalize(spec.path)
		: 'git:' +
				spec.url.replace(/\.git$/, '').replace(/\/$/, '') +
				'#' +
				(spec.ref ?? 'HEAD');
}

/** CLI sources resolve local paths against the current working directory. */
export function parseRegistrySource(input: string): RegistrySpec {
	if (!input.trim()) throw new Error('Registry reference cannot be empty');
	return isGitUrl(input)
		? {type: 'git', url: input}
		: {type: 'local', path: path.resolve(input)};
}

/** Order is global, project, CLI. Identical references only load once. */
export async function discoverRegistries(
	projectRoot: string,
	cliRegistries: string[] = [],
): Promise<{sources: ConfiguredRegistry[]; warnings: RegistryWarning[]}> {
	const warnings: RegistryWarning[] = [];
	const sources: ConfiguredRegistry[] = [];
	for (const file of [
    path.join(configDirectory(), 'skillsense', 'config.json'),
    path.join(path.resolve(projectRoot), '.skillsense.json'),
    globalConfigPath(),
    projectConfigPath(projectRoot),
  ]) {
		try {
			// Read sources in precedence order, including their warnings.
			// eslint-disable-next-line no-await-in-loop
			const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
			sources.push(
				...parseConfig(raw, file, (index, message) => {
					warnings.push({source: `${file}#registries[${index}]`, message});
				}),
			);
		} catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
			warnings.push({
				source: file,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	for (const input of cliRegistries) {
		if (!input) {
			warnings.push({
				source: '--registry',
				message: 'Registry reference cannot be empty',
			});
			continue;
		}

		sources.push({
			source: '--registry',
			spec: parseRegistrySource(input),
		});
	}

	const seen = new Set<string>();
	return {
		sources: sources.filter(item => {
			const key = registryIdentity(item.spec);
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		}),
		warnings,
	};
}
