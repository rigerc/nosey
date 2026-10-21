import {z} from 'zod';
import pkg from '../../package.json';
import {themeNames} from '../theme/tokens';
import {defaultTheme} from '../theme/resolve';
import {defineConfig} from './definition';
import {SKILLS_CLI_AGENTS, validAgents} from '../features/skills/install';

/** Loose parsing retains application-specific extension keys during edits. */
export const configSchema = z.looseObject({
  version: z.number().int().positive().optional(),
  theme: z.enum(['auto', ...themeNames]).optional(),
  ascii: z.boolean().optional(),
  compactMode: z.boolean().optional(),
  skillsCli: z.object({
    enabled: z.boolean().optional(),
    defaultAgents: z.array(z.string()).refine(validAgents, 'Unsupported or duplicate agent').optional(),
  }).optional(),
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
      description: 'Auto detects light/dark; NO_COLOR always forces mono.',
      defaultValue: defaultTheme,
      env: `${pkg.name.replaceAll('-', '_').toUpperCase()}_THEME`,
      options: [
        {value: 'auto', label: 'Auto (terminal default)'},
        ...themeNames.map((value) => ({value, label: value})),
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
    {
      path: 'compactMode',
      label: 'Compact mode',
      section: 'Appearance',
      kind: 'toggle',
      description: 'Show a minimal Scan interface when Nosey opens directly on Scan.',
      defaultValue: false,
    },
    {
      path: 'skillsCli.enabled',
      label: 'Generate Skills CLI commands',
      section: 'Skills CLI',
      kind: 'toggle',
      description: 'Only print project-local install commands after confirmation; never run them.',
      defaultValue: false,
    },
    {
      path: 'skillsCli.defaultAgents',
      label: 'Default target agents',
      section: 'Skills CLI',
      kind: 'multi',
      description: 'Commands target these agents in the scanned project only.',
      defaultValue: [],
      options: SKILLS_CLI_AGENTS,
    },
  ],
});
