/**
 * nosey brand palette.
 *
 * Mirrors `assets/nosey-brand-kit/palette/colors.json`; `tests/brand.test.ts`
 * fails if the two drift apart. Assets live outside `src/` so they are never
 * bundled: this module is the only runtime copy of the palette.
 *
 * Rules from the kit:
 * - Nose is *the* accent — one per screen. Don't add a second accent.
 * - On light backgrounds the nose is Burnt, never Nose (amber on parchment is
 *   too faint). `theme nosey` is a dark-ground theme by design; light terminals
 *   use `theme light`.
 * - No recoloring outside this palette, no stretching, no outlines.
 */
export const brandColors = {
  /** Dark ground. Terminals, code. */
  ground: '#14100A',
  /** Cards, code blocks. */
  surface: '#231C10',
  /** Text on dark, light ground. */
  parchment: '#F5E6C8',
  /** The accent. One per screen. */
  nose: '#FFB000',
  /** Accent text on light. */
  burnt: '#8A5A00',
  /** Secondary text, light. */
  umber: '#6B5A38',
  /** Secondary text, dark. */
  dim: '#A08A60',
  /** Success, on dark only. */
  moss: '#A3D977',
} as const;

export type BrandColor = keyof typeof brandColors;

/**
 * Tints for UI roles the eight-color kit does not cover. Every value is derived
 * from a palette color (lightened toward Parchment) rather than invented, so the
 * kit's "don't recolor outside the palette" rule still holds.
 */
export const brandTints = {
  /** Nose lifted, so a warning stays legible next to the accent. */
  warn: '#FFD37A',
} as const;

/** ANSI names keep danger inside the terminal's own palette. */
export const brandAnsi = {
  danger: 'redBright',
} as const;
