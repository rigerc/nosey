import path from 'node:path';
import type {ConfigFileContentBlock, DetectConfig, Technology} from '../data/skills-map.js';
import {AGENT_FOLDER_MAP} from '../data/skills-map.js';
import {builtInRegistry} from './registry/merge.js';
import type {MergedRegistry, RegistryWarning, SkillInstallSource} from './registry/types.js';
import {matchesPath, scanProject} from './scanner.js';
import type {ProjectTree, ScanOptions, SkippedFile} from './scanner.js';
import {manifestGroups, allPackages, findPackage, indexManifests} from './manifests.js';
import type {ManifestIndex} from './manifests.js';

export type DetectOptions = ScanOptions & {
  /** Add frontend bonus skills when a frontend project is detected. */
  frontendBonus?: boolean;
  /** Optional additive registry containing built-in and custom definitions. */
  registry?: MergedRegistry;
  registryWarnings?: RegistryWarning[];
};

export type DetectedTechnology = {
  id: string;
  name: string;
  evidence: string[];
  skills: string[];
};

export type DetectedCombination = {
  id: string;
  name: string;
  requires: string[];
  skills: string[];
};

export type SkillSource = {
  type: 'technology' | 'combination' | 'frontend' | 'always';
  id: string;
  name: string;
};

export type SuggestedSkill = {
  id: string;
  sources: SkillSource[];
  installSource?: SkillInstallSource;
  installation?: {installedAgents: string[]; unverifiedAgents: string[]};
};

export type DetectedAgentFolder = {
  agent: string;
  folder: string;
};

export type Report = {
  project: string;
  scannedFiles: number;
  truncated: boolean;
  skippedFiles: SkippedFile[];
  technologies: DetectedTechnology[];
  combinations: DetectedCombination[];
  frontendDetected: boolean;
  agents: DetectedAgentFolder[];
  inspectedAgents?: string[];
  skills: SuggestedSkill[];
  registryWarnings?: RegistryWarning[];
  summary: {
    technologies: number;
    combinations: number;
    suggestedSkills: number;
    technologiesWithoutSkills: number;
  };
};

function endOfString(text: string, start: number): number {
  const quote = text[start];
  let end = start + 1;
  while (end < text.length) {
    const char = text[end++];
    if (char === '\\' && end < text.length) end++;
    else if (char === quote) break;
  }

  return end;
}

function contentWithoutComments(
  text: string,
  style: ConfigFileContentBlock['stripComments'],
  maskStrings: boolean | undefined,
): string {
  if (style === 'xml') {
    return text.replaceAll(/<!--[\s\S]*?-->/g, (match) => match.replaceAll(/[^\n]/g, ' '));
  }

  if (style === 'hash') {
    return text.replaceAll(/#[^\n]*/g, (match) => ' '.repeat(match.length));
  }

  if (style !== 'code' && !maskStrings) return text;

  const output: string[] = [];
  let i = 0;
  let start = 0;
  const mask = (value: string) => value.replaceAll(/[^\n]/g, ' ');
  while (i < text.length) {
    const char = text[i] ?? '';
    const next = text[i + 1];
    if (char === '"' || char === "'" || char === '`') {
      const beginning = i;
      i = endOfString(text, i);

      if (maskStrings) {
        output.push(text.slice(start, beginning), mask(text.slice(beginning, i)));
        start = i;
      }

      continue;
    }

    if (style === 'code' && char === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const boundary = end === -1 ? text.length : end;
      output.push(text.slice(start, i), ' '.repeat(boundary - i));
      i = boundary;
      start = i;
      continue;
    }

    if (style === 'code' && char === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const boundary = end === -1 ? text.length : end + 2;
      output.push(text.slice(start, i), mask(text.slice(i, boundary)));
      i = boundary;
      start = i;
      continue;
    }

    i++;
  }

  output.push(text.slice(start));
  return output.join('');
}

function isGradle(file: string): boolean {
  const name = file.split('/').at(-1) ?? '';
  return (
    /^(?:build|settings)\.gradle(?:\.kts)?$/.test(name) ||
    /^(?:gradle\.properties|libs\.versions\.toml)$/.test(name)
  );
}

function isDotNet(file: string): boolean {
  return (
    /\.(?:csproj|fsproj|vbproj|props|targets)$/.test(file) ||
    /(?:^|\/)Directory\.(?:Build|Packages)\.(?:props|targets)$/.test(file)
  );
}

function matchesContentFile(file: string, block: ConfigFileContentBlock): boolean {
  if ((block.files ?? []).some((candidate) => matchesPath(file, candidate))) {
    return true;
  }

  if (block.scanGradleLayout && isGradle(file)) return true;
  if (block.scanDotNetLayout && isDotNet(file)) return true;
  if ((block.sourceExtensions ?? []).some((ext) => file.endsWith(ext))) return true;
  return false;
}

function contentBlocks(detect: DetectConfig): ConfigFileContentBlock[] {
  const config = detect.configFileContent;
  if (!config) return [];
  return Array.isArray(config) ? config : [config];
}

const evidenceLimit = 6;

type EvidenceCollector = {
  add: (reason: string) => void;
  count: () => number;
  values: () => string[];
};

function createCollector(): EvidenceCollector {
  const reasons = new Set<string>();
  return {
    add(reason) {
      if (reasons.size < evidenceLimit) reasons.add(reason);
    },
    count() {
      return reasons.size;
    },
    values() {
      return [...reasons];
    },
  };
}

/** Declared dependencies, including scoped package patterns. */
function manifestEvidence(
  manifests: ManifestIndex,
  detect: DetectConfig,
  collector: EvidenceCollector,
): void {
  for (const group of manifestGroups) {
    for (const packageName of detect[group] ?? []) {
      for (const file of findPackage(manifests, group, packageName)) {
        collector.add(`${group}: ${packageName} (${file})`);
      }
    }
  }

  if (!detect.packagePatterns?.length) return;
  for (const pkg of allPackages(manifests, 'packages')) {
    const matched = detect.packagePatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(pkg.name);
    });
    if (!matched) continue;
    for (const file of pkg.files) {
      collector.add(`packages: ${pkg.name} (${file})`);
    }
  }
}

/** Config files and source file extensions named by the mapping. */
function pathEvidence(tree: ProjectTree, detect: DetectConfig, collector: EvidenceCollector): void {
  for (const requested of detect.configFiles ?? []) {
    for (const file of [...tree.files, ...tree.directories]) {
      if (matchesPath(file, requested)) collector.add(`config: ${file}`);
      if (collector.count() >= evidenceLimit) break;
    }
  }

  for (const ext of detect.fileExtensions ?? []) {
    for (const file of tree.files) {
      if (file.endsWith(ext)) collector.add(`extension: ${file}`);
      if (collector.count() >= evidenceLimit) break;
    }
  }
}

/** Runs every pattern of a block against one file, recording which matched. */
function matchPatterns(contents: string, block: ConfigFileContentBlock, seen: boolean[]): boolean {
  let any = false;
  for (const [i, pattern] of block.patterns.entries()) {
    if (seen[i] && block.allPatterns) continue;
    if (pattern instanceof RegExp) pattern.lastIndex = 0;
    const matched =
      typeof pattern === 'string' ? contents.includes(pattern) : pattern.test(contents);
    if (matched) {
      seen[i] = true;
      any = true;
    }
  }

  return any;
}

/** File contents matching a configuration block's patterns. */
async function contentEvidence(
  tree: ProjectTree,
  detections: Array<{technology: Technology; collector: EvidenceCollector}>,
): Promise<void> {
  const states = detections.flatMap(({technology, collector}) =>
    contentBlocks(technology.detect)
      .filter((block) => block.patterns.length > 0)
      .map((block) => ({
        block,
        collector,
        seen: block.patterns.map(() => false),
        matchingFiles: new Set<string>(),
        done: false,
      })),
  );
  // Process a file once. Prepared variants live only until the next file.
  for (const file of tree.files) {
    const relevant = states.filter((state) => !state.done && matchesContentFile(file, state.block));
    if (relevant.length === 0) continue;
    // eslint-disable-next-line no-await-in-loop
    const original = await tree.read(file);
    if (original === undefined) continue;
    const prepared = new Map<string, string>();
    for (const state of relevant) {
      const {block, collector, seen, matchingFiles} = state;
      const key = `${block.stripComments ?? 'none'}:${block.maskStrings ? 'masked' : 'strings'}`;
      let contents = prepared.get(key);
      if (contents === undefined) {
        contents = contentWithoutComments(original, block.stripComments, block.maskStrings);
        prepared.set(key, contents);
      }

      const any = matchPatterns(contents, block, seen);
      if (any && matchingFiles.size < evidenceLimit) matchingFiles.add(file);
      if (!block.allPatterns && any) collector.add(`content: ${file}`);
      if (block.allPatterns && seen.every(Boolean)) {
        for (const match of matchingFiles) collector.add(`content: ${match}`);
        state.done = true;
      }

      if (collector.count() >= evidenceLimit) state.done = true;
    }
  }
}

function webFrontend(
  tree: ProjectTree,
  manifests: ManifestIndex,
  registry: MergedRegistry,
): boolean {
  const packageRoots = new Map<string, Set<string>>();
  for (const pkg of allPackages(manifests, 'packages')) {
    if (registry.frontendPackages.has(pkg.name)) return true;
    for (const file of pkg.files) {
      const root = path.posix.dirname(file);
      const names = packageRoots.get(root) ?? new Set<string>();
      names.add(pkg.name);
      packageRoots.set(root, names);
    }
  }

  // An empty nested manifest still establishes a separate workspace scope.
  for (const file of tree.files.filter((file) => matchesPath(file, 'package.json'))) {
    const root = path.posix.dirname(file);
    if (!packageRoots.has(root)) packageRoots.set(root, new Set());
  }

  const roots = [...packageRoots.keys()].sort((a, b) => b.length - a.length);
  return tree.files.some((file) => {
    if (/(?:^|\/)(?:docs?|tests?|__tests__|fixtures?|examples?)(?:\/|$)/i.test(file)) return false;
    const root = roots.find((root) => root === '.' || file.startsWith(`${root}/`));
    const packages = root ? packageRoots.get(root) : undefined;
    if (packages?.has('ink')) return false;
    if (packages?.has('react-native')) return false;
    return (
      /(?:^|\/)index\.html?$/.test(file) ||
      [...registry.webFrontendExtensions].some((ext) => file.endsWith(ext))
    );
  });
}

/**
 * The core public API. Does not modify the scanned project or install skills.
 */
export async function detectProject(root = '.', options: DetectOptions = {}): Promise<Report> {
  const tree = await scanProject(root, options);
  const manifests = await indexManifests(tree);
  const registry = options.registry ?? builtInRegistry();

  const technologies: DetectedTechnology[] = [];
  const detections = registry.technologies.map((technology) => ({
    technology,
    collector: createCollector(),
  }));
  for (const {technology, collector} of detections) {
    manifestEvidence(manifests, technology.detect, collector);
    pathEvidence(tree, technology.detect, collector);
  }

  await contentEvidence(tree, detections);
  for (const {technology, collector} of detections) {
    const evidence = collector.values();
    if (evidence.length > 0) {
      technologies.push({
        id: technology.id,
        name: technology.name,
        evidence,
        skills: [...technology.skills],
      });
    }
  }

  technologies.sort((a, b) => a.name.localeCompare(b.name));
  const detectedIds = new Set(technologies.map((tech) => tech.id));
  const combinations: DetectedCombination[] = registry.combinations
    .filter((combo) => combo.requires.every((id) => detectedIds.has(id)))
    .map((combo) => ({
      id: combo.id,
      name: combo.name,
      requires: [...combo.requires],
      skills: [...combo.skills],
    }));

  const skillMap = new Map<string, SkillSource[]>();
  const addSkills = (skills: string[], source: SkillSource) => {
    for (const id of skills) {
      let origins = skillMap.get(id);
      if (!origins) {
        origins = [];
        skillMap.set(id, origins);
      }

      if (!origins.some((existing) => existing.type === source.type && existing.id === source.id)) {
        origins.push(source);
      }
    }
  };

  for (const tech of technologies) {
    addSkills(tech.skills, {type: 'technology', id: tech.id, name: tech.name});
  }

  for (const combo of combinations) {
    addSkills(combo.skills, {
      type: 'combination',
      id: combo.id,
      name: combo.name,
    });
  }

  const frontendDetected = webFrontend(tree, manifests, registry);
  if (options.frontendBonus !== false && frontendDetected) {
    addSkills(registry.frontendBonusSkills, {
      type: 'frontend',
      id: 'frontend-bonus',
      name: 'Frontend project',
    });
  }

  for (const entry of registry.alwaysRecommend) {
    addSkills(entry.skills, {
      type: 'always',
      id: entry.registryId,
      name: 'Always recommended (' + entry.registryId + ')',
    });
  }

  const skills: SuggestedSkill[] = [...skillMap].map(([id, sources]) => ({
    id,
    sources,
  }));
  skills.sort((a, b) => a.id.localeCompare(b.id));

  const agents: DetectedAgentFolder[] = Object.entries(AGENT_FOLDER_MAP).flatMap(
    ([folder, agent]) =>
      tree.directories
        .filter((dir) => matchesPath(dir, folder))
        .map((dir) => ({agent, folder: dir})),
  );

  return {
    project: path.resolve(root),
    ...(options.registryWarnings?.length ? {registryWarnings: options.registryWarnings} : {}),
    scannedFiles: tree.files.length,
    truncated: tree.truncated,
    skippedFiles: tree.skippedFiles,
    technologies,
    combinations,
    frontendDetected,
    agents,
    skills,
    summary: {
      technologies: technologies.length,
      combinations: combinations.length,
      suggestedSkills: skills.length,
      technologiesWithoutSkills: technologies.filter((tech) => tech.skills.length === 0).length,
    },
  };
}
