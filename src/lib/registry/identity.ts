import {z} from 'zod';
import {isRecord, isString, type JsonObject, type JsonValue} from '../values.js';
import type {
  ConfigFileContentBlock,
  DetectConfig,
  McpServerMatcher,
} from '../../data/skills-map.js';
import type {RegistryManifest, RegistryMap} from './types.js';
import {mergeRegistries} from './merge.js';
import {parseMap, parseManifest} from './validate.js';

export const guideSentinel = '<!-- NOSEY-TEMPLATE-MAINTAINER-GUIDE:v1 -->';
export const catalogBegin = '<!-- BEGIN GENERATED SKILL CATALOG -->';
export const catalogEnd = '<!-- END GENERATED SKILL CATALOG -->';

export type GuidePolicy = {maintainer: string; downstream: string};

export type IdentityInput = {
  map: JsonValue;
  manifest: JsonValue;
  readme: string;
  agentGuide?: string;
  guidePolicy?: GuidePolicy;
  registryId: string;
};

export type IdentityOutput = {
  map: JsonObject;
  manifest: JsonObject;
  readme: string;
  agentGuide?: string;
};

const registryIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
  .refine(
    (value) =>
      !value.split('/').some((part) => part === '.' || part === '..' || part.endsWith('.')),
  );

const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const sortedUnique = (values: string[]): string[] => [...new Set(values)].sort(compare);

function rawObject(value: JsonValue, label: string): JsonObject {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);

  return structuredClone(value);
}

function escape(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/[\\`*_[\]{}()|#!+~]/g, '\\$&')
    .replace(/^-/, '\\-')
    .replace(/^(\d+)\.(?= )/, '$1\\.');
}

const detectionLabels = new Map<string, string>([
  ['packages', 'npm packages'],
  ['pythonPackages', 'Python packages'],
  ['composerPackages', 'Composer packages'],
  ['goModules', 'Go modules'],
  ['rustCrates', 'Rust crates'],
  ['elixirPackages', 'Elixir packages'],
  ['gems', 'Ruby gems'],
  ['configFiles', 'config files'],
  ['fileExtensions', 'file extensions'],
]);

const mcpIdentityFields = new Set(['packages', 'pythonPackages', 'endpoints', 'serverNames']);

function mcpDescription(matcher: McpServerMatcher): string {
  const fields: string[] = [];

  for (const field of [
    'packages',
    'pythonPackages',
    'endpoints',
    'serverNames',
    'configFiles',
  ] as const) {
    const values = matcher[field];

    if (values?.length) fields.push(`${field}: ${sortedUnique(values).join(', ')}`);
  }

  const identity = fields.filter((field) =>
    mcpIdentityFields.has(field.slice(0, field.indexOf(':'))),
  );

  const scope = fields.filter((field) => field.startsWith('configFiles:'));

  return `MCP server matching ${[...identity, ...scope].join('; ')}`;
}

function detectionSummary(detect: DetectConfig): string {
  const summaries: string[] = [];

  const stringGroups: Array<[string, string[] | undefined]> = [
    ['packages', detect.packages],
    ['pythonPackages', detect.pythonPackages],
    ['composerPackages', detect.composerPackages],
    ['goModules', detect.goModules],
    ['rustCrates', detect.rustCrates],
    ['elixirPackages', detect.elixirPackages],
    ['gems', detect.gems],
    ['configFiles', detect.configFiles],
    ['fileExtensions', detect.fileExtensions],
  ];

  for (const [key, rawValues] of stringGroups) {
    const label = detectionLabels.get(key);

    if (label && rawValues) {
      const values = sortedUnique(rawValues);

      if (values.length) summaries.push(`${label}: ${values.join(', ')}`);
    }
  }

  if (detect.mcpServers) summaries.push(...detect.mcpServers.map(mcpDescription));

  if (detect.packagePatterns) {
    const patterns = sortedUnique(
      detect.packagePatterns.map((pattern) => `/${pattern.source}/${pattern.flags}`),
    );

    if (patterns.length) summaries.push(`npm packages matching: ${patterns.join(', ')}`);
  }

  if (detect.configFileContent) {
    const blocks = contentBlocks(detect.configFileContent);

    for (const block of blocks) {
      const patterns = sortedUnique(
        block.patterns.map((pattern) =>
          isString(pattern) ? pattern : `/${pattern.source}/${pattern.flags}`,
        ),
      );

      if (!patterns.length) throw new Error('content patterns must not be empty');
      const files = sortedUnique(block.files ?? []);
      const scope = files.length ? files.join(', ') : 'config files';
      const options: string[] = [];

      if (block.sourceExtensions?.length)
        options.push(`source extensions: ${sortedUnique(block.sourceExtensions).join(', ')}`);

      if (block.scanGradleLayout) options.push('Gradle layout');

      if (block.scanDotNetLayout) options.push('.NET layout');

      if (block.stripComments) options.push(`ignore ${block.stripComments} comments`);

      if (block.maskStrings) options.push('ignore strings');
      summaries.push(
        `${scope} containing ${block.allPatterns ? 'all' : 'any'} of: ${patterns.join(', ')}${options.length ? ` (${options.join('; ')})` : ''}`,
      );
    }
  }

  return sortedUnique(summaries).join('; ');
}

function contentBlocks(
  value: ConfigFileContentBlock | ConfigFileContentBlock[],
): ConfigFileContentBlock[] {
  if (Array.isArray(value)) return value;

  return [value];
}

function catalog(manifest: RegistryManifest, map: RegistryMap): string {
  const skills = new Map(manifest.skills.map((skill) => [skill.id, skill]));
  const external = new Map((map.externalSkills ?? []).map((skill) => [skill.id, skill]));
  const recommendations = new Map<string, Set<string>>();

  for (const id of [...skills.keys(), ...external.keys()]) recommendations.set(id, new Set());

  const technologies = new Map(map.technologies.map((item) => [item.id, item]));
  const combinations = new Map(map.combinations.map((item) => [item.id, item]));

  const builtInNames = new Map([
    ['bash', 'Bash'],
    ['ink', 'Ink'],
    ['just', 'Just'],
    ['vitest', 'Vitest'],
  ]);

  const technologyName = (id: string): string =>
    technologies.get(id)?.name ?? builtInNames.get(id) ?? id;

  const technologyRule = (id: string): string => {
    const technology = technologies.get(id);
    const summary = technology ? detectionSummary(technology.detect) : '';

    return `${technologyName(id)} is detected${summary ? ` (${summary})` : ''}`;
  };

  const combinationRule = (id: string): string => {
    const combination = combinations.get(id);

    if (!combination) return `Combination ${id} is detected (defined by Nosey or another registry)`;
    const requires = sortedUnique(combination.requires);

    return `${combination.name} is detected (requires all: ${requires.map(technologyName).join(', ')})`;
  };

  const recommend = (ids: string[], rule: string, context: string): void => {
    for (const id of ids) {
      const rules = recommendations.get(id);

      if (!rules) throw new Error(`${context} references unknown skill: ${id}`);
      rules.add(rule);
    }
  };

  recommend(map.alwaysRecommend, 'Always recommended', 'alwaysRecommend');

  for (const item of map.technologies)
    recommend(item.skills, technologyRule(item.id), 'technology.skills');

  for (const item of map.technologySkills)
    recommend(item.skills, technologyRule(item.technologyId), 'technologySkills');

  for (const item of map.combinations)
    recommend(item.skills, combinationRule(item.id), 'combination.skills');

  for (const item of map.combinationSkills)
    recommend(item.skills, combinationRule(item.combinationId), 'combinationSkills');
  recommend(map.frontendBonusSkills, 'A web frontend is detected', 'frontendBonusSkills');

  const lines = [
    '## Skill catalog',
    '',
    `Registry: ${escape(manifest.registryId)} · ${skills.size + external.size} ${skills.size + external.size === 1 ? 'skill' : 'skills'}.`,
    '',
    'Generated from [skills-manifest.json](skills-manifest.json) and [skills-map.json](skills-map.json). Edit those sources or skill frontmatter, then regenerate this section.',
    '',
    'Recommendation conditions below are alternatives; matching any condition can recommend a skill. Technology detection is handled by Nosey.',
    '',
  ];

  if (!skills.size && !external.size) lines.push('No skills are registered.', '');

  const all = [...skills.values(), ...external.values()].sort((left, right) =>
    compare(left.id, right.id),
  );

  for (const skill of all) {
    const outside = external.get(skill.id);
    let link: string;

    if (outside) {
      link = `https://github.com/${outside.source.replace(/^(?:https:\/\/github\.com\/|git@github\.com:)/, '').replace(/(?:\.git)?\/?$/, '')}`;
    } else {
      const local = skills.get(skill.id);

      if (!local) throw new Error(`Missing skill record: ${skill.id}`);
      link = local.path
        .split('/')
        .map((part) =>
          encodeURIComponent(part).replace(
            /[!'()*]/g,
            (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
          ),
        )
        .join('/');
    }

    lines.push(`### [${escape(skill.name)}](${link})`, '');

    if (outside) lines.push(`External skill: ${escape(outside.skill)}.`, '');

    if (skill.description !== undefined) lines.push(escape(skill.description), '');
    const rules = sortedUnique([...(recommendations.get(skill.id) ?? [])]);

    if (rules.length)
      lines.push('**Recommended when:**', '', ...rules.map((rule) => `- ${escape(rule)}`), '');
    else lines.push('Available; no automatic recommendation.', '');
  }

  const frontend: string[] = [];

  if (map.frontendPackages.length)
    frontend.push(`- npm packages: ${escape(sortedUnique(map.frontendPackages).join(', '))}`);

  if (map.webFrontendExtensions.length)
    frontend.push(
      `- file extensions: ${escape(sortedUnique(map.webFrontendExtensions).join(', '))}`,
    );

  if (frontend.length)
    lines.push(
      '### Additional web frontend detection',
      '',
      'These extend Nosey’s built-in frontend detection rules:',
      '',
      ...frontend,
      '',
    );

  return lines.join('\n');
}

export function renderIdentityReadme(
  readme: string,
  manifest: RegistryManifest,
  map: RegistryMap,
): string {
  const start = readme.indexOf(catalogBegin);
  const end = readme.indexOf(catalogEnd);

  if (
    start < 0 ||
    end <= start ||
    readme.indexOf(catalogBegin, start + catalogBegin.length) >= 0 ||
    readme.indexOf(catalogEnd, end + catalogEnd.length) >= 0
  ) {
    throw new Error(
      'README.md requires exactly one ordered pair of generated skill catalog markers',
    );
  }

  const newline = readme.includes('\r\n') ? '\r\n' : '\n';

  return (
    readme.slice(0, start + catalogBegin.length) +
    newline +
    newline +
    catalog(manifest, map).replaceAll('\n', newline) +
    newline +
    readme.slice(end)
  );
}

function cleanNullableFields(map: JsonObject): JsonObject {
  const clean = structuredClone(map);

  const nullableFields = [
    'alwaysRecommend',
    'technologies',
    'technologySkills',
    'combinations',
    'combinationSkills',
    'frontendBonusSkills',
    'frontendPackages',
    'webFrontendExtensions',
  ];

  for (const field of nullableFields) if (clean[field] === null) delete clean[field];

  return clean;
}

function remapReferences(value: JsonValue, remap: (id: string) => string): JsonValue {
  if (!Array.isArray(value)) return value;

  return value.map((id) => {
    if (!isString(id)) throw new Error('Registry skill references must be strings');

    return remap(id);
  });
}

function remapNestedReferences(value: JsonValue, remap: (id: string) => string): JsonValue {
  if (!Array.isArray(value)) return value;

  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('Registry mapping entries must be objects');
    const result = structuredClone(entry);

    if (Array.isArray(result.skills)) result.skills = remapReferences(result.skills, remap);

    return result;
  });
}

/** Pure, lossless identity rewrite. Parser models validate and render; raw copies retain unknown JSON fields. */
export function transformRegistryIdentity(input: IdentityInput): IdentityOutput {
  if (!registryIdSchema.safeParse(input.registryId).success)
    throw new Error('Registry ID must be owner/repository');

  const map = rawObject(input.map, 'skills-map.json');
  const manifest = rawObject(input.manifest, 'skills-manifest.json');
  const rawRegistryId = map.registryId;

  if (
    !isString(rawRegistryId) ||
    !registryIdSchema.safeParse(rawRegistryId).success ||
    manifest.registryId !== rawRegistryId
  ) {
    throw new Error('Registry documents have inconsistent registry IDs');
  }

  const parsedMap = parseMap(cleanNullableFields(map));
  const parsedManifest = parseManifest(manifest);
  const localIds = new Map<string, string>();

  for (const skill of parsedManifest.skills) {
    if (!skill.id.startsWith(`${rawRegistryId}/`) || skill.id.length <= rawRegistryId.length + 1)
      throw new Error(`Invalid local skill ID: ${skill.id}`);

    if (
      skill.path.includes('\\') ||
      skill.path.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error(`Unsafe skill path: ${skill.path}`);
    const expectedId = `${rawRegistryId}/${skill.path.slice(7, -9)}`;

    if (
      !skill.path.startsWith('skills/') ||
      !skill.path.endsWith('/SKILL.md') ||
      skill.id !== expectedId
    )
      throw new Error(`Skill ID does not match path: ${skill.id}`);

    if (localIds.has(skill.id)) throw new Error(`Duplicate local skill ID: ${skill.id}`);
    localIds.set(skill.id, `${input.registryId}${skill.id.slice(rawRegistryId.length)}`);
  }

  const declaredExternal = new Set((parsedMap.externalSkills ?? []).map((skill) => skill.id));

  const references = [
    ...parsedMap.alwaysRecommend,
    ...parsedMap.frontendBonusSkills,
    ...parsedMap.technologies.flatMap((technology) => technology.skills),
    ...parsedMap.technologySkills.flatMap((binding) => binding.skills),
    ...parsedMap.combinations.flatMap((combination) => combination.skills),
    ...parsedMap.combinationSkills.flatMap((binding) => binding.skills),
  ];

  for (const id of references) {
    if (id.startsWith(`${rawRegistryId}/`) && !localIds.has(id) && !declaredExternal.has(id)) {
      throw new Error(`Undeclared local-looking skill reference: ${id}`);
    }
  }

  const remap = (id: string): string => localIds.get(id) ?? id;
  const rawSkills = manifest.skills;

  if (!Array.isArray(rawSkills)) throw new Error('skills-manifest.json skills must be an array');
  const rawById = new Map<string, JsonObject>();

  for (const entry of rawSkills) {
    if (!isRecord(entry) || !isString(entry.id))
      throw new Error('skills-manifest.json contains an invalid skill');
    rawById.set(entry.id, entry);
  }

  manifest.registryId = input.registryId;
  manifest.skills = parsedManifest.skills
    .toSorted((left, right) => compare(left.path, right.path))
    .map((skill) => {
      const rawSkill = rawById.get(skill.id);

      if (!rawSkill) throw new Error(`Missing raw manifest skill: ${skill.id}`);
      const updated = structuredClone(rawSkill);
      updated.id = remap(skill.id);

      return updated;
    });

  map.registryId = input.registryId;

  for (const field of ['alwaysRecommend', 'frontendBonusSkills']) {
    const value = map[field];

    if (value !== undefined && value !== null) map[field] = remapReferences(value, remap);
  }

  for (const field of ['technologies', 'technologySkills', 'combinations', 'combinationSkills']) {
    const value = map[field];

    if (value !== undefined && value !== null) map[field] = remapNestedReferences(value, remap);
  }

  const nextMap = parseMap(cleanNullableFields(map));
  const nextManifest = parseManifest(manifest);

  const merged = mergeRegistries([
    {map: nextMap, manifest: nextManifest, source: 'identity-transform'},
  ]);

  const firstWarning = merged.warnings[0];

  if (firstWarning) throw new Error(firstWarning.message);

  const declared = new Set([
    ...nextManifest.skills.map((skill) => skill.id),
    ...(nextMap.externalSkills ?? []).map((skill) => skill.id),
  ]);

  for (const id of nextMap.alwaysRecommend)
    if (!declared.has(id))
      throw new Error(`Always recommended skill not declared in registry: ${id}`);

  const readme = renderIdentityReadme(input.readme, nextManifest, nextMap);
  let agentGuide = input.agentGuide;

  if (agentGuide !== undefined) {
    if (input.guidePolicy) {
      const {maintainer, downstream} = input.guidePolicy;

      if (agentGuide === downstream) {
        // Already configured.
      } else if (agentGuide === maintainer && agentGuide.startsWith(`${guideSentinel}\n`)) {
        agentGuide = downstream;
      } else if (
        agentGuide.startsWith(guideSentinel) ||
        agentGuide.startsWith(`\uFEFF${guideSentinel}`)
      ) {
        throw new Error('Unrecognized or modified template maintainer AGENTS.md');
      }
    } else if (
      agentGuide.startsWith(guideSentinel) ||
      agentGuide.startsWith(`\uFEFF${guideSentinel}`)
    ) {
      throw new Error('A trusted guide policy is required to verify template maintainer AGENTS.md');
    }
  }

  const output: IdentityOutput = {map, manifest, readme};

  if (agentGuide !== undefined) output.agentGuide = agentGuide;

  return output;
}
