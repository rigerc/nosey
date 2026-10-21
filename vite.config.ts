import {defineConfig} from 'vite-plus';

export default defineConfig({
  staged: {
    '*': 'vp check --fix',
  },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'build/**', 'dist/**', 'tttt/**'],
  },
  pack: {
    entry: ['src/cli.tsx'],
    format: ['esm'],
    target: 'node22',
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
      '.claude/**',
      // Brand assets are exported from the design tool; format them there.
      'assets/**',
    ],
  },
  lint: {
    jsPlugins: [{name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin'}],
    rules: {'vite-plus/prefer-vite-plus-imports': 'error'},
    options: {typeAware: true, typeCheck: true},
    // templates/app holds overlay files for generated apps: their relative
    // imports only resolve after scaffolding. Generated apps are typechecked
    // and tested in .github/workflows/scaffold.yml instead.
    ignorePatterns: [
      'build/**',
      'dist/**',
      'screenshots/**',
      'tttt/**',
      'assets/**',
      'templates/app/**',
    ],
  },
});
