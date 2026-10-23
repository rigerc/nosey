import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {
  scaffoldRegistry as scaffold,
  type RegistryInitDependencies,
  runRegistryInit as initialize,
  type RegistryInitOptions,
} from '../../src/lib/registry/init.js';
import type {TemplateTransport} from '../../src/lib/registry/template.js';

/**
 * Minimal, synthetic *test data* for offline Nosey creation tests.
 * Do not vendor or duplicate the standalone registry template in Nosey's tree.
 * Real template generation, audits and synchronization are tested upstream.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nosey-registry-test-data-'));
const toolDirectory = fileURLToPath(new URL('../../registry-tools/', import.meta.url));
const registryId = 'example/agent-skills';
export const templateDirectory = root;
export const templateCommit = 'a'.repeat(40);

function write(name: string, data: string): void {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, data);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Only local, explicitly constructed test documents are serialized here.
function json(name: string, data: unknown): void {
  write(name, JSON.stringify(data, null, 2) + '\n');
}

json('registry.json', {schemaVersion: 1, registryId});

json('skills-manifest.json', {schemaVersion: 1, registryId, skills: []});

json('skills-map.json', {
  schemaVersion: 2,
  registryId,
  alwaysRecommend: [],
  externalSkills: [],
  technologies: [],
  technologySkills: [],
  combinations: [],
  combinationSkills: [],
  frontendBonusSkills: [],
  frontendPackages: [],
  webFrontendExtensions: [],
});

json('.template/state.json', {
  schemaVersion: 1,
  source: 'rigerc/nosey-registry-template',
  sourceRevision: templateCommit,
});

write(
  'README.md',
  '# Test registry\n\n<!-- BEGIN GENERATED SKILL CATALOG -->\n\n<!-- END GENERATED SKILL CATALOG -->\n',
);

write('.github/workflows/registry-ci.yml', 'name: Test registry validation\n');

write('.github/workflows/template-sync.yml', 'name: Test template update\n');

write('.agents/prompts/fix-skills-using-agnix.md', '# Test audit instructions\n');

write('.agnix.toml', '# Synthetic test policy\n');

write('scripts/prepare-agnix-sarif.mjs', '// Synthetic workflow placeholder\n');

write('scripts/prepare-agnix-sarif.test.mjs', '// Synthetic test placeholder\n');

write('scripts/template-update.mjs', '// Synthetic workflow placeholder\n');

write('scripts/validate-registry.mjs', '// Synthetic workflow placeholder\n');

write(
  'Makefile',
  'generate:\n\tnode scripts/generate-manifest.mjs\n\tnode scripts/generate-readme.mjs\n',
);

for (const name of [
  'configure-registry.mjs',
  'generate-manifest.mjs',
  'generate-manifest.test.mjs',
  'generate-readme.mjs',
  'generate-readme.test.mjs',
]) {
  fs.copyFileSync(path.join(toolDirectory, name), path.join(root, 'scripts', name));
}

execFileSync(process.execPath, [path.join(root, 'scripts/generate-readme.mjs')], {
  cwd: root,
  stdio: 'pipe',
});

process.once('exit', () => fs.rmSync(root, {recursive: true, force: true}));

export function tarEntry(name: string, data = Buffer.alloc(0), type = '0'): Buffer {
  const header = Buffer.alloc(512);

  if (Buffer.byteLength(name) > 100) throw new Error('Fixture entry name too long: ' + name);
  header.write(name);
  header.write('0000755\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  let checksum = 0;

  for (const value of header) checksum += value;
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);

  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

export async function fixtureArchive(directory = templateDirectory): Promise<Buffer> {
  const chunks: Buffer[] = [];

  async function walk(relative: string): Promise<void> {
    for (const entry of await fs.promises.readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      if (entry.name === '.git') continue;
      const name = path.posix.join(relative, entry.name);

      if (entry.isDirectory()) {
        chunks.push(tarEntry('template/' + name + '/', Buffer.alloc(0), '5'));
        await walk(name);
      } else {
        chunks.push(
          tarEntry('template/' + name, await fs.promises.readFile(path.join(directory, name))),
        );
      }
    }
  }

  await walk('');

  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

export async function fixtureTransport(directory = templateDirectory): Promise<TemplateTransport> {
  const bytes = await fixtureArchive(directory);

  return async (url) => {
    if (url.endsWith('/tar.gz/' + templateCommit)) return new Response(new Uint8Array(bytes));

    if (url.includes('/commits/')) return Response.json({sha: templateCommit});

    if (url === 'https://api.github.com/repos/rigerc/nosey-registry-template')
      return Response.json({default_branch: 'trunk'});
    throw new Error('Unexpected test request: ' + url);
  };
}

export function scaffoldRegistry(
  directory: string,
  id: string,
  template = templateDirectory,
): Promise<string> {
  return scaffold(directory, id, template);
}

export function runRegistryInit(
  options: RegistryInitOptions = {},
  dependencies: RegistryInitDependencies = {},
) {
  return initialize(options, {templateDirectory, ...dependencies});
}

export async function fixturePreload(
  parent: string,
  template = templateDirectory,
): Promise<string> {
  const archive = path.join(parent, 'template.tar.gz');
  const preload = path.join(parent, 'template-fetch.mjs');
  await fs.promises.writeFile(archive, await fixtureArchive(template));
  await fs.promises.writeFile(
    preload,
    `import fs from 'node:fs';
const archive = fs.readFileSync(${JSON.stringify(archive)});
globalThis.fetch = async (url) => {
  if (url === 'https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/${templateCommit}') return new Response(archive);
  if (url === 'https://api.github.com/repos/rigerc/nosey-registry-template/commits/trunk') return Response.json({sha: '${templateCommit}'});
  if (url === 'https://api.github.com/repos/rigerc/nosey-registry-template') return Response.json({default_branch: 'trunk'});
  throw new Error('Unexpected network request: ' + url);
};\n`,
  );

  return preload;
}
