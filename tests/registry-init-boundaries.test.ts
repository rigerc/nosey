import {test, expect} from 'vite-plus/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

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

test('offline init boundary inputs preserve the GitHub and archive release contracts', async () => {
  // SAFETY: This checked-in fixture is parsed as its named test contract and its required cases are asserted below.
  const corpus = JSON.parse(await readFile(filename, 'utf8')) as BoundaryCorpus;
  expect(corpus).toMatchObject({version: 1});

  const github = corpus.githubTemplate;
  const archive = corpus.archive;
  expect(Array.isArray(github)).toBe(true);
  expect(Array.isArray(archive)).toBe(true);
  expect(github).toHaveLength(5);
  expect(archive).toHaveLength(8);
  const githubNames = github.map(({name}) => name);
  expect(githubNames).toEqual(
    expect.arrayContaining([
      'head_matches_approved_sha',
      'head_mismatch_before_create',
      'head_moves_during_create',
      'same_tree_different_commit',
      'postclone_tree_mismatch',
    ]),
  );
  const archiveNames = archive.map(({name}) => name);
  expect(archiveNames).toEqual(
    expect.arrayContaining([
      'sha256_mismatch',
      'path_traversal',
      'symlink_or_hardlink',
      'unsupported_entry_type',
      'entry_count_limit',
      'expanded_byte_limit',
      'download_timeout_or_size_limit',
      'destination_reservation_conflict',
    ]),
  );
  expect(corpus.execution).toContain('No network transport or acquired template code');
});
