import type {z} from 'zod';

/** Editor metadata is independent of persistence and can be extended by consuming apps. */
export interface ConfigField {
  path: string;
  label: string;
  section: string;
  kind: 'toggle' | 'select' | 'text' | 'number' | 'multi';
  description?: string;
  options?: readonly {value: string; label: string; hint?: string}[];
  defaultValue?: unknown;
  env?: string;
  visibleWhen?: (values: Record<string, unknown>) => boolean;
}

export interface ConfigDefinition<T extends object> {
  schema: z.ZodType<T>;
  version: number;
  fields: readonly ConfigField[];
  migrations?: Readonly<Record<number, (raw: Record<string, unknown>) => Record<string, unknown>>>;
}

export function defineConfig<T extends object>(definition: ConfigDefinition<T>) {
  return definition;
}

export function getAtPath(values: object, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, values);
}

/** Immutable nested update. Paths refer to object keys, never array indices. */
export function setAtPath<T extends object>(values: T, path: string, value: unknown): T {
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
  const root: Record<string, unknown> = {...(values as Record<string, unknown>)};
  let node = root;
  for (const segment of segments.slice(0, -1)) {
    const old = node[segment];
    const next =
      old && typeof old === 'object' && !Array.isArray(old)
        ? {...(old as Record<string, unknown>)}
        : {};
    node[segment] = next;
    node = next;
  }
  node[segments[segments.length - 1]!] = value;
  return root as T;
}

export function configSections(fields: readonly ConfigField[]): string[] {
  return [...new Set(fields.map((field) => field.section))];
}
