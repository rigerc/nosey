import {brandColors} from '../theme/palette';
import {APP_NAME} from './config';

/**
 * Brand identity as text. Colors live in `src/theme/palette.ts`; the TUI draws
 * the mark with `<BrandMark />`, which needs React — this module is for plain
 * console output, help text, and tests.
 *
 * The mark is pure ASCII on purpose: it renders identically in every terminal,
 * with no Unicode fallback and no font installed.
 */
export const brandMark = ':^)';

/** One sentence, lower case: the kit's voice. */
export const brandTagline = 'sniffs your workspace, suggests agent skills.';

/** Splash lines for help text and diagnostics. */
export const brandBanner = (name: string = APP_NAME): string[] => [
  `${brandMark}  ${name}`,
  brandTagline,
];

/** Truecolor SGR around the character that is already the accent. */
function accent(text: string): string {
  const hex = brandColors.nose;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `\u001B[38;2;${r};${g};${b}m${text}\u001B[39m`;
}

/** `:^)` for console output: the nose keeps its accent when color is allowed. */
export function brandMarkAnsi({color}: {color: boolean}): string {
  if (!color) return brandMark;
  return `${brandMark.slice(0, 1)}${accent(brandMark.slice(1, 2))}${brandMark.slice(2)}`;
}
