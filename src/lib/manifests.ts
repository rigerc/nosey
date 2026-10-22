import {jsonValueSchema, type JsonValue, type JsonObject, isRecord, isString} from './values.js';

import type {ProjectTree} from './scanner.js';

export type ManifestGroup =
  | 'packages'
  | 'pythonPackages'
  | 'composerPackages'
  | 'goModules'
  | 'rustCrates'
  | 'elixirPackages'
  | 'gems';

/** Maps `group:packageName` to the manifests that reference it. */
export type ManifestIndex = Map<string, Set<string>>;

type ManifestParser = (store: ManifestIndex, content: string, file: string) => void;

export const manifestGroups: ManifestGroup[] = [
  'packages',
  'pythonPackages',
  'composerPackages',
  'goModules',
  'rustCrates',
  'elixirPackages',
  'gems',
];

function normalize(group: ManifestGroup, name: string): string {
  return group === 'pythonPackages' ? name.toLowerCase().replaceAll(/[-_.]+/g, '-') : name;
}

function push(store: ManifestIndex, group: ManifestGroup, name: string, file: string): void {
  if (!name) return;
  const key = `${group}:${normalize(group, name)}`;
  let paths = store.get(key);

  if (!paths) {
    paths = new Set();
    store.set(key, paths);
  }

  paths.add(file);
}

function json(text: string): JsonValue {
  try {
    return jsonValueSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

function asRecord(value: JsonValue): JsonObject | undefined {
  return value !== null && isRecord(value) && !Array.isArray(value) ? value : undefined;
}

function asArray(value: JsonValue): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function addKeys(store: ManifestIndex, group: ManifestGroup, value: JsonValue, file: string): void {
  const record = asRecord(value);

  if (!record) return;

  for (const key of Object.keys(record)) push(store, group, key, file);
}

const parsePackageJson: ManifestParser = (store, content, file) => {
  const data = asRecord(json(content));

  if (!data) return;

  for (const group of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    addKeys(store, 'packages', data[group], file);
  }
};

const parseComposer: ManifestParser = (store, content, file) => {
  const data = asRecord(json(content));

  if (!data) return;

  for (const group of ['require', 'require-dev']) {
    addKeys(store, 'composerPackages', data[group], file);
  }
};

const parseComposerLock: ManifestParser = (store, content, file) => {
  const data = asRecord(json(content));

  if (!data) return;

  for (const pkg of [...asArray(data['packages']), ...asArray(data['packages-dev'])]) {
    const record = asRecord(pkg);
    const name = record?.['name'];

    if (isString(name)) push(store, 'composerPackages', name, file);
  }
};

const parseRequirements: ManifestParser = (store, content, file) => {
  for (const line of content.split(/\r?\n/)) {
    const cleaned = line.trim();

    if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('-')) continue;
    const match = /^([A-Za-z][\w.-]*)\s*(?:\[|[<>=!~;#\s]|$)/.exec(cleaned);

    if (match?.[1]) push(store, 'pythonPackages', match[1], file);
  }
};

const parsePyproject: ManifestParser = (store, content, file) => {
  // Lightweight TOML extraction restricted to dependency-bearing sections.
  let section = '';
  let capturing = false;
  let buffer = '';

  const addArray = (value: string) => {
    for (const match of value.matchAll(/["']([A-Za-z][\w.-]*)(?:\[[^\]"']*])?[^"']*["']/g)) {
      if (match[1]) push(store, 'pythonPackages', match[1], file);
    }
  };

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (capturing) {
      buffer += `\n${line}`;

      if (line.includes(']')) {
        addArray(buffer);
        capturing = false;
        buffer = '';
      }

      continue;
    }

    const header = /^\[([^\]]+)]/.exec(line);

    if (header?.[1]) {
      section = header[1].toLowerCase();
      continue;
    }

    const dependenciesSection =
      /^(?:project|project\.optional-dependencies|dependency-groups|tool\.poetry\.dependencies|tool\.poetry\.group\.[^.]+\.dependencies|build-system)$/.test(
        section,
      );

    if (!dependenciesSection) continue;

    if (section.startsWith('tool.poetry.')) {
      const poetry = /^([A-Za-z][\w.-]*)\s*=/.exec(line);

      if (poetry?.[1] && poetry[1].toLowerCase() !== 'python') {
        push(store, 'pythonPackages', poetry[1], file);
      }
    }

    const assignment = /^[\w.-]+\s*=\s*(\[.*)$/.exec(line);

    if (assignment?.[1]) {
      buffer = assignment[1];

      if (buffer.includes(']')) {
        addArray(buffer);
        buffer = '';
      } else {
        capturing = true;
      }
    }
  }
};

const parsePipfile: ManifestParser = (store, content, file) => {
  let section = '';

  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)]/.exec(line);

    if (header?.[1]) {
      section = header[1];
      continue;
    }

    if (section !== 'packages' && section !== 'dev-packages') continue;
    const match = /^\s*["']?([A-Za-z][\w.-]*)["']?\s*=/.exec(line);

    if (match?.[1]) push(store, 'pythonPackages', match[1], file);
  }
};

const parseSetupCfg: ManifestParser = (store, content, file) => {
  let section = '';
  let parsingDeps = false;

  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)]/.exec(line);

    if (header?.[1]) {
      section = header[1];
      parsingDeps = false;
      continue;
    }

    if (section !== 'options' && section !== 'options.extras_require') continue;

    if (/^\s*(?:install_requires|[\w.-]+)\s*=/.test(line)) {
      parsingDeps = section === 'options.extras_require' || line.includes('install_requires');
      continue;
    }

    if (parsingDeps && /^\s+\S/.test(line)) parseRequirements(store, line, file);
  }
};

function parseGems(store: ManifestIndex, content: string, file: string, lock: boolean): void {
  if (!lock) {
    for (const match of content.matchAll(/^\s*gem\s*\(?\s*["']([^"']+)["']/gm)) {
      if (match[1]) push(store, 'gems', match[1], file);
    }

    return;
  }

  let deps = false;

  for (const line of content.split(/\r?\n/)) {
    if (line === 'DEPENDENCIES') {
      deps = true;
      continue;
    }

    if (deps && /^\S/.test(line)) deps = false;

    if (!deps) continue;
    const match = /^\s{2}([\w-]+)(?:[\s(!~<>=]|$)/.exec(line);

    if (match?.[1]) push(store, 'gems', match[1], file);
  }
}

const parseGoMod: ManifestParser = (store, content, file) => {
  let inside = false;

  for (const rawLine of content.split(/\r?\n/)) {
    if (/\/\/\s*indirect(?:\s|$)/.test(rawLine)) continue;
    const line = rawLine.split('//')[0]?.trim() ?? '';

    if (/^require\s*\(/.test(line)) {
      inside = true;
      continue;
    }

    if (inside && line.startsWith(')')) {
      inside = false;
      continue;
    }

    const candidate = inside ? line : line.replace(/^require\s+/, '');

    if (!inside && candidate === line) continue;
    const match = /^([^\s()]+)\s+v[\w.+-]+/.exec(candidate);

    if (match?.[1]) push(store, 'goModules', match[1], file);
  }
};

const parseCargo: ManifestParser = (store, content, file) => {
  let deps = false;
  let subtable = '';
  let renamedSubtable = '';

  const flush = () => {
    if (subtable) push(store, 'rustCrates', renamedSubtable || subtable, file);
  };

  for (const line of content.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]+)]/.exec(line);

    if (header?.[1]) {
      flush();

      const table =
        /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)\.(?:"([^"]+)"|'([^']+)'|([\w-]+))$/.exec(
          header[1],
        );

      subtable = table?.[1] ?? table?.[2] ?? table?.[3] ?? '';
      renamedSubtable = '';
      deps = /(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies)$/.test(header[1]);
      continue;
    }

    if (subtable) {
      const renamed = /^\s*package\s*=\s*["']([\w-]+)["']/.exec(line);

      if (renamed?.[1]) renamedSubtable = renamed[1];
      continue;
    }

    if (!deps) continue;
    const match = /^\s*["']?([\w-]+)["']?\s*=/.exec(line);

    if (!match?.[1]) continue;
    const renamed = /\bpackage\s*=\s*["']([\w-]+)["']/.exec(line);
    push(store, 'rustCrates', renamed?.[1] ?? match[1], file);
  }

  flush();
};

const parseMix: ManifestParser = (store, content, file) => {
  for (const match of content.matchAll(/{\s*:([a-z]\w*)\s*,/g)) {
    if (match[1]) push(store, 'elixirPackages', match[1], file);
  }
};

const parseGemfile: ManifestParser = (store, content, file) => {
  parseGems(store, content, file, false);
};

const parseGemfileLock: ManifestParser = (store, content, file) => {
  parseGems(store, content, file, true);
};

const parsersByBasename = new Map<string, ManifestParser>([
  ['package.json', parsePackageJson],
  ['composer.json', parseComposer],
  ['composer.lock', parseComposerLock],
  ['pyproject.toml', parsePyproject],
  ['Pipfile', parsePipfile],
  ['setup.cfg', parseSetupCfg],
  ['Gemfile', parseGemfile],
  ['Gemfile.lock', parseGemfileLock],
  ['go.mod', parseGoMod],
  ['Cargo.toml', parseCargo],
  ['mix.exs', parseMix],
]);

function parserFor(basename: string): ManifestParser | undefined {
  const exact = parsersByBasename.get(basename);

  if (exact) return exact;

  if (/^requirements[-\w.]*\.txt$/.test(basename)) return parseRequirements;

  return undefined;
}

/** Index direct package references from manifests, including nested workspaces. */
export async function indexManifests(tree: ProjectTree): Promise<ManifestIndex> {
  const store: ManifestIndex = new Map();

  for (const file of tree.files) {
    const basename = file.split('/').at(-1) ?? '';
    const parser = parserFor(basename);

    if (!parser) continue;
    // Read sequentially; the scanner caps retained text with a byte budget.
    // eslint-disable-next-line no-await-in-loop
    const contents = await tree.read(file);

    if (contents !== undefined) parser(store, contents, file);
  }

  return store;
}

/** Every manifest that references the given package in the given group. */
export function findPackage(
  manifests: ManifestIndex,
  group: ManifestGroup,
  packageName: string,
): string[] {
  return [...(manifests.get(`${group}:${normalize(group, packageName)}`) ?? [])];
}

/** Every indexed package in the given group, with the files that declare it. */
export function allPackages(
  manifests: ManifestIndex,
  group: ManifestGroup,
): Array<{name: string; files: string[]}> {
  const output: Array<{name: string; files: string[]}> = [];

  for (const [key, paths] of manifests) {
    if (key.startsWith(`${group}:`)) {
      output.push({name: key.slice(group.length + 1), files: [...paths]});
    }
  }

  return output;
}
