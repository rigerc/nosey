import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {test, expect} from 'vite-plus/test';
import {discoverRegistries, parseConfig} from '../src/lib/registry/config.js';
import {resolveRegistries} from '../src/lib/registry/resolve.js';

test('configuration resolves relative paths relative to its file', () => {
  const configs = parseConfig(
    {
      schemaVersion: 1,
      registries: [
        {type: 'local', path: './skills'},
        {
          type: 'git',
          url: 'https://github.com/acme/skills.git',
          ref: 'v1',
          refreshHours: 8,
        },
      ],
    },
    '/tmp/project/.skillsense.json',
  );

  expect(configs.map((item) => item.spec)).toStrictEqual([
    {type: 'local', path: '/tmp/project/skills'},
    {
      type: 'git',
      url: 'https://github.com/acme/skills.git',
      ref: 'v1',
      refreshHours: 8,
    },
  ]);
});

test('configuration validation rejects invalid inputs', () => {
  expect(() => parseConfig({registries: []}, '/tmp/.skillsense.json')).toThrow();
  expect(() =>
    parseConfig(
      {
        schemaVersion: 1,
        registries: [{type: 'git', url: 'https://example.com/a.git', refreshHours: -1}],
      },
      '/tmp/.skillsense.json',
    ),
  ).toThrow();
});

test('project registries and CLI references are additive and deduplicated', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-config-'));

  try {
    await fs.writeFile(
      path.join(project, '.skillsense.json'),
      JSON.stringify({
        schemaVersion: 1,
        registries: [
          {type: 'local', path: './registry'},
          {type: 'local', path: './registry'},
        ],
      }),
    );

    const found = await discoverRegistries(project, [
      path.join(project, 'registry'),
      path.join(project, 'second'),
    ]);

    const local = found.sources.filter((item) => item.spec.type === 'local');
    expect(
      local.some(
        (item) => item.spec.type === 'local' && item.spec.path === path.join(project, 'registry'),
      ),
    ).toBe(true);
    expect(
      local.some(
        (item) => item.spec.type === 'local' && item.spec.path === path.join(project, 'second'),
      ),
    ).toBe(true);
    expect(
      local.filter(
        (item) => item.spec.type === 'local' && item.spec.path === path.join(project, 'registry'),
      ).length,
    ).toBe(1);
  } finally {
    await fs.rm(project, {recursive: true, force: true});
  }
});

test('invalid project registries warn and built-ins remain available', async () => {
  const project = await fs.mkdtemp(path.join(os.tmpdir(), 'skillsense-config-'));

  try {
    await fs.writeFile(
      path.join(project, '.skillsense.json'),
      JSON.stringify({
        schemaVersion: 1,
        registries: [{type: 'local', path: './missing-registry'}],
      }),
    );
    const outcome = await resolveRegistries(project);
    expect(outcome.warnings.some((item) => item.source.includes('missing-registry'))).toBe(true);
    expect(outcome.registry.technologies.some((item) => item.id === 'react')).toBe(true);
  } finally {
    await fs.rm(project, {recursive: true, force: true});
  }
});
