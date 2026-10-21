import {renderToString} from 'ink';
import stringWidth from 'string-width';
import {describe, expect, it} from 'vite-plus/test';
import {AppProviders} from '../src/app';
import {GalleryExample, galleryItems} from '../src/screens/GalleryExamples';
import {themeNames} from '../src/theme/tokens';

describe('single-component gallery', () => {
  it('includes unique IDs and one searchable label per component', () => {
    const ids = galleryItems.map((item) => item.id);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
    expect(galleryItems.some((item) => item.id === 'search')).toBe(true);
  });

  for (const item of galleryItems) {
    for (const theme of themeNames) {
      for (const columns of [40, 80, 120]) {
        it(`${item.label} / ${theme} / ${columns} columns fits the terminal`, () => {
          const output = renderToString(
            <AppProviders options={{theme, ascii: true, debug: false, screen: 'gallery'}}>
              <GalleryExample id={item.id} searchActive={false} onSearchActiveChange={() => {}} />
            </AppProviders>,
            {columns},
          );
          expect(output.length).toBeGreaterThan(0);
          for (const line of output.split('\n'))
            expect(stringWidth(line)).toBeLessThanOrEqual(columns);
        });
      }
    }
  }
});
