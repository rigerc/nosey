import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {test, expect} from 'vite-plus/test';
import {loadGitRegistry} from '../src/lib/registry/git.js';

const spec = {
  type: 'git' as const,
  url: 'https://github.com/example/private-skills.git',
  ref: 'main',
};
const manifest = {
  schemaVersion: 1 as const,
  registryId: 'example/skills',
  skills: [{id: 'example/skills/demo', name: 'demo', path: 'skills/demo/SKILL.md'}],
};
const map = {
  schemaVersion: 1 as const,
  registryId: 'example/skills',
  alwaysRecommend: [],
  technologies: [],
  technologySkills: [],
  combinations: [],
  combinationSkills: [],
  frontendBonusSkills: [],
  frontendPackages: [],
  webFrontendExtensions: [],
};
const commit = 'a'.repeat(40);

async function cacheFixture<T>(callback: (directory: string) => Promise<T>): Promise<T> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-git-cache-'));
  try {
    return await callback(directory);
  } finally {
    await fs.rm(directory, {recursive: true, force: true});
  }
}

test('Git cache avoids repeat fetches while TTL is fresh', async () => {
  await cacheFixture(async (cacheDirectory) => {
    let requests = 0;
    const options = {
      cacheDirectory,
      now: 100_000,
      async fetcher() {
        requests++;
        return {loaded: {manifest, map, source: 'fixture'}, commit};
      },
    };
    const first = await loadGitRegistry(spec, options);
    const second = await loadGitRegistry(spec, options);
    expect(requests).toBe(1);
    expect(first.loaded.manifest).toStrictEqual(second.loaded.manifest);
    expect(second.warnings.length).toBe(0);
  });
});

test('cached regex detection rules retain their source and flags', async () => {
  await cacheFixture(async (cacheDirectory) => {
    const regexMap = {
      ...map,
      technologies: [
        {
          id: 'x',
          name: 'X',
          detect: {
            packagePatterns: [{source: '^@sample/', flags: 'i'}],
            configFileContent: [
              {
                files: ['example.config'],
                patterns: [{source: 'example', flags: 'i'}, 'enabled'],
              },
            ],
          },
          skills: [],
        },
      ],
    };
    await loadGitRegistry(spec, {
      cacheDirectory,
      now: 0,
      fetcher: async () => ({
        loaded: {manifest, map: regexMap as typeof map, source: 'fixture'},
        commit,
      }),
    });
    const cached = await loadGitRegistry(spec, {
      cacheDirectory,
      now: 1,
      async fetcher() {
        throw new Error('must use cache');
      },
    });
    expect(
      cached.loaded.map.technologies[0]?.detect.packagePatterns?.[0]?.test('@SAMPLE/sdk'),
    ).toBe(true);
    expect(cached.loaded.map.technologies[0]?.detect.configFileContent).toStrictEqual([
      {files: ['example.config'], patterns: [/example/i, 'enabled']},
    ]);
    const stale = await loadGitRegistry(
      {...spec, refreshHours: 0},
      {
        cacheDirectory,
        now: 2,
        async fetcher() {
          throw new Error('offline');
        },
      },
    );
    expect(stale.loaded.map.technologies[0]?.detect.packagePatterns?.[0]?.test('@SAMPLE/sdk')).toBe(
      true,
    );
    expect(stale.loaded.map.technologies[0]?.detect.configFileContent).toStrictEqual(
      cached.loaded.map.technologies[0]?.detect.configFileContent,
    );
    expect(stale.warnings.length).toBe(1);
  });
});

test('Git fetch errors reuse the last valid registry snapshot', async () => {
  await cacheFixture(async (cacheDirectory) => {
    await loadGitRegistry(spec, {
      cacheDirectory,
      now: 0,
      fetcher: async () => ({
        loaded: {manifest, map, source: 'fixture'},
        commit,
      }),
    });
    const stale = await loadGitRegistry(spec, {
      cacheDirectory,
      now: 172_800_000,
      async fetcher() {
        throw new Error('network unavailable');
      },
    });
    expect(stale.loaded.manifest.registryId).toBe('example/skills');
    expect(stale.warnings.length).toBe(1);
    expect(stale.warnings[0]!.message).toMatch(/using cached registry/);
  });
});

test('Git failure without cache is an error for the caller to handle', async () => {
  await cacheFixture(async (cacheDirectory) => {
    await expect(
      loadGitRegistry(spec, {
        cacheDirectory,
        async fetcher() {
          throw new Error('offline');
        },
      }),
    ).rejects.toThrow();
  });
});

test('reject dangerous Git URL schemes and revision option injection', async () => {
  await cacheFixture(async (cacheDirectory) => {
    await expect(
      loadGitRegistry(
        {
          type: 'git',
          url: 'file:///tmp/private.git',
        },
        {cacheDirectory},
      ),
    ).rejects.toThrow(/HTTPS or SSH/);
    await expect(
      loadGitRegistry(
        {
          ...spec,
          ref: '--upload-pack=sh',
        },
        {cacheDirectory},
      ),
    ).rejects.toThrow(/Invalid Git revision/);
  });
});

test('Git snapshots round-trip v2 external skill declarations through the cache', async () => {
  await cacheFixture(async cacheDirectory => {
    const externalId = 'acme/upstream/react-helper';
    const externalMap = {
      ...map,
      schemaVersion: 2 as const,
      externalSkills: [{
        id: externalId, name: 'React helper', source: 'acme/upstream', skill: 'react-helper',
      }],
      technologySkills: [{technologyId: 'react', skills: [externalId]}],
    };
    const first = await loadGitRegistry(spec, {
      cacheDirectory, now: 500,
      async fetcher() {
        return {loaded: {manifest, map: externalMap, source: 'fixture'}, commit};
      },
    });
    const cached = await loadGitRegistry(spec, {
      cacheDirectory, now: 501,
      async fetcher() {
        throw new Error('unexpected remote fetch');
      },
    });
    expect(first.warnings).toEqual([]);
    expect(cached.warnings).toEqual([]);
    expect(cached.loaded.map.externalSkills).toEqual(externalMap.externalSkills);
    expect(cached.loaded.map.technologySkills[0]?.skills).toEqual([externalId]);
  });
});
