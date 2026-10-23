#!/usr/bin/env node
// Rewrite the informational x-builtInTechnologies annotation in the skills-map
// schema from Nosey's built-in SKILLS_MAP. Built-in technologies are runtime
// data, not validation rules, so the annotation never constrains the schema.
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import process from 'node:process';

import {SKILLS_MAP} from '../src/data/skills-map.ts';

const schemaFile = fileURLToPath(
  new URL('../schemas/registry/skills-map.schema.json', import.meta.url),
);

const check = process.argv.includes('--check');
const requiredAnchor = '  "required": ["schemaVersion", "registryId"],\n';
const annotationPattern = /^ {2}"x-builtInTechnologies": \[\n[\s\S]*?\n {2}\],\n/m;

export type BuiltInTechnology = {id: string; name: string};

/** Built-in technologies in a stable order for reproducible schema bytes. */
export function builtInTechnologies(): BuiltInTechnology[] {
  return SKILLS_MAP.map(({id, name}) => ({id, name})).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function renderAnnotation(entries: BuiltInTechnology[]): string {
  const lines = entries.map(
    ({id, name}) => '    {"id": ' + JSON.stringify(id) + ', "name": ' + JSON.stringify(name) + '}',
  );

  return '  "x-builtInTechnologies": [\n' + lines.join(',\n') + '\n  ],\n';
}

/** Replace the annotation in place, or insert it after the top-level required list. */
export function renderSchema(source: string): string {
  const annotation = renderAnnotation(builtInTechnologies());

  if (annotationPattern.test(source)) return source.replace(annotationPattern, () => annotation);

  if (!source.includes(requiredAnchor)) {
    throw new Error('skills-map schema is missing its top-level required list');
  }

  return source.replace(requiredAnchor, requiredAnchor + annotation);
}

async function main(): Promise<void> {
  const source = await readFile(schemaFile, 'utf8');
  const rendered = renderSchema(source);

  if (check) {
    if (rendered !== source) {
      process.stderr.write(
        'skills-map schema built-in technologies are stale: run npm run schema:technologies\n',
      );
      process.exitCode = 1;

      return;
    }

    process.stdout.write('skills-map schema built-in technologies are current\n');

    return;
  }

  if (rendered === source) {
    process.stdout.write('skills-map schema built-in technologies are already current\n');

    return;
  }

  await writeFile(schemaFile, rendered);
  process.stdout.write(
    'Updated skills-map schema with ' + builtInTechnologies().length + ' built-in technologies\n',
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
