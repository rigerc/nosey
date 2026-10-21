import {describe, expect, it} from 'vite-plus/test';
import {defaultTheme, resolveThemeName} from '../src/theme/resolve';
import defaults from '../src/theme/defaults.json';
import palettes from '../src/theme/palettes.json';
import {appConfig} from '../src/config/schema';
import {themes} from '../src/theme/themes';
import {themeNames, tones} from '../src/theme/tokens';

describe('themes', () => {
  it('defines every token in every theme', () => {
    for (const name of themeNames) {
      for (const tone of tones) expect(tone in themes[name].color).toBe(true);
    }
  });

  it('reads the published color palettes without changing semantic token shape', () => {
    for (const name of ['dark', 'light', 'contrast'] as const) {
      expect(themes[name].color).toEqual(palettes[name]);
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
  it('uses the shared project default when higher-priority values are absent', () => {
    expect(defaultTheme).toBe(defaults.defaultTheme);
    expect(appConfig.fields[0]?.defaultValue).toBe(defaultTheme);
    const result = resolveThemeName({noColor: false});
    expect(result).toBe(
      defaultTheme === 'auto' ? resolveThemeName({config: 'auto', noColor: false}) : defaultTheme,
    );
  });

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
});
