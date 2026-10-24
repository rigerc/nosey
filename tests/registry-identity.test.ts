import {describe, expect, it} from 'vite-plus/test';
import {
  cp,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {errorCode, isRecord, type JsonValue} from '../src/lib/values.js';

import {
  transformRegistryIdentity,
  guideSentinel,
  catalogBegin,
  catalogEnd,
} from '../src/lib/registry/identity.js';
import {configureRegistryIdentityFiles} from '../src/lib/registry/identity-files.js';

type FixtureInput = {map: JsonValue; manifest: JsonValue; readme: string; agentGuide?: string};

const fixtureRoot = path.resolve(
  process.cwd(),
  '../template/registry/scripts/test/fixtures/identity/v1',
);

const guidePolicy = async () => ({
  maintainer: await readFile(path.join(fixtureRoot, 'maintainer-guide.md'), 'utf8'),
  downstream: await readFile(path.join(fixtureRoot, 'downstream-guide.md'), 'utf8'),
});

const fixtureJson = async <T>(name: string): Promise<T> =>
  // SAFETY: Callers use this helper only for checked-in fixture documents with the declared shape.
  JSON.parse(await readFile(path.join(fixtureRoot, name), 'utf8')) as T;

const readFixtureInput = async (name: string): Promise<FixtureInput> => {
  const directory = path.join(fixtureRoot, name, 'input');

  const [map, manifest, readme, agentGuide] = await Promise.all([
    fixtureJson<JsonValue>(`${name}/input/skills-map.json`),
    fixtureJson<JsonValue>(`${name}/input/skills-manifest.json`),
    readFile(path.join(directory, 'README.md'), 'utf8'),
    readFile(path.join(directory, 'AGENTS.md'), 'utf8').catch((error) =>
      errorCode(error) === 'ENOENT' ? undefined : Promise.reject(error),
    ),
  ]);

  const result: FixtureInput = {map, manifest, readme};

  if (agentGuide !== undefined) result.agentGuide = agentGuide;

  return result;
};

const make = (): any => ({
  map: {
    $schema: {custom: true},
    schemaVersion: 1,
    registryId: 'old/team',
    technologies: [],
    technologySkills: null,
    combinations: [],
    combinationSkills: [],
    alwaysRecommend: ['old/team/nested/tool'],
    frontendBonusSkills: null,
    frontendPackages: [],
    webFrontendExtensions: [],
    extra: {kept: true},
  },
  manifest: {
    $schema: 7,
    schemaVersion: 1,
    registryId: 'old/team',
    skills: [
      {
        id: 'old/team/nested/tool',
        name: 'Tool',
        path: 'skills/nested/tool/SKILL.md',
        description: 'A tool',
        custom: 'kept',
      },
    ],
    extra: true,
  },
  readme: `Before\n${catalogBegin}\nold\n${catalogEnd}\nAfter`,
  registryId: 'new/team',
});

describe('trusted registry identity transformation', () => {
  it('rewrites only manifest-declared local IDs and preserves unknown data and annotations', () => {
    const input = make();
    input.map.externalSkills = [
      {id: 'old/team/vendor', name: 'External', source: 'acme/repo', skill: 'tool'},
    ];
    input.map.schemaVersion = 2;
    input.map.alwaysRecommend.push('old/team/vendor');
    const output = transformRegistryIdentity(input);
    const transformedSkills = output.manifest.skills;
    expect(
      Array.isArray(transformedSkills) && isRecord(transformedSkills[0])
        ? transformedSkills[0].id
        : undefined,
    ).toBe('new/team/nested/tool');
    expect(output.map.alwaysRecommend).toEqual(['new/team/nested/tool', 'old/team/vendor']);
    expect(output.map.$schema).toEqual({custom: true});
    expect(output.manifest.$schema).toBe(7);
    expect(
      Array.isArray(transformedSkills) && isRecord(transformedSkills[0])
        ? transformedSkills[0].custom
        : undefined,
    ).toBe('kept');
    expect(output.map.extra).toEqual({kept: true});
    expect(output.readme).toContain('Registry: new/team');
  });

  it('is byte-stable on a second transform and preserves a user-authored guide', () => {
    const policy = {maintainer: `${guideSentinel}\n# Maintainer\n`, downstream: '# Downstream\n'};

    const first = transformRegistryIdentity({
      ...make(),
      agentGuide: '# Mine\n\nKeep this.',
      guidePolicy: policy,
    });

    const second = transformRegistryIdentity({
      ...first,
      registryId: 'new/team',
      guidePolicy: policy,
    });

    expect(second).toEqual(first);
  });

  it('rejects missing/ambiguous README markers, mismatched IDs, and undeclared local-looking refs', () => {
    expect(() => transformRegistryIdentity({...make(), readme: 'no markers'})).toThrow(/markers/);
    const dup = make();
    dup.readme += catalogBegin;
    expect(() => transformRegistryIdentity(dup)).toThrow(/markers/);
    const mismatched = make();
    mismatched.manifest.registryId = 'other/team';
    expect(() => transformRegistryIdentity(mismatched)).toThrow(/inconsistent/);
    const stray = make();
    stray.map.frontendBonusSkills = ['old/team/not-declared'];
    expect(() => transformRegistryIdentity(stray)).toThrow(/Undeclared local-looking/);
  });

  it('converts only exact trusted maintainer guide bytes and rejects sentinel edits', () => {
    const maintainer = `${guideSentinel}\n# Maintainer\n`;
    const downstream = '# Downstream\n';
    const input = make();
    expect(
      transformRegistryIdentity({
        ...input,
        agentGuide: maintainer,
        guidePolicy: {maintainer, downstream},
      }).agentGuide,
    ).toBe(downstream);
    expect(() =>
      transformRegistryIdentity({
        ...input,
        agentGuide: `${guideSentinel}\n# edited`,
        guidePolicy: {maintainer, downstream},
      }),
    ).toThrow(/modified/);
    expect(
      transformRegistryIdentity({
        ...input,
        agentGuide: '# User\n',
        guidePolicy: {maintainer, downstream},
      }).agentGuide,
    ).toBe('# User\n');
  });

  it('rejects maintainer-like guide content anywhere without changing user guides', () => {
    const maintainer = `${guideSentinel}\n# Registry template agent guide\nTrusted body\n`;
    const downstream = '# Downstream\n';
    const policy = {maintainer, downstream};

    for (const guide of [
      `\n${maintainer}`,
      `User preface\n\n${maintainer}`,
      '# Registry template agent guide\nUser edits follow\n',
    ]) {
      expect(() =>
        transformRegistryIdentity({...make(), agentGuide: guide, guidePolicy: policy}),
      ).toThrow(/Unrecognized or modified/);
      expect(() => transformRegistryIdentity({...make(), agentGuide: guide})).toThrow(
        /trusted guide policy/,
      );
    }

    expect(
      transformRegistryIdentity({...make(), agentGuide: maintainer, guidePolicy: policy})
        .agentGuide,
    ).toBe(downstream);
    const userGuide = '# User guide\nNo maintainer markers here.\n';
    expect(
      transformRegistryIdentity({...make(), agentGuide: userGuide, guidePolicy: policy}).agentGuide,
    ).toBe(userGuide);
  });

  it('preserves nullable optional arrays for legacy v1 maps', () => {
    const input = make();
    const output = transformRegistryIdentity(input);
    expect(output.map.technologySkills).toBeNull();
    expect(output.map.frontendBonusSkills).toBeNull();
  });

  it('accepts and preserves nullable collections in the shared v1 fixture', async () => {
    const map = await fixtureJson<JsonValue>('v1-nullables/input/skills-map.json');
    const manifest = await fixtureJson<JsonValue>('v1-nullables/input/skills-manifest.json');

    const output = transformRegistryIdentity({
      map,
      manifest,
      readme: `${catalogBegin}\nplaceholder\n${catalogEnd}`,
      registryId: 'example/agent-skills',
    });

    expect(output.map.technologies).toBeNull();
    expect(output.map.combinations).toBeNull();
    expect(Object.hasOwn(output.map, 'externalSkills')).toBe(false);
    expect(output.map.$schema).toEqual({uri: 'custom://map', revision: 3});
  });

  it('preserves each JSON type used by the shared $schema annotation corpus', async () => {
    const annotations = await fixtureJson<Array<{type: string; value: JsonValue}>>(
      'schema-annotation-values.json',
    );

    for (const annotation of annotations) {
      const input = make();
      input.map.$schema = annotation.value;
      input.manifest.$schema = annotation.value;
      const output = transformRegistryIdentity(input);

      expect(output.map.$schema).toEqual(annotation.value);
      expect(output.manifest.$schema).toEqual(annotation.value);
    }
  });

  it('renders MCP matcher details and escapes registry supplied Markdown', () => {
    const input = make();
    input.manifest.skills[0].name = '<img src=x> [tool]';
    input.manifest.skills[0].description = 'MCP & tools';
    input.map.technologies = [
      {
        id: 'mcp-release',
        name: '<MCP>',
        detect: {
          mcpServers: [
            {
              endpoints: ['https://example.test/mcp'],
              serverNames: ['release & build'],
              configFiles: ['.mcp.json'],
            },
          ],
        },
        skills: ['old/team/nested/tool'],
      },
    ];

    const output = transformRegistryIdentity(input);

    expect(output.readme).toContain(
      'MCP server matching endpoints: https://example.test/mcp; serverNames: release &amp; build; configFiles: .mcp.json',
    );
    expect(output.readme).toContain(
      '### [&lt;img src=x&gt; \\[tool\\]](skills/nested/tool/SKILL.md)',
    );
    expect(output.readme).not.toContain('<img src=x>');
    expect(output.readme).toContain('MCP &amp; tools');
  });

  it('matches the shared v1 golden outputs, including generated catalog bytes and trusted guide policy', async () => {
    const policy = await guidePolicy();
    const names = ['configure-success', 'guide-user-preserved'];

    for (const name of names) {
      const metadata = await fixtureJson<{requestedIdentity: string}>(`${name}/input/case.json`);

      const output = transformRegistryIdentity({
        ...(await readFixtureInput(name)),
        registryId: metadata.requestedIdentity,
        guidePolicy: policy,
      });

      expect(output.map).toEqual(await fixtureJson(`${name}/expected/skills-map.json`));
      expect(output.manifest).toEqual(await fixtureJson(`${name}/expected/skills-manifest.json`));
      expect(output.readme).toBe(
        await readFile(path.join(fixtureRoot, name, 'expected/README.md'), 'utf8'),
      );
      expect(output.agentGuide).toBe(
        await readFile(path.join(fixtureRoot, name, 'expected/AGENTS.md'), 'utf8'),
      );
    }
  });

  it('rejects every shared negative identity fixture without relying on fixture names as verdicts', async () => {
    const directories = await readdir(fixtureRoot, {withFileTypes: true});
    const policy = await guidePolicy();
    const negativeFixtures: string[] = [];
    const rejectedFixtures: string[] = [];

    for (const entry of directories.filter((item) => item.isDirectory())) {
      const inputDirectory = path.join(fixtureRoot, entry.name, 'input');

      try {
        await readFile(path.join(inputDirectory, 'case.json'));
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue;
        throw error;
      }

      const metadata = await fixtureJson<{verdict: string; requestedIdentity?: string}>(
        `${entry.name}/input/case.json`,
      );

      if (metadata.verdict !== 'reject') continue;
      negativeFixtures.push(entry.name);
      let raw;

      try {
        raw = await readFixtureInput(entry.name);
      } catch (error) {
        expect(error).toBeInstanceOf(SyntaxError);
        rejectedFixtures.push(entry.name);
        continue;
      }

      expect(() =>
        transformRegistryIdentity({
          ...raw,
          registryId: metadata.requestedIdentity ?? 'acme/team-skills',
          guidePolicy: policy,
        }),
      ).toThrow();
      rejectedFixtures.push(entry.name);
    }

    expect(negativeFixtures.length).toBeGreaterThan(0);
    expect(rejectedFixtures).toEqual(negativeFixtures);
  });

  it('prevalidates and rolls back recoverable filesystem failures, then stays byte-idempotent', async () => {
    const policy = await guidePolicy();
    policy.maintainer = await readFile(
      path.join(fixtureRoot, 'write-failure/input/AGENTS.md'),
      'utf8',
    );
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'nosey-identity-'));
    const root = path.join(temporary, 'registry');
    await cp(path.join(fixtureRoot, 'write-failure/input'), root, {recursive: true});
    await mkdir(path.join(root, 'skills/nested/release'), {recursive: true});
    await mkdir(path.join(root, 'skills/nested/tooling/lint'), {recursive: true});
    await writeFile(path.join(root, 'skills/nested/release/SKILL.md'), 'fixture skill data');
    await writeFile(path.join(root, 'skills/nested/tooling/lint/SKILL.md'), 'fixture skill data');

    const metadata = await fixtureJson<{requestedIdentity: string}>(
      'write-failure/input/case.json',
    );

    const before = new Map<string, Buffer>();

    for (const name of ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'])
      before.set(name, await readFile(path.join(root, name)));

    try {
      let didFail = false;
      await expect(
        configureRegistryIdentityFiles(root, metadata.requestedIdentity, {
          guidePolicy: policy,
          beforeRename(completed) {
            if (completed === 2 && !didFail) {
              didFail = true;
              throw new Error('injected recoverable rename failure');
            }
          },
        }),
      ).rejects.toThrow('injected recoverable rename failure');
      expect(didFail).toBe(true);

      for (const [name, bytes] of before)
        expect(await readFile(path.join(root, name))).toEqual(bytes);
      expect((await readdir(root)).filter((name) => name.includes('.nosey-'))).toEqual([]);

      await configureRegistryIdentityFiles(root, metadata.requestedIdentity, {guidePolicy: policy});
      const configured = new Map<string, Buffer>();

      for (const name of before.keys()) configured.set(name, await readFile(path.join(root, name)));
      expect(
        await configureRegistryIdentityFiles(root, metadata.requestedIdentity, {
          guidePolicy: policy,
        }),
      ).toEqual({changedFiles: []});

      for (const [name, bytes] of configured)
        expect(await readFile(path.join(root, name))).toEqual(bytes);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  });

  it.each([
    ['ordinary identity growth', 'newowner/newrepository'],
    ['long valid identity', `newowner/${'r'.repeat(300)}`],
  ])('rejects %s when serialized manifest output exceeds its bound', async (_label, registryId) => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'nosey-identity-output-limit-'));
    const root = path.join(temporary, 'registry');
    await cp(path.join(fixtureRoot, 'configure-success/input'), root, {recursive: true});
    await mkdir(path.join(root, 'skills/nested/release'), {recursive: true});
    await mkdir(path.join(root, 'skills/nested/tooling/lint'), {recursive: true});
    await writeFile(path.join(root, 'skills/nested/release/SKILL.md'), 'fixture skill data');
    await writeFile(path.join(root, 'skills/nested/tooling/lint/SKILL.md'), 'fixture skill data');

    const manifestPath = path.join(root, 'skills-manifest.json');
    const parsedManifest: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));

    if (!isRecord(parsedManifest)) throw new Error('Fixture manifest must be an object');
    const manifest = parsedManifest;
    const manifestLimit = 4 * 1024 * 1024;
    manifest.padding = '';
    const baseLength = Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`);
    manifest.padding = 'x'.repeat(manifestLimit - 1 - baseLength);
    const padded = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    expect(padded.length).toBe(manifestLimit - 1);
    await writeFile(manifestPath, padded);

    const filenames = ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'];
    const before = new Map<string, Buffer>();

    for (const filename of filenames)
      before.set(filename, await readFile(path.join(root, filename)));

    try {
      await expect(
        configureRegistryIdentityFiles(root, registryId, {guidePolicy: await guidePolicy()}),
      ).rejects.toThrow('skills-manifest.json output exceeds the 4194304-byte limit');

      for (const [filename, bytes] of before)
        expect(await readFile(path.join(root, filename))).toEqual(bytes);
      expect((await readdir(root)).filter((name) => name.includes('.nosey-'))).toEqual([]);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  });

  it('attempts independent rollback restores and preserves a failed restore backup', async () => {
    const policy = await guidePolicy();
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'nosey-identity-restore-failure-'));
    const root = path.join(temporary, 'registry');
    await cp(path.join(fixtureRoot, 'configure-success/input'), root, {recursive: true});
    await mkdir(path.join(root, 'skills/nested/release'), {recursive: true});
    await mkdir(path.join(root, 'skills/nested/tooling/lint'), {recursive: true});
    await writeFile(path.join(root, 'skills/nested/release/SKILL.md'), 'fixture skill data');
    await writeFile(path.join(root, 'skills/nested/tooling/lint/SKILL.md'), 'fixture skill data');

    const filenames = ['skills-map.json', 'skills-manifest.json', 'README.md', 'AGENTS.md'];
    const before = new Map<string, Buffer>();

    for (const filename of filenames)
      before.set(filename, await readFile(path.join(root, filename)));

    let restoreAttempt = 0;

    try {
      let failure: unknown;

      try {
        await configureRegistryIdentityFiles(root, 'acme/team-skills', {
          guidePolicy: policy,
          beforeRename(completed) {
            if (completed === 3) throw new Error('injected write failure');
          },
          beforeRestore() {
            if (restoreAttempt++ === 0) throw new Error('injected restore failure');
          },
        });
      } catch (error) {
        failure = error;
      }

      expect(failure).toBeInstanceOf(Error);
      const failureMessage = failure instanceof Error ? failure.message : String(failure);
      expect(failureMessage).toContain('injected write failure');
      expect(failureMessage).toContain('Rollback was incomplete');
      expect(restoreAttempt).toBe(3);

      const recovery = failureMessage.match(/original preserved at ([^;)]+)/)?.[1];
      expect(recovery).toBeDefined();
      expect(await readFile(recovery!)).toEqual(before.get('README.md'));

      // The first restore is the most recently replaced file (README.md); later restores still ran.
      for (const filename of ['skills-map.json', 'skills-manifest.json', 'AGENTS.md'])
        expect(await readFile(path.join(root, filename))).toEqual(before.get(filename));
      expect(await readFile(path.join(root, 'README.md'))).not.toEqual(before.get('README.md'));

      await writeFile(path.join(root, 'README.md'), await readFile(recovery!));
      await rm(recovery!, {force: true});
      expect((await readdir(root)).filter((name) => name.includes('.nosey-'))).toEqual([]);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  });

  it('rejects linked fixed files before any mutation', async () => {
    const policy = await guidePolicy();
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'nosey-identity-links-'));
    const root = path.join(temporary, 'registry');
    await cp(path.join(fixtureRoot, 'configure-success/input'), root, {recursive: true});
    const before = await readFile(path.join(root, 'skills-map.json'));
    await rm(path.join(root, 'README.md'));
    await symlink(path.join(root, 'skills-map.json'), path.join(root, 'README.md'));

    try {
      await expect(
        configureRegistryIdentityFiles(root, 'acme/team-skills', {guidePolicy: policy}),
      ).rejects.toThrow(/regular file without links/);
      expect(await readFile(path.join(root, 'skills-map.json'))).toEqual(before);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  });

  it('rejects hard-linked fixed files before any mutation', async () => {
    const policy = await guidePolicy();
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'nosey-identity-hardlinks-'));
    const root = path.join(temporary, 'registry');
    await cp(path.join(fixtureRoot, 'configure-success/input'), root, {recursive: true});
    const mapPath = path.join(root, 'skills-map.json');
    const before = await readFile(mapPath);
    await link(mapPath, path.join(root, 'skills-map-copy.json'));

    try {
      await expect(
        configureRegistryIdentityFiles(root, 'acme/team-skills', {guidePolicy: policy}),
      ).rejects.toThrow(/regular file without links/);
      expect(await readFile(mapPath)).toEqual(before);
    } finally {
      await rm(temporary, {recursive: true, force: true});
    }
  });
});
