import fs from 'node:fs/promises';
import path from 'node:path';
import {buildRegistry} from '../../src/lib/registry/commands.js';

/** Give behavior tests an explicit local skill without shipping it in the starter. */
export async function seedRegistrySkill(directory: string): Promise<void> {
  const skillDirectory = path.join(directory, 'skills/example-testing');
  await fs.mkdir(skillDirectory, {recursive: true});
  await fs.writeFile(
    path.join(skillDirectory, 'SKILL.md'),
    '---\nname: example-testing\ndescription: Testing conventions for React projects.\n---\n',
  );
  const mapPath = path.join(directory, 'skills-map.json');
  const map = JSON.parse(await fs.readFile(mapPath, 'utf8'));
  map.technologySkills = [{technologyId: 'react', skills: [map.registryId + '/example-testing']}];
  await fs.writeFile(mapPath, JSON.stringify(map, null, 2) + '\n');
  await buildRegistry(directory);
}
