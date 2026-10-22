export const themeNames = ['dark', 'light', 'nosey', 'contrast', 'mono'] as const;

export type ThemeName = (typeof themeNames)[number];

export const tones = ['primary', 'accent', 'success', 'warn', 'danger', 'info', 'muted'] as const;

export type Tone = (typeof tones)[number];

export type BorderName = 'round' | 'single' | 'bold' | 'double' | 'classic';

/** Colors are optional so the mono theme can opt out of color entirely. */
export type Palette = Record<Tone, string | undefined> & {
  text: string | undefined;
  subtle: string | undefined;
  border: string | undefined;
  focus: string | undefined;
  /** Text color on top of a solid tone background. */
  onTone: string | undefined;
};

export interface Symbols {
  success: string;
  error: string;
  warn: string;
  info: string;
  pointer: string;
  bullet: string;
  pending: string;
  ellipsis: string;
  line: string;
  barFull: string;
  barEmpty: string;
}

export interface Theme {
  name: ThemeName;
  /** True when the theme carries no color and relies on weight/symbols. */
  mono: boolean;
  color: Palette;
  border: {base: BorderName; focus: BorderName};
  symbols: Symbols;
  motion: {spinner: string[]; intervalMs: number};
}

export const unicodeSymbols: Symbols = {
  success: '✔',
  error: '✖',
  warn: '⚠',
  info: 'ℹ',
  pointer: '❯',
  bullet: '•',
  pending: '○',
  ellipsis: '…',
  line: '─',
  barFull: '█',
  barEmpty: '░',
};

export const asciiSymbols: Symbols = {
  success: '+',
  error: 'x',
  warn: '!',
  info: 'i',
  pointer: '>',
  bullet: '*',
  pending: 'o',
  ellipsis: '...',
  line: '-',
  barFull: '#',
  barEmpty: '-',
};

export const unicodeSpinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export const asciiSpinner = ['-', '\\', '|', '/'];
