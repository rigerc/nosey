import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';

const run = promisify(execFile);
const source = fileURLToPath(new URL('./fixtures/registry-template/', import.meta.url));
const packageFile = fileURLToPath(new URL('../package.json', import.meta.url));

const generator = fileURLToPath(
  new URL('../registry-tools/generate-manifest.mjs', import.meta.url),
);

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

test('Nosey owns the schemas and the template ships no schema files or annotations', async () => {
  // SAFETY: the owned package manifest is JSON; the assertions below verify the field used here.
  const packageJson = JSON.parse(await fs.readFile(packageFile, 'utf8')) as {files: string[]};
  expect(packageJson.files).toContain('registry-tools');
  expect(packageJson.files).toContain('schemas/registry');
  await expect(fs.stat(path.join(source, 'schemas'))).rejects.toMatchObject({code: 'ENOENT'});

  for (const name of documents) {
    const document = JSON.parse(await fs.readFile(path.join(source, name), 'utf8'));
    expect(Object.hasOwn(document, '$schema')).toBe(false);
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
