import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {z} from 'zod';
import {fixturePreload, templateCommit} from '../tests/helpers/registry-template.js';

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
  const packedPaths = new Set(packed.files.map(({path: filename}) => filename));

  for (const filename of [
    'schemas/registry/skills-map.schema.json',
    'schemas/registry/skills-manifest.schema.json',
    'THIRD_PARTY_NOTICES.md',
    'LICENSE-APACHE-2.0',
  ])
    assert.ok(packedPaths.has(filename), `package is missing ${filename}`);

  for (const filename of packedPaths)
    assert.ok(
      !/^(?:registry-tools|template|docs\/example\/registry)(?:\/|$)/.test(filename),
      `package contains retired/copied template content: ${filename}`,
    );

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
  const subprocessMarker = path.join(temporary, 'acquired-script-subprocess');
  await fs.appendFile(
    preload,
    `\nimport childProcess from 'node:child_process';\n` +
      `for (const key of ['exec','execFile','execFileSync','execSync','fork','spawn','spawnSync']) {\n` +
      ` childProcess[key] = function (...args) { fs.writeFileSync(${JSON.stringify(subprocessMarker)}, key); throw new Error('unexpected subprocess: ' + key); };\n}\n` +
      `for (const key of ['exec','execFile','fork','spawn']) if (childProcess.promises?.[key]) childProcess.promises[key] = async function () { fs.writeFileSync(${JSON.stringify(subprocessMarker)}, key); throw new Error('unexpected subprocess: ' + key); };\n`,
  );

  const registry = path.join(temporary, 'registry');
  const emptyPath = path.join(temporary, 'no-tools-installed');
  await fs.mkdir(emptyPath);
  const isolatedEnv = {...process.env, PATH: emptyPath};

  const initialized = await exec(
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
    {cwd: temporary, env: isolatedEnv},
  );

  assert.ok(initialized.stdout.includes(templateCommit));
  await assert.rejects(fs.stat(path.join(registry, '.git')), {code: 'ENOENT'});

  for (const name of ['skills-map.json', 'skills-manifest.json']) {
    const document = JSON.parse(await fs.readFile(path.join(registry, name), 'utf8'));
    assert.equal(document.registryId, 'acme/packaged');
    assert.equal(
      document.$schema,
      `https://raw.githubusercontent.com/rigerc/nosey/main/schemas/registry/${name === 'skills-map.json' ? 'skills-map' : 'skills-manifest'}.schema.json`,
    );
  }

  assert.equal(
    await fs.readFile(path.join(registry, 'AGENTS.md'), 'utf8'),
    await fs.readFile(
      path.join(root, 'template/registry/.agents/templates/registry-AGENTS.md'),
      'utf8',
    ),
  );
  await assert.rejects(fs.stat(path.join(packageRoot, 'template')), {code: 'ENOENT'});
  assert.match(
    await fs.readFile(path.join(packageRoot, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
    /surviving TypeScript registry identity configuration/,
  );

  await fs.writeFile(
    path.join(registry, 'scripts/configure-registry.mjs'),
    "throw new Error('untrusted registry script ran');\n",
  );
  await fs.writeFile(
    path.join(registry, 'scripts/generate-manifest.mjs'),
    "throw new Error('untrusted registry script ran');\n",
  );
  const strayLegacy = path.join(registry, 'registry.json');
  const malformedLegacy = '{ malformed legacy settings';
  await fs.writeFile(strayLegacy, malformedLegacy);

  const validated = await exec(
    process.execPath,
    [cli, 'registry', 'validate', registry, '--json'],
    {
      cwd: temporary,
      env: isolatedEnv,
    },
  );

  assert.ok(z.object({valid: z.boolean()}).parse(JSON.parse(validated.stdout)).valid);
  assert.equal(await fs.readFile(strayLegacy, 'utf8'), malformedLegacy);
  await exec(process.execPath, ['--import', preload, cli, 'scan', registry, '--json'], {
    cwd: temporary,
    env: isolatedEnv,
  });
  assert.equal(
    await fs.stat(subprocessMarker).then(
      () => true,
      () => false,
    ),
    false,
  );

  const withGit = path.join(temporary, 'with-git');
  await exec(
    process.execPath,
    ['--import', preload, cli, 'registry', 'init', withGit, '--registry-id', 'acme/git', '--yes'],
    {cwd: temporary},
  );
  const remotes = await exec('git', ['-C', withGit, 'remote']);
  assert.equal(remotes.stdout.trim(), '');
  console.log(
    'Packed CLI: offline schemas, full pinned-template init, identity, no subprocess execution, and no default Git remote passed.',
  );
} finally {
  await fs.rm(temporary, {recursive: true, force: true});
}
