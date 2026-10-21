import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {test, expect} from 'vite-plus/test';
import {detectProject} from '../src/lib/detect.js';
import {generateInstallCommands} from '../src/features/skills/install.js';
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

const externalId = 'acme/upstream-skills/external-react';
const external = {
  id: externalId,
  name: 'External React',
  source: 'acme/upstream-skills',
  skill: 'external-react',
};

test('v2 map accepts external skills without local skill files and maps them to scans', async () => {
  await registryFixture(async directory => {
    await fs.writeFile(path.join(directory, 'skills-manifest.json'), JSON.stringify({
      schemaVersion: 1, registryId: 'example/skills', skills: [],
    }));
    await fs.writeFile(path.join(directory, 'skills-map.json'), JSON.stringify({
      schemaVersion: 2, registryId: 'example/skills',
      externalSkills: [external],
      technologySkills: [{technologyId: 'react', skills: [externalId]}],
      alwaysRecommend: [externalId],
    }));
    const loaded = await loadLocalRegistry(directory);
    const {registry, warnings} = mergeRegistries([loaded]);
    expect(warnings).toStrictEqual([]);
    expect(registry.skillInstallSources?.get(externalId)).toEqual({
      source: external.source, name: external.skill,
    });
    const project = path.join(directory, 'project');
    await fs.mkdir(project);
    await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({
      dependencies: {react: '^19'},
    }));
    const report = await detectProject(project, {registry});
    const entry = report.skills.find(skill => skill.id === externalId);
    expect(report.skills.filter(skill => skill.id === externalId)).toHaveLength(1);
    expect(entry?.sources.map(source => source.type).sort()).toEqual(['technology', 'always'].sort());
    const generated = generateInstallCommands([externalId], [
      {...entry!, installSource: registry.skillInstallSources?.get(externalId)},
    ], ['codex'], project);
    expect(generated.errors).toEqual([]);
    expect(generated.commands).toHaveLength(1);
    expect(generated.commands[0]).toContain('npx skills add acme/upstream-skills');
    expect(generated.commands[0]).toContain('--skill external-react');
  });
});

test('identical external skills from multiple registries combine mappings without duplicate IDs', () => {
  const map = (registryId: string, source = 'acme/upstream-skills') => parseMap({
    schemaVersion: 2, registryId,
    externalSkills: [{...external, source}],
    technologySkills: [{technologyId: 'react', skills: [externalId]}],
  });
  const manifest = (registryId: string) => parseManifest({schemaVersion: 1, registryId, skills: []});
  const first = {manifest: manifest('first/skills'), map: map('first/skills'), source: '/first'};
  const second = {manifest: manifest('second/skills'), map: map('second/skills', 'https://github.com/acme/upstream-skills.git'), source: '/second'};
  const merged = mergeRegistries([first, second]);
  expect(merged.warnings).toEqual([]);
  expect(merged.registry.technologies.find(item => item.id === 'react')?.skills.filter(id => id === externalId)).toHaveLength(1);
  expect(merged.registry.skillIds.has(externalId)).toBe(true);

  const conflicting = mergeRegistries([first, {...second, map: map('second/skills', 'different/upstream-skills')}]);
  expect(conflicting.warnings).toHaveLength(1);
  expect(conflicting.warnings[0]?.message).toMatch(/Conflicting external skill ID/);
  expect(conflicting.registry.registryIds).toEqual(['first/skills']);
});

test('explicit external declaration may map a built-in skill ID without duplicating it', () => {
  const id = 'vercel-labs/agent-skills/react-best-practices';
  const loaded = {
    manifest: parseManifest({schemaVersion: 1, registryId: 'sample/skills', skills: []}),
    map: parseMap({schemaVersion: 2, registryId: 'sample/skills', externalSkills: [
      {id, name: 'React best practices', source: 'vercel-labs/agent-skills', skill: 'react-best-practices'},
    ], technologySkills: [{technologyId: 'react', skills: [id]}]}),
    source: '/sample',
  };
  const merged = mergeRegistries([loaded]);
  expect(merged.warnings).toEqual([]);
  expect(merged.registry.skillInstallSources?.get(id)).toEqual({
    source: 'vercel-labs/agent-skills', name: 'react-best-practices',
  });
  expect(merged.registry.technologies.find(item => item.id === 'react')?.skills.filter(skill => skill === id)).toHaveLength(1);
});

test('external schema rejects malformed sources, duplicate IDs, and v1 external declarations', () => {
  const base = {schemaVersion: 2, registryId: 'sample/skills'};
  for (const item of [
    {...external, source: 'file:///tmp/skills'},
    {...external, source: 'https://user:password@github.com/acme/skills'},
    {...external, source: 'acme/../skills'},
    {...external, skill: '../escape'},
    {...external, id: 'bad\n/id/name'},
  ]) {
    expect(() => parseMap({...base, externalSkills: [item]})).toThrow();
  }
  expect(() => parseMap({...base, externalSkills: [external, external]})).toThrow(/Duplicate external skill IDs/);
  expect(() => parseMap({schemaVersion: 1, registryId: 'sample/skills', externalSkills: []})).toThrow(/schemaVersion 2/);
  expect(parseMap({schemaVersion: 1, registryId: 'sample/skills'}).externalSkills ?? []).toEqual([]);
});
