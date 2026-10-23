#!/usr/bin/env node
// Copy current canonical sources into a template for review. No Git or release metadata needed.
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const templateRegistryId = 'example/agent-skills';

// Keep these examples aligned with Nosey's supported document versions.
export const templateDocuments = {
  'registry.json': {schemaVersion: 1, registryId: templateRegistryId},
  'skills-manifest.json': {schemaVersion: 1, registryId: templateRegistryId, skills: []},
  'skills-map.json': {
    schemaVersion: 2,
    registryId: templateRegistryId,
    alwaysRecommend: [],
    externalSkills: [],
    technologies: [],
    technologySkills: [],
    combinations: [],
    combinationSkills: [],
    frontendBonusSkills: [],
    frontendPackages: [],
    webFrontendExtensions: [],
  },
};

export const templateFiles = {
  'scripts/configure-registry.mjs': 'registry-tools/configure-registry.mjs',
  'scripts/generate-manifest.mjs': 'registry-tools/generate-manifest.mjs',
  'scripts/generate-readme.mjs': 'registry-tools/generate-readme.mjs',
  'NOSEY_NOTICES.md': 'THIRD_PARTY_NOTICES.md',
  NOSEY_LICENSE_APACHE_2_0: 'registry-tools/LICENSE-APACHE-2.0',
};

async function regularTarget(directory, name, check) {
  const parts = name.split('/');

  for (let index = 1; index < parts.length; index++) {
    const parent = path.join(directory, ...parts.slice(0, index));

    if (!check) {
      // eslint-disable-next-line no-await-in-loop
      await fs.mkdir(parent).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
    }

    // eslint-disable-next-line no-await-in-loop
    const info = await fs.lstat(parent);

    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('Template path must be a regular directory: ' + parent);
  }

  const filename = path.join(directory, name);

  const info = await fs.lstat(filename).catch((error) => {
    if (error.code === 'ENOENT' && !check) return undefined;
    throw error;
  });

  if (info && (!info.isFile() || info.isSymbolicLink()))
    throw new Error('Template path must be a regular file: ' + filename);

  return filename;
}

export async function syncRegistryTemplate(target, check = false) {
  const directory = await fs.realpath(path.resolve(target));
  // Confirm the target is a registry root before overwriting any maintained files.
  await regularTarget(directory, 'registry.json', true);
  const settings = JSON.parse(await fs.readFile(path.join(directory, 'registry.json'), 'utf8'));

  if (settings?.registryId !== templateRegistryId)
    throw new Error(
      'Template sync requires registryId example/agent-skills; configured registries are not overwritten.',
    );

  const files = await Promise.all(
    Object.entries(templateFiles).map(async ([name, source]) => {
      const content = await fs.readFile(path.join(root, source), 'utf8');

      return {name, content};
    }),
  );

  files.push(
    ...Object.entries(templateDocuments).map(([name, document]) => ({
      name,
      content: JSON.stringify(document, null, 2) + '\n',
    })),
  );

  for (const {name, content} of files) {
    // eslint-disable-next-line no-await-in-loop
    const filename = await regularTarget(directory, name, check);

    if (check) {
      // eslint-disable-next-line no-await-in-loop
      if ((await fs.readFile(filename, 'utf8')) !== content)
        throw new Error('Template file differs from Nosey: ' + name);
    } else {
      const temporary = filename + '.' + randomUUID() + '.tmp';

      try {
        // eslint-disable-next-line no-await-in-loop
        await fs.writeFile(temporary, content, {flag: 'wx'});
        // eslint-disable-next-line no-await-in-loop
        await fs.rename(temporary, filename);
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await fs.rm(temporary, {force: true});
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const check = args[0] === '--check';
    const target = args[check ? 1 : 0];

    if (!target || target.startsWith('-') || args.length !== (check ? 2 : 1))
      throw new Error('Usage: npm run registry:template:sync -- [--check] template-directory');
    await syncRegistryTemplate(target, check);
    console.log(
      check
        ? 'Template files match Nosey sources.'
        : 'Synced template files. Review the diff and open a PR.',
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
