import {defineConfig} from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'build/**', 'dist/**', 'tttt/**'],
    // CLI integration cases launch several Node/tsx processes per test.
    testTimeout: 90_000,
    maxWorkers: 4,
  },
  pack: {
    entry: ['src/cli.tsx'],
    format: ['esm'],
    target: 'node24',
    clean: true,
    sourcemap: true,
    // Keep the published entry at dist/cli.js (package.json bin/start):
    // derive the extension from `"type": "module"` instead of forcing .mjs.
    fixedExtension: false,
    // Keep runtime deps external; they are installed alongside the package.
    deps: {
      neverBundle: ['react', 'ink', 'meow', 'zod', 'string-width'],
    },
    dts: false,
  },
  fmt: {
    // Keep the code style already used in this repository.
    singleQuote: true,
    bracketSpacing: false,
    // Generated output, scaffolded apps and tool state are not sources.
    ignorePatterns: [
      'build/**',
      'dist/**',
      'screenshots/**',
      'tttt/**',
      '.serena/**',
      '.impeccable/**',
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.continue/**',
      '.cursor/**',
      '.gemini/**',
      '.opencode/**',
      '.pi/**',
      '.roo/**',
      '.windsurf/**',
      'tools/oxlint/anti-slop/**',
      'assets/**',
    ],
  },
  lint: {
    jsPlugins: [
      {name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin'},
      {name: 'anti-slop', specifier: './tools/oxlint/anti-slop/index.ts'},
    ],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
      'oxc/no-accumulating-spread': 'error',
      'anti-slop/no-array-filter-map': 'error',
      'anti-slop/no-reduce-accumulator-copy': 'error',
      'anti-slop/no-chained-type-assertions': 'error',
      'anti-slop/no-conditional-empty-object-spread': 'error',
      'anti-slop/no-known-value-widening': 'error',
      'anti-slop/no-module-mocking': 'error',
      'anti-slop/no-object-parameters': 'error',
      'anti-slop/no-reflect-apply': 'error',
      'anti-slop/no-reflect-get': 'error',
      'anti-slop/no-runtime-typeof': 'error',
      'anti-slop/no-shape-in-symbol-names': 'error',
      'anti-slop/no-unknown-parameters': 'error',
      'anti-slop/no-unknown-returns': 'error',
      'anti-slop/no-unknown-type-aliases': 'error',
      'anti-slop/no-unsafe-dictionary-type': 'error',
      'anti-slop/no-widen-then-assert': 'error',
      'anti-slop/require-readable-spacing': 'error',
      'anti-slop/require-safety-comment-for-type-assertion': 'error',
    },
    options: {typeAware: true, typeCheck: true},
    // templates/app holds overlay files for generated apps: their relative
    // imports only resolve after scaffolding. Generated apps are typechecked
    // and tested in .github/workflows/scaffold.yml instead.
    ignorePatterns: [
      'build/**',
      'dist/**',
      'screenshots/**',
      'tttt/**',
      'templates/app/**',
      '.serena/**',
      '.impeccable/**',
      '.agent/**',
      '.agents/**',
      '.claude/**',
      '.codex/**',
      '.continue/**',
      '.cursor/**',
      '.gemini/**',
      '.opencode/**',
      '.pi/**',
      '.roo/**',
      '.windsurf/**',
      'tools/oxlint/anti-slop/**',
    ],
  },
});
