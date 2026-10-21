import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';

const run = promisify(execFile);
const source = fileURLToPath(
	new URL('../templates/registry/', import.meta.url),
);
const generator = path.join(source, 'scripts/generate-manifest.mjs');

test('template generator is deterministic and leaves the skill map untouched', async () => {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), 'skillsense-template-'),
	);
	try {
		await fs.cp(source, directory, {recursive: true});
		const originalMap = await fs.readFile(
			path.join(directory, 'skills-map.json'),
			'utf8',
		);
		await run(process.execPath, [generator], {cwd: directory});
		await run(process.execPath, [generator, '--check'], {cwd: directory});
		const manifest = JSON.parse(
			await fs.readFile(path.join(directory, 'skills-manifest.json'), 'utf8'),
		) as {skills: Array<{id: string}>};
		expect(manifest.skills[0]?.id).toBe('example/agent-skills/example-testing');
		expect(
			await fs.readFile(path.join(directory, 'skills-map.json'), 'utf8'),
		).toBe(originalMap);
		await fs.mkdir(path.join(directory, 'skills/another'), {recursive: true});
		await fs.writeFile(
			path.join(directory, 'skills/another/SKILL.md'),
			[
				'---',
				'name: another',
				'description: >',
				'  Multiple line',
				'  description',
				'---',
				'# Another',
			].join('\n'),
		);
		await expect(
			run(process.execPath, [generator, '--check'], {cwd: directory}),
		).rejects.toThrow();
		await run(process.execPath, [generator], {cwd: directory});
		await run(process.execPath, [generator, '--check'], {cwd: directory});
	} finally {
		await fs.rm(directory, {recursive: true, force: true});
	}
});
