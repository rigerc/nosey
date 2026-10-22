import type {Report} from '../../lib/detect.js';

export type SkillGroup = {
  readonly key: string;
  readonly title: string;
  readonly kind: 'technology' | 'combination' | 'frontend' | 'always';
  readonly skillIds: readonly string[];
  readonly evidence: readonly string[];
};

export type PickerRow =
  | {
      readonly key: string;
      readonly kind: 'group';
      readonly group: SkillGroup;
      readonly matchingIds: readonly string[];
    }
  | {
      readonly key: string;
      readonly kind: 'skill';
      readonly group: SkillGroup;
      readonly skillId: string;
    };

/** Keep distinct identities within each group, but allow shared IDs across groups. */
export function deriveSkillGroups(report: Report): SkillGroup[] {
  const group = (
    kind: SkillGroup['kind'],
    id: string,
    title: string,
    evidence: readonly string[],
  ): SkillGroup | undefined => {
    const skillIds = report.skills
      .filter((skill) => skill.sources.some((source) => source.type === kind && source.id === id))
      .map((skill) => skill.id);

    if (skillIds.length === 0) return undefined;

    return {key: `${kind}:${id}`, kind, title, evidence, skillIds};
  };

  const groups: SkillGroup[] = [];

  for (const technology of report.technologies) {
    const entry = group('technology', technology.id, technology.name, technology.evidence);

    if (entry) groups.push(entry);
  }

  for (const combination of report.combinations) {
    const evidence = report.technologies
      .filter((technology) => combination.requires.includes(technology.id))
      .flatMap((technology) =>
        technology.evidence.map((reason) => `${technology.name}: ${reason}`),
      );

    const entry = group('combination', combination.id, combination.name, evidence);

    if (entry) groups.push(entry);
  }

  const frontend = group('frontend', 'frontend-bonus', 'Frontend essentials', []);

  if (frontend) groups.push(frontend);

  const alwaysRegistryIds = [
    ...new Set(
      report.skills.flatMap((skill) =>
        skill.sources.filter((source) => source.type === 'always').map((source) => source.id),
      ),
    ),
  ];

  for (const registryId of alwaysRegistryIds) {
    const entry = group('always', registryId, 'Always recommended · ' + registryId, [
      'Listed in alwaysRecommend in the ' + registryId + ' registry',
    ]);

    if (entry) groups.push(entry);
  }

  return groups;
}

/** Filter the logical unique skill IDs first, then show each ID in every source group. */
export function groupRows(
  groups: readonly SkillGroup[],
  matching: ReadonlySet<string>,
  collapsed: ReadonlySet<string>,
): PickerRow[] {
  const rows: PickerRow[] = [];

  for (const group of groups) {
    const matchingIds = group.skillIds.filter((id) => matching.has(id));

    if (matchingIds.length === 0) continue;
    rows.push({key: group.key, kind: 'group', group, matchingIds});

    if (!collapsed.has(group.key)) {
      for (const skillId of matchingIds) {
        rows.push({
          key: `${group.key}/${skillId}`,
          kind: 'skill',
          group,
          skillId,
        });
      }
    }
  }

  return rows;
}

export function selectedInGroup(group: SkillGroup, selected: ReadonlySet<string>): number {
  return group.skillIds.filter((id) => selected.has(id)).length;
}

export function orderedSelection(report: Report, selected: ReadonlySet<string>): string[] {
  return report.skills.filter((skill) => selected.has(skill.id)).map((skill) => skill.id);
}
