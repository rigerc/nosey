import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseArgs} from 'node:util';
import pkg from '../package.json';
import type {AppOptions} from '../src/app';

async function main() {
  const {values} = parseArgs({
    options: {
      screen: {type: 'string', multiple: true},
      theme: {type: 'string', multiple: true},
      columns: {type: 'string', multiple: true},
      rows: {type: 'string', default: '40'},
      'output-dir': {type: 'string', default: 'screenshots'},
      ascii: {type: 'boolean', default: false},
      project: {type: 'string'},
      help: {type: 'boolean', short: 'h'},
    },
  });

  if (values.help) {
    console.log(`Usage: npm run screenshot -- [options]

  --screen <id>       Screen ID (repeat to select several; default: visible tabs)
  --theme <name>      nosey | dark | light | contrast | mono (repeat; default: all)
  --project <path>    Scan a real project instead of the built-in demo workspace
  --columns <n>       Terminal width, 40–240 (repeat; default: 80 and 120)
  --rows <n>          Terminal height, 24–100 (default: 40)
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
  delete process.env[`${pkg.name.toUpperCase()}_THEME`];
  delete process.env.CLI_ASCII;

  const [
    {renderToString},
    {App},
    {screenIds, navScreens, canonicalScreen},
    {themeNames},
    {default: Convert},
    {chromium},
  ] = await Promise.all([
    import('ink'),
    import('../src/app'),
    import('../src/screens'),
    import('../src/theme/tokens'),
    import('ansi-to-html'),
    import('playwright'),
  ]);

  const selectedScreens = [...new Set(values.screen ?? navScreens.map(({id}) => id))];
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

  const rows = Number(values.rows);
  if (!/^\d+$/.test(values.rows) || rows < 24 || rows > 100) {
    throw new Error('--rows must be an integer between 24 and 100');
  }

  const outputDir = path.resolve(values['output-dir']);
  await mkdir(outputDir, {recursive: true});
  const temporary = await mkdtemp(path.join(tmpdir(), `${pkg.name}-`));
  try {
    process.env.XDG_CONFIG_HOME = path.join(temporary, 'config');
    const configFile = path.join(temporary, 'config.json');
    const demo = path.join(temporary, 'demo-app');
    if (!values.project) {
      await mkdir(path.join(demo, 'src'), {recursive: true});
      await mkdir(path.join(demo, '.claude'), {recursive: true});
      await writeFile(
        path.join(demo, 'package.json'),
        JSON.stringify({
          name: 'demo-app',
          private: true,
          type: 'module',
          dependencies: {react: '^19.0.0', 'react-dom': '^19.0.0'},
          devDependencies: {typescript: '^5.0.0', vite: '^7.0.0', vitest: '^3.0.0'},
        }),
      );
      await writeFile(path.join(demo, 'tsconfig.json'), '{}\n');
      await writeFile(path.join(demo, 'index.html'), '<div id="root"></div>\n');
      await writeFile(
        path.join(demo, 'src', 'App.tsx'),
        'export const App = () => <h1>Hello</h1>;\n',
      );
    }
    const {detectProject} = await import('../src/lib/detect');
    const {defaultScan} = await import('../src/features/skills/context');
    const report = await detectProject(values.project ?? demo);
    // Stable display paths keep documentation independent of the capture machine.
    if (!values.project) report.project = '/workspace/demo-app';
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
            Object.defineProperty(process.stdout, 'rows', {value: rows, configurable: true});
            const options: AppOptions = {
              theme: theme as (typeof themeNames)[number],
              ascii: values.ascii,
              debug: false,
              screen: canonicalScreen(screen),
              configFile,
              configFlags: {theme: theme as (typeof themeNames)[number], ascii: values.ascii},
              scan: {...defaultScan, root: report.project},
              report,
              static: true,
            };
            const ansi = renderToString(<App options={options} />, {columns}).replaceAll(
              temporary,
              path.join(tmpdir(), `${pkg.name}-XXXXXX`),
            );
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
              theme === 'light'
                ? '#14100A'
                : theme === 'nosey'
                  ? '#F5E6C8'
                  : theme === 'dark'
                    ? '#c0caf5'
                    : '#ffffff';
            const html = new Convert({fg: foreground, bg: background, escapeXML: true}).toHtml(
              ansi,
            );
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
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
