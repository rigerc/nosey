import type {SuggestedSkill} from '../../lib/detect.js';

/** Match skill ID and source name while preserving report order. */
export function filterSkills(skills: readonly SuggestedSkill[], query: string): SuggestedSkill[] {
  const term = query.trim().toLocaleLowerCase();

  if (!term) return [...skills];

  return skills.filter(
    (skill) =>
      skill.id.toLocaleLowerCase().includes(term) ||
      skill.sources.some((source) => source.name.toLocaleLowerCase().includes(term)),
  );
}
