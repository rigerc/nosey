import {brandAnsi, brandColors, brandTints} from './palette';
import {
  asciiSpinner,
  asciiSymbols,
  unicodeSpinner,
  unicodeSymbols,
  type Palette,
  type Theme,
  type ThemeName,
} from './tokens';

const make = (name: ThemeName, color: Palette, extra: Partial<Theme> = {}): Theme => ({
  name,
  mono: false,
  color,
  border: {base: 'round', focus: 'bold'},
  symbols: unicodeSymbols,
  motion: {spinner: unicodeSpinner, intervalMs: 80},
  ...extra,
});

const dark = make('dark', {
  primary: '#7aa2f7',
  accent: '#bb9af7',
  success: '#9ece6a',
  warn: '#e0af68',
  danger: '#f7768e',
  info: '#7dcfff',
  muted: '#565f89',
  text: '#c0caf5',
  subtle: '#737aa2',
  border: '#3b4261',
  focus: '#7aa2f7',
  onTone: '#1a1b26',
});

const light = make('light', {
  primary: '#2e5cb8',
  accent: '#7b3fb5',
  success: '#2f7d32',
  warn: '#a15c00',
  danger: '#c62828',
  info: '#00698f',
  muted: '#6b7280',
  text: '#1f2937',
  subtle: '#4b5563',
  border: '#9ca3af',
  focus: '#2e5cb8',
  onTone: '#ffffff',
});

/** The nosey brand theme: parchment on ground, nose as the single accent. */
const nosey = make('nosey', {
  primary: brandColors.nose,
  accent: brandColors.parchment,
  success: brandColors.moss,
  warn: brandTints.warn,
  danger: brandAnsi.danger,
  info: brandColors.dim,
  muted: brandColors.umber,
  text: brandColors.parchment,
  subtle: brandColors.dim,
  border: brandColors.umber,
  focus: brandColors.nose,
  onTone: brandColors.ground,
});

/** ANSI named colors only, so the user's terminal palette stays in control. */
const contrast = make('contrast', {
  primary: 'cyanBright',
  accent: 'magentaBright',
  success: 'greenBright',
  warn: 'yellowBright',
  danger: 'redBright',
  info: 'blueBright',
  muted: 'white',
  text: 'whiteBright',
  subtle: 'white',
  border: 'whiteBright',
  focus: 'yellowBright',
  onTone: 'black',
});

const none = undefined;
const mono = make(
  'mono',
  {
    primary: none,
    accent: none,
    success: none,
    warn: none,
    danger: none,
    info: none,
    muted: none,
    text: none,
    subtle: none,
    border: none,
    focus: none,
    onTone: none,
  },
  {mono: true, border: {base: 'single', focus: 'double'}},
);

export const themes: Record<ThemeName, Theme> = {dark, light, nosey, contrast, mono};

/** Swap unicode glyphs for ASCII ones (dumb terminals, legacy Windows consoles). */
export function applyGlyphs(theme: Theme, ascii: boolean): Theme {
  if (!ascii) return theme;
  return {
    ...theme,
    border: {base: 'classic', focus: 'classic'},
    symbols: asciiSymbols,
    motion: {...theme.motion, spinner: asciiSpinner},
  };
}
