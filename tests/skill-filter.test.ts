import {test, expect} from 'vite-plus/test';
import {filterSkills} from '../src/features/skills/filter.js';
import type {SuggestedSkill} from '../src/lib/detect.js';

const skills: SuggestedSkill[] = [
  {
    id: 'acme/react',
    sources: [{type: 'technology', id: 'react', name: 'React'}],
  },
  {
    id: 'acme/clerk',
    sources: [{type: 'combination', id: 'next-clerk', name: 'Next.js + Clerk'}],
  },
];

test('filters skill IDs and provenance, case-insensitively', () => {
  expect(filterSkills(skills, 'CLERK').map((skill) => skill.id)).toStrictEqual(['acme/clerk']);
  expect(filterSkills(skills, 'next.js').map((skill) => skill.id)).toStrictEqual(['acme/clerk']);
  expect(filterSkills(skills, '').length).toBe(2);
  expect(filterSkills(skills, 'missing')).toStrictEqual([]);
});
