import {discoverRegistries} from './config.js';
import {loadLocalRegistry} from './load.js';
import {loadGitRegistry} from './git.js';
import {mergeRegistries} from './merge.js';
import type {LoadedRegistry, MergedRegistry, RegistryWarning} from './types.js';

export type ResolvedRegistries = {
	registry: MergedRegistry;
	warnings: RegistryWarning[];
	updatedSources: string[];
};

export async function resolveRegistries(
	projectRoot: string,
	cliRegistries: string[] = [],
	options: {forceRefresh?: boolean} = {},
): Promise<ResolvedRegistries> {
	const discovered = await discoverRegistries(projectRoot, cliRegistries);
	const warnings = [...discovered.warnings];
	const loaded: LoadedRegistry[] = [];
	const updatedSources: string[] = [];
	for (const item of discovered.sources) {
		try {
			if (item.spec.type === 'git') {
				// Load sequentially for deterministic warnings and precedence.
				// eslint-disable-next-line no-await-in-loop
				const result = await loadGitRegistry(item.spec, {forceRefresh: options.forceRefresh});
				if (result.updated) updatedSources.push(result.loaded.source);
				loaded.push(result.loaded);
				warnings.push(...result.warnings);
			} else {
				// eslint-disable-next-line no-await-in-loop
				loaded.push(await loadLocalRegistry(item.spec.path));
			}
		} catch (error: unknown) {
			warnings.push({
				source: item.spec.type === 'local' ? item.spec.path : item.spec.url,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	const merged = mergeRegistries(loaded);
	warnings.push(...merged.warnings);
	return {registry: merged.registry, warnings, updatedSources};
}
