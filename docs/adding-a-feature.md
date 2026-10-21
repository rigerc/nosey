# Adding a Nosey feature

New domain features belong under `src/features/<feature>/` for operations and models,
or `src/lib/` for pure shared services. Keep services independent of React and Ink
so the CLI and TUI can use the same operations.

1. Implement a pure feature service with unit tests in `tests/`.
2. Add a screen in `src/screens/`, building its controls with `src/components/`
   and `src/hooks/`.
3. Register it in `src/screens/index.ts` and update global key/help hints if needed.
4. Add a headless command to `src/cli.tsx` or `src/commands/` when the operation
   should also support scripts and pipes.
5. Only extend the versioned app config or registry config when the feature needs
   persisted settings.
6. Validate with `npm run typecheck`, `npm test`, `npm run build`, and `npm run check`.

Do not introduce another application shell, theme provider, router, terminal-key dispatcher,
or generic UI component library. The SkillSense integration established a single,
Nosey-native interface and shared domain services.
