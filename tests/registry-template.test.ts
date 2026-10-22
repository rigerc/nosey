import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';
import {type JsonObject, isRecord, isString} from '../src/lib/values.js';

const run = promisify(execFile);
const source = fileURLToPath(new URL('../templates/registry/', import.meta.url));
const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));
const generator = path.join(source, 'scripts/generate-manifest.mjs');
const documents = ['skills-manifest.json', 'skills-map.json'];

test('template generator is deterministic and leaves the skill map untouched', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-template-'));

  try {
    await fs.cp(source, directory, {recursive: true});
    const originalMap = await fs.readFile(path.join(directory, 'skills-map.json'), 'utf8');
    await run(process.execPath, [generator], {cwd: directory});
    await run(process.execPath, [generator, '--check'], {cwd: directory});

    // SAFETY: the owned fixture produces this JSON contract; the assertions below verify its fields.
    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, 'skills-manifest.json'), 'utf8'),
    ) as {skills: Array<{id: string}>};

    expect(manifest.skills).toEqual([]);
    expect(await fs.readFile(path.join(directory, 'skills-map.json'), 'utf8')).toBe(originalMap);
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
    await expect(run(process.execPath, [generator, '--check'], {cwd: directory})).rejects.toThrow();
    await run(process.execPath, [generator], {cwd: directory});
    await run(process.execPath, [generator, '--check'], {cwd: directory});
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('generator rejects dangling output symlinks and directories', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-manifest-output-'));

  try {
    await fs.cp(source, directory, {recursive: true});
    const manifest = path.join(directory, 'skills-manifest.json');
    const missing = path.join(directory, 'must-not-create.json');
    await fs.rm(manifest);
    await fs.symlink(missing, manifest);

    for (const flags of [[], ['--check']]) {
      await expect(run(process.execPath, [generator, ...flags], {cwd: directory})).rejects.toThrow(
        /regular file/,
      );
    }

    expect((await fs.lstat(manifest)).isSymbolicLink()).toBe(true);
    await expect(fs.stat(missing)).rejects.toMatchObject({code: 'ENOENT'});
    await fs.rm(manifest);
    await fs.mkdir(manifest);
    await expect(run(process.execPath, [generator], {cwd: directory})).rejects.toThrow(
      /regular file/,
    );
    expect((await fs.lstat(manifest)).isDirectory()).toBe(true);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('generator replaces hard-linked manifests and creates missing manifests without leftover temporary files', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-manifest-output-'));

  try {
    await fs.cp(source, directory, {recursive: true});
    const manifest = path.join(directory, 'skills-manifest.json');
    const linked = path.join(directory, 'keep.json');
    await fs.writeFile(manifest, 'keep this file');
    await fs.link(manifest, linked);
    await run(process.execPath, [generator], {cwd: directory});
    expect(await fs.readFile(linked, 'utf8')).toBe('keep this file');
    await run(process.execPath, [generator, '--check'], {cwd: directory});
    await fs.rm(manifest);
    await run(process.execPath, [generator], {cwd: directory});
    await run(process.execPath, [generator, '--check'], {cwd: directory});
    expect((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp'))).toStrictEqual([]);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('generator supports registries containing only external skills', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-external-only-'));

  try {
    await fs.cp(source, directory, {recursive: true});
    await fs.rm(path.join(directory, 'skills'), {recursive: true, force: true});
    const mapPath = path.join(directory, 'skills-map.json');
    const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
    map.externalSkills = [
      {
        id: 'acme/tools/react-helper',
        name: 'React helper',
        source: 'acme/tools',
        skill: 'react-helper',
      },
    ];
    map.technologySkills = [{technologyId: 'react', skills: ['acme/tools/react-helper']}];
    await fs.writeFile(mapPath, JSON.stringify(map));
    await run(process.execPath, [generator], {cwd: directory});
    await run(process.execPath, [generator, '--check'], {cwd: directory});

    const manifest = JSON.parse(
      await fs.readFile(path.join(directory, 'skills-manifest.json'), 'utf8'),
    );

    expect(manifest.skills).toEqual([]);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});

test('the packaged template ships schemas and self-resolving annotations', async () => {
  // SAFETY: the owned package manifest is JSON; the assertions below verify the field used here.
  const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8')) as {files: string[]};

  expect(packageJson.files).toContain('templates/registry');

  for (const file of ['schemas/skills-manifest.schema.json', 'schemas/skills-map.schema.json'])
    expect((await fs.stat(path.join(source, file))).isFile()).toBe(true);

  for (const name of documents) {
    // SAFETY: template documents are owned JSON; the annotation assertions below verify the shape.
    const document = JSON.parse(await fs.readFile(path.join(source, name), 'utf8')) as JsonObject;
    const annotation = document['$schema'];

    expect(isString(annotation)).toBe(true);

    if (!isString(annotation)) throw new Error(name + ' annotation must be a string');

    // A relative annotation must resolve inside a copied registry, not in the Nosey checkout.
    expect(annotation.startsWith('./')).toBe(true);
    expect((await fs.stat(path.resolve(source, annotation))).isFile()).toBe(true);
    expect(isRecord(document)).toBe(true);
  }
});

test('the README generator never writes the registry documents', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-readme-documents-'));

  try {
    await fs.cp(source, directory, {recursive: true});

    const annotated = await Promise.all(
      documents.map((name) => fs.readFile(path.join(directory, name), 'utf8')),
    );

    await run(process.execPath, [path.join(directory, 'scripts/generate-readme.mjs')], {
      cwd: directory,
    });

    for (const [index, name] of documents.entries())
      expect(await fs.readFile(path.join(directory, name), 'utf8')).toBe(annotated[index]);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
});
