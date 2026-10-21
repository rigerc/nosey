import {themeNames, type ThemeName} from './tokens';

/** The brand theme is the default; `--theme dark` stays available. */
export const DEFAULT_THEME: ThemeName = 'nosey';

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === 'string' && (themeNames as readonly string[]).includes(value);

/**
 * Best-effort light/dark detection. COLORFGBG is "fg;bg" in many terminals.
 * A light terminal keeps the `light` theme: the kit forbids amber-on-parchment,
 * so the brand theme is dark-ground only.
 */
function detectScheme(): ThemeName {
  const bg = process.env.COLORFGBG?.split(';').pop();
  return bg === '7' || bg === '15' ? 'light' : DEFAULT_THEME;
}

/** Order: NO_COLOR > --theme flag > env var > config file > autodetect. */
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
  return detectScheme();
}
