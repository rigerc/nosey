import fs from 'node:fs/promises';
import path from 'node:path';

/** Give behavior tests an explicit local skill without shipping it in the starter. */
export async function seedRegistrySkill(directory: string): Promise<void> {
  const skillDirectory = path.join(directory, 'skills/example-testing');
  await fs.mkdir(skillDirectory, {recursive: true});
  await fs.writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    '---\nname: example-testing\ndescription: Testing conventions for React projects.\n---\n',
  );

  const mapPath = path.join(directory, 'skills-map.json');
  // SAFETY: scaffoldRegistry writes this checked-in JSON document with the stated fields.

  const map = JSON.parse(await fs.readFile(mapPath, 'utf8')) as {
    registryId: string;
    technologySkills: Array<{technologyId: string; skills: string[]}>;
  };

  const skillId = map.registryId + '/example-testing';
  map.technologySkills = [{technologyId: 'react', skills: [skillId]}];
  await fs.writeFile(mapPath, JSON.stringify(map, null, 2) + '\n');

  const manifestPath = path.join(directory, 'skills-manifest.json');
  // SAFETY: scaffoldRegistry writes this checked-in JSON document with the stated fields.

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    registryId: string;
    skills: Array<{id: string; name: string; path: string; description: string}>;
  };

  manifest.skills = [
    {
      id: skillId,
      name: 'Example testing',
      path: 'skills/example-testing/SKILL.md',
      description: 'Testing conventions for React projects.',
    },
  ];
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
