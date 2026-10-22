import {isFunction} from '../src/lib/values.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  RemoteSource,
  build,
  checkSkillMd,
  combineCandidates,
  fetchTree,
  fromGold,
  parseOptions,
  pathFromGithubUrl,
  rawSkillUrl,
  readFrontmatter,
  skillMdCandidates,
  treeResolver,
} from './build-skills-catalog.ts';

const fixture = (name = 'foo', path = `skills/${name}/SKILL.md`, more = {}) => ({
  id: `owner/repo/${name}`,
  name,
  publisher: 'owner',
  repository: 'owner/repo',
  repository_url: 'https://github.com/owner/repo',
  github_url: `https://github.com/owner/repo/tree/main/skills/${name}`,
  skill_md_path: path,
  description: null,
  category: null,
  classification: null,
  tags: [],
  sources: ['gold-basket'],
  ...more,
});

const md = (name = 'foo', description = 'A test skill') =>
  `---\nname: ${name}\ndescription: ${description}\n---\nHello\n`;

const treeUrl = 'https://api.github.com/repos/owner/repo/git/trees/HEAD?recursive=1';
const response = (body = '', status = 200, headers = {}) => new Response(body, {status, headers});

const bodyTree = (paths, truncated = false) =>
  JSON.stringify({
    sha: 'x',
    truncated,
    tree: paths.map((path) => ({path, type: 'blob'})),
  });

const mock =
  (map = {}, visits = []) =>
  async (url, init) => {
    visits.push({url, headers: init.headers});
    const value = map[url];

    if (value instanceof Error) throw value;

    if (isFunction(value)) return value(url, init);

    if (value instanceof Response) return value.clone();

    return response('', 404);
  };

const source = (map = {}, visits = []) =>
  new RemoteSource({cacheDir: null, fetcher: mock(map, visits)});

async function expireCache(dir, url) {
  const key = createHash('sha1').update(url).digest('hex');
  const file = join(dir, `${key}.json`);
  const entry = JSON.parse(await readFile(file, 'utf8'));
  entry.fetched_at = '2000-01-01T00:00:00.000Z';
  await writeFile(file, JSON.stringify(entry));
}

// A warm cache and --cache-ttl 0 form a reproducible offline snapshot.
void test('disk cache is shared, makes zero requests when warm, and rejects corrupt bodies', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-cache-'));

  try {
    const url = 'https://raw.githubusercontent.com/owner/repo/HEAD/foo/SKILL.md';
    let calls = 0;

    const first = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: async () => {
        calls++;

        return response(md());
      },
    });

    assert.equal((await first.resource(url)).cache, 'miss');

    const second = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: async () => {
        throw Error('Network should not be used');
      },
    });

    assert.equal((await second.resource(url)).cache, 'hit');
    assert.equal(calls, 1);
    // Cache body corruption invalidates entry and causes a new request.
    const {createHash} = await import('node:crypto');
    const key = createHash('sha1').update(url).digest('hex');
    await writeFile(join(dir, `${key}.body`), 'broken');

    const third = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: async () => {
        calls++;

        return response(md());
      },
    });

    assert.equal((await third.resource(url)).cache, 'miss');
    assert.equal(calls, 2);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

void test('stale entries are conditionally revalidated with ETag', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-etag-'));

  try {
    const url = 'https://example.com/SKILL.md';
    const visits = [];

    const first = new RemoteSource({
      cacheDir: dir,
      fetcher: mock({[url]: response(md(), 200, {etag: '"abc"'})}),
    });

    await first.resource(url);
    await expireCache(dir, url);

    const second = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 1,
      fetcher: mock(
        {
          [url]: (_url, init) => {
            assert.equal(init.headers['If-None-Match'], '"abc"');

            return new Response(null, {status: 304});
          },
        },
        visits,
      ),
    });

    const res = await second.resource(url);
    assert.equal(res.cache, 'revalidated');
    assert.equal(res.body, md());
    assert.equal(visits.length, 1);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

void test('auth headers are only used for api.github.com', async () => {
  const visits = [];

  const s = new RemoteSource({
    cacheDir: null,
    tokens: [{host: 'api.github.com', headers: {Authorization: 'Bearer secret'}}],
    fetcher: mock({}, visits),
  });

  await s.resource('https://api.github.com/hello');
  await s.resource('https://raw.githubusercontent.com/hello');
  await s.resource('https://officialskills.sh/hello');
  assert.equal(visits[0].headers.Authorization, 'Bearer secret');
  assert.equal(visits[1].headers.Authorization, undefined);
  assert.equal(visits[2].headers.Authorization, undefined);
});

void test('recorded path comes first; candidate casing is preserved', () => {
  const s = fixture('foo', 'skills/foo/SKILL.md', {
    github_url: 'https://github.com/owner/repo/tree/main/outdated/foo',
  });

  assert.deepEqual(skillMdCandidates(s).slice(0, 4), [
    'skills/foo/SKILL.md',
    'skills/foo/skill.md',
    'outdated/foo/SKILL.md',
    'outdated/foo/skill.md',
  ]);
});

void test('README GitHub blob URL cannot be treated as SKILL.md', () => {
  assert.equal(pathFromGithubUrl('https://github.com/owner/repo/blob/main/README.md'), null);
  assert.equal(
    pathFromGithubUrl('https://github.com/owner/repo/blob/main/skills/foo/SKILL.md'),
    'skills/foo/SKILL.md',
  );
});

void test('frontmatter parser requires both YAML fences and reads name', () => {
  assert.equal(readFrontmatter(md()).name, 'foo');
  assert.equal(readFrontmatter('---\nname: foo\nNo closing fence').has_frontmatter, false);
  assert.equal(readFrontmatter('\uFEFF---\r\nname: "my-skill"\r\n---\r\n').name, 'my-skill');
});

void test('first valid sighting is never-seen; identical repeat ok; new bytes changed', async () => {
  const skill = fixture();
  const url = rawSkillUrl(skill.repository, skill.skill_md_path);
  const first = await checkSkillMd(source({[url]: response(md())}), skill, null, null);
  assert.equal(first.reason, 'never-seen');
  assert.equal(first.changed_since_last_build, null);
  assert.equal(first.outdated, false);
  const same = await checkSkillMd(source({[url]: response(md())}), skill, first, null);
  assert.equal(same.reason, 'ok');
  assert.equal(same.changed_since_last_build, false);

  const changed = await checkSkillMd(
    source({[url]: response(md('foo', 'new text'))}),
    skill,
    first,
    null,
  );

  assert.equal(changed.reason, 'changed');
  assert.equal(changed.changed_since_last_build, true);
  assert.equal(changed.outdated, true);
});

void test('recorded path wins even when obsolete GitHub link also answers', async () => {
  const skill = fixture('foo', 'skills/foo/SKILL.md', {
    github_url: 'https://github.com/owner/repo/tree/main/old/foo',
  });

  const s = source({
    [rawSkillUrl(skill.repository, 'skills/foo/SKILL.md')]: response(md()),
    [rawSkillUrl(skill.repository, 'old/foo/SKILL.md')]: response(md()),
  });

  const result = await checkSkillMd(s, skill, null);
  assert.equal(result.path, 'skills/foo/SKILL.md');
  assert.equal(result.moved, false);
});

void test('lowercase skill.md is reachable as a separate case-sensitive path', async () => {
  const skill = fixture();

  const check = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'skills/foo/skill.md')]: response(md()),
    }),
    skill,
    null,
  );

  assert.equal(check.path, 'skills/foo/skill.md');
  assert.equal(check.reason, 'moved');
});

void test('wrong frontmatter in recorded file does not mask valid fallback', async () => {
  const skill = fixture('foo', 'old/foo/SKILL.md', {
    github_url: 'https://github.com/owner/repo/tree/main/new/foo',
  });

  const check = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'old/foo/SKILL.md')]: response(md('another-skill')),
      [rawSkillUrl(skill.repository, 'new/foo/SKILL.md')]: response(md()),
    }),
    skill,
    null,
  );

  assert.equal(check.reason, 'moved');
  assert.equal(check.path, 'new/foo/SKILL.md');
});

void test('a wrong-name recorded file is flagged; an invalid frontmatter is flagged independently', async () => {
  const skill = fixture();
  const url = rawSkillUrl(skill.repository, 'skills/foo/SKILL.md');
  const mismatch = await checkSkillMd(source({[url]: response(md('another-skill'))}), skill, null);
  assert.equal(mismatch.reason, 'name-mismatch');
  assert.equal(mismatch.name_mismatch, true);
  const invalid = await checkSkillMd(source({[url]: response('Not frontmatter')}), skill, null);
  assert.equal(invalid.reason, 'invalid');
});

void test('tree discovery accepts a nonmatching directory if frontmatter proves identity', async () => {
  const skill = fixture('foo', 'missing/foo/SKILL.md', {
    github_url: skillUrlRoot(),
  });

  const file = 'packages/agent-tools/SKILL.md';

  const s = source({
    [treeUrl]: response(bodyTree([file])),
    [rawSkillUrl(skill.repository, file)]: response(md()),
  });

  const check = await checkSkillMd(s, skill, null, treeResolver(s));
  assert.equal(check.reason, 'moved');
  assert.equal(check.path, file);
  assert.equal(check.matched_by, 'tree');
});

function skillUrlRoot() {
  return 'https://github.com/owner/repo';
}

void test('complete tree with unrelated skill is unresolved, never missing or mismatch', async () => {
  const skill = fixture('foo', 'missing/foo/SKILL.md', {
    github_url: skillUrlRoot(),
  });

  const file = 'packages/unrelated/SKILL.md';

  const s = source({
    [treeUrl]: response(bodyTree([file])),
    [rawSkillUrl(skill.repository, file)]: response(md('unrelated')),
  });

  const check = await checkSkillMd(s, skill, null, treeResolver(s));
  assert.equal(check.reason, 'unresolved');
  assert.equal(check.outdated, null);
});

void test('only complete and empty tree proves missing', async () => {
  const skill = fixture('foo', 'missing/foo/SKILL.md', {
    github_url: skillUrlRoot(),
  });

  const s = source({[treeUrl]: response(bodyTree([]))});
  const check = await checkSkillMd(s, skill, null, treeResolver(s));
  assert.equal(check.reason, 'missing');
  assert.equal(check.outdated, true);
  const incomplete = source({[treeUrl]: response(bodyTree([], true))});
  const unknown = await checkSkillMd(incomplete, skill, null, treeResolver(incomplete));
  assert.equal(unknown.reason, 'unresolved');
});

void test('GitHub tree 404 or malformed 200 is not a complete listing', async () => {
  const skill = fixture('foo', 'missing/foo/SKILL.md', {
    github_url: skillUrlRoot(),
  });

  for (const treeResponse of [response('', 404), response('{}')]) {
    const s = source({[treeUrl]: treeResponse});
    assert.equal((await fetchTree(s, skill.repository)).kind, 'denied');
    const check = await checkSkillMd(s, skill, null, treeResolver(s));
    assert.equal(check.reason, 'unresolved');
  }
});

void test('no-tree mode leaves all 404 paths unresolved', async () => {
  const check = await checkSkillMd(source(), fixture(), null, null);
  assert.equal(check.reason, 'unresolved');
  assert.equal(check.outdated, null);
});

void test('one API file-list lookup per repository even across separate skills', async () => {
  const visits = [];
  const s = source({[treeUrl]: response(bodyTree([]))}, visits);
  const trees = treeResolver(s);
  await Promise.all([
    checkSkillMd(s, fixture('foo', null, {github_url: skillUrlRoot()}), null, trees),
    checkSkillMd(s, fixture('bar', null, {github_url: skillUrlRoot()}), null, trees),
  ]);
  assert.equal(trees.stats.lookups, 1);
  assert.equal(visits.filter((v) => v.url === treeUrl).length, 1);
});

void test('transitive aliases collapse into one component and map exclusions cover whole group', () => {
  const a = fromGold({id: 'owner/repo/a', name: 'A'});
  const b = fromGold({id: 'owner/repo/b', name: 'B'});
  const c = fromGold({id: 'owner/repo/c', name: 'C'});
  a.aliases = ['owner/repo/a', 'owner/repo/x'];
  b.aliases = ['owner/repo/b', 'owner/repo/y'];
  c.aliases = ['owner/repo/x', 'owner/repo/y'];
  const result = combineCandidates([a, b, c], new Set());
  assert.equal(result.skills.length, 1);
  assert.equal(result.duplicatesMerged, 2);
  const excluded = combineCandidates([a, b, c], new Set(['owner/repo/b']));
  assert.equal(excluded.skills.length, 0);
  assert.equal(excluded.excludedAsMapped, 1);
});

void test('--no-verify carries historical skill hashes into a newly merged catalogue', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-build-'));

  try {
    const cacheUrl = 'https://officialskills.sh/';
    const pageUrl = 'https://officialskills.sh/owner/skills/foo';

    const goldUrl =
      'https://raw.githubusercontent.com/jonslimak/omgskills/refs/heads/main/index/gold-basket.json';

    const raw = rawSkillUrl('owner/repo', 'skills/foo/SKILL.md');

    const pages = {
      [cacheUrl]: `<a href="/owner/skills/foo">A</a>`,
      [pageUrl]: `<h1>foo</h1><p>Documentation for test skill</p><a href="https://github.com/owner/repo/tree/main/skills/foo">View on GitHub</a>`,
      [goldUrl]: JSON.stringify([
        {
          id: 'owner/repo/foo',
          name: 'foo',
          skill_md_path: 'skills/foo/SKILL.md',
          github_url: 'https://github.com/owner/repo',
        },
      ]),
      [raw]: md(),
    };

    const warm = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: mock(Object.fromEntries(Object.entries(pages).map(([k, v]) => [k, response(v)]))),
    });

    await Promise.all(Object.keys(pages).map((key) => warm.resource(key)));

    const options = parseOptions([
      '--cache-dir',
      dir,
      '--cache-ttl',
      '0',
      '--output',
      join(dir, 'catalogue.json'),
      '--delay',
      '0',
      '--no-tree',
    ]);

    const first = await build(options);
    assert.equal(first.skills.length, 1);
    assert.equal(first.skills[0].skill_md.reason, 'never-seen');
    assert.equal(first.verification.snapshot_only, true);
    await writeFile(options.output, JSON.stringify(first));
    const skipped = await build({...options, verify: false});
    assert.equal(skipped.skills[0].skill_md.sha256, first.skills[0].skill_md.sha256);
    assert.equal(skipped.skills[0].skill_md.checked_at, first.skills[0].skill_md.checked_at);
    assert.equal(skipped.verification, undefined);
    await writeFile(options.output, JSON.stringify(skipped));
    const third = await build(options);
    assert.equal(third.skills[0].skill_md.reason, 'ok');
    assert.equal(third.skills[0].skill_md.changed_since_last_build, false);
    assert.equal(third.stats.cache_misses, 0);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

void test('moved, changed and previous path name mismatch are all reported', async () => {
  const skill = fixture('foo', 'old/foo/SKILL.md', {
    github_url: 'https://github.com/owner/repo/tree/main/new/foo',
  });

  const old = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'old/foo/SKILL.md')]: response(md()),
    }),
    skill,
    null,
  );

  const check = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'old/foo/SKILL.md')]: response(md('unrelated')),
      [rawSkillUrl(skill.repository, 'new/foo/SKILL.md')]: response(md('foo', 'new content')),
    }),
    skill,
    old,
  );

  assert.equal(check.reason, 'moved');
  assert.equal(check.moved, true);
  assert.equal(check.changed_since_last_build, true);
  assert.equal(check.name_mismatch, true);
});

void test('a link-only catalogue can detect a moved skill without a recorded path', async () => {
  const skill = fixture('foo', null, {
    github_url: 'https://github.com/owner/repo/tree/main/obsolete/foo',
  });

  const check = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'skills/foo/SKILL.md')]: response(md()),
    }),
    skill,
    null,
  );

  assert.equal(check.reason, 'moved');
  assert.equal(check.recorded_path, null);
});

void test('a stale cached SKILL.md never becomes proof of current existence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-stale-'));

  try {
    const skill = fixture();
    const url = rawSkillUrl(skill.repository, skill.skill_md_path);

    const warm = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: async () => response(md()),
    });

    await warm.resource(url);
    await expireCache(dir, url);

    const stale = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 1,
      fetcher: async () => {
        throw Error('HTTP 403 Forbidden');
      },
    });

    const check = await checkSkillMd(stale, skill, null);
    assert.equal(check.reason, 'unresolved');
    assert.equal(check.outdated, null);
    assert.equal(check.source_cache, 'stale');
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

void test('--refresh bypasses even a never-expiring cache entry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'skills-refresh-'));

  try {
    const url = 'https://example.com/skill';

    const warm = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      fetcher: async () => response('old'),
    });

    await warm.resource(url);

    const fresh = new RemoteSource({
      cacheDir: dir,
      cacheTtlHours: 0,
      refresh: true,
      fetcher: async () => response('new'),
    });

    assert.equal((await fresh.resource(url)).body, 'new');
    assert.equal(fresh.stats.misses, 1);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
});

void test('an unrelated repository-root SKILL.md does not falsely identify the skill as mismatched', async () => {
  const skill = fixture('foo', null, {github_url: skillUrlRoot()});

  const check = await checkSkillMd(
    source({
      [rawSkillUrl(skill.repository, 'SKILL.md')]: response(md('repository-internal')),
    }),
    skill,
    null,
  );

  assert.equal(check.reason, 'unresolved');
  assert.equal(check.outdated, null);
});
