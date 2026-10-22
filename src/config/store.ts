import {
  isNumber,
  errorCode,
  jsonObjectSchema,
  jsonValueSchema,
  type JsonValue,
  type JsonObject,
  isRecord,
} from '../lib/values';

import {randomBytes} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import type {ConfigDefinition} from './definition';

export type ConfigRead<T extends object> =
  | {config: T; error?: undefined; path: string}
  | {config: Partial<T>; error: string; path: string};

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

const record = (value: JsonValue): value is JsonObject =>
  value !== null && isRecord(value) && !Array.isArray(value);

export function mergeConfig<T extends object>(base: T, patch: DeepPartial<T>): T {
  const merged = {...jsonObjectSchema.parse(base)};

  for (const [key, value] of Object.entries(jsonObjectSchema.parse(patch))) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    merged[key] = record(value) && record(merged[key]) ? mergeConfig(merged[key], value) : value;
  }

  // SAFETY: base supplies T and the patch is DeepPartial<T>; the store validates the merged document before writing.
  return merged as T;
}

export function createConfigStore<T extends object>(
  definition: ConfigDefinition<T>,
  appName = 'ink-kit',
) {
  const pathFor = (override?: string) => configFilePath(override, appName);

  function validate(value: JsonValue): T {
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
    let raw: JsonValue;

    try {
      raw = jsonValueSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return {config: validate({}), path};
      }

      return {
        config: {},
        path,
        error: `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    try {
      if (!record(raw)) throw new Error('Configuration must be a JSON object');
      const rawVersion = raw.version === undefined ? 0 : raw.version;

      if (!isNumber(rawVersion) || !Number.isInteger(rawVersion) || rawVersion < 0)
        throw new Error('Invalid configuration version');
      const version = rawVersion;

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
      return {config: {}, path, error: error instanceof Error ? error.message : String(error)};
    }
  }

  /** Refuses corrupt files; validates the merged document before an atomic replacement. */
  function write(patch: DeepPartial<T>, override?: string): T {
    const {config, error, path} = read(override);

    if (error !== undefined) throw new Error(error);
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
