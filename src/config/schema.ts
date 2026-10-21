import {z} from 'zod';
import pkg from '../../package.json';
import {themeNames} from '../theme/tokens';
import {defineConfig} from './definition';

/** Loose parsing retains application-specific extension keys during edits. */
export const configSchema = z.looseObject({
  version: z.number().int().positive().optional(),
  theme: z.enum(['auto', ...themeNames]).optional(),
  ascii: z.boolean().optional(),
});

export type Config = z.infer<typeof configSchema>;

export const appConfig = defineConfig({
  schema: configSchema,
  version: 1,
  fields: [
    {
      path: 'theme',
      label: 'Terminal theme',
      section: 'Appearance',
      kind: 'select',
      description: 'nosey by default; Auto follows the terminal background.',
      defaultValue: 'auto',
      env: `${pkg.name.replaceAll('-', '_').toUpperCase()}_THEME`,
      options: [
        {value: 'auto', label: 'Auto (nosey, light on light terminals)'},
        ...themeNames.map((value) => ({value, label: value === 'nosey' ? 'nosey (brand)' : value})),
      ],
    },
    {
      path: 'ascii',
      label: 'ASCII symbols',
      section: 'Appearance',
      kind: 'toggle',
      description: 'Use ASCII-only symbols and borders.',
      defaultValue: false,
      env: 'CLI_ASCII',
    },
  ],
});
