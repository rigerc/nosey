# nosey

Workspace detection and agent skill suggestions, with an Ink 8 / React 19 terminal shell.
Requires Node.js 24+ (matching Nosey's runtime requirement).

Generated with preset **standard**, package manager **npm**,
and toolchain **vite-plus**.

## Getting started

```bash
npm install
npm run dev
npm run build
npm run start
```

Installation creates the package-manager lockfile if one was not included.
Commit that generated lockfile and use frozen installs in deployed environments.

## Commands and features

```bash
nosey --help
nosey --plain
nosey --setup
nosey --screen settings
nosey doctor --json
nosey --screen gallery
```

In a terminal, the app opens Nosey's branded Scan, Registries, Settings, and Help
tabs. The component gallery is a hidden development route. The default dark-terminal
theme is `nosey`; light, dark, contrast, mono, and ASCII rendering are supported.
The original asset exports are in `assets/nosey-brand-kit`.

## Terminal interface

```bash
npm run dev -- ../project
npm run dev -- ../project --explain
npm run dev -- --screen registry
npm run dev -- --theme nosey
```

Use Tab / Shift+Tab or 1–4 to navigate. Ctrl+K opens commands, `t` previews a
runtime theme, `?` opens Help, and `q` quits without confirming a selection.
Captured text fields and confirmation prompts own the keyboard.

In Scan, arrows or j/k move, Space selects, `/` or `f` filters, `c` clears the
filter, `g` toggles technology groups, `d` finds skill details, and `r` rescans.
Selections hidden by filters stay selected. Tabs and the command menu preserve
selection, filter, cursor, and settings drafts. A completed new scan resets the
old selection. Enter reviews ordered, unique IDs; the final confirmation defaults
to No. Confirmed IDs print only after Ink exits. Nothing is installed.

Results are grouped by technology, combination, and frontend essentials, with
spacing between each heading and its options. A shared skill appears under each
matching heading with one synchronized checkbox state and one confirmed ID.
The footer shows available screen actions and app navigation separately; active
editors and confirmation prompts replace those hints with their own controls.

Registries targets the scanned project for project-scoped references. Add, remove,
metadata builds, and initialization show exact write targets and require explicit
confirmation. The initialization wizard supports optional Git and GitHub creation;
Ctrl+X cancels without creating anything before final confirmation. Settings uses
drafts: `s` saves, `d` discards, and `w` opens guided setup. Theme cycling does not save.

## Scan a workspace

```bash
npm run dev -- scan ../project --json
npm run dev -- ../project --skills-only
npm run dev -- scan ../project --explain --no-frontend-bonus
npm run dev -- scan ../project --depth 6 --max-files 5000
npm run dev -- scan ../project --registry ./team-skills
```

After building, use `node dist/cli.js` in place of `npm run dev --`, or link the
package with `npm link` to use `nosey` directly. `scan` defaults to the current
directory and always runs headlessly. A project path opens Scan in a TTY;
`--json`, `--skills-only`, `--plain`, `--no-interactive`, pipes, and CI produce
noninteractive reports. Non-Scan `--screen ... --plain` still previews a screen.

Scans read manifests and configuration signals without executing project code or
installing skills. Reports include technologies, combinations, agent folders,
suggested skills, evidence, and registry warnings. Use `--json` for structured
output, `--skills-only` for skill IDs, or `--explain` for a text report with evidence.
`--plain` and `--no-interactive` are also supported on scan commands.

## Skill registries

```bash
npm run dev -- registry init ./team-skills --registry-id acme/team-skills --yes --no-git
npm run dev -- registry add ./team-skills
npm run dev -- registry add https://github.com/org/skills.git --ref v1
npm run dev -- registry list --json
npm run dev -- registry show ./team-skills --json
npm run dev -- registry validate ./team-skills --json
npm run dev -- registry build ./team-skills
npm run dev -- registry remove ./team-skills
```

Use `--global` with `list`, `add`, and `remove` for global registry references.
Headless initialization requires a destination and `--registry-id`; in a TTY,
`registry init` opens the same guided wizard as the Registries tab. Headless init
initializes Git by default unless `--no-git` is passed. `--github` explicitly creates and pushes a
remote with `gh`, with optional `--visibility private|public`.

Registry configuration retains Nosey's `.nosey.json` project file and global
`nosey/registries.json` under the platform config directory. Existing SkillSense
registry settings and cached snapshots remain readable; edits write Nosey files.
Appearance settings use the `nosey` config path.
Git registries load through Git objects without checking out or running remote code.

## Catalog and mapping tools

```bash
npm run skills-catalog -- --output skills-catalog.json --refresh
npm run skills-map:propose -- --no-model --limit 3 --output out/offline-proposals.json
```

The catalog builder and optional Kev mapping proposal tool are imported unchanged.
They produce catalogs and review proposals; they do not install skills or edit the
built-in mappings. See [the tooling guide](scripts/README.md) for network/cache
behavior, model configuration, checkpointing, and output details.

## Theme customization

Semantic palettes live in `src/theme/palettes.json`; the project default is in `src/theme/defaults.json`.

```bash
npm run theme:list
npm run theme:token -- dark primary "#ff80aa"
npm run theme:default -- light
npm run theme:default -- auto
```

## Extend your app

- Register screens in `src/screens/index.ts`.
- Register noninteractive commands in `src/commands/index.ts`.
- Keep domain features independent of React/Ink.
- Reuse `src/components/`, `src/hooks/`, and `src/theme/`.
- See [UI framework guide](docs/ui-framework.md), [Architecture](docs/architecture.md), and [Add a feature](docs/adding-a-feature.md).

## Checks

```bash
npm run typecheck
npm run test
npm run test:unit # Runtime, domain, CLI, and existing UI tests
npm run test:catalog
npm run test:map
npm run build
npm run screenshot # First: npx playwright install chromium
```

A GitHub Actions workflow is included in `.github/workflows/ci.yml`.

## Provenance

Core logic, tests, catalog tools, registry templates, and the brand kit originated
in the Nosey checkout at `bfe67a8b14e758927f997fc56ca35ef322497c43`.
The UI uses the ink-cli-starter framework, with Nosey's brand mark and text field.
The four-screen workflows include input arbitration, write confirmations, and
responsive layouts.
See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the SkillSense engine's
original provenance and MIT license.
