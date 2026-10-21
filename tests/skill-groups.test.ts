import {test, expect} from 'vite-plus/test';
import type {Report} from '../src/lib/detect.js';
import {
  deriveSkillGroups,
  groupRows,
  orderedSelection,
  selectedInGroup,
} from '../src/features/skills/groups.js';
import {filterSkills} from '../src/features/skills/filter.js';

const report: Report = {
  project: '/tmp/nosey-example',
  scannedFiles: 2,
  truncated: false,
  skippedFiles: [],
  technologies: [
    {
      id: 'react',
      name: 'React',
      evidence: ['package.json: react'],
      skills: ['shared', 'react-only'],
    },
    {id: 'next', name: 'Next.js', evidence: ['package.json: next'], skills: ['shared']},
  ],
  combinations: [
    {id: 'react-next', name: 'React + Next', requires: ['react', 'next'], skills: ['combo']},
  ],
  agents: [],
  frontendDetected: false,
  skills: [
    {
      id: 'shared',
      sources: [
        {type: 'technology', id: 'react', name: 'React'},
        {type: 'technology', id: 'next', name: 'Next.js'},
      ],
    },
    {id: 'react-only', sources: [{type: 'technology', id: 'react', name: 'React'}]},
    {id: 'combo', sources: [{type: 'combination', id: 'react-next', name: 'React + Next'}]},
  ],
  summary: {technologies: 2, combinations: 1, suggestedSkills: 3, technologiesWithoutSkills: 0},
};

test('Nosey grouping deduplicates shared skill IDs in the selected output', () => {
  const groups = deriveSkillGroups(report);
  expect(groups.map((group) => group.key)).toEqual([
    'technology:react',
    'technology:next',
    'combination:react-next',
  ]);
  expect(selectedInGroup(groups[0]!, new Set(['shared']))).toBe(1);
  expect(selectedInGroup(groups[1]!, new Set(['shared']))).toBe(1);
  expect(orderedSelection(report, new Set(['shared', 'combo']))).toEqual(['shared', 'combo']);
});

test('Nosey group rows honor collapsed groups and skill filtering', () => {
  const filtered = filterSkills(report.skills, 'next');
  expect(filtered.map((skill) => skill.id)).toEqual(['shared', 'combo']);
  const rows = groupRows(
    deriveSkillGroups(report),
    new Set(['shared']),
    new Set(['technology:react']),
  );
  expect(rows.map((row) => row.key)).toEqual([
    'technology:react',
    'technology:next',
    'technology:next/shared',
  ]);
});

test('empty group and zero-selection reports remain valid', () => {
  const blank = {...report, skills: [], technologies: [], combinations: []};
  expect(deriveSkillGroups(blank)).toEqual([]);
  expect(orderedSelection(blank, new Set())).toEqual([]);
});

test('always recommended skills have their own group and share selection identity', () => {
  const source = {
    type: 'always' as const,
    id: 'acme/skills',
    name: 'Always recommended (acme/skills)',
  };
  const augmented = {
    ...report,
    skills: report.skills.map((skill) => ({...skill, sources: [...skill.sources, source]})),
  };
  const groups = deriveSkillGroups(augmented);
  expect(groups.at(-1)?.title).toBe('Always recommended · acme/skills');
  expect(groups.at(-1)?.skillIds).toEqual(['shared', 'react-only', 'combo']);
  expect(orderedSelection(augmented, new Set(['shared']))).toEqual(['shared']);
});
