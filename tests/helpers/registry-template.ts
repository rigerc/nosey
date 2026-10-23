import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {
  scaffoldRegistry as scaffold,
  type RegistryInitDependencies,
  runRegistryInit as initialize,
  type RegistryInitOptions,
} from '../../src/lib/registry/init.js';
import type {TemplateTransport} from '../../src/lib/registry/template.js';

export const templateDirectory = fileURLToPath(
  new URL('../fixtures/registry-template/', import.meta.url),
);

export const templateCommit = 'a'.repeat(40);

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
    for (const entry of await fs.readdir(path.join(directory, relative), {withFileTypes: true})) {
      if (entry.name === '.git') continue;
      const name = path.posix.join(relative, entry.name);

      if (entry.isDirectory()) {
        chunks.push(tarEntry('template/' + name + '/', Buffer.alloc(0), '5'));
        // eslint-disable-next-line no-await-in-loop
        await walk(name);
      } else {
        // eslint-disable-next-line no-await-in-loop
        chunks.push(tarEntry('template/' + name, await fs.readFile(path.join(directory, name))));
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
    throw new Error('Unexpected fixture request: ' + url);
  };
}

export function scaffoldRegistry(
  directory: string,
  registryId: string,
  template = templateDirectory,
): Promise<string> {
  return scaffold(directory, registryId, template);
}

export function runRegistryInit(
  options: RegistryInitOptions = {},
  dependencies: RegistryInitDependencies = {},
) {
  return initialize(options, {templateDirectory, ...dependencies});
}

/** Intercept HTTP at the process boundary, keeping the installed CLI's production paths intact. */
export async function fixturePreload(
  parent: string,
  template = templateDirectory,
): Promise<string> {
  const archive = path.join(parent, 'template.tar.gz');
  const preload = path.join(parent, 'template-fetch.mjs');
  await fs.writeFile(archive, await fixtureArchive(template));
  await fs.writeFile(
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
