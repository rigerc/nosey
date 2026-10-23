import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {z} from 'zod';
import {
  fixturePreload,
  templateCommit,
  templateDirectory,
} from '../tests/helpers/registry-template.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-package-'));

try {
  const npmEnvironment = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !/^npm_config_/i.test(name)),
    ),
    npm_config_cache: path.join(temporary, 'npm-cache'),
    npm_config_userconfig: os.devNull,
  };

  const {stdout} = await exec('npm', ['pack', '--json', '--pack-destination', temporary], {
    cwd: root,
    env: npmEnvironment,
  });

  const [packed] = z
    .array(z.object({filename: z.string(), files: z.array(z.object({path: z.string()}))}))
    .parse(JSON.parse(stdout));

  assert.ok(packed);
  assert.equal(
    packed.files.some((file) => file.path.startsWith('templates/')),
    false,
  );

  for (const file of [
    'registry-tools/configure-registry.mjs',
    'registry-tools/generate-manifest.mjs',
    'schemas/registry/skills-map.schema.json',
    'schemas/registry/skills-manifest.schema.json',
  ])
    assert.ok(packed.files.some((entry) => entry.path === file));
  const installation = path.join(temporary, 'install');
  await fs.mkdir(installation);
  await fs.writeFile(path.join(installation, 'package.json'), '{"private":true}\n');
  await exec(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      path.join(temporary, packed.filename),
    ],
    {timeout: 120_000, env: npmEnvironment, cwd: installation},
  );
  const packageRoot = path.join(installation, 'node_modules/nosey');
  const cli = path.join(packageRoot, 'dist/cli.js');

  for (const [name, filename] of [
    ['skills-map', 'skills-map.schema.json'],
    ['manifest', 'skills-manifest.schema.json'],
  ] as const) {
    const result = await exec(process.execPath, [cli, 'schema', name], {cwd: temporary});

    const expected = JSON.parse(
      await fs.readFile(path.join(packageRoot, 'schemas/registry', filename), 'utf8'),
    );

    assert.deepEqual(JSON.parse(result.stdout), expected);
    assert.equal(result.stderr, '');
  }

  const preload = await fixturePreload(temporary);
  const registry = path.join(temporary, 'registry');

  const result = await exec(
    process.execPath,
    [
      '--import',
      preload,
      cli,
      'registry',
      'init',
      registry,
      '--registry-id',
      'acme/packaged',
      '--yes',
      '--no-git',
    ],
    {
      cwd: temporary,
      env: {...process.env, PATH: path.join(temporary, 'no-tools-installed')},
    },
  );

  assert.ok(result.stdout.includes(templateCommit));
  await assert.rejects(fs.stat(path.join(registry, '.git')), {code: 'ENOENT'});

  for (const name of ['generate-manifest.mjs', 'generate-readme.mjs'])
    await exec(process.execPath, [path.join(packageRoot, 'registry-tools', name), '--check'], {
      cwd: registry,
    });
  await fs.writeFile(
    path.join(registry, 'scripts/generate-manifest.mjs'),
    'throw new Error("untrusted registry script ran");',
  );
  await exec(process.execPath, [cli, 'registry', 'build', registry], {cwd: temporary});

  const validated = await exec(
    process.execPath,
    [cli, 'registry', 'validate', registry, '--json'],
    {cwd: temporary},
  );

  const verdict = z.object({valid: z.boolean()}).parse(JSON.parse(validated.stdout));
  assert.ok(verdict.valid);

  const minimal = path.join(temporary, 'minimal-template');
  await fs.cp(templateDirectory, minimal, {recursive: true});
  await fs.rm(path.join(minimal, 'schemas'), {recursive: true, force: true});
  await fs.rm(path.join(minimal, 'scripts'), {recursive: true});

  for (const name of ['skills-manifest.json', 'skills-map.json']) {
    const filename = path.join(minimal, name);
    const document = JSON.parse(await fs.readFile(filename, 'utf8'));
    delete document.$schema;
    await fs.writeFile(filename, JSON.stringify(document));
  }

  const minimalDownload = path.join(temporary, 'minimal-download');
  await fs.mkdir(minimalDownload);
  const minimalPreload = await fixturePreload(minimalDownload, minimal);
  const minimalRegistry = path.join(temporary, 'minimal-registry');
  await exec(
    process.execPath,
    [
      '--import',
      minimalPreload,
      cli,
      'registry',
      'init',
      minimalRegistry,
      '--registry-id',
      'acme/minimal',
      '--yes',
      '--no-git',
    ],
    {
      cwd: temporary,
      env: {...process.env, PATH: path.join(temporary, 'no-tools-installed')},
    },
  );
  await assert.rejects(fs.stat(path.join(minimalRegistry, 'schemas')), {code: 'ENOENT'});

  const minimalValidation = await exec(
    process.execPath,
    [cli, 'registry', 'validate', minimalRegistry, '--json'],
    {cwd: temporary},
  );

  assert.ok(z.object({valid: z.boolean()}).parse(JSON.parse(minimalValidation.stdout)).valid);
  const withGit = path.join(temporary, 'with-git');
  await exec(
    process.execPath,
    ['--import', preload, cli, 'registry', 'init', withGit, '--registry-id', 'acme/git', '--yes'],
    {cwd: temporary},
  );
  const remotes = await exec('git', ['-C', withGit, 'remote']);
  assert.equal(remotes.stdout.trim(), '');
  console.log(
    'Installed package: schema-free init with and without Git, trusted generators, offline build and validation passed.',
  );
} finally {
  await fs.rm(temporary, {recursive: true, force: true});
}
