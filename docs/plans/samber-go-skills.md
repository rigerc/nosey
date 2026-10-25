# Add samber Go skills with mappings

Status: **implemented on `t3/add-golang-skill-mappings`**. Verified against
[`samber/cc-skills-golang`](https://github.com/samber/cc-skills-golang) at commit
[`246b6c4`](https://github.com/samber/cc-skills-golang/commit/246b6c4c1ab3077dee114beb9ade3bb0527dfebc)
(upstream `2026-10-23`, plugin version `2.0.1`) and Nosey's built-in map at
`ca15e1c`. `main` is mutable; recheck the upstream tree and skill count before
refreshing the list.

## Goal

Make the upstream Go skill collection available as Nosey defaults:

- every `samber/cc-skills-golang` skill is suggested for a detected Go project;
- library/framework skills are additionally grouped under dedicated technologies
  when the matching Go module is present;
- only recommendation IDs and detection metadata are added. No upstream
  `SKILL.md` files, scripts, or agent rules are copied or vendored.

## Verified baseline

| Area                | Observation                                                                                                                                                                                                       | Consequence                                                                                                                                   |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream inventory  | 46 `skills/<name>/SKILL.md` files. All skill names equal their directory names. The README groups 30 general-purpose and 16 library/framework skills; `golang-temporal` is listed as to-do and has no `SKILL.md`. | Add 46 IDs, not 47. No install-name overrides are needed.                                                                                     |
| Upstream install    | `npx skills add samber/cc-skills-golang --skill <name>`; frontmatter `name` matches the directory.                                                                                                                | Nosey's three-segment ID `samber/cc-skills-golang/<name>` already resolves through `skillSource()`.                                           |
| Upstream license    | MIT, Copyright 2026 Samuel Berthe.                                                                                                                                                                                | Referencing IDs is not redistribution; no `THIRD_PARTY_NOTICES.md` change is required. Record the reviewed commit in this plan and in the PR. |
| Built-in map        | `src/data/skills-map.ts` defines a 263-entry `SKILLS_MAP`. `go` is detected by `go.mod`/`go.work` and has two `affaan-m/everything-claude-code` skills. `gin` is detected by `goModules` but has no skills.       | Append the 46 IDs to `go`; keep the two existing suggestions for now.                                                                         |
| Go detection        | `goModules` is parsed from `go.mod` `require` blocks; lines marked `// indirect` are skipped and matching is exact.                                                                                               | Mappings must use real module paths and cannot match indirect-only dependencies.                                                              |
| Shared technologies | `grpc` (JS/Python) and `graphql` (JS) already exist; there is no `cobra`, `viper`, `wire`, `dig`, `fx`, `swagger`, `testify`, or `samber-*` technology.                                                           | Extend `grpc`/`graphql`; add the missing technologies.                                                                                        |
| Deduplication       | `detectProject` keys skills by ID and keeps every origin. `deriveSkillGroups` shows the same ID in multiple groups with synchronized selection.                                                                   | A skill can be listed under both `Go` and its library without appearing twice in confirmed output.                                            |
| Schema metadata     | `schemas/registry/skills-map.schema.json` embeds `x-builtInTechnologies` derived from `SKILLS_MAP`.                                                                                                               | Run `npm run schema:technologies`; CI's `--check` mode fails on a stale annotation.                                                           |

## Decisions

- **All 46 skills on `go`.** Every Go project sees the complete upstream set,
  matching the upstream guidance that the general-purpose skills are designed to
  be installed together.
- **Library skills also get a technology mapping.** The same ID appears under
  `Go` and under its library group, so evidence stays visible and the skill still
  appears when a user already knows which library they use.
- **Keep the two `affaan-m` Go suggestions in this change.** Removing existing
  recommendations is a separate product decision. The duplicate testing/patterns
  coverage is accepted temporarily.
- **Use unprefixed, library-shaped IDs** consistent with existing entries such as
  `gin`, `vue`, and `axum`; use `google-wire`, `uber-dig`, and `uber-fx` where the
  bare name would be ambiguous.
- **Exact module paths only.** Do not add a substring or regex matcher; the
  detector has no such matcher for Go modules and adding one is out of scope.
- **No `alwaysRecommend` change.** Built-in defaults are technology-scoped; the
  built-in registry's `alwaysRecommend` stays empty.

## Default Go list

Append these IDs to `go.skills` in alphabetical order. The prefix
`samber/cc-skills-golang/` is omitted below for readability.

General purpose (30):

```text
golang-benchmark
golang-cli
golang-code-style
golang-concurrency
golang-context
golang-continuous-integration
golang-data-structures
golang-database
golang-dependency-injection
golang-dependency-management
golang-design-patterns
golang-documentation
golang-error-handling
golang-gopls
golang-how-to
golang-lint
golang-modernize
golang-naming
golang-observability
golang-performance
golang-pkg-go-dev
golang-popular-libraries
golang-project-layout
golang-refactoring
golang-safety
golang-security
golang-stay-updated
golang-structs-interfaces
golang-testing
golang-troubleshooting
```

Library/framework (16):

```text
golang-google-wire
golang-graphql
golang-grpc
golang-samber-do
golang-samber-hot
golang-samber-lo
golang-samber-mo
golang-samber-oops
golang-samber-ro
golang-samber-slog
golang-spf13-cobra
golang-spf13-viper
golang-stretchr-testify
golang-swagger
golang-uber-dig
golang-uber-fx
```

The `go` entry therefore has 48 skills after this change (46 new plus the two
existing `affaan-m` entries).

## Technology mappings

Add these entries next to `gin` in `src/data/skills-map.ts`. Each skill also stays
on `go`, so the mapping adds a second origin rather than moving it.

| ID            | Name        | `detect.goModules`                                                                                                                                       | Added skill               |
| ------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `google-wire` | Google Wire | `github.com/google/wire`                                                                                                                                 | `golang-google-wire`      |
| `uber-dig`    | Uber Dig    | `go.uber.org/dig`                                                                                                                                        | `golang-uber-dig`         |
| `uber-fx`     | Uber Fx     | `go.uber.org/fx`                                                                                                                                         | `golang-uber-fx`          |
| `samber-do`   | samber/do   | `github.com/samber/do`, `github.com/samber/do/v2`                                                                                                        | `golang-samber-do`        |
| `samber-hot`  | samber/hot  | `github.com/samber/hot`                                                                                                                                  | `golang-samber-hot`       |
| `samber-lo`   | samber/lo   | `github.com/samber/lo`                                                                                                                                   | `golang-samber-lo`        |
| `samber-mo`   | samber/mo   | `github.com/samber/mo`                                                                                                                                   | `golang-samber-mo`        |
| `samber-oops` | samber/oops | `github.com/samber/oops`                                                                                                                                 | `golang-samber-oops`      |
| `samber-ro`   | samber/ro   | `github.com/samber/ro`                                                                                                                                   | `golang-samber-ro`        |
| `samber-slog` | samber/slog | `github.com/samber/slog-multi`, `github.com/samber/slog-sampling`, `github.com/samber/slog-formatter`                                                    | `golang-samber-slog`      |
| `cobra`       | Cobra       | `github.com/spf13/cobra`                                                                                                                                 | `golang-spf13-cobra`      |
| `viper`       | Viper       | `github.com/spf13/viper`                                                                                                                                 | `golang-spf13-viper`      |
| `swagger`     | Swagger     | `github.com/swaggo/swag`, `github.com/swaggo/gin-swagger`, `github.com/swaggo/echo-swagger`, `github.com/swaggo/http-swagger`, `github.com/swaggo/files` | `golang-swagger`          |
| `testify`     | Testify     | `github.com/stretchr/testify`                                                                                                                            | `golang-stretchr-testify` |

Extend existing entries instead of duplicating them:

```ts
// grpc: add a Go matcher; existing JS/Python matchers stay.
detect: {
  packages: ['@grpc/grpc-js', '@grpc/proto-loader'],
  pythonPackages: ['grpcio', 'grpcio-tools'],
  goModules: ['google.golang.org/grpc'],
},
skills: ['samber/cc-skills-golang/golang-grpc'],

// graphql: add Go clients; keep the JavaScript skill.
detect: {
  packages: ['graphql', 'graphql-request', 'graphql-yoga', '@apollo/server'],
  goModules: ['github.com/99designs/gqlgen', 'github.com/graph-gophers/graphql-go'],
},
skills: ['apollographql/skills/graphql-operations', 'samber/cc-skills-golang/golang-graphql'],
```

`gin` needs no skill mapping; upstream has no gin-specific skill. Do not attach
unrelated library skills to it.

Module paths were checked against `proxy.golang.org/@latest`; `samber/do` has a
separate v2 module path, and the other samber modules are still v1. The slog skill
documents only the three core `slog-*` module paths, so backend-specific modules
such as `slog-sentry` are intentionally not listed; add them only after upstream
names them.

## Implementation steps

1. **Map the default set.** Extend `go.skills` in `src/data/skills-map.ts` with the
   46 IDs above. Keep the existing two `affaan-m` IDs.
2. **Map library technologies.** Add the 14 new entries and extend `grpc` and
   `graphql` as shown. Keep IDs lowercase and match the surrounding formatting.
3. **Regenerate schema metadata.** Run `npm run schema:technologies` and commit the
   updated `schemas/registry/skills-map.schema.json`. Do not hand-edit the
   annotation.
4. **Add regression tests** (see below). Prefer one focused Go fixture over many
   small fixtures.
5. **Verify** with the commands in the verification section.
6. **Record provenance.** In the PR description, link the reviewed upstream
   commit and state that no upstream files were copied.

## Tests

Extend `tests/detect.test.ts`:

- **Full default set.** With a bare `go.mod`, every ID in the expected
  `samber/cc-skills-golang` list appears exactly once in `report.skills`, and
  `report.technologies` includes `go`.
- **Library detection.** A `go.mod` requiring `github.com/spf13/cobra`,
  `go.uber.org/fx`, and `github.com/samber/lo` detects `cobra`, `uber-fx`, and
  `samber-lo` with evidence from `go.mod`.
- **Shared origin.** `golang-spf13-cobra` has both a `technology:go` and a
  `technology:cobra` source, and appears once in `report.skills`.
- **Indirect-only dependencies stay unmatched.** A requirement marked
  `// indirect` does not detect its library, as today.
- **Inventory shape.** Assert the added Go IDs use three segments and that no
  technology list contains the same ID twice.

Extend `tests/skills-cli.test.ts`:

- `skillSource({id: 'samber/cc-skills-golang/golang-spf13-cobra'})` resolves to
  `{source: 'samber/cc-skills-golang', name: 'golang-spf13-cobra'}`.
- Generated install commands group all selected samber skills under one
  `npx skills add samber/cc-skills-golang` invocation.

`tests/registry-schema.test.ts` already compares the schema annotation with
`SKILLS_MAP`; the regenerated file must keep that test green. No new catalog or
mapping-proposal fixtures are required; those scripts read `SKILLS_MAP`
dynamically.

## Verification

```bash
npm run typecheck
npm run build
npm run test
npm run schema:technologies:check
npm run docs:schema:check
npm run template:schema:conformance
```

Confirm `node dist/cli.js --plain <go-project>` lists the new Go skills and does
not duplicate shared IDs. Review Scan at 40 and 120 columns: the Go group is large,
so confirm filtering, the option budget, and selection counts remain usable.

### Implementation evidence

- `npm run typecheck`, `npm run build`, and `npm run test` pass (43 test files,
  452 unit tests, 24 catalog tests, 17 mapping tests).
- `npm run schema:technologies:check` and `npm run docs:schema:check` report the
  generated artifacts are current.
- Both registry conformance suites pass.
- A fixture requiring `github.com/spf13/cobra`, `go.uber.org/fx`, and
  `github.com/samber/lo` detects `Go`, `Cobra`, `Uber Fx`, and `samber/lo`, and
  `node dist/cli.js --plain` reports 48 Go suggestions with shared IDs listed
  once.

## Risks and open points

- **Suggestion volume.** A Go project jumps from 2 to 48 suggestions in the `Go`
  group. This is the requested all-skills scope; filtering and multi-group
  deduplication already exist. If it proves noisy, a follow-up can trim the
  default list to the 14 starred skills without changing the mappings.
- **Existing registries.** Built-in technology IDs are reserved. A custom registry
  that already declares one of the new IDs (`cobra`, `viper`, `testify`, …) will
  fail with `Duplicate technology definition`. This is existing merge behavior,
  not a new failure mode, but the new IDs raise the chance of a collision.
- **Detection gaps.** Module paths are exact, indirect-only requirements are
  skipped, and renamed/forked modules are not matched. The skill is still
  suggested under `Go`, so the library group is an extra, not the only path.
- **Upstream drift.** There is no automated sync. Recheck the 46-skill count,
  names, module paths, and license before refreshing the list.
- **`golang-how-to` overlap.** The upstream orchestrator duplicates routing that
  Nosey performs through technology groups. It is included because it is a
  general-purpose skill; remove it only with an explicit product decision.

## Acceptance criteria

- [x] All 46 upstream skills are recommended for any workspace with `go.mod` or
      `go.work`.
- [x] The 16 library skills also appear under their matching technology when the
      module is a direct requirement.
- [x] Shared IDs appear once in confirmed output and show both origins.
- [x] No upstream files, scripts, or rules are copied; no install-name override is
      added.
- [x] Schema metadata, documentation checks, and tests pass.
- [x] The PR records the reviewed upstream commit and the no-vendoring decision.
