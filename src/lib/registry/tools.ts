import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const source = fileURLToPath(new URL('../../../registry-tools/', import.meta.url));
const packaged = fileURLToPath(new URL('../registry-tools/', import.meta.url));

// Vite bundles runtime modules into dist/cli.js; standalone tools remain package assets.
export const registryToolsDirectory = existsSync(source) ? source : packaged;
export const configureTool = path.join(registryToolsDirectory, 'configure-registry.mjs');
