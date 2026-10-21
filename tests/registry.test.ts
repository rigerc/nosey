import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {test, expect} from 'vite-plus/test';
import {detectProject} from '../src/lib/detect.js';
import {loadLocalRegistry} from '../src/lib/registry/load.js';
import {mergeRegistries} from '../src/lib/registry/merge.js';
import {parseManifest, parseMap} from '../src/lib/registry/validate.js';

async function registryFixture<T>(
	callback: (directory: string) => Promise<T>,
): Promise<T> {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), 'skillsense-registry-'),
	);
	try {
		await fs.mkdir(path.join(directory, 'skills/custom'), {recursive: true});
		await fs.writeFile(
			path.join(directory, 'skills/custom/SKILL.md'),
			'# Custom\n',
		);
		await fs.writeFile(
			path.join(directory, 'skills-manifest.json'),
			JSON.stringify({
				schemaVersion: 1,
				registryId: 'example/skills',
				skills: [
					{
						id: 'example/skills/custom',
						name: 'custom',
						path: 'skills/custom/SKILL.md',
					},
				],
			}),
		);
		await fs.writeFile(
			path.join(directory, 'skills-map.json'),
			JSON.stringify({
				schemaVersion: 1,
				registryId: 'example/skills',
				technologySkills: [
					{technologyId: 'react', skills: ['example/skills/custom']},
				],
				technologies: [
					{
						id: 'example-sdk',
						name: 'Example SDK',
						detect: {packages: ['@example/sdk']},
						skills: ['example/skills/custom'],
					},
				],
				combinations: [
					{
						id: 'example-react',
						name: 'React + Example',
						requires: ['react', 'example-sdk'],
						skills: ['example/skills/custom'],
					},
				],
				frontendBonusSkills: ['example/skills/custom'],
			}),
		);
		return await callback(directory);
	} finally {
		await fs.rm(directory, {recursive: true, force: true});
	}
}

test('custom registry extends built-in mappings and preserves skill origins', async () => {
	await registryFixture(async directory => {
		const loaded = await loadLocalRegistry(directory);
		const {registry, warnings} = mergeRegistries([loaded]);
		expect(warnings.length).toBe(0);
		const project = path.join(directory, 'project');
		await fs.mkdir(project);
		await fs.writeFile(
			path.join(project, 'package.json'),
			JSON.stringify({
				dependencies: {react: '^19', 'react-dom': '^19', '@example/sdk': '1.0'},
			}),
		);
		const report = await detectProject(project, {registry});
		expect(report.technologies.some(item => item.id === 'react')).toBe(true);
		expect(report.technologies.some(item => item.id === 'example-sdk')).toBe(
			true,
		);
		expect(report.combinations.some(item => item.id === 'example-react')).toBe(
			true,
		);
		const custom = report.skills.find(
			item => item.id === 'example/skills/custom',
		);
		expect(custom).toBeTruthy();
		expect(report.frontendDetected).toBe(true);
		expect(custom?.sources.map(item => item.type).sort()).toStrictEqual(
			['technology', 'technology', 'combination', 'frontend'].sort(),
		);
		expect(
			report.skills.filter(item => item.id === 'example/skills/custom').length,
		).toBe(1);
	});
});

test('custom frontend bonus skills require web evidence', async () => {
	await registryFixture(async directory => {
		const {registry} = mergeRegistries([await loadLocalRegistry(directory)]);
		const project = path.join(directory, 'project');
		await fs.mkdir(project);
		await fs.writeFile(
			path.join(project, 'package.json'),
			JSON.stringify({
				dependencies: {react: '^19'},
			}),
		);
		const report = await detectProject(project, {registry});
		expect(report.frontendDetected).toBe(false);
		const custom = report.skills.find(
			item => item.id === 'example/skills/custom',
		);
		expect(custom?.sources.map(source => source.type)).toStrictEqual([
			'technology',
		]);
	});
});

test('duplicate technology definition skips registry without overriding built-in', async () => {
	await registryFixture(async directory => {
		const mapPath = path.join(directory, 'skills-map.json');
		const parsed = JSON.parse(await fs.readFile(mapPath, 'utf8')) as {
			technologies: Array<{id: string}>;
		};
		parsed.technologies[0]!.id = 'react';
		await fs.writeFile(mapPath, JSON.stringify(parsed));
		const {registry, warnings} = mergeRegistries([
			await loadLocalRegistry(directory),
		]);
		expect(warnings.length).toBe(1);
		expect(warnings[0]!.message).toContain('Duplicate technology');
		expect(registry.skillIds.has('example/skills/custom')).toBe(false);
		expect(
			registry.technologies.filter(item => item.id === 'react').length,
		).toBe(1);
	});
});

test('manifest and map validate types, regex patterns and traversal attempts', () => {
	expect(() =>
		parseManifest({
			schemaVersion: 1,
			registryId: 'sample',
			skills: [{id: 'x', name: 'x', path: '../private/SKILL.md'}],
		}),
	).toThrow(/Unsafe skill path/);
	expect(() =>
		parseMap({
			schemaVersion: 1,
			registryId: 'sample',
			technologies: [
				{
					id: 'x',
					name: 'X',
					detect: {packagePatterns: [{source: '[', flags: 'i'}]},
				},
			],
		}),
	).toThrow(/packagePattern/);
	expect(
		parseMap({
			schemaVersion: 1,
			registryId: 'sample',
			technologies: [
				{
					id: 'x',
					name: 'X',
					detect: {packagePatterns: [{source: '^@org/', flags: 'i'}]},
				},
			],
		}).technologies[0]?.detect.packagePatterns?.[0] instanceof RegExp,
	).toBe(true);
});

test('missing manifest skill is a registry-local failure', async () => {
	await registryFixture(async directory => {
		await fs.rm(path.join(directory, 'skills/custom/SKILL.md'));
		await expect(loadLocalRegistry(directory)).rejects.toThrow();
	});
});
