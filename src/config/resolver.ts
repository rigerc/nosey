import {getAtPath, setAtPath, type ConfigField} from './definition';

export interface ResolvedConfig<T extends object> {
  values: T;
  sources: Record<string, 'default' | 'file' | 'environment' | 'flag'>;
}

function fromEnvironment(field: ConfigField, env: NodeJS.ProcessEnv): unknown {
  const raw = field.env ? env[field.env] : undefined;
  if (raw === undefined || raw === '') return undefined;
  if (field.kind === 'toggle') {
    if (/^(1|true|yes|on)$/i.test(raw)) return true;
    if (/^(0|false|no|off)$/i.test(raw)) return false;
    return undefined;
  }
  if (field.kind === 'number') {
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  }
  if (field.kind === 'multi')
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return raw;
}

/** Resolve registered fields without writing CLI/environment overrides to disk. */
export function resolveConfig<T extends object>(
  fields: readonly ConfigField[],
  stored: T,
  options: {env?: NodeJS.ProcessEnv; flags?: Partial<T>} = {},
): ResolvedConfig<T> {
  let values = {} as T;
  const sources: ResolvedConfig<T>['sources'] = {};
  for (const field of fields) {
    const fromFile = getAtPath(stored, field.path);
    const fromEnv = fromEnvironment(field, options.env ?? process.env);
    const fromFlag = options.flags ? getAtPath(options.flags, field.path) : undefined;
    const source =
      fromFlag !== undefined
        ? 'flag'
        : fromEnv !== undefined
          ? 'environment'
          : fromFile !== undefined
            ? 'file'
            : 'default';
    const value = fromFlag ?? fromEnv ?? fromFile ?? field.defaultValue;
    if (value !== undefined) values = setAtPath(values, field.path, value);
    sources[field.path] = source;
  }
  return {values, sources};
}
