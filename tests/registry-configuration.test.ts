import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test, expect} from 'vite-plus/test';
import {buildRegistry} from '../src/lib/registry/commands.js';
import {configureRegistryIdentity} from '../src/lib/registry/init.js';
import {templateDirectory} from './helpers/registry-template.js';

test('configuration supports older map documents with null optional collections', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-legacy-configure-'));

  try {
    await fs.cp(templateDirectory, root, {recursive: true});
    await fs.writeFile(
      path.join(root, 'skills-map.json'),
      JSON.stringify({
        schemaVersion: 1,
        registryId: 'example/agent-skills',
        technologies: null,
        combinations: null,
      }),
    );
    await configureRegistryIdentity(root, 'acme/legacy');
    const first = await fs.readFile(path.join(root, 'skills-map.json'), 'utf8');
    await configureRegistryIdentity(root, 'acme/legacy');
    expect(await fs.readFile(path.join(root, 'skills-map.json'), 'utf8')).toBe(first);
    expect(JSON.parse(first).registryId).toBe('acme/legacy');
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('trusted configuration remaps every local binding, preserves external prefix collisions, and is idempotent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-configure-'));

  try {
    await fs.cp(templateDirectory, root, {recursive: true});
    const former = 'example/agent-skills';
    const local = former + '/nested/local';
    const external = former + '/external';
    const skillDirectory = path.join(root, 'skills/nested/local');
    await fs.mkdir(skillDirectory, {recursive: true});
    await fs.writeFile(
      path.join(skillDirectory, 'SKILL.md'),
      '---\nname: local\ndescription: A nested skill\n---\nLocal',
    );

    // Target-supplied scripts are data. Neither build nor configure may execute them.
    for (const name of ['generate-manifest.mjs', 'generate-readme.mjs', 'configure-registry.mjs'])
      await fs.writeFile(
        path.join(root, 'scripts', name),
        'throw new Error("untrusted script ran");',
      );
    await buildRegistry(root);

    const map = {
      $schema: {custom: 'preserve exactly'},
      schemaVersion: 2,
      registryId: former,
      externalSkills: [{id: external, name: 'External', source: former, skill: 'external'}],
      technologies: [
        {id: 'custom', name: 'Custom', detect: {packages: ['custom']}, skills: [local, external]},
      ],
      technologySkills: [{technologyId: 'custom', skills: [local, external]}],
      combinations: [
        {id: 'custom-pair', name: 'Custom pair', requires: ['custom'], skills: [local, external]},
      ],
      combinationSkills: [{combinationId: 'custom-pair', skills: [local, external]}],
      alwaysRecommend: [local, external],
      frontendBonusSkills: [local, external],
      customAnnotation: 'retained',
    };

    await fs.writeFile(path.join(root, 'skills-map.json'), JSON.stringify(map));
    await configureRegistryIdentity(root, 'acme/renamed');
    const rewritten = JSON.parse(await fs.readFile(path.join(root, 'skills-map.json'), 'utf8'));
    const expected = ['acme/renamed/nested/local', external];

    for (const key of ['technologies', 'technologySkills', 'combinations', 'combinationSkills'])
      expect(rewritten[key][0].skills).toEqual(expected);
    expect(rewritten.alwaysRecommend).toEqual(expected);
    expect(rewritten.frontendBonusSkills).toEqual(expected);
    expect(rewritten.externalSkills).toEqual(map.externalSkills);
    expect(rewritten.$schema).toEqual(map.$schema);
    expect(rewritten.customAnnotation).toBe('retained');
    const names = ['registry.json', 'skills-manifest.json', 'skills-map.json', 'README.md'];

    const before = await Promise.all(
      names.map((name) => fs.readFile(path.join(root, name), 'utf8')),
    );

    await configureRegistryIdentity(root, 'acme/renamed');
    expect(
      await Promise.all(names.map((name) => fs.readFile(path.join(root, name), 'utf8'))),
    ).toEqual(before);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});

test('invalid input is rejected by Nosey parsers before configuration writes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-invalid-configure-'));

  try {
    await fs.cp(templateDirectory, root, {recursive: true});
    const filename = path.join(root, 'skills-map.json');
    const map = JSON.parse(await fs.readFile(filename, 'utf8'));
    map.technologies = [{id: 'bad', name: 'Bad', detect: {packagePatterns: [{source: '['}]}}];
    await fs.writeFile(filename, JSON.stringify(map));
    const before = await fs.readFile(path.join(root, 'registry.json'), 'utf8');
    await expect(configureRegistryIdentity(root, 'acme/renamed')).rejects.toThrow();
    expect(await fs.readFile(path.join(root, 'registry.json'), 'utf8')).toBe(before);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
});
