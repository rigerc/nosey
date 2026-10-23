import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import test from 'node:test';
import {syncRegistryTemplate, templateFiles, templateDocuments} from './sync-registry-template.mjs';

const exec = promisify(execFile);
const source = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(new URL('./sync-registry-template.mjs', import.meta.url));

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-sync-'));

  try {
    await fs.cp(path.join(source, 'tests/fixtures/registry-template'), root, {recursive: true});
    await run(root);
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}

void test('sync copies current sources without Git and preserves template-owned files', async () => {
  await fixture(async (root) => {
    const owned = ['README.md', '.github/workflows/template-sync.yml'];

    const before = await Promise.all(
      owned.map((name) => fs.readFile(path.join(root, name), 'utf8')),
    );

    await fs.writeFile(path.join(root, 'scripts/generate-readme.mjs'), '// stale copy');
    await exec(process.execPath, [cli, root], {
      env: {...process.env, PATH: path.join(root, 'no-tools')},
    });
    await syncRegistryTemplate(root, true);

    for (const [destination, canonical] of Object.entries(templateFiles)) {
      const expected = await fs.readFile(path.join(source, canonical), 'utf8');
      assert.equal(await fs.readFile(path.join(root, destination), 'utf8'), expected);
    }

    await syncRegistryTemplate(root); // Repeating the copy leaves identical maintained files.
    assert.deepEqual(
      await Promise.all(owned.map((name) => fs.readFile(path.join(root, name), 'utf8'))),
      before,
    );

    for (const name of [
      'schemas',
      'docs/registry-schema.md',
      'scripts/build-schema-docs.mjs',
      'nosey-contract.json',
      '.github/workflows/nosey-contract.yml',
    ])
      await assert.rejects(fs.stat(path.join(root, name)), {code: 'ENOENT'});
  });
});

void test('check mode reports stale copies without changing them', async () => {
  await fixture(async (root) => {
    await fs.writeFile(path.join(root, 'scripts/generate-manifest.mjs'), 'stale generator');
    await assert.rejects(syncRegistryTemplate(root, true), /Template file differs/);
    assert.equal(
      await fs.readFile(path.join(root, 'scripts/generate-manifest.mjs'), 'utf8'),
      'stale generator',
    );
  });
});

void test('sync repairs stale template JSON and keeps it unannotated', async () => {
  await fixture(async (root) => {
    for (const name of Object.keys(templateDocuments))
      await fs.writeFile(
        path.join(root, name),
        JSON.stringify({
          registryId: 'example/agent-skills',
          schemaVersion: 999,
          $schema: './schemas/old.json',
        }),
      );
    await assert.rejects(syncRegistryTemplate(root, true), /Template file differs/);
    await syncRegistryTemplate(root);
    await syncRegistryTemplate(root, true);

    for (const [name, expected] of Object.entries(templateDocuments)) {
      const document = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
      assert.deepEqual(document, expected);
      assert.equal(Object.hasOwn(document, '$schema'), false);
    }
  });
});

void test('sync never overwrites an existing registry with template examples', async () => {
  await fixture(async (root) => {
    const filename = path.join(root, 'registry.json');
    const original = JSON.stringify({schemaVersion: 1, registryId: 'acme/my-skills'});
    await fs.writeFile(filename, original);
    await assert.rejects(syncRegistryTemplate(root), /configured registries are not overwritten/);
    assert.equal(await fs.readFile(filename, 'utf8'), original);
  });
});

void test('sync rejects symlinked output directories and targets without registry identity', async () => {
  await fixture(async (root) => {
    const outside = path.join(root, 'outside');
    await fs.mkdir(outside);
    const protectedFile = path.join(outside, 'generate-manifest.mjs');
    await fs.writeFile(protectedFile, 'keep');
    await fs.rm(path.join(root, 'scripts'), {recursive: true});
    await fs.symlink(outside, path.join(root, 'scripts'));
    await assert.rejects(syncRegistryTemplate(root), /regular directory/);
    assert.equal(await fs.readFile(protectedFile, 'utf8'), 'keep');
    await fs.rm(path.join(root, 'registry.json'));
    await assert.rejects(syncRegistryTemplate(root));
    await assert.rejects(exec(process.execPath, [cli, root, 'a'.repeat(40)]), /Usage/);
  });
});
