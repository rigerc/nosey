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
- `src/commands/schema.ts` prints the canonical map or manifest JSON Schema offline.
- `src/lib/scanner.ts`, `manifests.ts`, `detect.ts`, `report.ts`, and `text-cache.ts`
  implement bounded scanning, manifest parsing, detection, reporting, and caching.
- `src/lib/registry/` implements local/Git registry loading, validation, merging,
  configuration discovery, migration compatibility, initialization, and commands.
  Version 2 maps may declare external GitHub skills independently of the local manifest;
  references are mapped and deduplicated without fetching external skill files.
- `src/data/skills-map.ts` contains built-in technology and skill mappings.
- `src/lib/mcp.ts` parses recognized workspace JSON/JSONC MCP files and Codex
  `.codex/config.toml` through the same bounded `ProjectTree`. It normalizes
  package-runner identities and HTTP(S) endpoints without execution, interpolation,
  environment-file reads, or endpoint requests. `detect.mcpServers` matches enabled
  declarations through the existing technology, combination, and skill pipeline.
  `Report.mcpServers` retains unknown and disabled declarations; transport availability
  and client approval are not inferred. Syntax/shape failures add `invalid-config`
  skipped inputs with no parser source excerpts. No global MCP config is read.
- `src/features/skills/filter.ts` and `groups.ts` provide pure selection helpers.
- `src/features/skills/install.ts` inspects project-local installations (lock provenance
  and agent folders) and generates copyable `skills add --yes --json` commands.
  Execution is separately opt-in: after selection confirmation and Ink exit,
  `src/features/skills/execute.ts` runs the structured plan sequentially in the scanned directory.
- `schemas/registry/` contains Nosey's canonical JSON Schemas; their published `$id`
  values remain stable. The built-in technology and combination inventories are
  informational annotations generated from Nosey's runtime maps. The registry
  template references the public schemas but owns generation and validation;
  `scripts/build-schema-docs.mjs` generates [the schema reference](registry-schema.md).
- `src/lib/registry/template.ts` currently resolves the upstream default branch to
  a commit, bounds HTTP and tar extraction, rejects unsafe entries, and copies an
  ephemeral download into the exclusively reserved destination. Local init requires
  network; `--no-git` requires no Git or GitHub CLI. The proposed integration pins
  this archive to a reviewed commit/tree and adds a GitHub preflight and post-clone
  content-tree check. It never falls back to bundled scaffolding.
- Registry JSON is validated by Nosey's parsers using document `schemaVersion` values
  before and after configuration. The proposed template integration keeps schema files
  in Nosey, and initialization remains data-only: downloaded code is never executed.
  The currently packaged configurator is scheduled for removal only after its
  behavior and required attribution have been reviewed and ported.
  GitHub API operations use the shared Octokit client in `src/lib/registry/github.ts`,
  authenticated with `GITHUB_TOKEN`, `GH_TOKEN`, or an optional `gh auth token` fallback.
  Requests are bounded and silent; automatic retries are disabled to avoid duplicate
  creation. Git clones, configures, commits and pushes
  `HEAD`, preserving generated history. HTTPS credentials use process-only Git configuration
  for network commands. Partial results distinguish creation, clone,
  configuration, and push completion; the wizard prevents duplicate creation attempts.
- Template maintenance and releases are owned by the separate registry-template
  repository. The proposed Nosey integration verifies a pinned submodule commit/tree,
  checks compatibility against proposed schemas, and preserves offline schema commands.
  See [registry ownership and security](registry-contract.md).
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
runs both runtime/UI tests and the catalog and mapping tool tests. Template tooling
uses Node.js 22 built-ins without an installation step; Agnix is separately
provisioned for skill linting. Nosey's checks cover schema compatibility, identity
parity, security, package behavior, and template smoke tests. Its package includes
canonical schemas, brand assets, and third-party license notices.

## UI framework

Use [the UI framework guide](ui-framework.md) for shared shell ownership,
screen registration, keymap priority, text input capture, semantic theming,
async states and terminal-width-safe layouts.
The [feature walkthrough](adding-a-feature.md) shows the extension path.

Run your package manager scripts for typecheck and build, plus tests.
