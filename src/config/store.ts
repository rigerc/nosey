import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import type {ConfigDefinition} from './definition';

export interface ConfigRead<T extends object> {
  config: T;
  error?: string;
  path: string;
}

export function configFilePath(override?: string, appName = 'ink-kit'): string {
  if (override) return resolve(override);
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(isAbsolute(base) ? base : resolve(base), appName, 'config.json');
}

/** Patch accepted by `mergeConfig`: nested objects may be partial at any depth. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function mergeConfig<T extends object>(base: T, patch: DeepPartial<T>): T {
  const merged: Record<string, unknown> = {...(base as Record<string, unknown>)};
  for (const [key, value] of Object.entries(patch)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    merged[key] = record(value) && record(merged[key]) ? mergeConfig(merged[key], value) : value;
  }
  return merged as T;
}

export function createConfigStore<T extends object>(
  definition: ConfigDefinition<T>,
  appName = 'ink-kit',
) {
  const pathFor = (override?: string) => configFilePath(override, appName);

  function validate(value: unknown): T {
    const result = definition.schema.safeParse(value);
    if (!result.success) {
      throw new Error(
        result.error.issues
          .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
          .join('; '),
      );
    }
    return result.data;
  }

  function read(override?: string): ConfigRead<T> {
    const path = pathFor(override);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {config: validate({}), path};
      }
      return {config: {} as T, path, error: `Could not read ${path}: ${(error as Error).message}`};
    }
    try {
      if (!record(raw)) throw new Error('Configuration must be a JSON object');
      const rawVersion = raw.version === undefined ? 0 : raw.version;
      if (!Number.isInteger(rawVersion) || (rawVersion as number) < 0)
        throw new Error('Invalid configuration version');
      const version = rawVersion as number;
      if (version > definition.version)
        throw new Error(
          `Configuration version ${version} is newer than supported version ${definition.version}`,
        );
      let migrated = raw;
      for (let current = version; current < definition.version; current++) {
        migrated = definition.migrations?.[current]?.(migrated) ?? migrated;
      }
      return {config: validate(migrated), path};
    } catch (error) {
      return {config: {} as T, path, error: (error as Error).message};
    }
  }

  /** Refuses corrupt files; validates the merged document before an atomic replacement. */
  function write(patch: DeepPartial<T>, override?: string): T {
    const {config, error, path} = read(override);
    if (error) throw new Error(error);
    const next = validate({...mergeConfig(config, patch), version: definition.version});
    const directory = dirname(path);
    mkdirSync(directory, {recursive: true});
    const temporary = join(directory, `.${randomBytes(8).toString('hex')}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      renameSync(temporary, path);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return next;
  }

  return {pathFor, read, write, validate, definition};
}
