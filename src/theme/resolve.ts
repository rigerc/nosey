import {themeNames, type ThemeName} from './tokens';
import defaults from './defaults.json';

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === 'string' && (themeNames as readonly string[]).includes(value);

/** Project-level default; 'auto' retains the original terminal detection behavior. */
if (defaults.defaultTheme !== 'auto' && !isThemeName(defaults.defaultTheme)) {
  throw new Error('Invalid theme default in src/theme/defaults.json');
}
export const defaultTheme = defaults.defaultTheme as ThemeName | 'auto';

/** Best-effort light/dark detection. COLORFGBG is "fg;bg" in many terminals. */
function detectScheme(): ThemeName {
  const bg = process.env.COLORFGBG?.split(';').pop();
  return bg === '7' || bg === '15' ? 'light' : 'nosey';
}

/** Order: NO_COLOR > --theme flag > env var > config file > project default > autodetect. */
export function resolveThemeName(input: {
  flag?: string | undefined;
  env?: string | undefined;
  config?: string | undefined;
  noColor: boolean;
}): ThemeName {
  if (input.noColor) return 'mono';
  for (const candidate of [input.flag, input.env, input.config]) {
    if (candidate === 'auto') return detectScheme();
    if (isThemeName(candidate)) return candidate;
  }
  return defaultTheme === 'auto' ? detectScheme() : defaultTheme;
}
