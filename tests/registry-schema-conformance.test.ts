import {test, expect} from 'vite-plus/test';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runRegistrySchemaConformance} from '../scripts/registry-schema-conformance.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

test('candidate schema gate is explicitly blocked when its evaluator is absent', async () => {
  const missing = path.join(
    repositoryRoot,
    'tests/fixtures/registry-schema/no-candidate-evaluator',
  );

  await expect(
    runRegistrySchemaConformance({
      template: missing,
      schemas: path.join(repositoryRoot, 'schemas/registry'),
    }),
  ).rejects.toThrow(/BLOCKED: candidate schema evaluator unavailable/);
});

test('schema conformance command requires explicit candidate and schema directories', async () => {
  const script = path.join(repositoryRoot, 'scripts/registry-schema-conformance.ts');
  const {spawnSync} = await import('node:child_process');

  const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });

  expect(result.status).toBe(1);
  expect(result.stderr).toContain('--template <candidate-dir> --schemas <schema-dir>');
});
