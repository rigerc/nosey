import {jsonObjectSchema, type JsonValue, type JsonObject, isRecord} from '../lib/values';

import type {z} from 'zod';

/** Editor metadata is independent of persistence and can be extended by consuming apps. */
export interface ConfigField {
  path: string;
  label: string;
  section: string;
  kind: 'toggle' | 'select' | 'text' | 'number' | 'multi';
  description?: string;
  options?: readonly {value: string; label: string; hint?: string}[];
  defaultValue?: JsonValue;
  env?: string;
  visibleWhen?: (values: JsonObject) => boolean;
}

export interface ConfigDefinition<T extends object> {
  schema: z.ZodType<T>;
  version: number;
  fields: readonly ConfigField[];
  migrations?: Readonly<Record<number, (raw: JsonObject) => JsonObject>>;
}

export function defineConfig<T extends object>(definition: ConfigDefinition<T>) {
  return definition;
}

export function getAtPath<T extends object>(values: T, path: string): JsonValue {
  return path.split('.').reduce<JsonValue>((current, part) => {
    if (!current || !isRecord(current) || Array.isArray(current)) return undefined;

    return current[part];
  }, jsonObjectSchema.parse(values));
}

/** Immutable nested update. Paths refer to object keys, never array indices. */
export function setAtPath<T extends object>(values: T, path: string, value: JsonValue): T {
  const segments = path.split('.');

  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment || segment === '__proto__' || segment === 'constructor' || segment === 'prototype',
    )
  ) {
    throw new Error('Invalid configuration path');
  }

  const root = {...jsonObjectSchema.parse(values)};
  let node = root;

  for (const segment of segments.slice(0, -1)) {
    const old = node[segment];

    const next = old && isRecord(old) && !Array.isArray(old) ? {...old} : {};

    node[segment] = next;
    node = next;
  }

  node[segments[segments.length - 1]!] = value;

  // SAFETY: untouched T fields are preserved; edited paths are drafts validated by the config store before persistence.
  return root as T;
}

export function configSections(fields: readonly ConfigField[]): string[] {
  return [...new Set(fields.map((field) => field.section))];
}
