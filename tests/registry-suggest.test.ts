import {test, expect, vi} from 'vite-plus/test';
import {githubClient} from '../src/lib/registry/github.js';
import {registryName, suggestRegistryId} from '../src/lib/registry/suggest.js';

const client = (login: string) => githubClient('test-token', async () => Response.json({login}));

test('suggests the authenticated GitHub account and the destination directory', async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({login: 'rigerc'}));
  const github = githubClient('test-token', transport);
  await expect(suggestRegistryId('/tmp/team-skills', {github})).resolves.toBe('rigerc/team-skills');
  expect(transport).toHaveBeenCalledWith(
    'https://api.github.com/user',
    expect.objectContaining({method: 'GET'}),
  );
});

test('suggests the documented default directory name', async () => {
  await expect(suggestRegistryId('./my-skills-registry', {github: client('rigerc')})).resolves.toBe(
    'rigerc/my-skills-registry',
  );
});

test('sanitizes directory names that are not valid repository segments', async () => {
  await expect(suggestRegistryId('/tmp/My Skills!', {github: client('rigerc')})).resolves.toBe(
    'rigerc/My-Skills',
  );
  expect(registryName('/tmp/team.skills.')).toBe('team.skills');
  expect(registryName('/')).toBe('my-skills-registry');
});

test('omits the suggestion when authentication fails or the account is not valid', async () => {
  const github = githubClient('test-token', async () =>
    Response.json({message: 'Bad credentials'}, {status: 401}),
  );

  await expect(suggestRegistryId('/tmp/new', {github})).resolves.toBeUndefined();
  await expect(
    suggestRegistryId('/tmp/new', {github: client('bad login!')}),
  ).resolves.toBeUndefined();
  await expect(suggestRegistryId('/tmp/new', {github: client('')})).resolves.toBeUndefined();
});
