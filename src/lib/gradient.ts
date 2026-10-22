const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (value: string | undefined): value is string => !!value && HEX.test(value);

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** Linear RGB interpolation: one hex color per character. */
export function gradient(length: number, from: string, to: string): string[] {
  return Array.from({length}, (_, i) => {
    const t = length <= 1 ? 0 : i / (length - 1);

    const rgb = [0, 1, 2].map((k) =>
      Math.round(channel(from, k) + (channel(to, k) - channel(from, k)) * t)
        .toString(16)
        .padStart(2, '0'),
    );

    return `#${rgb.join('')}`;
  });
}
