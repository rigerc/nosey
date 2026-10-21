import {mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import pkg from '../package.json';

async function main() {
  const {values} = parseArgs({
    options: {
      screen: {type: 'string', multiple: true},
      theme: {type: 'string', multiple: true},
      columns: {type: 'string', multiple: true},
      'output-dir': {type: 'string', default: 'screenshots'},
      ascii: {type: 'boolean', default: false},
      project: {type: 'string'},
      help: {type: 'boolean', short: 'h'},
    },
  });

  if (values.help) {
    console.log(`Usage: npm run screenshot -- [options]

  --screen <id>       Screen ID (repeat to select several; default: all)
  --theme <name>      nosey | dark | light | contrast | mono (repeat; default: all)
  --project <path>    Project to scan for the Scan preview (default: current directory)
  --columns <n>       Terminal width, 40–240 (repeat; default: 80 and 120)
  --output-dir <dir>  Destination directory (default: screenshots)
  --ascii            Use ASCII glyphs and borders
  -h, --help         Show this help

First run: npx playwright install chromium`);
    return;
  }

  // Set these before importing Ink/Chalk so pipes and CI retain theme colors.
  // App configuration and the Home screen's diagnostics must not depend on the host.
  delete process.env.NO_COLOR;
  process.env.FORCE_COLOR = '3';
  process.env.CI = '1';
  process.env.XDG_CONFIG_HOME = path.join(tmpdir(), `${pkg.name}-screenshots`);

  const [{renderToString}, {App}, {screenIds}, {themeNames}, {default: Convert}, {chromium}] =
    await Promise.all([
      import('ink'),
      import('../src/app'),
      import('../src/screens'),
      import('../src/theme/tokens'),
      import('ansi-to-html'),
      import('playwright'),
    ]);

  const selectedScreens = [...new Set(values.screen ?? screenIds)];
  const selectedThemes = [...new Set(values.theme ?? themeNames)];
  const widths = [...new Set(values.columns ?? ['80', '120'])];
  for (const screen of selectedScreens) {
    if (!screenIds.includes(screen))
      throw new Error(`Unknown screen "${screen}". Choose: ${screenIds.join(', ')}`);
  }
  for (const theme of selectedThemes) {
    if (!themeNames.some((name) => name === theme))
      throw new Error(`Unknown theme "${theme}". Choose: ${themeNames.join(', ')}`);
  }
  for (const width of widths) {
    if (!/^\d+$/.test(width) || Number(width) < 40 || Number(width) > 240) {
      throw new Error('--columns must be an integer between 40 and 240');
    }
  }

  const outputDir = path.resolve(values['output-dir']);
  await mkdir(outputDir, {recursive: true});
  const {detectProject} = await import('../src/lib/detect');
  const report = await detectProject(values.project ?? process.cwd());
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: {width: 2560, height: 900},
      deviceScaleFactor: 1,
    });
    for (const screen of selectedScreens) {
      for (const theme of selectedThemes) {
        for (const width of widths) {
          const columns = Number(width);
          // renderToString sets Yoga's width; hooks also read stdout's dimensions.
          Object.defineProperty(process.stdout, 'columns', {value: columns, configurable: true});
          Object.defineProperty(process.stdout, 'rows', {value: 40, configurable: true});
          const options = {
            theme: theme as (typeof themeNames)[number],
            ascii: values.ascii,
            debug: false,
            screen,
            report,
            static: true,
          };
          const ansi = renderToString(<App options={options} />, {columns});
          if (!ansi.trim()) throw new Error(`Empty render: ${screen}/${theme}/${columns}`);

          const background =
            theme === 'light'
              ? '#F5E6C8'
              : theme === 'nosey'
                ? '#14100A'
                : theme === 'dark'
                  ? '#1a1b26'
                  : '#000000';
          const foreground =
            theme === 'light' ? '#14100A' : theme === 'nosey' ? '#F5E6C8' : '#c0caf5';
          const html = new Convert({fg: foreground, bg: background, escapeXML: true}).toHtml(ansi);
          await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
            body { margin: 0; background: ${background}; }
            main { display: inline-block; padding: 24px; background: ${background}; color: ${foreground}; }
            pre { margin: 0; width: ${columns}ch; font: 14px/20px "DejaVu Sans Mono", monospace;
              font-variant-ligatures: none; white-space: pre; }
          </style></head><body><main><pre>${html}</pre></main></body></html>`);
          await page.evaluate(() => document.fonts.ready);
          const filename = `${screen}-${theme}-${columns}${values.ascii ? '-ascii' : ''}.png`;
          await page
            .locator('main')
            .screenshot({path: path.join(outputDir, filename), animations: 'disabled'});
          console.log(path.join(outputDir, filename));
        }
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
