# Agent instructions for this CLI

These instructions apply to the **generated application**, not the ink-kit starter repository. Start with `README.md`, [UI framework guide](docs/ui-framework.md), [Architecture](docs/architecture.md) and [Add a feature](docs/adding-a-feature.md). The source in `src/` is the authoritative API reference.

## Architecture and implementation

- `src/cli.tsx` handles flags and interactive/plain rendering; `src/app.tsx` owns providers and the shared application shell.
- Add screens under `src/screens/` and register them in `src/screens/index.ts`. Put domain operations in `src/features/` instead of coupling them to Ink components. Register headless operations in `src/commands/index.ts`.
- Compose each screen with `ScreenLayout`; do not duplicate `AppShell`, application header, tabs or footer.
- Prefer existing `src/components/` and `src/hooks/` exports. Use `ScreenState` for loading, empty, error and success views and `useToast` for transient messages.
- Use `useKeymap` with `{scope: 'screen'}` for screen shortcuts. Shared key precedence is control > screen > global. Keep only one active keyboard control; text fields must capture input and release capture on close.
- Style with semantic theme tokens (`useTheme` / `useTone`), not hard-coded ANSI colors; support `NO_COLOR`, `--ascii`, and narrow terminals.
- Keep terminal rendering free of console logging; maintain headless/`--plain` behavior. Review generated documentation when changing framework conventions.
- Features are optional. Check `package.json` and the screen/command registries before assuming settings, gallery, doctor, screenshots, tests, or CI are installed.

## Toolchain and checks

This application uses **Vite+** for building and running tests. Run package.json scripts with the chosen package manager. If using the global `vp` CLI, note that `vp <name>` invokes a built-in command whereas `vp run <name>` runs a project script; inspect the scripts first.

- Install dependencies with `npm install`.
- Run `npm run typecheck` and `npm run build`.
- Run `npm run test`; keep interactive and plain-rendering coverage.
- For screenshots or recordings, follow [the recording guide](docs/recording.md) for VHS setup and editable interaction tapes.
- The generated CI workflow lives in `.github/workflows/ci.yml`.
- Confirm `node dist/cli.js --plain` prints output after a build.
