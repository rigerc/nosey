import {test, expect, vi} from 'vite-plus/test';
import {registryName, suggestRegistryId, type SuggestRunner} from '../src/lib/registry/suggest.js';

const gh = (stdout: string): SuggestRunner => vi.fn<SuggestRunner>(async () => stdout);

test('suggests the authenticated gh account and the destination directory', async () => {
  const run = gh('rigerc\n');
  await expect(suggestRegistryId('/tmp/team-skills', {run})).resolves.toBe('rigerc/team-skills');
  expect(run).toHaveBeenCalledWith('gh', ['api', 'user', '--jq', '.login']);
});

test('suggests the documented default directory name', async () => {
  await expect(suggestRegistryId('./my-skills-registry', {run: gh('rigerc')})).resolves.toBe(
    'rigerc/my-skills-registry',
  );
});

test('sanitizes directory names that are not valid repository segments', async () => {
  await expect(suggestRegistryId('/tmp/My Skills!', {run: gh('rigerc')})).resolves.toBe(
    'rigerc/My-Skills',
  );
  expect(registryName('/tmp/team.skills.')).toBe('team.skills');
  expect(registryName('/')).toBe('my-skills-registry');
});

test('omits the suggestion when gh is unavailable or the account is not valid', async () => {
  const failing: SuggestRunner = vi.fn(async () => {
    throw new Error('gh: command not found');
  });

  await expect(suggestRegistryId('/tmp/new', {run: failing})).resolves.toBeUndefined();
  await expect(suggestRegistryId('/tmp/new', {run: gh('bad login!')})).resolves.toBeUndefined();
  await expect(suggestRegistryId('/tmp/new', {run: gh('')})).resolves.toBeUndefined();
});
