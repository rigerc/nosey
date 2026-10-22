import type {ComboSkill, DetectConfig, Technology} from '../../data/skills-map.js';

export type SkillRecord = {
  id: string;
  name: string;
  path: string;
  description?: string;
};

/** An installable skill hosted outside the declaring registry. */
export type ExternalSkillRecord = {
  id: string;
  name: string;
  source: string;
  skill: string;
  description?: string;
};

export type RegistryManifest = {
  schemaVersion: 1;
  registryId: string;
  skills: SkillRecord[];
};

export type TechnologySkills = {technologyId: string; skills: string[]};

export type CombinationSkills = {combinationId: string; skills: string[]};

export type RegistryMap = {
  alwaysRecommend: string[];
  /** V1 maps contain local skills only; V2 allows external skill declarations. */
  schemaVersion: 1 | 2;
  /** Absent in legacy v1 maps constructed directly or persisted before v2. */
  externalSkills?: ExternalSkillRecord[];
  registryId: string;
  technologies: Technology[];
  technologySkills: TechnologySkills[];
  combinations: ComboSkill[];
  combinationSkills: CombinationSkills[];
  frontendBonusSkills: string[];
  frontendPackages: string[];
  webFrontendExtensions: string[];
};

export type LoadedRegistry = {
  manifest: RegistryManifest;
  map: RegistryMap;
  source: string;
};

export type SkillInstallSource = {source: string; name: string};

export type MergedRegistry = {
  skillInstallSources?: Map<string, SkillInstallSource>;
  /** Distinguishes reusable external IDs from locally defined skill IDs. */
  externalSkillIds: Set<string>;
  alwaysRecommend: Array<{registryId: string; skills: string[]}>;
  technologies: Technology[];
  combinations: ComboSkill[];
  frontendBonusSkills: string[];
  frontendPackages: Set<string>;
  webFrontendExtensions: Set<string>;
  registryIds: string[];
  skillIds: Set<string>;
};

export type RegistryWarning = {source: string; message: string};

/** JSON representations use {source, flags?} for regular expressions. */
export type JsonRegex = {source: string; flags?: string};

export type JsonDetectConfig = Omit<DetectConfig, 'packagePatterns' | 'configFileContent'> & {
  packagePatterns?: JsonRegex[];
  configFileContent?: unknown;
};
