#!/usr/bin/env node
import {randomUUID} from 'node:crypto';
import {readFile, rename, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const palettePath = join(projectRoot, 'src/theme/palettes.json');
const defaultPath = join(projectRoot, 'src/theme/defaults.json');
const ansiColors = new Set(
  ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'].flatMap((color) => [
    color,
    color + 'Bright',
  ]),
);

function usage() {
  console.log(
    [
      'Theme customization for this project',
      '',
      'Usage:',
      '  npm run theme:list',
      '  npm run theme:token -- <theme> <token> <color>',
      '  npm run theme:default -- <theme|auto>',
      '',
      '  npm run theme -- list',
      "  npm run theme -- token dark primary '#ff80aa'",
      '  npm run theme -- default light',
      '',
      'Themes: nosey, dark, light, contrast, mono',
      'Default: auto (detect the terminal light/dark scheme)',
      'Colors: #RRGGBB or ANSI names (e.g. cyanBright).',
      'The contrast palette accepts ANSI names only; mono has no colors.',
      'Editing a token changes project source, not user config.',
      'CLI flags, environment variables, and saved config override the project default.',
    ].join('\n'),
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readJson(path) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (!isRecord(parsed)) throw new Error('Expected a JSON object in ' + path);
  return parsed;
}

async function saveJson(path, object) {
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    await writeFile(temp, JSON.stringify(object, null, 2) + '\n', {flag: 'wx'});
    await rename(temp, path);
  } catch (error) {
    await rm(temp, {force: true});
    throw error;
  }
}

async function list() {
  const [palettes, defaults] = await Promise.all([readJson(palettePath), readJson(defaultPath)]);
  console.log('Project default: ' + defaults.defaultTheme);
  for (const [name, palette] of Object.entries(palettes)) {
    if (!isRecord(palette)) throw new Error('Invalid palette: ' + name);
    console.log('\n' + name + ':');
    for (const [token, color] of Object.entries(palette)) {
      console.log('  ' + token + ': ' + color);
    }
  }
  console.log('\nmono: no colors');
}

async function setToken(theme, token, color) {
  if (!theme || !token || !color) {
    throw new Error('Usage: npm run theme:token -- <theme> <token> <color>');
  }
  const palettes = await readJson(palettePath);
  if (theme === 'mono') throw new Error('The mono theme has no colors to edit.');
  if (!Object.hasOwn(palettes, theme) || !isRecord(palettes[theme])) {
    throw new Error(
      'Unknown color theme "' + theme + '". Choose: ' + Object.keys(palettes).join(', '),
    );
  }
  const palette = palettes[theme];
  if (!Object.hasOwn(palette, token)) {
    throw new Error('Unknown token "' + token + '". Choose: ' + Object.keys(palette).join(', '));
  }
  if (
    theme === 'contrast'
      ? !ansiColors.has(color)
      : !(/^#[\da-f]{6}$/i.test(color) || ansiColors.has(color))
  ) {
    throw new Error(
      theme === 'contrast'
        ? 'Contrast colors must be ANSI names (e.g. cyanBright).'
        : 'Colors must be #RRGGBB or an ANSI name (e.g. cyanBright).',
    );
  }
  if (palette[token] === color) {
    console.log('Unchanged: ' + theme + '.' + token + ' = ' + color);
    return;
  }
  palette[token] = color;
  await saveJson(palettePath, palettes);
  console.log('Updated ' + theme + '.' + token + ' = ' + color);
}

async function setDefault(name) {
  if (!name) throw new Error('Usage: npm run theme:default -- <theme|auto>');
  const palettes = await readJson(palettePath);
  const available = ['auto', ...Object.keys(palettes), 'mono'];
  if (!available.includes(name)) {
    throw new Error('Unknown default theme "' + name + '". Choose: ' + available.join(', '));
  }
  const defaults = await readJson(defaultPath);
  if (defaults.defaultTheme === name) {
    console.log('Unchanged: project default = ' + name);
    return;
  }
  defaults.defaultTheme = name;
  await saveJson(defaultPath, defaults);
  console.log('Updated project default = ' + name);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    usage();
    return;
  }
  if (command === 'list' && args.length === 0) return list();
  if (command === 'token' && args.length === 3) return setToken(...args);
  if (command === 'default' && args.length === 1) return setDefault(args[0]);
  throw new Error('Unknown command or incorrect arguments. Run npm run theme -- --help.');
}

main().catch((error) => {
  console.error('Theme customization failed: ' + error.message);
  process.exitCode = 1;
});
