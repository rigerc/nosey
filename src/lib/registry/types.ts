import type {
	ComboSkill,
	DetectConfig,
	Technology,
} from '../../data/skills-map.js';

export type SkillRecord = {
	id: string;
	name: string;
	path: string;
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
	schemaVersion: 1;
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

export type MergedRegistry = {
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
export type JsonDetectConfig = Omit<
	DetectConfig,
	'packagePatterns' | 'configFileContent'
> & {
	packagePatterns?: JsonRegex[];
	configFileContent?: unknown;
};
