import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test, expect} from 'vite-plus/test';
import Ajv2020, {type ValidateFunction} from 'ajv/dist/2020.js';
import {type JsonObject, type JsonValue, isBoolean, isRecord, isString} from '../src/lib/values.js';
import {parseManifest, parseMap} from '../src/lib/registry/validate.js';

const schemaDirectory = fileURLToPath(new URL('../templates/registry/schemas/', import.meta.url));
const templateDirectory = fileURLToPath(new URL('../templates/registry/', import.meta.url));
const fixtureDirectory = fileURLToPath(new URL('./fixtures/registry-schema/', import.meta.url));
const guideFile = fileURLToPath(new URL('../docs/registry-schema.md', import.meta.url));

type DocumentName = 'manifest' | 'map';

type ParseOutcome = 'ok' | 'throws';

type SchemaMutation = (schema: JsonObject) => void;

type Expectation = {
  document: DocumentName;
  expectedSchemaValid: boolean;
  expectedParse: ParseOutcome;
  parserOnlyRule?: string;
  reason?: string;
};

type Fixture = {name: string; data: JsonValue; expectation: Expectation};

type ParseVerdict = {outcome: ParseOutcome; message: string};

type Result = {
  fixture: Fixture;
  schemaValid: boolean;
  parseOutcome: ParseOutcome;
  message: string;
};

/** Fields inventoried from the parsers; every one must reach the generated guide. */
const inventoriedFields = [
  'schemaVersion',
  'registryId',
  'skills[]',
  'skills[].id',
  'skills[].name',
  'skills[].path',
  'skills[].description',
  'alwaysRecommend',
  'externalSkills[]',
  'externalSkills[].id',
  'externalSkills[].name',
  'externalSkills[].source',
  'externalSkills[].skill',
  'externalSkills[].description',
  'technologies[]',
  'technologies[].id',
  'technologies[].name',
  'technologies[].detect',
  'technologies[].detect.packages',
  'technologies[].detect.pythonPackages',
  'technologies[].detect.composerPackages',
  'technologies[].detect.goModules',
  'technologies[].detect.rustCrates',
  'technologies[].detect.elixirPackages',
  'technologies[].detect.gems',
  'technologies[].detect.configFiles',
  'technologies[].detect.fileExtensions',
  'technologies[].detect.packagePatterns[]',
  'technologies[].detect.packagePatterns[].source',
  'technologies[].detect.packagePatterns[].flags',
  'technologies[].detect.configFileContent',
  'technologies[].detect.configFileContent.patterns[]',
  'technologies[].detect.configFileContent.files',
  'technologies[].detect.configFileContent.sourceExtensions',
  'technologies[].detect.configFileContent.scanGradleLayout',
  'technologies[].detect.configFileContent.scanDotNetLayout',
  'technologies[].detect.configFileContent.allPatterns',
  'technologies[].detect.configFileContent.maskStrings',
  'technologies[].detect.configFileContent.stripComments',
  'technologies[].skills',
  'technologySkills[]',
  'technologySkills[].technologyId',
  'technologySkills[].skills',
  'combinations[]',
  'combinations[].id',
  'combinations[].name',
  'combinations[].requires',
  'combinations[].skills',
  'combinationSkills[]',
  'combinationSkills[].combinationId',
  'combinationSkills[].skills',
  'frontendBonusSkills',
  'frontendPackages',
  'webFrontendExtensions',
];

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });

  ajv.addKeyword({keyword: 'x-parserOnly', schemaType: 'array', validate: () => true});
  ajv.addKeyword({keyword: 'x-normalization', schemaType: 'string', validate: () => true});

  return ajv;
}

async function readJson(filename: string): Promise<JsonValue> {
  const text = await fs.readFile(filename, 'utf8');

  // SAFETY: JSON.parse returns the JSON value the file contains; callers validate each fixture.
  return JSON.parse(text) as JsonValue;
}

async function schemaDocument(name: DocumentName): Promise<JsonObject> {
  const file = name === 'manifest' ? 'skills-manifest.schema.json' : 'skills-map.schema.json';
  const document = await readJson(path.join(schemaDirectory, file));

  if (!isRecord(document)) throw new Error(name + ' schema is not an object');

  return document;
}

async function compileSchema(
  name: DocumentName,
  mutate?: SchemaMutation,
): Promise<ValidateFunction> {
  const schema = structuredClone(await schemaDocument(name));

  mutate?.(schema);

  return createAjv().compile(schema);
}

function parseDocument(name: DocumentName, data: JsonValue) {
  try {
    if (name === 'manifest') parseManifest(data);
    else parseMap(data);

    return {outcome: 'ok', message: ''} satisfies ParseVerdict;
  } catch (error: unknown) {
    return {
      outcome: 'throws',
      message: error instanceof Error ? error.message : String(error),
    } satisfies ParseVerdict;
  }
}

async function fixtureFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const found: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix === '' ? entry.name : prefix + '/' + entry.name;

    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      found.push(...(await fixtureFiles(path.join(directory, entry.name), relative)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      !entry.name.endsWith('.expect.json')
    ) {
      found.push(relative);
    }
  }

  return found;
}

async function loadFixtures(): Promise<Fixture[]> {
  const fixtures: Fixture[] = [];

  for (const relative of await fixtureFiles(fixtureDirectory)) {
    const name = relative.slice(0, -'.json'.length);
    const data = await readJson(path.join(fixtureDirectory, relative));
    const sidecar = await readJson(path.join(fixtureDirectory, name + '.expect.json'));

    if (!isRecord(sidecar)) throw new Error(name + '.expect.json is not an object');

    const document = sidecar['document'];
    const expectedSchemaValid = sidecar['expectedSchemaValid'];
    const expectedParse = sidecar['expectedParse'];
    const parserOnlyRule = sidecar['parserOnlyRule'];
    const reason = sidecar['reason'];

    if (document !== 'manifest' && document !== 'map')
      throw new Error(name + ': document must be manifest or map');

    if (!isBoolean(expectedSchemaValid))
      throw new Error(name + ': expectedSchemaValid must be a boolean');

    if (expectedParse !== 'ok' && expectedParse !== 'throws')
      throw new Error(name + ': expectedParse must be ok or throws');

    if (parserOnlyRule !== undefined && !isString(parserOnlyRule))
      throw new Error(name + ': parserOnlyRule must be a string');

    if (reason !== undefined && !isString(reason))
      throw new Error(name + ': reason must be a string');

    fixtures.push({
      name,
      data,
      expectation: {
        document,
        expectedSchemaValid,
        expectedParse,
        parserOnlyRule,
        reason,
      },
    });
  }

  return fixtures;
}

async function evaluateFixtures(): Promise<Result[]> {
  const results: Result[] = [];

  for (const fixture of await loadFixtures()) {
    const validate = await compileSchema(fixture.expectation.document);
    const parsed = parseDocument(fixture.expectation.document, fixture.data);

    results.push({
      fixture,
      schemaValid: validate(fixture.data) === true,
      parseOutcome: parsed.outcome,
      message: parsed.message,
    });
  }

  return results;
}

test('every registry schema fixture meets its declared expectations', async () => {
  const results = await evaluateFixtures();

  expect(results.length).toBeGreaterThan(60);

  for (const result of results) {
    const {fixture, schemaValid, parseOutcome, message} = result;
    const label = fixture.name + ':';

    expect(schemaValid).toBe(fixture.expectation.expectedSchemaValid);
    expect(parseOutcome).toBe(fixture.expectation.expectedParse);

    if (fixture.expectation.reason !== undefined)
      expect(message, label + ' parser message').toContain(fixture.expectation.reason);

    if (schemaValid && parseOutcome === 'throws')
      expect(
        fixture.expectation.parserOnlyRule,
        label + ' a schema-valid/parser-throws fixture must name a parser-only rule',
      ).toMatch(/^parser-only:/);

    if (!schemaValid)
      expect(parseOutcome, label + ' schema-invalid implies parser-throws').toBe('throws');

    if (parseOutcome === 'ok')
      expect(schemaValid, label + ' parser-ok implies schema-valid').toBe(true);
  }
});

test('harness detects a weakened manifest schema', async () => {
  const missingRegistryId = (await loadFixtures()).find(
    (fixture) => fixture.name === 'manifest/invalid/missing-registry-id',
  );

  if (!missingRegistryId) throw new Error('missing-registry-id fixture is required');

  const weakened = await compileSchema('manifest', (schema) => {
    const required = schema['required'];

    if (!Array.isArray(required)) throw new Error('manifest schema has no required list');

    schema['required'] = required.filter((entry) => entry !== 'registryId');
  });

  // The fixture declares schema-invalid; the weakened schema accepts it, so the harness must report a mismatch.
  expect(weakened(missingRegistryId.data)).toBe(true);
  expect(weakened(missingRegistryId.data)).not.toBe(
    missingRegistryId.expectation.expectedSchemaValid,
  );
});

test('harness detects an over-strict map schema', async () => {
  const withRecommendations = (await loadFixtures()).find(
    (fixture) => fixture.name === 'map/valid/duplicate-reference-strings',
  );

  if (!withRecommendations) throw new Error('duplicate-reference-strings fixture is required');

  const overStrict = await compileSchema('map', (schema) => {
    const properties = schema['properties'];

    if (!isRecord(properties)) throw new Error('map schema has no properties');

    properties['alwaysRecommend'] = {type: 'array', maxItems: 0};
  });

  // The fixture declares schema-valid; the over-strict schema rejects it, so the harness must report a mismatch.
  expect(overStrict(withRecommendations.data)).toBe(false);
  expect(withRecommendations.expectation.expectedSchemaValid).toBe(true);
});

test('schemas bound array sizes at the parser limits', async () => {
  const manifest = await compileSchema('manifest');
  const map = await compileSchema('map');

  const skill = {
    id: 'example/agent-skills/example',
    name: 'example',
    path: 'skills/example/SKILL.md',
  };

  expect(
    manifest({
      schemaVersion: 1,
      registryId: 'example/agent-skills',
      skills: Array.from({length: 20_000}, () => skill),
    }),
  ).toBe(true);
  expect(
    manifest({
      schemaVersion: 1,
      registryId: 'example/agent-skills',
      skills: Array.from({length: 20_001}, () => skill),
    }),
  ).toBe(false);
  expect(map({schemaVersion: 2, registryId: 'example/agent-skills', externalSkills: []})).toBe(
    true,
  );
  expect(
    map({
      schemaVersion: 2,
      registryId: 'example/agent-skills',
      externalSkills: Array.from({length: 20_001}, () => ({
        id: 'acme/upstream/example',
        name: 'example',
        source: 'acme/upstream',
        skill: 'example',
      })),
    }),
  ).toBe(false);
});

test('both schemas share byte-identical definitions', async () => {
  const shared: JsonObject[] = [];

  for (const name of ['manifest', 'map'] as const) {
    const definitions = (await schemaDocument(name))['$defs'];

    if (!isRecord(definitions)) throw new Error(name + ' schema has no $defs');

    shared.push(definitions);
  }

  const [manifestDefinitions, mapDefinitions] = shared;

  const common = Object.keys(manifestDefinitions ?? {}).filter(
    (key) => key in (mapDefinitions ?? {}),
  );

  expect(common.sort((left, right) => left.localeCompare(right))).toEqual([
    'LocalSkillId',
    'NonEmptyArrayItem',
    'Text',
  ]);

  for (const key of common)
    expect(JSON.stringify(manifestDefinitions?.[key]), key).toBe(
      JSON.stringify(mapDefinitions?.[key]),
    );
});

test('schemas only reference local definitions', async () => {
  const references: string[] = [];

  const collect = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry);

      return;
    }

    if (!isRecord(value)) return;

    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && isString(entry)) references.push(entry);

      collect(entry);
    }
  };

  for (const name of ['manifest', 'map'] as const) collect(await schemaDocument(name));

  expect(references.length).toBeGreaterThan(20);

  for (const reference of references) expect(reference).toMatch(/^#\/\$defs\//);
});

test('template documents validate against their schemas and parsers', async () => {
  const documents = [
    {file: 'skills-manifest.json', annotation: './schemas/skills-manifest.schema.json'},
    {file: 'skills-map.json', annotation: './schemas/skills-map.schema.json'},
  ];

  for (const {file, annotation} of documents) {
    const data = await readJson(path.join(templateDirectory, file));
    const name: DocumentName = file === 'skills-manifest.json' ? 'manifest' : 'map';
    const validate = await compileSchema(name);

    expect(validate(data), file + ' schema').toBe(true);
    expect(parseDocument(name, data).outcome, file + ' parser').toBe('ok');

    if (!isRecord(data)) throw new Error(file + ' is not an object');

    expect(data['$schema']).toBe(annotation);
  }
});

test('generated schema guide covers every inventoried field', async () => {
  const guide = await fs.readFile(guideFile, 'utf8');

  for (const field of inventoriedFields) expect(guide, field).toContain('`' + field + '`');
});
