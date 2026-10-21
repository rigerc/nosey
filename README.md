# :^) nosey

A domain-agnostic terminal application built with Ink 8, React 19, and TypeScript. Requires Node.js 22+.

## Getting started

```bash
npm install
npm run dev             # Interactive terminal UI
npm run dev -- --plain  # One-shot output for CI/pipes
npm run build
npm start
```

## Commands

```bash
nosey --help
nosey --screen settings
nosey --setup          # Interactive configuration wizard
nosey doctor           # Environment and config diagnostics
nosey doctor --json    # Machine-readable diagnostics
nosey --screen gallery # Optional component gallery
```

## Extend your app

- Create screens in `src/screens/` and register them in `src/screens/index.ts`.
- Register noninteractive commands in `src/commands/index.ts`.
- Add feature modules under `src/features/` only when needed.
- Extend `src/config/schema.ts` for validated application settings.
- Reuse `src/components/`, `src/hooks/`, and `src/theme/`.
- See `docs/architecture.md` and `docs/adding-a-feature.md`.

Home, Settings, and Help are the only navigation tabs. The component gallery is
accessible by flag but is not part of your app's product functionality. No
business domain, fake task runner, or data backend is included.

## Brand

The brand kit lives in `assets/nosey-brand-kit/` (SVG sources, PNG renders,
palette, favicons, CLI banner). It is not bundled: `src/theme/palette.ts` is the
runtime copy of the palette and `tests/brand.test.ts` fails if the two drift.

`nosey` is the default theme: parchment on ground, with the mark's caret in Nose
amber. Every surface draws `:^)` through `<BrandMark />` — header, Home, Help,
`--help`, and `doctor` — so the accent never drifts to a hardcoded string.

```bash
nosey --theme dark     # the generic palette
nosey --theme light    # for light terminals
```

The brand theme is dark-ground by design — the kit forbids Nose amber on
parchment (it is too faint), so autodetect falls back to `light` on a light
terminal. Palette rules (one accent per screen, no recoloring, clear space) are
documented in `assets/nosey-brand-kit/README.md`.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm run screenshot  # Requires Playwright Chromium
```

GitHub Actions CI is included in `.github/workflows/ci.yml`.
