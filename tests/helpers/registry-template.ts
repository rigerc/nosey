import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {gzipSync} from 'node:zlib';
import {
  scaffoldRegistry as scaffold,
  type RegistryInitDependencies,
  runRegistryInit as initialize,
  type RegistryInitOptions,
} from '../../src/lib/registry/init.js';
import type {TemplateTransport} from '../../src/lib/registry/template.js';
import {templateCommit} from '../../src/lib/registry/template-source.js';

export {templateCommit};

/**
 * Minimal, synthetic *test data* for offline Nosey creation tests.
 * Do not vendor or duplicate the standalone registry template in Nosey's tree.
 * Real template generation, audits and synchronization are tested upstream.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nosey-registry-test-data-'));
const registryId = 'example/agent-skills';
export const templateDirectory = root;
const pinnedTemplateDirectory = path.resolve('template/registry');

function write(name: string, data: string): void {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, data);
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Only local, explicitly constructed test documents are serialized here.
function json(name: string, data: unknown): void {
  write(name, JSON.stringify(data, null, 2) + '\n');
}

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

write(
  'README.md',
  '# Test registry\n\n<!-- BEGIN GENERATED SKILL CATALOG -->\n\n<!-- END GENERATED SKILL CATALOG -->\n',
);

write('scripts/configure-registry.mjs', "throw new Error('template script must not execute');\n");

process.once('exit', () => fs.rmSync(root, {recursive: true, force: true}));

export function tarEntry(name: string, data = Buffer.alloc(0), type = '0', mode = 0o644): Buffer {
  const header = Buffer.alloc(512);
  let leaf = name;
  let prefix = '';

  if (Buffer.byteLength(leaf) > 100) {
    const slash = leaf.lastIndexOf('/');
    prefix = leaf.slice(0, slash);
    leaf = leaf.slice(slash + 1);
  }

  if (Buffer.byteLength(leaf) > 100 || Buffer.byteLength(prefix) > 155)
    throw new Error('Fixture entry name too long: ' + name);
  header.write(leaf);
  header.write(mode.toString(8).padStart(6, '0') + '\0', 100);
  header.write('0000000\0', 108);
  header.write('0000000\0', 116);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write('00000000000\0', 136);
  header.fill(32, 148, 156);
  header.write(type, 156);
  header.write('ustar\0', 257);
  header.write('00', 263);

  if (prefix) header.write(prefix, 345);
  let checksum = 0;

  for (const value of header) checksum += value;
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);

  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

export async function fixtureArchive(directory = pinnedTemplateDirectory): Promise<Buffer> {
  const recordValue = `comment=${templateCommit}\n`;
  let recordLength = Buffer.byteLength(recordValue) + 3;

  while (String(recordLength).length + 1 + Buffer.byteLength(recordValue) !== recordLength)
    recordLength = String(recordLength).length + 1 + Buffer.byteLength(recordValue);
  const pax = Buffer.from(`${recordLength} ${recordValue}`);

  const chunks: Buffer[] = [
    tarEntry('pax_global_header', pax, 'g'),
    tarEntry('template/', Buffer.alloc(0), '5', 0o755),
  ];

  async function walk(relative: string): Promise<void> {
    for (const entry of await fs.promises.readdir(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      if (entry.name === '.git') continue;
      const name = path.posix.join(relative, entry.name);

      if (entry.isDirectory()) {
        const info = await fs.promises.lstat(path.join(directory, name));
        chunks.push(tarEntry('template/' + name + '/', Buffer.alloc(0), '5', info.mode & 0o777));
        await walk(name);
      } else {
        const filename = path.join(directory, name);

        if (!(await fs.promises.lstat(filename)).isFile())
          throw new Error('Fixture archive only supports regular files: ' + name);
        // The pinned submodule's tracked files are all Git mode 100644. Worktree
        // permissions vary by platform and must not become archive provenance.
        chunks.push(tarEntry('template/' + name, await fs.promises.readFile(filename), '0', 0o644));
      }
    }
  }

  await walk('');

  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

export async function fixtureTransport(
  directory = pinnedTemplateDirectory,
): Promise<TemplateTransport> {
  const bytes = await fixtureArchive(directory);

  return async (url) => {
    if (
      url ===
      'https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/' + templateCommit
    )
      return new Response(new Uint8Array(bytes));
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

export async function fixturePreload(parent: string, _template?: string): Promise<string> {
  const archive = path.join(parent, 'template.tar.gz');
  const preload = path.join(parent, 'template-fetch.mjs');
  await fs.promises.writeFile(archive, await fixtureArchive());
  await fs.promises.writeFile(
    preload,
    `import fs from 'node:fs';
const archive = fs.readFileSync(${JSON.stringify(archive)});
globalThis.fetch = async (url) => {
  if (url === 'https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/${templateCommit}') return new Response(archive);
  throw new Error('Unexpected network request: ' + url);
};\n`,
  );

  return preload;
}
