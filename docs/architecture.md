# Architecture

The application combines the Ink 8 scaffold shell with Nosey's workspace detection
and skill registry engine. Domain operations are shared by the terminal UI and
headless commands, without adding a separate UI framework dependency.

- `src/cli.tsx` parses CLI arguments and handles plain and interactive rendering.
- `src/app.tsx` composes providers, navigation, and shortcuts.
- `src/screens/index.ts` defines screens and visible navigation order.
- `src/commands/index.ts` registers headless commands.
- `src/commands/scan.ts` resolves registries, scans workspaces, and prints reports.
- `src/commands/registry.ts` routes registry management and noninteractive initialization.
- `src/lib/scanner.ts`, `manifests.ts`, `detect.ts`, `report.ts`, and `text-cache.ts`
  implement bounded scanning, manifest parsing, detection, reporting, and caching.
- `src/lib/registry/` implements local/Git registry loading, validation, merging,
  configuration discovery, migration compatibility, initialization, and commands.
  Version 2 maps may declare external GitHub skills independently of the local manifest;
  references are mapped and deduplicated without fetching external skill files.
- `src/data/skills-map.ts` contains built-in technology and skill mappings.
- `src/features/skills/filter.ts` and `groups.ts` provide pure selection helpers.
- `src/features/skills/install.ts` inspects project-local installations (lock provenance
  and agent folders) and generates copyable `skills add --yes --json` commands.
  Execution is separately opt-in: after selection confirmation and Ink exit,
  `src/features/skills/execute.ts` runs the structured plan sequentially in the scanned directory.
- `schemas/registry/` contains Nosey's canonical JSON Schemas; their published `$id`
  values remain stable. `registry-tools/` contains the dependency-free trusted
  configuration and generation code shipped in the package and copied to the template.
  `scripts/build-schema-docs.mjs` generates [the schema reference](registry-schema.md).
- `src/lib/registry/template.ts` resolves the upstream default branch to a commit,
  bounds HTTP and tar extraction, rejects unsafe entries, and copies an ephemeral
  download into the exclusively reserved destination. Local init requires network;
  `--no-git` requires no Git or GitHub CLI. It never falls back to bundled scaffolding.
- Registry JSON is validated by Nosey's parsers using document `schemaVersion` values
  before and after running its packaged configuration tools. The template ships no schema files or annotations; downloaded code is never executed during init.
  GitHub creation uses `gh --template`, then clones, configures, commits and pushes
  `HEAD`, preserving generated history. Partial results distinguish creation, clone,
  configuration, and push completion; the wizard prevents duplicate creation attempts.
- `npm run registry:template:sync -- <directory>` copies current canonical tools,
  generators, notices, and canonical template JSON examples for review. It requires no release metadata or hashes
  and protects configured registries from being overwritten with examples. See [template maintenance](registry-contract.md).
- `scripts/build-skills-catalog.ts` and `propose-skill-mappings.ts` maintain catalogs
  and generate review proposals; see [their guide](../scripts/README.md).
- `assets/nosey-brand-kit/` retains Nosey's original asset exports; runtime semantic
  colors live in `src/theme/palettes.json`. The ASCII `BrandMark` carries the identity.
- `src/components/`, `src/hooks/`, and `src/theme/` supply reusable UI primitives.
- `docs/ui-framework.md` explains composition, input ownership, themes and tests.
- `src/config/` and `src/lib/config.ts` provide versioned, validated config.

Selected features: settings, doctor, tests, screenshots, ci.

The no-argument CLI and project-path form open Scan in a TTY. Explicit `scan`, JSON,
skills-only, plain, and noninteractive modes reuse the same engine without mounting
Ink. Non-Scan plain previews remain separate. Confirmed skill IDs are printed only
after Ink exits; quit/cancel never confirms a selection.
When Skills CLI is enabled in saved settings, confirmations instead print grouped
project-only commands targeting the selected agents; fully installed targets are
omitted. With `skillsCli.execute` also enabled, the reviewed structured plan is
executed after Ink exits. Execution defaults off; failures stop the batch and Ctrl+C
cancels the process group. Headless scans remain reports. Disabled command
generation retains ID output.

`src/app.tsx` owns one provider tree and shell. Visited primary screens remain
mounted, retaining their local selections, filters, cursors, and drafts. Each is
wrapped in `InputActivityProvider`: hidden screens keep state but cannot capture
input or dispatch keys. The command menu deactivates every screen while open.
`src/features/skills/context.tsx` owns scanning via `useAsync`, which ignores stale
completions. `src/features/ui/context.tsx` carries contextual hints and command actions.

Scan, Registries, Settings, and Help are the visible routes. `skills` resolves to
Scan; `registry-setup` is hidden. Registry initialization unmounts
on exit so each new wizard starts cleanly. The Stepper locks transitions and writes
once, after Review. Settings drafts survive tab changes; opening the separate
wizard requires discarding an unsaved draft explicitly.

App appearance uses the existing `nosey` configuration; registry discovery retains
Nosey's and legacy SkillSense's paths. New registry references are stored globally;
legacy project-scoped references remain readable and removable.

Node.js 24+ matches the imported application's runtime requirement. `npm test`
runs both the runtime/UI tests and the catalog and mapping tool tests. The package
ships registry tools, canonical schemas, brand assets, and third-party license notices.

## UI framework

Use [the UI framework guide](ui-framework.md) for shared shell ownership,
screen registration, keymap priority, text input capture, semantic theming,
async states and terminal-width-safe layouts.
The [feature walkthrough](adding-a-feature.md) shows the extension path.

Run your package manager scripts for typecheck and build, plus tests.
