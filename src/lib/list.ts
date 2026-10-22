/** Normalize user-provided sizes so empty/invalid pages cannot produce NaN indexes. */
export const listSize = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : fallback;

export const listIndex = (value: number, length: number) =>
  Math.max(0, Math.min(Number.isFinite(value) ? Math.trunc(value) : 0, length - 1));

export function listWindow(index: number, length: number, size: number) {
  const start = Math.max(0, Math.min(index - size + 1, length - size));

  return {start, end: Math.min(length, start + size)};
}
