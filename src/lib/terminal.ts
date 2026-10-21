export const isCI = (): boolean => Boolean(process.env.CI);

/** https://no-color.org: any non-empty value disables color. */
export const noColor = (): boolean => (process.env.NO_COLOR ?? '') !== '';

export const isInteractive = (): boolean => Boolean(process.stdout.isTTY) && !isCI();

export function supportsUnicode(): boolean {
  const {TERM, CLI_ASCII, WT_SESSION, TERM_PROGRAM, ConEmuTask} = process.env;
  if (CLI_ASCII) return false;
  if (TERM === 'dumb' || TERM === 'linux') return false;
  if (process.platform === 'win32') return Boolean(WT_SESSION || TERM_PROGRAM || ConEmuTask);
  return true;
}
