import {
  asciiSpinner,
  asciiSymbols,
  unicodeSpinner,
  unicodeSymbols,
  type Palette,
  type Theme,
  type ThemeName,
} from './tokens';
import palettes from './palettes.json';

const make = (name: ThemeName, color: Palette, extra: Partial<Theme> = {}): Theme => ({
  name,
  mono: false,
  color,
  border: {base: 'round', focus: 'bold'},
  symbols: unicodeSymbols,
  motion: {spinner: unicodeSpinner, intervalMs: 80},
  ...extra,
});

const dark = make('dark', palettes.dark);

const light = make('light', palettes.light);
const nosey = make('nosey', palettes.nosey);

/** Contrast uses ANSI named colors so the terminal palette stays in control. */
const contrast = make('contrast', palettes.contrast);

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

export const themes: Record<ThemeName, Theme> = {nosey, dark, light, contrast, mono};

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
