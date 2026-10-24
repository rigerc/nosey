// Cross-implementation identity gate: use the checked-out template module and shared fixtures.
// oxlint-disable anti-slop/no-runtime-typeof -- JSON fixtures and imported candidate exports are validated at their I/O boundary here.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {isRecord, type JsonValue} from '../src/lib/values.js';
import {configureRegistryIdentityFiles} from '../src/lib/registry/identity-files.js';
import {validateRegistryId} from '../src/lib/registry/init.js';
import type {GuidePolicy} from '../src/lib/registry/identity.js';

type CandidateOptions = {
  schemasDir: string;
  fileOps?: {beforeRename: (filename: string, renamed: number) => void};
};

type Candidate = {
  configureRegistry(
    root: string,
    id: string,
    options: CandidateOptions,
  ): Promise<{changed: string[]}>;
};

type Options = {template: string; schemas: string};

const fixtureRoot = 'scripts/test/fixtures/identity/v1';

function args(argv: string[]): Options {
  const values: Record<string, string> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];

    if (key !== '--template' && key !== '--schemas') throw new Error(`Unknown argument: ${key}`);
    const value = argv[++i];

    if (!value || value.startsWith('--')) throw new Error(`${key} requires a directory`);
    values[key.slice(2)] = path.resolve(value);
  }

  if (!values.template || !values.schemas)
    throw new Error(
      'Usage: registry-identity-conformance --template <candidate-dir> --schemas <schema-dir>',
    );

  return {template: values.template, schemas: values.schemas};
}

async function json(filename: string): Promise<JsonValue> {
  // SAFETY: JSON.parse returns only JSON values, the complete JsonValue domain.
  return JSON.parse(await fs.readFile(filename, 'utf8')) as JsonValue;
}

async function copyFixture(source: string, target: string): Promise<void> {
  await fs.cp(source, target, {
    recursive: true,
    filter: (filename) => path.basename(filename) !== 'case.json',
  });
  const manifest = await json(path.join(target, 'skills-manifest.json'));

  if (!isRecord(manifest) || !Array.isArray(manifest.skills)) return;

  for (const skill of manifest.skills) {
    if (
      !isRecord(skill) ||
      typeof skill.path !== 'string' ||
      typeof skill.name !== 'string' ||
      typeof skill.description !== 'string'
    )
      continue;
    const filename = path.join(target, skill.path);
    await fs.mkdir(path.dirname(filename), {recursive: true});
    await fs.writeFile(
      filename,
      `---\nname: ${JSON.stringify(skill.name)}\ndescription: ${JSON.stringify(skill.description)}\n---\n\nFixture skill.\n`,
    );
  }
}

async function run(options: Options): Promise<number> {
  const fixtureDirectory = path.join(options.template, fixtureRoot);

  const entries = (await fs.readdir(fixtureDirectory, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!entries.length)
    throw new Error(`BLOCKED: shared identity fixtures missing at ${fixtureDirectory}`);
  const modulePath = path.join(options.template, 'scripts/configure-registry.mjs');
  // SAFETY: The candidate module is checked out and its configureRegistry export is validated immediately below.
  const template = (await import(pathToFileURL(modulePath).href)) as Candidate;

  if (typeof template.configureRegistry !== 'function')
    throw new Error(`BLOCKED: candidate configurator unavailable at ${modulePath}`);

  const guidePolicy: GuidePolicy = {
    maintainer: await fs.readFile(path.join(options.template, 'AGENTS.md'), 'utf8'),
    downstream: await fs.readFile(
      path.join(options.template, '.agents/templates/registry-AGENTS.md'),
      'utf8',
    ),
  };

  let passed = 0;

  for (const entry of entries) {
    const source = path.join(fixtureDirectory, entry.name, 'input');

    try {
      await fs.access(source);
    } catch {
      continue;
    } // parser-only/malformed cases are handled by the schema gate.

    const caseFile = path.join(source, 'case.json');
    let scenario: JsonValue;

    try {
      scenario = await json(caseFile);
    } catch {
      continue;
    }

    if (!isRecord(scenario)) throw new Error(`${entry.name}: case.json must be an object`);

    if (scenario.kind === 'parse') continue;

    const requested =
      typeof scenario.requestedIdentity === 'string'
        ? scenario.requestedIdentity
        : 'example/configured';

    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'nosey-identity-parity-'));
    const noseyRoot = path.join(temp, 'nosey');
    const templateRoot = path.join(temp, 'template');

    try {
      await Promise.all([fs.mkdir(noseyRoot), fs.mkdir(templateRoot)]);
      await Promise.all([copyFixture(source, noseyRoot), copyFixture(source, templateRoot)]);
      const templateGuide = path.join(templateRoot, '.agents/templates/registry-AGENTS.md');
      await fs.mkdir(path.dirname(templateGuide), {recursive: true});
      await fs.copyFile(
        path.join(options.template, '.agents/templates/registry-AGENTS.md'),
        templateGuide,
      );
      const trackedFiles = ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'];
      const original = new Map<string, Buffer | undefined>();

      for (const filename of trackedFiles)
        original.set(
          filename,
          await fs.readFile(path.join(noseyRoot, filename)).catch(() => undefined),
        );
      const noseyOptions: Parameters<typeof configureRegistryIdentityFiles>[2] = {guidePolicy};
      const templateOptions: CandidateOptions = {schemasDir: options.schemas};

      if (entry.name === 'write-failure') {
        noseyOptions.beforeRename = (completed) => {
          if (completed === 2) throw new Error('injected recoverable rename failure');
        };

        templateOptions.fileOps = {
          beforeRename: (_filename, renamed) => {
            if (renamed === 2) throw new Error('injected recoverable rename failure');
          },
        };
      }

      const outcomes: Array<{ok: boolean; error?: string}> = [];

      for (const operation of [
        () => configureRegistryIdentityFiles(noseyRoot, requested, noseyOptions),
        () => template.configureRegistry(templateRoot, requested, templateOptions),
      ] as const) {
        try {
          await operation();
          outcomes.push({ok: true});
        } catch (error) {
          outcomes.push({ok: false, error: error instanceof Error ? error.message : String(error)});
        }
      }

      if (outcomes[0]!.ok !== outcomes[1]!.ok)
        throw new Error(
          `${entry.name}: acceptance mismatch Nosey=${JSON.stringify(outcomes[0])}; template=${JSON.stringify(outcomes[1])}`,
        );

      if (!outcomes[0]!.ok) {
        for (const filename of trackedFiles) {
          const a = await fs.readFile(path.join(noseyRoot, filename)).catch(() => undefined);
          const b = await fs.readFile(path.join(templateRoot, filename)).catch(() => undefined);
          const before = original.get(filename);

          if (
            Boolean(a) !== Boolean(before) ||
            Boolean(b) !== Boolean(before) ||
            (a && before && !a.equals(before)) ||
            (b && before && !b.equals(before))
          )
            throw new Error(`${entry.name}: rejected input bytes were modified (${filename})`);
        }

        passed += 1;
        continue;
      }

      for (const filename of ['skills-map.json', 'skills-manifest.json']) {
        const left = await json(path.join(noseyRoot, filename));
        const right = await json(path.join(templateRoot, filename));

        if (JSON.stringify(left) !== JSON.stringify(right))
          throw new Error(`${entry.name}: ${filename} semantic parity mismatch`);
      }

      const expectedRoot = path.join(options.template, fixtureRoot, entry.name, 'expected');

      for (const filename of Array.isArray(scenario.expectedFiles)
        ? scenario.expectedFiles.filter((item): item is string => typeof item === 'string')
        : []) {
        const expected = await fs.readFile(path.join(expectedRoot, filename));
        const templateActual = await fs.readFile(path.join(templateRoot, filename));

        if (!expected.equals(templateActual))
          throw new Error(`${entry.name}: ${filename} differs from committed shared golden output`);

        if (filename !== 'README.md' && filename !== 'AGENTS.md') {
          const noseyActual = await fs.readFile(path.join(noseyRoot, filename));

          if (!expected.equals(noseyActual))
            throw new Error(
              `${entry.name}: Nosey ${filename} differs byte-for-byte from committed shared golden output`,
            );
        }
      }

      for (const filename of ['README.md', 'AGENTS.md']) {
        const a = await fs.readFile(path.join(noseyRoot, filename)).catch(() => undefined);
        const b = await fs.readFile(path.join(templateRoot, filename)).catch(() => undefined);

        if (Boolean(a) !== Boolean(b) || (a && b && !a.equals(b)))
          throw new Error(`${entry.name}: ${filename} byte parity mismatch`);
      }

      // Both implementations must be byte-idempotent for the same requested identity.
      const snapshot = new Map<string, Buffer>();

      for (const filename of ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'])
        snapshot.set(
          filename,
          await fs.readFile(path.join(noseyRoot, filename)).catch(() => Buffer.alloc(0)),
        );
      await configureRegistryIdentityFiles(noseyRoot, requested, {guidePolicy});
      await template.configureRegistry(templateRoot, requested, {schemasDir: options.schemas});

      for (const filename of snapshot.keys()) {
        const a = snapshot.get(filename)!;
        const b = await fs.readFile(path.join(noseyRoot, filename)).catch(() => Buffer.alloc(0));
        const c = await fs.readFile(path.join(templateRoot, filename)).catch(() => Buffer.alloc(0));

        if (!a.equals(b) || !a.equals(c))
          throw new Error(`${entry.name}: ${filename} second-run byte idempotency failed`);
      }

      passed += 1;
    } finally {
      await fs.rm(temp, {recursive: true, force: true});
    }
  }

  const candidateSyntaxCases = [
    {id: 'acme/repo_name', accepted: true},
    {id: 'acme/repo.name', accepted: true},
    {id: 'acme-name/repo', accepted: true},
    {id: 'acme_name/repo', accepted: false},
    {id: 'acme.name/repo', accepted: false},
    {id: `${'a'.repeat(40)}/repo`, accepted: false},
  ];

  for (const item of candidateSyntaxCases) {
    let noseyAccepted = true;

    try {
      validateRegistryId(item.id);
    } catch {
      noseyAccepted = false;
    }

    if (!noseyAccepted)
      throw new Error(`Nosey local identity grammar unexpectedly rejected ${item.id}`);
    let templateAccepted = true;

    try {
      await template.configureRegistry(
        path.join(options.template, 'missing-syntax-fixture'),
        item.id,
        {schemasDir: options.schemas},
      );
    } catch (error) {
      templateAccepted = !(
        error instanceof Error && /safe GitHub owner\/repository/.test(error.message)
      );
    }

    if (templateAccepted !== item.accepted)
      throw new Error(
        `template identity syntax verdict mismatch for ${item.id}: expected=${item.accepted}, actual=${templateAccepted}`,
      );
  }

  if (!passed)
    throw new Error(`BLOCKED: no executable shared identity fixtures found at ${fixtureDirectory}`);
  console.log(
    `Identity conformance passed: ${passed}/${passed} shared file-operation fixtures plus ${candidateSyntaxCases.length} explicit identity syntax cases; local Nosey grammar retained its dotted/underscored owner support while the manual template configure kept stricter GitHub owner rules.`,
  );

  return passed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run(args(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = String(error).includes('BLOCKED:') ? 2 : 1;
  }
}
