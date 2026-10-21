import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vite-plus/test';
import {z} from 'zod';
import {
  appConfig,
  configFilePath,
  createConfigStore,
  defineConfig,
  getAtPath,
  mergeConfig,
  resolveConfig,
  setAtPath,
} from '../src/config';
import {loadConfig, saveConfig} from '../src/lib/config';

const dirs: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ink-kit-config-'));
  dirs.push(directory);
  return join(directory, 'config.json');
}
afterEach(() => {
  for (const directory of dirs.splice(0)) rmSync(directory, {recursive: true, force: true});
});

describe('configuration persistence', () => {
  it('reads missing files, writes versioned JSON, and accepts an explicit path', () => {
    const path = fixture();
    expect(loadConfig(path).config).toEqual({});
    saveConfig({theme: 'light'}, path);
    expect(loadConfig(path).config).toMatchObject({version: 1, theme: 'light'});
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({version: 1, theme: 'light'});
    expect(configFilePath(path)).toBe(path);
  });

  it('preserves unknown application keys and merges nested patches', () => {
    const path = fixture();
    writeFileSync(path, JSON.stringify({theme: 'dark', plugin: {one: true, two: 7}}));
    saveConfig({ascii: true}, path);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    expect(saved).toMatchObject({theme: 'dark', ascii: true, plugin: {one: true, two: 7}});
    expect(mergeConfig({nested: {a: 1, b: 2}}, {nested: {b: 3}})).toEqual({
      nested: {a: 1, b: 3},
    });
  });

  it('refuses to overwrite malformed or schema-invalid files', () => {
    const path = fixture();
    for (const invalid of ['{bad json', '{"theme":"not-a-theme"}', '[]']) {
      writeFileSync(path, invalid);
      expect(loadConfig(path).error).toBeTruthy();
      expect(() => saveConfig({theme: 'dark'}, path)).toThrow();
      expect(readFileSync(path, 'utf8')).toBe(invalid);
    }
  });

  it('blocks unsupported future versions and supports migrations', () => {
    const path = fixture();
    const store = createConfigStore(
      defineConfig({
        version: 2,
        schema: z.looseObject({
          version: z.number().optional(),
          name: z.string().optional(),
        }),
        fields: [],
        migrations: {
          0: (raw) => ({...raw, name: raw.oldName}),
          1: (raw) => raw,
        },
      }),
    );
    writeFileSync(path, JSON.stringify({oldName: 'legacy'}));
    expect(store.read(path).config.name).toBe('legacy');
    store.write({name: 'updated'}, path);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({version: 2, name: 'updated'});
    writeFileSync(path, JSON.stringify({version: 99}));
    expect(store.read(path).error).toContain('newer');
    expect(() => store.write({name: 'oops'}, path)).toThrow();
  });

  it('validates full documents before any write', () => {
    const path = fixture();
    const store = createConfigStore(appConfig);
    expect(() => store.write({ascii: 'maybe' as unknown as boolean}, path)).toThrow('ascii');
    expect(loadConfig(path).config).toEqual({});
  });
});

describe('configuration fields and precedence', () => {
  it('supports nested fields without mutating the original object', () => {
    const base = {nested: {name: 'one', enabled: true}};
    const next = setAtPath(base, 'nested.name', 'two');
    expect(getAtPath(next, 'nested.name')).toBe('two');
    expect(base.nested.name).toBe('one');
    expect(() => setAtPath(base, '__proto__.bad', 'x')).toThrow();
  });

  it('resolves flags > environment > file > defaults and reports sources', () => {
    const fields = [
      {
        path: 'nested.level',
        section: 'General',
        kind: 'number' as const,
        label: 'Level',
        env: 'APP_LEVEL',
        defaultValue: 1,
      },
    ];
    const file = {nested: {level: 2}};
    expect(resolveConfig(fields, file, {env: {APP_LEVEL: '3'}})).toEqual({
      values: {nested: {level: 3}},
      sources: {'nested.level': 'environment'},
    });
    expect(
      resolveConfig(fields, file, {env: {APP_LEVEL: '3'}, flags: {nested: {level: 4}}}),
    ).toEqual({
      values: {nested: {level: 4}},
      sources: {'nested.level': 'flag'},
    });
    expect(resolveConfig(fields, file, {env: {}}).sources['nested.level']).toBe('file');
    expect(resolveConfig(fields, {}, {env: {}}).values).toEqual({nested: {level: 1}});
  });
});
