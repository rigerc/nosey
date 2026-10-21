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


test('forced refresh bypasses a warm cache and detects new commits', async () => {
  await cacheFixture(async (cacheDirectory) => {
    let requests = 0;
    const fetcher = async () => ({
      loaded: {manifest, map, source: 'fixture'},
      commit: (++requests === 1 ? 'a' : 'b').repeat(40),
    });
    const initial = await loadGitRegistry(spec, {cacheDirectory, now: 100, fetcher});
    expect(initial.hadCache).toBe(false);
    expect(initial.updated).toBe(false);
    expect(initial.refreshed).toBe(true);

    const cached = await loadGitRegistry(spec, {cacheDirectory, now: 101, fetcher});
    expect(cached.refreshed).toBe(false);
    expect(cached.updated).toBe(false);
    expect(requests).toBe(1);

    const changed = await loadGitRegistry(spec, {
      cacheDirectory, now: 102, fetcher, forceRefresh: true,
    });
    expect(changed.updated).toBe(true);
    expect(changed.refreshed).toBe(true);
    expect(changed.hadCache).toBe(true);
    expect(changed.commit).toBe('b'.repeat(40));
    expect(requests).toBe(2);

    const unchanged = await loadGitRegistry(spec, {
      cacheDirectory, now: 103, fetcher, forceRefresh: true,
    });
    expect(unchanged.updated).toBe(false);
    expect(unchanged.refreshed).toBe(true);
    expect(requests).toBe(3);
  });
});

test('failed forced refresh does not report an update or replace the cache', async () => {
  await cacheFixture(async (cacheDirectory) => {
    await loadGitRegistry(spec, {
      cacheDirectory, now: 0,
      fetcher: async () => ({loaded: {manifest, map, source: 'fixture'}, commit}),
    });
    const fallback = await loadGitRegistry(spec, {
      cacheDirectory, now: 1, forceRefresh: true,
      fetcher: async () => { throw new Error('offline'); },
    });
    expect(fallback.updated).toBe(false);
    expect(fallback.refreshed).toBe(false);
    expect(fallback.hadCache).toBe(true);
    expect(fallback.commit).toBe(commit);
    expect(fallback.warnings).toHaveLength(1);
  });
});
