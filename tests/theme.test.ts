import {describe, expect, it} from 'vite-plus/test';
import {resolveThemeName} from '../src/theme/resolve';
import {themes} from '../src/theme/themes';
import {themeNames, tones} from '../src/theme/tokens';

describe('themes', () => {
  it('defines every token in every theme', () => {
    for (const name of themeNames) {
      for (const tone of tones) expect(tone in themes[name].color).toBe(true);
    }
  });

  it('only the mono theme drops color', () => {
    for (const name of themeNames) {
      expect(themes[name].mono).toBe(name === 'mono');
      expect(themes[name].color.primary === undefined).toBe(name === 'mono');
    }
  });
});

describe('resolveThemeName', () => {
  it('NO_COLOR beats everything', () => {
    expect(resolveThemeName({flag: 'dark', noColor: true})).toBe('mono');
  });
  it('flag > env > config', () => {
    expect(resolveThemeName({flag: 'light', env: 'dark', config: 'contrast', noColor: false})).toBe(
      'light',
    );
    expect(resolveThemeName({env: 'contrast', config: 'light', noColor: false})).toBe('contrast');
    expect(resolveThemeName({config: 'light', noColor: false})).toBe('light');
  });
  it('ignores invalid names', () => {
    expect(resolveThemeName({flag: 'neon', config: 'light', noColor: false})).toBe('light');
  });

  it('defaults to the brand theme, and to light on a light terminal', () => {
    const previous = process.env.COLORFGBG;
    try {
      delete process.env.COLORFGBG;
      expect(resolveThemeName({noColor: false})).toBe('nosey');
      process.env.COLORFGBG = '0;15';
      expect(resolveThemeName({noColor: false})).toBe('light');
      process.env.COLORFGBG = '15;0';
      expect(resolveThemeName({noColor: false})).toBe('nosey');
    } finally {
      if (previous === undefined) delete process.env.COLORFGBG;
      else process.env.COLORFGBG = previous;
    }
  });
});
