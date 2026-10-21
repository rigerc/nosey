import {
  COMBO_SKILLS_MAP,
  FRONTEND_BONUS_SKILLS,
  FRONTEND_PACKAGES,
  SKILLS_MAP,
  WEB_FRONTEND_EXTENSIONS,
} from '../../data/skills-map.js';
import type {LoadedRegistry, MergedRegistry, RegistryWarning} from './types.js';
import {canonicalExternalSource} from './validate.js';

const addUnique = (target: string[], additions: string[]) => {
  for (const item of additions) if (!target.includes(item)) target.push(item);
};

export function builtInRegistry(): MergedRegistry {
  const technologies = SKILLS_MAP.map((item) => ({
    ...item,
    skills: [...item.skills],
  }));
  const combinations = COMBO_SKILLS_MAP.map((item) => ({
    ...item,
    skills: [...item.skills],
  }));
  return {
    alwaysRecommend: [],
    skillInstallSources: new Map(),
    externalSkillIds: new Set(),
    technologies,
    combinations,
    frontendBonusSkills: [...FRONTEND_BONUS_SKILLS],
    frontendPackages: new Set(FRONTEND_PACKAGES),
    webFrontendExtensions: new Set(WEB_FRONTEND_EXTENSIONS),
    registryIds: [],
    skillIds: new Set([
      ...technologies.flatMap((item) => item.skills),
      ...combinations.flatMap((item) => item.skills),
      ...FRONTEND_BONUS_SKILLS,
    ]),
  };
}

function validateAddition(current: MergedRegistry, incoming: LoadedRegistry): void {
  const {manifest, map} = incoming;
  if (current.registryIds.includes(manifest.registryId)) {
    throw new Error('Duplicate registryId: ' + manifest.registryId);
  }

  for (const skill of manifest.skills) {
    if (current.skillIds.has(skill.id)) throw new Error('Duplicate skill ID: ' + skill.id);
  }
  const localIds = new Set(manifest.skills.map((skill) => skill.id));
  for (const skill of (map.externalSkills ?? [])) {
    if (localIds.has(skill.id)) throw new Error('External skill duplicates local skill ID: ' + skill.id);
    if (!current.skillIds.has(skill.id)) continue;
    const previous = current.skillInstallSources?.get(skill.id);
    if (!previous && !current.externalSkillIds.has(skill.id)) {
      // Built-in suggestions can be declared explicitly by registries.
      continue;
    }
    if (!current.externalSkillIds.has(skill.id) || !previous ||
        canonicalExternalSource(previous.source) !== canonicalExternalSource(skill.source) ||
        previous.name !== skill.skill) {
      throw new Error('Conflicting external skill ID: ' + skill.id);
    }
  }

  const technologyIds = new Set(current.technologies.map((item) => item.id));
  for (const tech of map.technologies) {
    if (technologyIds.has(tech.id)) throw new Error('Duplicate technology definition: ' + tech.id);
    technologyIds.add(tech.id);
  }

  const combinationIds = new Set(current.combinations.map((item) => item.id));
  for (const combo of map.combinations) {
    if (combinationIds.has(combo.id))
      throw new Error('Duplicate combination definition: ' + combo.id);
    combinationIds.add(combo.id);
  }

  const registeredSkills = new Set([
    ...manifest.skills.map((item) => item.id),
    ...(map.externalSkills ?? []).map((item) => item.id),
  ]);
  const mapped = [
    ...map.technologies.flatMap((item) => item.skills),
    ...map.technologySkills.flatMap((item) => item.skills),
    ...map.combinations.flatMap((item) => item.skills),
    ...map.combinationSkills.flatMap((item) => item.skills),
    ...map.frontendBonusSkills,
  ];
  for (const id of mapped) {
    if (!registeredSkills.has(id)) throw new Error('Skill not declared in registry: ' + id);
  }

  for (const item of map.technologySkills) {
    if (!technologyIds.has(item.technologyId)) {
      throw new Error('Unknown technology reference: ' + item.technologyId);
    }
  }

  for (const item of map.combinationSkills) {
    if (!combinationIds.has(item.combinationId)) {
      throw new Error('Unknown combination reference: ' + item.combinationId);
    }
  }

  for (const item of map.combinations) {
    if (item.requires.some((id) => !technologyIds.has(id))) {
      throw new Error('Unknown technology in combination: ' + item.id);
    }
  }
}

/** Validate and merge registries atomically, skipping only invalid sources. */
export function mergeRegistries(registries: LoadedRegistry[]): {
  registry: MergedRegistry;
  warnings: RegistryWarning[];
} {
  const registry = builtInRegistry();
  const warnings: RegistryWarning[] = [];
  for (const incoming of registries) {
    try {
      validateAddition(registry, incoming);
    } catch (error: unknown) {
      warnings.push({
        source: incoming.source,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    for (const tech of incoming.map.technologies) {
      registry.technologies.push({...tech, skills: [...tech.skills]});
    }

    for (const binding of incoming.map.technologySkills) {
      const target = registry.technologies.find((item) => item.id === binding.technologyId);
      if (target) addUnique(target.skills, binding.skills);
    }

    for (const combo of incoming.map.combinations) {
      registry.combinations.push({...combo, skills: [...combo.skills]});
    }

    for (const binding of incoming.map.combinationSkills) {
      const target = registry.combinations.find((item) => item.id === binding.combinationId);
      if (target) addUnique(target.skills, binding.skills);
    }

    addUnique(registry.frontendBonusSkills, incoming.map.frontendBonusSkills);
    for (const item of incoming.map.frontendPackages) registry.frontendPackages.add(item);
    for (const item of incoming.map.webFrontendExtensions) registry.webFrontendExtensions.add(item);
    for (const item of incoming.(map.externalSkills ?? [])) {
      if (!registry.externalSkillIds.has(item.id)) {
        registry.skillInstallSources?.set(item.id, {source: item.source, name: item.skill});
      }
      registry.skillIds.add(item.id);
      registry.externalSkillIds.add(item.id);
    }
    for (const item of incoming.manifest.skills) {
      registry.skillIds.add(item.id);
      registry.skillInstallSources?.set(item.id, {
        source: incoming.source.replace(/#HEAD$/, ''),
        name: item.path.split('/').at(-2) ?? item.name,
      });
    }
    const available = new Set([
      ...incoming.manifest.skills.map((skill) => skill.id),
      ...incoming.(map.externalSkills ?? []).map((skill) => skill.id),
    ]);
    const alwaysRecommend = (incoming.map.alwaysRecommend ?? []).filter((id) => {
      if (available.has(id)) return true;
      warnings.push({
        source: incoming.source,
        message: 'Always recommended skill not declared in registry: ' + id,
      });
      return false;
    });
    if (alwaysRecommend.length > 0) {
      registry.alwaysRecommend.push({
        registryId: incoming.manifest.registryId,
        skills: alwaysRecommend,
      });
    }
    registry.registryIds.push(incoming.manifest.registryId);
  }

  return {registry, warnings};
}
