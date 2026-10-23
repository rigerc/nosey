import skillsMapSchema from '../../schemas/registry/skills-map.schema.json';
import manifestSchema from '../../schemas/registry/skills-manifest.schema.json';
import {AppError} from '../lib/errors';
import type {JsonObject} from '../lib/values';

/** Emit the canonical schemas without loading a registry or starting the UI. */
export function runSchema(args: string[]): void {
  if (args.length !== 1)
    throw new AppError('Expected: nosey schema <skills-map|manifest>', {exitCode: 2});

  let schema: JsonObject;

  switch (args[0]) {
    case 'skills-map':
    case 'skill-map':
    case 'map':
      schema = skillsMapSchema;
      break;
    case 'manifest':
    case 'skills-manifest':
      schema = manifestSchema;
      break;
    default:
      throw new AppError(`Unknown schema: ${args[0]}`, {
        hint: 'Expected: nosey schema <skills-map|manifest>',
        exitCode: 2,
      });
  }

  process.stdout.write(JSON.stringify(schema, null, 2) + '\n');
}
