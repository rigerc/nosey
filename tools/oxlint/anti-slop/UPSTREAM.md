# Vendored anti-slop

- Source: https://github.com/dmmulroy/anti-slop
- Source commit: `13909c9e07590f5a85d93c62712259fe14a883f7`
- Copied from: `skills/install-anti-slop/assets/anti-slop/`
- Installed at: `tools/oxlint/anti-slop/`
- Installation: upstream `skills/install-anti-slop/scripts/install.mjs`, with its default destination.

All bundled plugin assets are copied verbatim from the revision above, including
the optional `effect/` plugin and the nested ESLint Stylistic license and provenance
record. The anti-slop repository's root MIT `LICENSE` is also retained here.
Local additions are this provenance record and that root license; no rule source
has been modified.

The generic plugin and all 18 generic rules are enabled in `vite.config.ts`,
alongside native `oxc/no-accumulating-spread`. The Effect plugin is not registered
because Nosey has no direct `effect` dependency.

`@oxlint/plugins` is an exact development dependency matching the `oxlint` version
locked through Vite+. Upgrade both together. The plugin and project-local agent
tooling directories are excluded from linting and formatting, preserving upstream
source and installed agent assets.

Existing application-source findings are left for a separate cleanup. Run
`npm run lint` for diagnostics and `npm run check` for the full Vite+ check.
