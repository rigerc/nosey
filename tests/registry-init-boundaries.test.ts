import {test, expect} from 'vite-plus/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {isString} from '../src/lib/values.js';

type BoundaryCase = {name: string};

type BoundaryCorpus = {
  version: 1;
  githubTemplate: BoundaryCase[];
  archive: BoundaryCase[];
  execution: string;
};

const filename = fileURLToPath(
  new URL('./fixtures/registry-init-boundaries.json', import.meta.url),
);

// This is only a fixture integrity check. N03 transport/runtime behavior tests
// must consume these inputs; listing them here does not prove that behavior.
test('N03 init boundary inputs remain well-formed and uniquely named', async () => {
  // SAFETY: This checked-in fixture is parsed as its named test contract and its required cases are asserted below.
  const corpus = JSON.parse(await readFile(filename, 'utf8')) as BoundaryCorpus;
  expect(corpus.version).toBe(1);
  expect(Array.isArray(corpus.githubTemplate)).toBe(true);
  expect(Array.isArray(corpus.archive)).toBe(true);
  expect(corpus.execution).toContain('No network transport or acquired template code');

  for (const cases of [corpus.githubTemplate, corpus.archive]) {
    expect(cases.length).toBeGreaterThan(0);
    expect(cases.every((item) => isString(item.name) && item.name.length > 0)).toBe(true);
    expect(new Set(cases.map(({name}) => name)).size).toBe(cases.length);
  }
});
