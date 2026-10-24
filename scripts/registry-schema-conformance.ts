// oxlint-disable anti-slop/no-runtime-typeof -- This gate validates dynamic exports and untrusted evaluator results at trust boundaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {isBoolean, isRecord, isString, type JsonObject, type JsonValue} from '../src/lib/values.js';
import {parseManifest, parseMap} from '../src/lib/registry/validate.js';
import {mergeRegistries} from '../src/lib/registry/merge.js';

type DocumentName = 'manifest' | 'map';

type JsonSchema = JsonObject | boolean;

type CliOptions = {template: string; schemas: string};

type ParseVerdict = {outcome: 'ok' | 'throws'; message: string};

type EvaluatorResult = {
  valid: boolean;
  errors: Array<{path: string; keyword: string; message: string}>;
};

type Evaluator = {
  assertSchemaSupported(schema: JsonSchema): void;
  validateSchema(schema: JsonSchema, data: JsonValue): EvaluatorResult;
};

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = path.join(repositoryRoot, 'tests/fixtures/registry-schema');

const schemaFiles: Record<DocumentName, string> = {
  manifest: 'skills-manifest.schema.json',
  map: 'skills-map.schema.json',
};

const instanceFiles: Record<DocumentName, string> = {
  manifest: 'skills-manifest.json',
  map: 'skills-map.json',
};

function parseArguments(args: string[]): CliOptions {
  const result: Record<string, string> = {};

  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];

    if (key !== '--template' && key !== '--schemas') throw new Error(`Unknown argument: ${key}`);
    const value = args[index + 1];

    if (!value || value.startsWith('--')) throw new Error(`${key} requires a directory`);
    result[key.slice(2)] = path.resolve(value);
    index += 1;
  }

  if (!result.template || !result.schemas)
    throw new Error(
      'Usage: registry-schema-conformance --template <candidate-dir> --schemas <schema-dir>',
    );

  return {template: result.template, schemas: result.schemas};
}

async function jsonFile(filename: string): Promise<JsonValue> {
  // SAFETY: Callers validate the JSON shape before accessing document-specific properties.
  return JSON.parse(await fs.readFile(filename, 'utf8')) as JsonValue;
}

async function fixtureFiles(directory: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(directory, {withFileTypes: true});
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory())
      files.push(...(await fixtureFiles(path.join(directory, entry.name), relative)));
    else if (entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.expect.json'))
      files.push(relative);
  }

  return files;
}

function parserVerdict(document: DocumentName, data: JsonValue): ParseVerdict {
  try {
    if (document === 'manifest') parseManifest(data);
    else parseMap(data);

    return {outcome: 'ok', message: ''};
  } catch (error) {
    return {outcome: 'throws', message: error instanceof Error ? error.message : String(error)};
  }
}

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    // strictTypes/strictRequired are style policies, not Draft 2020-12
    // validity rules: keywords such as minLength apply only to strings and
    // required applies only to objects even when no `type` is declared.
    // Keep schema/meta validation and unknown-keyword rejection enabled.
    strict: false,
    strictSchema: true,
    validateSchema: true,
    allErrors: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  });

  for (const keyword of [
    'x-parserOnly',
    'x-normalization',
    'x-builtInTechnologies',
    'x-builtInCombinations',
  ])
    ajv.addKeyword({keyword, valid: true});

  return ajv;
}

function asSchema(value: JsonValue): JsonSchema {
  if (isBoolean(value) || isRecord(value)) return value;

  throw new Error('JSON Schema must be an object or boolean');
}

function requiredValue<T>(values: Map<DocumentName, T>, document: DocumentName, label: string): T {
  const value = values.get(document);

  if (value === undefined) throw new Error(`${label} unavailable for ${document}`);

  return value;
}

function collectParserOnlyRules(schema: JsonValue): Set<string> {
  const rules = new Set<string>();

  const annotations = new Set([
    '$id',
    '$schema',
    'title',
    'description',
    'examples',
    '$comment',
    'default',
    'deprecated',
    'readOnly',
    'writeOnly',
    'x-normalization',
    'x-builtInTechnologies',
    'x-builtInCombinations',
  ]);

  const visit = (value: JsonValue): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);

      return;
    }

    if (!isRecord(value)) return;
    const ownRules = value['x-parserOnly'];

    if (Array.isArray(ownRules)) for (const rule of ownRules) if (isString(rule)) rules.add(rule);

    for (const [key, entry] of Object.entries(value))
      if (key !== 'x-parserOnly' && !annotations.has(key)) visit(entry);
  };

  visit(schema);

  return rules;
}

function checkEvaluatorResult(result: EvaluatorResult, context: string): void {
  if (!result || !isBoolean(result.valid) || !Array.isArray(result.errors))
    throw new Error(`${context}: evaluator returned an invalid result shape`);

  for (const error of result.errors) {
    if (!error || !isString(error.path) || !isString(error.keyword) || !isString(error.message))
      throw new Error(
        `${context}: evaluator errors must include string path, keyword, and message fields`,
      );
  }

  if (!result.valid && result.errors.length === 0)
    throw new Error(`${context}: invalid result must include at least one diagnostic`);
}

async function loadEvaluator(candidate: string): Promise<Evaluator> {
  const modulePath = path.join(candidate, 'scripts/lib/schema-validator.mjs');
  let loaded: Evaluator;

  try {
    // SAFETY: The imported exports are checked for callable entrypoints before invocation.
    loaded = (await import(pathToFileURL(modulePath).href)) as Evaluator;
  } catch (error) {
    throw new Error(
      `BLOCKED: candidate schema evaluator unavailable at ${modulePath}: ${String(error)}`,
    );
  }

  if (
    typeof loaded.assertSchemaSupported !== 'function' ||
    typeof loaded.validateSchema !== 'function'
  )
    throw new Error(
      `BLOCKED: ${modulePath} must export assertSchemaSupported(schema) and validateSchema(schema, data)`,
    );

  return loaded;
}

/** Run independent structural (Ajv), candidate evaluator, and Nosey parser verdicts. */
async function withoutNetwork<T>(operation: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  // SAFETY: The replacement preserves fetch's signature and intentionally rejects every request.
  globalThis.fetch = (async () => {
    attempts += 1;
    throw new Error('offline conformance must not fetch network resources');
  }) as typeof fetch;

  try {
    const result = await operation();

    if (attempts !== 0)
      throw new Error(`offline conformance attempted ${attempts} network request(s)`);

    return result;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function runRegistrySchemaConformance(options: CliOptions) {
  return withoutNetwork(() => runRegistrySchemaConformanceOffline(options));
}

async function runRegistrySchemaConformanceOffline(options: CliOptions) {
  const candidate = path.resolve(options.template);
  const schemasDirectory = path.resolve(options.schemas);
  const evaluator = await loadEvaluator(candidate);
  const schemas = new Map<DocumentName, JsonSchema>();
  const ajv = createAjv();
  const validators = new Map<DocumentName, ReturnType<Ajv2020['compile']>>();
  const parserOnlyRules = new Map<DocumentName, Set<string>>();

  for (const document of ['manifest', 'map'] as const) {
    const schema = await jsonFile(path.join(schemasDirectory, schemaFiles[document]));

    if (!isRecord(schema)) throw new Error(`${schemaFiles[document]} must contain a schema object`);
    schemas.set(document, schema);
    parserOnlyRules.set(document, collectParserOnlyRules(schema));
    evaluator.assertSchemaSupported(schema);
    validators.set(document, ajv.compile(schema));
  }

  const semanticCorpus = await jsonFile(
    path.join(repositoryRoot, 'tests/fixtures/registry-schema-evaluator-cases.json'),
  );

  if (
    !isRecord(semanticCorpus) ||
    !Array.isArray(semanticCorpus.cases) ||
    !Array.isArray(semanticCorpus.unsupported)
  )
    throw new Error('evaluator-cases.json has an invalid corpus shape');

  for (const item of semanticCorpus.cases) {
    if (
      !isRecord(item) ||
      !isString(item.name) ||
      !isBoolean(item.valid) ||
      item.schema === undefined
    )
      throw new Error('evaluator-cases.json contains a malformed supported case');
    const schema = asSchema(item.schema);

    evaluator.assertSchemaSupported(schema);
    const reference = createAjv().compile(schema);
    const expected = item.valid;
    const ajvValid = reference(item.data) === true;
    const candidateResult = evaluator.validateSchema(schema, item.data);
    checkEvaluatorResult(candidateResult, item.name);

    if (ajvValid !== expected || candidateResult.valid !== expected)
      throw new Error(
        `${item.name}: semantic expectation=${expected}, Ajv=${ajvValid}, candidate=${candidateResult.valid}`,
      );

    if (item.expectedError !== undefined) {
      const expectedError = item.expectedError;

      if (
        !isRecord(expectedError) ||
        !isString(expectedError.path) ||
        !isString(expectedError.keyword)
      )
        throw new Error(`${item.name}: expected diagnostic path and keyword were not returned`);
      const expectedPath = expectedError.path;
      const expectedKeyword = expectedError.keyword;

      if (
        !candidateResult.errors.some(
          ({path: errorPath, keyword, message}) =>
            errorPath === expectedPath && keyword === expectedKeyword && message.length > 0,
        )
      )
        throw new Error(`${item.name}: expected diagnostic path and keyword were not returned`);
    }
  }

  for (const item of semanticCorpus.unsupported) {
    if (!isRecord(item) || !isString(item.name) || item.schema === undefined)
      throw new Error('evaluator-cases.json contains a malformed unsupported case');
    let rejected = false;

    try {
      evaluator.assertSchemaSupported(asSchema(item.schema));
    } catch {
      rejected = true;
    }

    if (!rejected)
      throw new Error(
        `${item.name}: assertSchemaSupported accepted an unsupported or invalid schema`,
      );
  }

  const identityFixtureRoot = path.join(candidate, 'scripts/test/fixtures/identity/v1');

  const annotationValues = await jsonFile(
    path.join(identityFixtureRoot, 'schema-annotation-values.json'),
  );

  if (!Array.isArray(annotationValues) || annotationValues.length !== 6)
    throw new Error('identity schema annotation corpus must list all six JSON value types');

  const annotationBase = {
    map: await jsonFile(path.join(identityFixtureRoot, 'configure-success/input/skills-map.json')),
    manifest: await jsonFile(
      path.join(identityFixtureRoot, 'configure-success/input/skills-manifest.json'),
    ),
  };

  for (const entry of annotationValues) {
    if (!isRecord(entry) || !isString(entry.type) || !Object.hasOwn(entry, 'value'))
      throw new Error('identity schema annotation corpus contains a malformed value');

    for (const document of ['map', 'manifest'] as const) {
      const data = structuredClone(annotationBase[document]);

      if (!isRecord(data)) throw new Error(`identity ${document} fixture must be an object`);
      data['$schema'] = entry.value;
      const ajvValid = requiredValue(validators, document, 'Ajv validator')(data) === true;

      const candidateResult = evaluator.validateSchema(
        requiredValue(schemas, document, 'schema'),
        data,
      );

      checkEvaluatorResult(candidateResult, `annotation/${entry.type}/${document}`);
      const parser = parserVerdict(document, data);

      if (!ajvValid || !candidateResult.valid || parser.outcome !== 'ok')
        throw new Error(
          `instance $schema value type ${entry.type} changed ${document} validation (Ajv=${ajvValid}, evaluator=${candidateResult.valid}, parser=${parser.outcome})`,
        );
    }
  }

  const results: Array<{
    name: string;
    document: DocumentName;
    expectedSchemaValid: boolean;
    ajvValid: boolean;
    evaluatorValid: boolean;
    expectedParse: 'ok' | 'throws';
    parserOutcome: 'ok' | 'throws';
  }> = [];

  for (const relative of await fixtureFiles(fixtureRoot)) {
    const name = relative.slice(0, -'.json'.length);
    const data = await jsonFile(path.join(fixtureRoot, relative));
    const sidecar = await jsonFile(path.join(fixtureRoot, `${name}.expect.json`));

    if (!isRecord(sidecar)) throw new Error(`${name}.expect.json must be an object`);
    const documentValue = sidecar.document;
    const expectedSchemaValid = sidecar.expectedSchemaValid;
    const expectedParse = sidecar.expectedParse;

    if (
      (documentValue !== 'manifest' && documentValue !== 'map') ||
      !isBoolean(expectedSchemaValid) ||
      (expectedParse !== 'ok' && expectedParse !== 'throws')
    )
      throw new Error(`${name}.expect.json has invalid independent verdict fields`);
    const document: DocumentName = documentValue;
    const expectedParseOutcome: 'ok' | 'throws' = expectedParse;

    if (sidecar.parserOnlyRule !== undefined && !isString(sidecar.parserOnlyRule))
      throw new Error(`${name}.expect.json parserOnlyRule must be a string`);

    const candidateResult = evaluator.validateSchema(
      requiredValue(schemas, document, 'schema'),
      data,
    );

    checkEvaluatorResult(candidateResult, name);
    const parser = parserVerdict(document, data);

    const result = {
      name,
      document,
      expectedSchemaValid,
      ajvValid: requiredValue(validators, document, 'Ajv validator')(data) === true,
      evaluatorValid: candidateResult.valid,
      expectedParse: expectedParseOutcome,
      parserOutcome: parser.outcome,
    };

    results.push(result);
    const context = `${name} [schema expected=${expectedSchemaValid}, Ajv=${result.ajvValid}, evaluator=${result.evaluatorValid}; parser expected=${expectedParse}, actual=${parser.outcome}]`;

    if (result.ajvValid !== expectedSchemaValid)
      throw new Error(`${context}: independent structural expectation disagrees with Ajv`);

    if (result.evaluatorValid !== expectedSchemaValid)
      throw new Error(
        `${context}: candidate evaluator disagrees with expected schema verdict (${JSON.stringify(candidateResult.errors)})`,
      );

    if (parser.outcome !== expectedParseOutcome)
      throw new Error(`${context}: Nosey parser verdict mismatch (${parser.message})`);

    if (!expectedSchemaValid && expectedParseOutcome === 'ok')
      throw new Error(`${context}: Nosey parser accepted schema-invalid data`);

    if (
      expectedSchemaValid &&
      expectedParseOutcome === 'throws' &&
      !(isString(sidecar.parserOnlyRule) && sidecar.parserOnlyRule.startsWith('parser-only:'))
    )
      throw new Error(`${context}: parser-only rejection must be explicitly named`);

    if (
      expectedSchemaValid &&
      expectedParseOutcome === 'throws' &&
      (!isString(sidecar.parserOnlyRule) ||
        !requiredValue(parserOnlyRules, document, 'parser-only rule set').has(
          sidecar.parserOnlyRule,
        ))
    )
      throw new Error(`${context}: parser-only rule is not declared in the checked-out schema`);

    if (expectedSchemaValid && expectedParse === 'ok' && sidecar.parserOnlyRule !== undefined)
      throw new Error(`${context}: parserOnlyRule is only valid for parser-only rejects`);
  }

  const identityRoot = path.join(candidate, 'scripts/test/fixtures/identity/v1');

  const identityEntries = (await fs.readdir(identityRoot, {withFileTypes: true})).filter((entry) =>
    entry.isDirectory(),
  );

  if (identityEntries.length === 0)
    throw new Error(`BLOCKED: candidate identity fixture suite unavailable at ${identityRoot}`);

  for (const entry of identityEntries) {
    const name = entry.name;
    const inputRoot = path.join(identityRoot, name, 'input');
    let identityCase: JsonValue;

    try {
      identityCase = await jsonFile(path.join(inputRoot, 'case.json'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }

    if (!isRecord(identityCase) || !isRecord(identityCase.layers))
      throw new Error(`identity fixture ${name} has no independent layer verdicts`);
    const parsedDocuments: Partial<Record<DocumentName, JsonValue>> = {};
    const parseOutcomes: Array<'ok' | 'throws'> = [];
    const schemaOutcomes: boolean[] = [];

    const schemaDocumentExpectations = isRecord(identityCase.schemaDocuments)
      ? identityCase.schemaDocuments
      : undefined;

    const parserDocumentExpectations = isRecord(identityCase.parserDocuments)
      ? identityCase.parserDocuments
      : undefined;

    const hasSchemaDocumentExpectations = schemaDocumentExpectations !== undefined;
    const hasParserDocumentExpectations = parserDocumentExpectations !== undefined;

    for (const document of ['map', 'manifest'] as const) {
      let data: JsonValue;

      try {
        data = await jsonFile(path.join(inputRoot, instanceFiles[document]));
      } catch (error) {
        if (error instanceof SyntaxError) {
          parseOutcomes.push('throws');
          continue;
        }

        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
        throw error;
      }

      parsedDocuments[document] = data;

      const declaredSchema = hasSchemaDocumentExpectations
        ? schemaDocumentExpectations[document]
        : identityCase.layers.schema;

      const declaredParser = hasParserDocumentExpectations
        ? parserDocumentExpectations[document]
        : identityCase.layers.parser;

      if (declaredSchema === 'pass' || declaredSchema === 'fail') {
        const ajvValid = requiredValue(validators, document, 'Ajv validator')(data) === true;
        schemaOutcomes.push(ajvValid);

        const candidateResult = evaluator.validateSchema(
          requiredValue(schemas, document, 'schema'),
          data,
        );

        checkEvaluatorResult(candidateResult, `identity/${name}/${document}`);

        if (
          ajvValid !== candidateResult.valid ||
          ((hasSchemaDocumentExpectations || identityCase.layers.schema === 'pass') &&
            ajvValid !== (declaredSchema === 'pass'))
        )
          throw new Error(
            `identity ${name} ${document} schema mismatch: expected=${declaredSchema}, Ajv=${ajvValid}, evaluator=${candidateResult.valid}`,
          );
      }

      const parsed = parserVerdict(document, data);
      parseOutcomes.push(parsed.outcome);

      if (
        ((hasParserDocumentExpectations || identityCase.layers.parser === 'pass') &&
          declaredParser === 'pass' &&
          parsed.outcome !== 'ok') ||
        (hasParserDocumentExpectations && declaredParser === 'fail' && parsed.outcome !== 'throws')
      )
        throw new Error(
          `identity ${name} ${document} parser mismatch: expected=${declaredParser}, actual=${parsed.outcome} (${parsed.message})`,
        );

      if (
        declaredSchema === 'pass' &&
        parsed.outcome === 'ok' &&
        requiredValue(validators, document, 'Ajv validator')(data) !== true
      )
        throw new Error(`identity ${name} ${document}: Nosey parser accepted schema-invalid data`);
      results.push({
        name: `identity/${name}/${document}`,
        document,
        expectedSchemaValid: requiredValue(validators, document, 'Ajv validator')(data) === true,
        ajvValid: requiredValue(validators, document, 'Ajv validator')(data) === true,
        evaluatorValid: evaluator.validateSchema(requiredValue(schemas, document, 'schema'), data)
          .valid,
        expectedParse: parsed.outcome,
        parserOutcome: parsed.outcome,
      });
    }

    const parserLayer = identityCase.layers.parser;

    if (
      parserLayer === 'pass' &&
      (parseOutcomes.length === 0 || parseOutcomes.some((outcome) => outcome !== 'ok'))
    )
      throw new Error(
        `identity ${name}: aggregate parser verdict says pass but input parser outcomes were ${JSON.stringify(parseOutcomes)}`,
      );

    if (parserLayer === 'fail' && !parseOutcomes.includes('throws'))
      throw new Error(
        `identity ${name}: aggregate parser verdict says fail but all input documents parsed`,
      );

    if (
      identityCase.layers.schema === 'pass' &&
      (schemaOutcomes.length === 0 || schemaOutcomes.some((valid) => !valid))
    )
      throw new Error(
        `identity ${name}: aggregate schema verdict says pass but a document failed structural validation`,
      );

    if (identityCase.layers.schema === 'fail' && !schemaOutcomes.some((valid) => !valid))
      throw new Error(
        `identity ${name}: aggregate schema verdict says fail but all documents validated`,
      );

    if (
      identityCase.layers.integration === 'pass' &&
      parsedDocuments.map &&
      parsedDocuments.manifest
    ) {
      const parsedMap = parseMap(parsedDocuments.map);
      const parsedManifest = parseManifest(parsedDocuments.manifest);

      const merged = mergeRegistries([
        {source: `identity-${name}`, map: parsedMap, manifest: parsedManifest},
      ]);

      if (merged.warnings.length !== 0)
        throw new Error(
          `identity ${name} integration expected merge success, warnings=${JSON.stringify(merged.warnings)}`,
        );

      if (
        Array.isArray(identityCase.expectedFiles) &&
        identityCase.expectedFiles.includes('skills-map.json') &&
        identityCase.expectedFiles.includes('skills-manifest.json')
      ) {
        const expectedRoot = path.join(identityRoot, name, 'expected');
        const expectedMap = await jsonFile(path.join(expectedRoot, instanceFiles.map));
        const expectedManifest = await jsonFile(path.join(expectedRoot, instanceFiles.manifest));

        const expectedDocuments: Array<[DocumentName, JsonValue]> = [
          ['map', expectedMap],
          ['manifest', expectedManifest],
        ];

        for (const [document, data] of expectedDocuments) {
          const ajvValid = requiredValue(validators, document, 'Ajv validator')(data) === true;

          const candidateResult = evaluator.validateSchema(
            requiredValue(schemas, document, 'schema'),
            data,
          );

          checkEvaluatorResult(candidateResult, `identity/${name}/expected/${document}`);
          const parsed = parserVerdict(document, data);

          if (!ajvValid || !candidateResult.valid || parsed.outcome !== 'ok')
            throw new Error(
              `identity ${name} expected ${document} must remain schema-valid and parser-valid (Ajv=${ajvValid}, evaluator=${candidateResult.valid}, parser=${parsed.outcome})`,
            );
          results.push({
            name: `identity/${name}/expected/${document}`,
            document,
            expectedSchemaValid: true,
            ajvValid,
            evaluatorValid: candidateResult.valid,
            expectedParse: 'ok',
            parserOutcome: parsed.outcome,
          });
        }

        const expectedMerge = mergeRegistries([
          {
            source: `identity-${name}-expected`,
            map: parseMap(expectedMap),
            manifest: parseManifest(expectedManifest),
          },
        ]);

        if (expectedMerge.warnings.length !== 0)
          throw new Error(
            `identity ${name} expected output failed Nosey merge: ${JSON.stringify(expectedMerge.warnings)}`,
          );
      }

      if (name === 'configure-success') {
        const externalId = parsedMap.externalSkills?.[0]?.id;

        if (
          !isString(externalId) ||
          !externalId.startsWith(parsedMap.registryId + '/') ||
          parsedManifest.skills.some(({id}) => id === externalId)
        )
          throw new Error(
            'identity configure-success must retain an external ID sharing the registry prefix without becoming local',
          );

        const hasBuiltinReference =
          parsedMap.combinations.some(({requires}) => requires.includes('react')) &&
          merged.registry.technologies.some(({id}) => id === 'react');

        if (!hasBuiltinReference)
          throw new Error(
            'identity configure-success must exercise a resolved built-in technology reference',
          );
      }
    }
  }

  return {
    candidate,
    schemasDirectory,
    count: results.length,
    semanticCaseCount: semanticCorpus.cases.length,
    unsupportedSchemaCount: semanticCorpus.unsupported.length,
    annotationCaseCount: annotationValues.length * 2,
    results,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runRegistrySchemaConformance(parseArguments(process.argv.slice(2)));
    console.log(
      `Schema conformance passed: ${result.count} registry fixtures, ${result.semanticCaseCount} semantic cases, and ${result.annotationCaseCount} annotation cases; ${result.unsupportedSchemaCount} unsupported schemas rejected; Ajv 2020, candidate evaluator, and Nosey parser verdicts independently matched.`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = String(error).includes('BLOCKED:') ? 2 : 1;
  }
}
