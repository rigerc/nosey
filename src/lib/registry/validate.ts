import path from 'node:path';
import type {ConfigFileContentBlock, DetectConfig} from '../../data/skills-map.js';
import type {
  CombinationSkills,
  ExternalSkillRecord,
  RegistryManifest,
  RegistryMap,
  SkillRecord,
  TechnologySkills,
} from './types.js';

type ObjectValue = Record<string, unknown>;

function object(value: unknown, context: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(context + ' must be an object');
  }

  return value as ObjectValue;
}

function text(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(context + ' must be a nonempty string');
  }

  return value;
}

function strings(value: unknown, context: string): string[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'string' && item.length > 0)
  ) {
    throw new Error(context + ' must be an array of nonempty strings');
  }

  return value as string[];
}

function optionalStrings(value: unknown, context: string): string[] {
  return value === undefined ? [] : strings(value, context);
}

function unique(items: string[], context: string): void {
  if (new Set(items).size !== items.length) throw new Error('Duplicate ' + context);
}

function regex(value: unknown, context: string): RegExp {
  const rule = object(value, context);
  if (
    typeof rule['source'] !== 'string' ||
    (rule['flags'] !== undefined && typeof rule['flags'] !== 'string')
  ) {
    throw new Error(context + ' requires source and optional flags');
  }

  if (rule['source'].length > 512) throw new Error(context + ': regex exceeds 512 characters');
  try {
    // Stateful regex flags are irrelevant to detection; forbid them for deterministic matching.
    if (/[gy]/.test(rule['flags'] ?? '')) throw new Error('stateful regex flags are not supported');
    return new RegExp(rule['source'], rule['flags'] ?? '');
  } catch (error: unknown) {
    throw new Error(context + ': ' + String(error));
  }
}

function contentBlock(value: unknown): ConfigFileContentBlock {
  const block = object(value, 'configFileContent block');
  if (
    !Array.isArray(block['patterns']) ||
    block['patterns'].length === 0 ||
    block['patterns'].length > 64
  ) {
    throw new Error('configFileContent.patterns must be a nonempty array');
  }

  const result: ConfigFileContentBlock = {
    patterns: block['patterns'].map((entry: unknown) =>
      typeof entry === 'string' ? entry : regex(entry, 'content pattern'),
    ),
  };
  for (const key of ['files', 'sourceExtensions'] as const) {
    if (block[key] !== undefined) result[key] = strings(block[key], key);
  }

  for (const key of [
    'scanGradleLayout',
    'scanDotNetLayout',
    'allPatterns',
    'maskStrings',
  ] as const) {
    if (block[key] !== undefined) {
      if (typeof block[key] !== 'boolean') throw new Error(key + ' must be a boolean');
      result[key] = block[key];
    }
  }

  if (block['stripComments'] !== undefined) {
    if (
      typeof block['stripComments'] !== 'string' ||
      !['code', 'hash', 'xml'].includes(block['stripComments'])
    ) {
      throw new Error('Invalid stripComments');
    }

    result.stripComments = block['stripComments'] as ConfigFileContentBlock['stripComments'];
  }

  return result;
}

function detect(value: unknown): DetectConfig {
  const input = object(value, 'detect');
  const result: DetectConfig = {};
  for (const key of [
    'packages',
    'pythonPackages',
    'composerPackages',
    'goModules',
    'rustCrates',
    'elixirPackages',
    'configFiles',
    'fileExtensions',
    'gems',
  ] as const) {
    if (input[key] !== undefined) result[key] = strings(input[key], 'detect.' + key);
  }

  if (input['packagePatterns'] !== undefined) {
    if (!Array.isArray(input['packagePatterns']))
      throw new Error('packagePatterns must be an array');
    result.packagePatterns = input['packagePatterns'].map((item: unknown) =>
      regex(item, 'packagePattern'),
    );
  }

  if (input['configFileContent'] !== undefined) {
    result.configFileContent = Array.isArray(input['configFileContent'])
      ? input['configFileContent'].map((entry) => contentBlock(entry))
      : contentBlock(input['configFileContent']);
  }

  const allowed = new Set([...Object.keys(result), 'packagePatterns', 'configFileContent']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error('Unknown detection field: ' + key);
  }

  return result;
}

/** A manifest path cannot escape the registry or use a symlink as its final file. */
export function safeSkillPath(value: unknown): string {
  const name = text(value, 'skill path');
  if (
    name.includes('\\') ||
    path.posix.isAbsolute(name) ||
    name.includes('\0') ||
    path.posix.normalize(name) !== name ||
    name.split('/').includes('..') ||
    name.split('/').includes('.') ||
    !name.endsWith('/SKILL.md')
  ) {
    throw new Error('Unsafe skill path: ' + name);
  }

  return name;
}

function header(value: ObjectValue): string {
  if (value['schemaVersion'] !== 1) throw new Error('Unsupported schemaVersion (expected 1)');
  return text(value['registryId'], 'registryId');
}

export function parseManifest(raw: unknown): RegistryManifest {
  const value = object(raw, 'skills-manifest.json');
  const registryId = header(value);
  if (!Array.isArray(value['skills'])) throw new Error('skills must be an array');
  if (value['skills'].length > 20_000) throw new Error('Registry contains too many skills');
  const skills: SkillRecord[] = value['skills'].map((entry: unknown) => {
    const item = object(entry, 'skill');
    const skill: SkillRecord = {
      id: text(item['id'], 'skill.id'),
      name: text(item['name'], 'skill.name'),
      path: safeSkillPath(item['path']),
    };
    if (item['description'] !== undefined)
      skill.description = text(item['description'], 'skill.description');
    return skill;
  });
  unique(
    skills.map((skill) => skill.id),
    'skill IDs',
  );
  unique(
    skills.map((skill) => skill.path),
    'skill paths',
  );
  return {schemaVersion: 1, registryId, skills};
}

function bindings(
  value: unknown,
  field: string,
  key: 'technologyId' | 'combinationId',
): Array<TechnologySkills & CombinationSkills> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(field + ' must be an array');
  return value.map((entry: unknown) => {
    const item = object(entry, field + ' entry');
    return {
      [key]: text(item[key], field + '.' + key),
      skills: strings(item['skills'], field + '.skills'),
    };
  }) as Array<TechnologySkills & CombinationSkills>;
}

/** Normalize GitHub remote spellings for cross-registry external identity checks. */
export function canonicalExternalSource(value: string): string {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*?)(?:\.git)?\/?$/i.exec(value);
  if (!match) throw new Error('External skill source must be a GitHub owner/repository or GitHub HTTPS/SSH URL');
  const [owner, repo] = match[1]!.split('/');
  if (!owner || !repo || repo === '..' || owner.endsWith('.') || repo.endsWith('.')) {
    throw new Error('Invalid external skill source: ' + value);
  }
  return owner.toLowerCase() + '/' + repo.toLowerCase();
}

function externalSkill(value: unknown): ExternalSkillRecord {
  const item = object(value, 'external skill');
  const id = text(item['id'], 'external skill.id');
  if (!/^[A-Za-z0-9_.@-]+\/[A-Za-z0-9_.@-]+\/[A-Za-z0-9_.@-]+$/.test(id) ||
      id.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid external skill ID: ' + id);
  }
  const source = text(item['source'], 'external skill.source');
  canonicalExternalSource(source);
  const skillName = text(item['skill'], 'external skill.skill');
  if (!/^[A-Za-z0-9_.@-]+$/.test(skillName) || skillName === '.' || skillName === '..') {
    throw new Error('Invalid external skill name: ' + skillName);
  }
  for (const key of Object.keys(item)) {
    if (!['id', 'name', 'description', 'source', 'skill'].includes(key)) {
      throw new Error('Unknown external skill field: ' + key);
    }
  }
  const result: ExternalSkillRecord = {id, name: text(item['name'], 'external skill.name'), source, skill: skillName};
  if (item['description'] !== undefined)
    result.description = text(item['description'], 'external skill.description');
  return result;
}

export function parseMap(raw: unknown): RegistryMap {
  const value = object(raw, 'skills-map.json');
  if (value['schemaVersion'] !== 1 && value['schemaVersion'] !== 2) {
    throw new Error('Unsupported skills-map.json schemaVersion (expected 1 or 2)');
  }
  const version = value['schemaVersion'];
  const registryId = text(value['registryId'], 'registryId');
  if (version === 1 && value['externalSkills'] !== undefined) {
    throw new Error('externalSkills requires skills-map.json schemaVersion 2');
  }
  const external = value['externalSkills'] ?? [];
  if (!Array.isArray(external) || external.length > 20_000) {
    throw new Error('externalSkills must be an array of at most 20000 entries');
  }
  const technologies = (value['technologies'] ?? []) as unknown;
  const combinations = (value['combinations'] ?? []) as unknown;
  if (!Array.isArray(technologies) || !Array.isArray(combinations)) {
    throw new TypeError('technologies and combinations must be arrays');
  }

  const map: RegistryMap = {
    alwaysRecommend: optionalStrings(value['alwaysRecommend'], 'alwaysRecommend'),
    schemaVersion: version,
    registryId,
    externalSkills: external.map((item: unknown) => externalSkill(item)),
    technologies: technologies.map((entry: unknown) => {
      const item = object(entry, 'technology');
      return {
        id: text(item['id'], 'technology.id'),
        name: text(item['name'], 'technology.name'),
        detect: detect(item['detect']),
        skills: optionalStrings(item['skills'], 'technology.skills'),
      };
    }),
    technologySkills: bindings(value['technologySkills'], 'technologySkills', 'technologyId'),
    combinations: combinations.map((entry: unknown) => {
      const item = object(entry, 'combination');
      return {
        id: text(item['id'], 'combination.id'),
        name: text(item['name'], 'combination.name'),
        requires: strings(item['requires'], 'combination.requires'),
        skills: optionalStrings(item['skills'], 'combination.skills'),
      };
    }),
    combinationSkills: bindings(value['combinationSkills'], 'combinationSkills', 'combinationId'),
    frontendBonusSkills: optionalStrings(value['frontendBonusSkills'], 'frontendBonusSkills'),
    frontendPackages: optionalStrings(value['frontendPackages'], 'frontendPackages'),
    webFrontendExtensions: optionalStrings(value['webFrontendExtensions'], 'webFrontendExtensions'),
  };
  unique((map.externalSkills ?? []).map((item) => item.id), 'external skill IDs');
  unique(
    map.technologies.map((item) => item.id),
    'technology IDs',
  );
  unique(
    map.combinations.map((item) => item.id),
    'combination IDs',
  );
  unique(
    map.technologySkills.map((item) => item.technologyId),
    'technology associations',
  );
  unique(
    map.combinationSkills.map((item) => item.combinationId),
    'combination associations',
  );
  return map;
}
