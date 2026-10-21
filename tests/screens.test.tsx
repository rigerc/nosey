import {renderToString} from 'ink';
import stringWidth from 'string-width';
import {describe, expect, it} from 'vite-plus/test';
import {AppProviders} from '../src/app';
import {screens} from '../src/screens';
import {themeNames} from '../src/theme/tokens';

const render = (
  id: string,
  theme: (typeof themeNames)[number],
  columns: number,
  ascii: boolean,
) => {
  const {Component} = screens.find((s) => s.id === id)!;
  return renderToString(
    <AppProviders options={{theme, ascii, debug: false, screen: id}}>
      <Component />
    </AppProviders>,
    {columns},
  );
};

describe('every screen × theme × width', () => {
  for (const {id} of screens) {
    for (const theme of themeNames) {
      for (const columns of [60, 120]) {
        it(`${id} / ${theme} / ${columns} cols fits the terminal`, () => {
          const out = render(id, theme, columns, false);
          expect(out.length).toBeGreaterThan(0);
          for (const line of out.split('\n'))
            expect(stringWidth(line)).toBeLessThanOrEqual(columns);
        });
      }
    }
  }

  it('ascii mode uses no unicode symbols', () => {
    const out = render('gallery', 'mono', 80, true);
    expect(out).not.toMatch(/[✔✖⚠ℹ❯█░─╭╮╰╯│]/);
  });

  it('mono output contains no color escape codes', () => {
    const out = render('gallery', 'mono', 80, false);
    // eslint-disable-next-line no-control-regex
    expect(out).not.toMatch(/\u001B\[(3|4|9)\d/);
  });
});
