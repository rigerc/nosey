import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vite-plus/test';
import {brandMark, brandTagline} from '../src/lib/brand';
import {brandColors} from '../src/theme/palette';
import {themes} from '../src/theme/themes';

const palettePath = new URL('../assets/nosey-brand-kit/palette/colors.json', import.meta.url);
const palette = JSON.parse(readFileSync(palettePath, 'utf8')) as Record<string, {hex: string}>;

describe('brand palette', () => {
  it('matches the brand kit colors.json', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(brandColors).sort());
    for (const [name, entry] of Object.entries(palette)) {
      expect(brandColors[name as keyof typeof brandColors]).toBe(entry.hex);
    }
  });

  it('drives the nosey theme with kit colors', () => {
    const {color} = themes.nosey;
    expect(color.primary).toBe(brandColors.nose);
    expect(color.text).toBe(brandColors.parchment);
    expect(color.success).toBe(brandColors.moss);
    expect(color.muted).toBe(brandColors.umber);
    // The kit's rule: on light grounds the nose is Burnt, never Nose.
    expect(color.primary).not.toBe(brandColors.burnt);
  });
});

describe('brand identity', () => {
  it('uses the kit mark and tagline verbatim', () => {
    expect(brandMark).toBe(':^)');
    expect(brandTagline).toBe('sniffs your workspace, suggests agent skills.');
  });

  it('keeps the mark pure ASCII so it renders without a font', () => {
    // eslint-disable-next-line no-control-regex
    expect(brandMark).toMatch(/^[\u0020-\u007E]+$/);
  });
});
