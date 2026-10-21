import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';
import {parseConfig} from '../src/lib/registry/config.js';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.tsx', import.meta.url));

test('invalid config entries do not discard valid entries', () => {
	const warnings: string[] = [];
	const sources = parseConfig(
		{
			schemaVersion: 1,
			registries: [
				{type: 'local', path: './valid'},
				{type: 'git', url: 42},
				{type: 'local', path: './also-valid'},
			],
		},
		'/tmp/project/.skillsense.json',
		(index, message) => {
			warnings.push(`${index}: ${message}`);
		},
	);
	expect(sources.length).toBe(2);
	expect(warnings.length).toBe(1);
	expect(warnings[0]!).toMatch(/^1:/);
});

test('CLI uses a local registry in JSON and skills-only outputs', async () => {
	const folder = await fs.mkdtemp(
		path.join(os.tmpdir(), 'skillsense-cli-registry-'),
	);
	try {
		const project = path.join(folder, 'project');
		const registry = path.join(folder, 'registry');
		await fs.mkdir(project);
		await fs.mkdir(path.join(registry, 'skills/example'), {recursive: true});
		await fs.writeFile(
			path.join(project, 'package.json'),
			JSON.stringify({
				dependencies: {react: '^19'},
			}),
		);
		await fs.writeFile(
			path.join(registry, 'skills/example/SKILL.md'),
			'# example\n',
		);
		await fs.writeFile(
			path.join(registry, 'skills-manifest.json'),
			JSON.stringify({
				schemaVersion: 1,
				registryId: 'example/testing',
				skills: [
					{
						id: 'example/testing/example',
						name: 'example',
						path: 'skills/example/SKILL.md',
					},
				],
			}),
		);
		await fs.writeFile(
			path.join(registry, 'skills-map.json'),
			JSON.stringify({
				schemaVersion: 1,
				registryId: 'example/testing',
				technologySkills: [
					{technologyId: 'react', skills: ['example/testing/example']},
				],
			}),
		);
		const {stdout} = await run(process.execPath, [
			'--import=tsx',
			cli,
			project,
			'--registry',
			registry,
			'--json',
		]);
		const report = JSON.parse(stdout) as {skills: Array<{id: string}>};
		expect(
			report.skills.some(skill => skill.id === 'example/testing/example'),
		).toBe(true);
		const only = await run(process.execPath, [
			'--import=tsx',
			cli,
			project,
			'--registry',
			registry,
			'--skills-only',
		]);
		expect(only.stdout.split('\n').includes('example/testing/example')).toBe(
			true,
		);
	} finally {
		await fs.rm(folder, {recursive: true, force: true});
	}
});
