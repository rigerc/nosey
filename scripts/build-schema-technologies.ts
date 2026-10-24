#!/usr/bin/env node
// Rewrite informational built-in inventories from Nosey's runtime maps. These
// annotations are reference metadata, not validation rules.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

import {COMBO_SKILLS_MAP, SKILLS_MAP} from '../src/data/skills-map.ts';

const schemaFile = fileURLToPath(
  new URL('../schemas/registry/skills-map.schema.json', import.meta.url),
);

const check = process.argv.includes('--check');
const requiredAnchor = '  "required": ["schemaVersion", "registryId"],\n';
const annotationPattern = /^ {2}"x-builtInTechnologies": \[\n[\s\S]*?\n {2}\],\n/m;
const combinationsPattern = /^ {2}"x-builtInCombinations": \[\n[\s\S]*?\n {2}\],\n/m;

export type BuiltInTechnology = {id: string; name: string};

export type BuiltInCombination = {id: string; name: string};

/** Built-in technologies in a stable order for reproducible schema bytes. */
export function builtInTechnologies(): BuiltInTechnology[] {
  return SKILLS_MAP.map(({id, name}) => ({id, name})).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

/** Built-in combinations in a stable order for reproducible schema bytes. */
export function builtInCombinations(): BuiltInCombination[] {
  return COMBO_SKILLS_MAP.map(({id, name}) => ({id, name})).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function renderAnnotation(entries: BuiltInTechnology[]): string {
  const lines = entries.map(
    ({id, name}) => '    {"id": ' + JSON.stringify(id) + ', "name": ' + JSON.stringify(name) + '}',
  );

  return '  "x-builtInTechnologies": [\n' + lines.join(',\n') + '\n  ],\n';
}

function renderCombinationsAnnotation(entries: BuiltInCombination[]): string {
  const lines = entries.map(
    ({id, name}) => '    {"id": ' + JSON.stringify(id) + ', "name": ' + JSON.stringify(name) + '}',
  );

  return '  "x-builtInCombinations": [\n' + lines.join(',\n') + '\n  ],\n';
}

/** Replace the annotation in place, or insert it after the top-level required list. */
export function renderSchema(source: string): string {
  const annotation = renderAnnotation(builtInTechnologies());
  const combinationsAnnotation = renderCombinationsAnnotation(builtInCombinations());

  let rendered = annotationPattern.test(source)
    ? source.replace(annotationPattern, () => annotation)
    : source;

  if (!annotationPattern.test(source)) {
    if (!rendered.includes(requiredAnchor)) {
      throw new Error('skills-map schema is missing its top-level required list');
    }

    rendered = rendered.replace(requiredAnchor, requiredAnchor + annotation);
  }

  if (combinationsPattern.test(rendered))
    return rendered.replace(combinationsPattern, () => combinationsAnnotation);

  const technologyAnnotation = annotationPattern.exec(rendered)?.[0];

  if (!technologyAnnotation)
    throw new Error('skills-map schema is missing builtin technology metadata');

  return rendered.replace(technologyAnnotation, technologyAnnotation + combinationsAnnotation);
}

async function main(): Promise<void> {
  const source = await readFile(schemaFile, 'utf8');
  const rendered = renderSchema(source);

  if (check) {
    if (rendered !== source) {
      process.stderr.write(
        'skills-map schema built-in metadata is stale: run npm run schema:technologies\n',
      );
      process.exitCode = 1;

      return;
    }

    process.stdout.write('skills-map schema built-in metadata is current\n');

    return;
  }

  if (rendered === source) {
    process.stdout.write('skills-map schema built-in technologies are already current\n');

    return;
  }

  await writeFile(schemaFile, rendered);
  process.stdout.write(
    'Updated skills-map schema with ' +
      builtInTechnologies().length +
      ' technologies and ' +
      builtInCombinations().length +
      ' combinations\n',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
