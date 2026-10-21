import {execFile} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import {promisify} from 'node:util';
import {validateRegistryId} from './init.js';

const execFileAsync = promisify(execFile);

export type SuggestRunner = (
	command: string,
	args: string[],
) => Promise<string>;

/** Read-only commands only; prompts and terminal reads must never block a frame. */
const runReadOnly: SuggestRunner = async (command, args) => {
	const {stdout} = await execFileAsync(command, args, {
		timeout: 5_000,
		maxBuffer: 64 * 1024,
		env: {
			...process.env,
			GH_PROMPT_DISABLED: '1',
			GIT_TERMINAL_PROMPT: '0',
		},
	});
	return stdout;
};

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
 * `gh` is authenticated as and the repository is the destination directory.
 * Undefined when `gh` is unavailable or the result is not a valid ID.
 */
export async function suggestRegistryId(
	directory: string,
	dependencies: {run?: SuggestRunner} = {},
): Promise<string | undefined> {
	let owner: string;
	try {
		owner = (
			await (dependencies.run ?? runReadOnly)('gh', [
				'api',
				'user',
				'--jq',
				'.login',
			])
		).trim();
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
