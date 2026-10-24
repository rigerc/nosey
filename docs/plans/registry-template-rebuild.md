# Registry template rebuild

Status: **revised implementation plan; not implemented**. Verified against the default branches of [`rigerc/nosey`](https://github.com/rigerc/nosey) and [`rigerc/nosey-registry-template`](https://github.com/rigerc/nosey-registry-template) on **2026-10-24**. The uploaded proposal has been revised; **no repository code, workflow, submodule, or branch has been changed**.

This document is the implementation specification, not evidence that the new scripts pass. Evidence-based repository observations are explicitly separated from proposed behavior below. Reinspect both repositories immediately before coding or merging; `main` is mutable.

### Verified repository baseline (before implementation)

| Area                       | Observed on GitHub `main`                                                                                                                                                                                                                                                                                                                                                                                                | Consequence for this plan                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nosey runtime              | [`package.json`](https://github.com/rigerc/nosey/blob/main/package.json) declares `engines.node: ">=24"`; [CI](https://github.com/rigerc/nosey/blob/main/.github/workflows/ci.yml) uses Node 24 and `npm ci`.                                                                                                                                                                                                            | **Do not** rewrite Nosey's Node/npm baseline. Node 22 and no package installation apply **only to the template**.                                           |
| Template runtime           | [Template `package.json`](https://github.com/rigerc/nosey-registry-template/blob/main/package.json) currently depends on `ajv` and declares Node `>=20`.                                                                                                                                                                                                                                                                 | Remove dependency/install/lockfile and explicitly require Node 22 for template scripts.                                                                     |
| Nosey schema contract      | [`schemas/registry/skills-map.schema.json`](https://github.com/rigerc/nosey/blob/main/schemas/registry/skills-map.schema.json), [`skills-manifest.schema.json`](https://github.com/rigerc/nosey/blob/main/schemas/registry/skills-manifest.schema.json), and [`src/lib/registry/validate.ts`](https://github.com/rigerc/nosey/blob/main/src/lib/registry/validate.ts) split schema, parser-only, and integration checks. | A schema-only checker is insufficient; keep explicit integration checks and test semantics against both schema and runtime.                                 |
| Registry loading           | [`load.ts`](https://github.com/rigerc/nosey/blob/main/src/lib/registry/load.ts) reads manifest/map; [`commands.ts`](https://github.com/rigerc/nosey/blob/main/src/lib/registry/commands.ts) additionally checks optional `registry.json` during `registry validate` and implements `registry build`.                                                                                                                     | Remove legacy behavior from all readers, commands, UI, fixtures, and tests.                                                                                 |
| Identity configuration     | [`init.ts`](https://github.com/rigerc/nosey/blob/main/src/lib/registry/init.ts) calls packaged `configureTool`; [template configurator](https://github.com/rigerc/nosey-registry-template/blob/main/scripts/configure-registry.mjs) still reads/writes three JSON documents.                                                                                                                                             | Replace with trusted, in-process TypeScript in Nosey; independently implement manual template configure for **two** documents.                              |
| Template acquisition       | [`template.ts`](https://github.com/rigerc/nosey/blob/main/src/lib/registry/template.ts) resolves _current_ template default-branch HEAD and downloads its archive by SHA; `init.ts --github` calls GitHub's `createUsingTemplate`.                                                                                                                                                                                       | “Downloaded at an exact SHA” does **not** mean release-pinned. Local and GitHub modes need separate, explicit consistency gates.                            |
| CI and fixtures            | [Template `registry-ci.yml`](https://github.com/rigerc/nosey-registry-template/blob/main/.github/workflows/registry-ci.yml) currently installs packages and its manual dispatch does **not** force agnix; Nosey tests contain legacy tooling assumptions.                                                                                                                                                                | Rewrite workflows and tests, rather than merely renaming files.                                                                                             |
| Schema metadata            | Current `$id` values contain historical `templates/registry/schemas/` paths, and descriptions/examples still mention `registry.json`.                                                                                                                                                                                                                                                                                    | Remove stale legacy text while preserving stable `$id` identifiers unless a separately reviewed schema-identity change is approved. Regenerate schema docs. |
| Existing reusable guidance | Nosey's `docs/example/registry/` includes prompts, `.agnix.toml`, PR template, and `.gitkeep`; the [mapping prompt](https://github.com/rigerc/nosey/blob/main/docs/example/registry/.agents/prompts/map-skills.md) assumes `registry.json` and Make commands.                                                                                                                                                            | Copy **and adapt** those materials before removing their source.                                                                                            |

**Current schema-keyword inventory:** Inspection of both published schemas found `$ref`/`$defs`, `type`, `required`, `properties`, `propertyNames`, `additionalProperties`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `minProperties`, `pattern`, `enum`, `const`, `allOf`, `anyOf`, `not`, `if`, `then`, and `dependentSchemas`. The existing evaluator plan also allows `maxProperties` and `else` for explicitly tested future use. This inventory is a dated snapshot, **not** a permanent allowlist guaranteeing future compatibility.

## Dependency-free design

- **Tooling baseline:** Node.js 22 **for template tooling** and its built-in modules (`node:fs`, `node:path`, `node:test`, `node:assert`, `node:util`, etc.) plus built-in `fetch`. Node is the required runtime, not an installed project package. No `yaml`, `ajv`, npm dependencies/devDependencies, pip packages, vendored libraries, or install step for the template scripts.
- **Language choice:** Keep the existing `.mjs` design because **template CI** already sets up Node 22 and the required features are built in. **Nosey CI and the packaged CLI remain on Node 24+.** Changing languages is allowed if implementation proves a different standard-library-only solution simpler, but do not add a second mandatory runtime or third-party packages.
- **Package interface:** Retain `package.json` for familiar `npm run ...` scripts with no `dependencies` or `devDependencies`. Delete `package-lock.json`; never run `npm install` or `npm ci` in template CI. `npm run` is only a command dispatcher and does not install anything.
- **YAML scope:** Do not attempt to implement a general YAML parser. Read the `name` and `description` metadata fields with a deliberately bounded, deterministic frontmatter extractor. Agnix remains responsible for full skill/frontmatter correctness.
- **JSON Schema scope:** Fetch Nosey's two latest schema documents and evaluate the JSON Schema assertion/applicator keywords they actually use with a small, locally tested Node implementation. This is **not** a complete Draft 2020-12 implementation. Unknown validation keywords or unsupported references must fail closed rather than silently skip constraints.
- **External-tool exception:** The original requirement that agnix exclusively validates skill quality is retained. Agnix is an externally provisioned, SHA-pinned CI tool and an optional local executable, **not a dependency of the template's generation/check/configure scripts**. GitHub Actions and Git itself remain workflow infrastructure. Literal elimination of all external tools would require dropping agnix and rewriting the locked validation policy; that is **not** part of this revision.
- **Risk gate:** If schema-compatibility tests expose unacceptable differences between the minimal evaluator, a reference Draft 2020-12 implementation, and Nosey, **block the PR**. Do not quietly weaken validation. Revisit the no-package-dependency constraint or move schema validation into a first-party Nosey API only through a separate approved design change.
- **Release boundary:** The template intentionally validates against Nosey `main`, so upstream schema changes or network failures can break an unchanged downstream check. This fail-closed/availability trade-off is accepted **only if** Nosey's schema PR CI tests proposed schemas against the released template validator _before merge_. No live-schema cache, version pin, or silent fallback is added to production checks.

## Locked decisions

- Rebuild the existing `rigerc/nosey-registry-template` from scratch.
- Store it in Nosey as a submodule at `template/registry/`.
- Do template rebuild **and** Nosey cleanup.
- Generate both `skills-manifest.json` and the README catalog.
- Run agnix CI only when `skills/**` changes.
- **Eliminate `registry.json`.** `skills-map.json` is the canonical identity source.
- **Both JSON files include the latest Nosey schema URL in `$schema`.**
- **All initialization is data-only.** Nosey must never run scripts from an acquired template or downstream registry.
- **Template consistency is release-enforced.** The Nosey submodule commit, local archive SHA, and GitHub-template content check must agree with one approved template revision; differences block initialization before the user's registry is configured. The exact mechanism is specified in section 2.**

## Resolved decisions

- **`registry build` is retired.** No Nosey-side generation fallback or wrapper.
- **Template has zero npm package dependencies.** All template scripts and tests use Node.js 22 built-ins; `yaml` and `ajv` are not used.
- **No general-purpose YAML or JSON Schema dependency.** The frontmatter reader extracts metadata only; the registry validator implements an explicit, fail-closed subset of the current Nosey JSON Schema contract.
- **No template install step.** Keep `package.json` with scripts but remove `package-lock.json` and `npm ci`/`npm install` from the template workflow.
- **`template-sync.yml` stays.** Derived registries receive reviewed infrastructure updates through it.
- **No legacy `registry.json` path.** Nosey does not read, validate, migrate, or warn about it. A stray file is ignored.
- **Agnix owns skill validation.** Generators parse frontmatter only to build the manifest; the validator checks registry JSON and references, never skill content, naming, descriptions, links, or instructions.
- **`$schema` points at `main`.** Both JSON files use the latest public Nosey URLs, with no pinning.
- **Template changes go through a PR.** The Nosey submodule gitlink is bumped only after the template PR merges.
- **PRs own generated artifacts.** Contributors commit the manifest and README update alongside skill/map changes; post-merge generation is a safeguard and may never be used to excuse an invalid PR.
- **Downstream agent guidance is installed at configuration.** Both template `configure` and Nosey `registry init` replace only the _recognized template-maintainer_ `AGENTS.md` with an owned downstream guide; unknown/user-edited agent files are not overwritten.
- **Reference parity has a home:** Nosey (which already has Ajv and Node 24 dependencies) runs differential schema and cross-implementation identity fixtures in its CI; the template runtime remains dependency-free.

## Repository boundaries

| Area                   | Repository                       | Edit location                                                     |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------- |
| Template content       | `rigerc/nosey-registry-template` | Template repo checkout; later the `template/registry` submodule   |
| Nosey runtime and docs | `rigerc/nosey`                   | Nosey repo checkout                                               |
| Schema contract        | `rigerc/nosey`                   | `schemas/registry/`; the template only references the public URLs |

- **Section 1 is template-repo work.** Paths are relative to the template repository root.
- **Section 2 is Nosey-repo work.** Paths are relative to the Nosey repository root.
- **Sections 3–4 are cross-repo sequencing and acceptance.**
- Template changes land in the template repo first; Nosey then updates the submodule gitlink to the merged template commit.
- Commit the revised plan into `rigerc/nosey/docs/plans/registry-template-rebuild.md` before using that path in `AGENTS.md`. **That file was not present on inspected `main`**, so references to it are planned, not current.
- Nosey remains an ordinary Node 24/npm application with existing dependencies. “Zero dependency” only governs the **published registry template's checked-in scripts and tests**, not Nosey, GitHub Actions, Git, or the separately provisioned agnix binary.
- Do not edit template content through the Nosey submodule and call it a Nosey change. Make it in the template repo, merge, then bump the gitlink.

---

## 1. Template repository changes (`rigerc/nosey-registry-template`)

**Repo:** template only. Everything in this section happens in the template repository, not in Nosey.

### Remove

- `scripts/*`
- `docs/plans/`
- `TEMPLATE_UPDATES.md`
- generated README catalog body
- current workflows
- `registry.json`
- `skills/demo/` and any other example/demo skill content; keep only `skills/.gitkeep`
- old `Makefile` if redundant

Keep licenses, notices, `.editorconfig`, and `.gitignore`. Preserve attribution when moving files. Do not delete the template's existing secure archive/template-sync behavior by accident; port necessary invariants to replacement scripts/tests.

### Final layout

```text
skills/.gitkeep                 # placeholder only; no example skill
skills-map.json                 # identity + mappings, canonical
skills-manifest.json            # generated from map + skills
scripts/
  generate-manifest.mjs
  generate-readme.mjs
  validate-registry.mjs
  configure-registry.mjs
  lib/
    frontmatter.mjs           # bounded metadata extraction, no YAML package
    schema-validator.mjs      # supported JSON Schema keywords, fail-closed
  test/                       # Node built-in test runner
.agents/prompts/
  fix-skills-using-agnix.md
  map-skills.md
.agents/templates/
  registry-AGENTS.md            # downstream agent guide installed on configure
.github/
  workflows/ci.yml
  workflows/generate.yml
  workflows/template-sync.yml
  pull_request_template.md
.agnix.toml
.editorconfig
.gitignore
.templatesyncignore
README.md
CONTRIBUTING.md
AGENTS.md                       # template-repo maintainer instructions
SECURITY.md
LICENSE
NOTICE.md
package.json                   # scripts only; no dependencies
```

Start `.agnix.toml`, prompts, PR template, and `skills/.gitkeep` from Nosey's `docs/example/registry/`. This is a one-way copy into the template repo; section 2 then deletes the Nosey copy. **Adapt copied material:** remove `registry.json` references, replace `make check`/`make generate` with npm or direct Node commands, clarify Node 22, point both schema URLs to public Nosey `main`, and preserve agnix's security-rule escalations. Require no dangling old links in prompts, docs, workflow comments, or PR checklist.

`package.json` is a script-only convenience wrapper: `generate`, `generate:check`, `validate`, `configure`, `test` (`node --test`), `check`, `lint`, and `lint:strict` call the checked-in `.mjs` files or an already provisioned agnix binary. `generate:check` runs **both** manifest and README `--check`; `check` runs both generation checks, live registry validation, and tests; **neither check command mutates files**. It has no package or dev dependencies. All tooling must also be runnable directly as `node scripts/<name>.mjs`; do not bundle, transpile, download packages, or introduce a build step. The optional lint scripts invoke a preexisting `agnix` binary only.

### AGENTS.md content plan (template repo)

Add `AGENTS.md` at the template root as instructions for agents **working on the template repository itself**. It is not a guide for maintaining a registry created from the template.

GitHub template creation copies root files, so begin with a clear notice:

> This file describes maintaining the template repository. If this repository was created from the template, replace this file with your registry's own `AGENTS.md`.

Add `AGENTS.md` to `.templatesyncignore` so a downstream replacement is never overwritten by template sync. Add a canonical downstream guide at `.agents/templates/registry-AGENTS.md` (syncable infrastructure); it covers skill creation, mappings, generation, checks, and agnix, and contains no instructions for maintaining the upstream template.

**Executable replacement rule:** both configurators recognize the template-maintainer guide using an explicit, unique sentinel/header plus verified template-guide content, replace it from the canonical downstream guide before declaring configuration successful, and are idempotent. If `AGENTS.md` is already downstream-owned, leave it alone. If it has a conflicting or unrecognized maintainer-like form, fail with instructions rather than destroy content. When a registry is created using GitHub's **web** “Use this template” outside Nosey, it still contains maintainer guidance until the owner runs the configurator; state this explicitly in the top of README and AGENTS. Never imply a web-created repo is automatically configured.

#### Audience and scope

- Primary: agents changing template scripts, workflows, prompts, validation, documentation, or tests.
- Secondary: agents validating the template before a merge.
- Not for agents maintaining a derived registry; `README.md` and `CONTRIBUTING.md` cover that workflow.

#### Proposed sections

1. `# Registry template agent guide`
   - Opening paragraph: purpose is maintaining the template repo.
   - Downstream-replacement notice.

2. `## What this repository is`
   - Source template for Nosey skill registries, not a published registry.
   - Repositories created from it have independent histories.
   - Nosey owns the schema contract; the template references the latest public URLs.
   - The template ships no schemas, no `registry.json`, and no example skill.

3. `## Repository boundaries`
   - This repo: template tooling, workflows, prompts, docs, tests.
   - Nosey repo: runtime, parsers, schema contract, and the pinned submodule.
   - Template content changes here first; Nosey bumps its submodule gitlink after merge.
   - Schema changes start in Nosey, then flow into template docs/tests.

4. `## Source of truth`
   - `skills-map.json` — template identity and mapping defaults.
   - `skills-manifest.json` — generated; do not hand-edit.
   - README catalog — generated; do not hand-edit.
   - `scripts/` — generators, validator, configure; edit with tests.
   - `.github/workflows/` — CI and generation behavior.
   - `.agents/prompts/` — agent remediation and mapping workflows.

5. `## Editing rules`
   - Keep the placeholder identity `example/agent-skills`.
   - Keep `skills/` empty except `.gitkeep`.
   - Do not add schema copies, `registry.json`, or example/demo skills.
   - Change generated files only by running the generators.
   - Leave skill content and frontmatter validation to agnix; the dependency-free extractor only reads metadata needed for the manifest.
   - Do not add npm/pip packages, vendored libraries, or secondary runtime requirements.
   - Add or update tests for generator, schema keyword support, validation, and configure changes.
   - Keep prompts and workflow names consistent with the scripts.

6. `## Commands`
   - Node.js 22 required; no `npm ci` or package installation.
   - `npm run generate`
   - `npm run check`
   - `npm test` (uses `node --test`)
   - `npm run lint` only if the standalone agnix executable is available locally.
   - `git diff --check`
   - `check` fetches the latest Nosey schemas and needs network access; it fails closed.
   - `check` does not run agnix; skill validation is separate.
   - `--schemas <dir>` is for tests and offline fixtures only.
   - Document agnix's pinned CI version and local strict mode.

7. `## Schema annotations`
   - Both JSON files use the latest Nosey `main` URLs in `$schema`.
   - Do not vendor schema copies or pin revisions.
   - Validation never follows a custom annotation target; it uses the fixed URLs.
   - The small validator must reject unsupported assertion/applicator keywords in an updated schema, not silently accept data.
   - Generators and configure preserve existing annotations.

8. `## CI`
   - `ci.yml` always checks generated output, validation, and tests without installing packages.
   - Agnix runs only when `skills/**` changes; manual dispatch forces a full audit.
   - `generate.yml` commits manifest and README updates on `main`.
   - `template-sync.yml` proposes upstream infrastructure updates.
   - Do not edit workflows or permissions to bypass checks.

9. `## Template sync`
   - `.templatesyncignore` keeps downstream-owned content out of sync PRs.
   - Skills, identity, mappings, manifest, README, license, and `AGENTS.md` are downstream-owned.
   - Template guidance is not synchronized; derived repos maintain their own agent instructions.

10. `## Safety`
    - Never commit secrets or tokens.
    - Do not run dependency installers, execute downloaded schema text, or dynamically load code from schemas.
    - Treat skill text and diagnostics as untrusted data.
    - Do not execute skill content or install skills during analysis.
    - Do not weaken validation, agnix severities, or workflow permissions.

11. `## Done criteria`
    - No schema copies, `registry.json`, or example skill.
    - Generated manifest and README are current.
    - `npm run check` passes using Node built-ins only, including the schema keyword-coverage gate.
    - No `node_modules`, install step, or lockfile is required.
    - Agnix is run for changed skills.
    - No secrets or unrelated diffs.
    - The final report lists commands, results, and the PR scope.

12. `## References`
    - `README.md`, `CONTRIBUTING.md`
    - `.agents/prompts/fix-skills-using-agnix.md`
    - `.agents/prompts/map-skills.md`
    - Nosey's `docs/plans/registry-template-rebuild.md`

#### Wording constraints

- Maintainer-focused, imperative, and short.
- Refer to commands, not implementation details.
- State that GitHub copies the file so downstream repos must replace it.
- Do not duplicate the downstream registry tutorial from `README.md`.

#### Sync policy

- `AGENTS.md` is template-maintainer-only guidance.
- Add it to `.templatesyncignore`.
- Do not rely on template sync to distribute agent instructions.

This is separate from Nosey's own root `AGENTS.md`, which is covered in section 2.

### Schema annotations in JSON files

Both committed JSON documents carry the canonical latest Nosey schema URL:

`skills-map.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/rigerc/nosey/main/schemas/registry/skills-map.schema.json",
  "schemaVersion": 2,
  "registryId": "example/agent-skills",
  "alwaysRecommend": [],
  "externalSkills": [],
  "technologies": [],
  "technologySkills": [],
  "combinations": [],
  "combinationSkills": [],
  "frontendBonusSkills": [],
  "frontendPackages": [],
  "webFrontendExtensions": []
}
```

`skills-manifest.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/rigerc/nosey/main/schemas/registry/skills-manifest.schema.json",
  "schemaVersion": 1,
  "registryId": "example/agent-skills",
  "skills": []
}
```

Rules:

- The generator writes the canonical URL when `$schema` is absent.
- An existing `$schema` value is preserved verbatim, including a custom URL, matching Nosey's annotation contract.
- The template test suite asserts both committed files contain the canonical URLs.
- Validation never dereferences `$schema`; it always fetches the fixed latest URLs.
- No local schema copies are committed to the template.

### Identity and generation

- `skills-map.json` is the only identity source: `registryId` plus mappings.
- The template defaults to map `schemaVersion: 2` so `externalSkills` is available.
- `generate-manifest.mjs`:
  - reads `registryId` from `skills-map.json`
  - walks `skills/**/SKILL.md`; enforce a deterministic, lexicographic path order independent of locale, filesystem enumeration, and OS
  - extracts top-level YAML frontmatter `name` and `description` with a small Node-only lexical reader; supports plain, single-quoted, double-quoted, and `|`/`>` block scalars (including block indent/chomping where used by fixtures)
  - treats missing, non-scalar, or unrecognized metadata as absent; missing or blank `name` falls back to the skill directory name so the manifest stays schema-valid; unsupported metadata forms produce actionable diagnostics without treating skill quality as a registry-validation failure
  - omits a missing or non-string/blank `description`; does not judge skill content
  - supports BOM, CRLF, quoted colons and hashes, comments, and multiline scalar fixtures without executing text or attempting arbitrary YAML features
  - builds IDs as `${registryId}/${relative-directory-under-skills}`
  - rejects a symlinked `skills` root, does not traverse symlinked directories or read symlinked `SKILL.md` files, and never follows a realpath outside the registry; report skipped links as diagnostics; enforce the existing manifest's 20,000-entry contract and JSON file size/security limits
  - sorts deterministically, writes atomically using exclusive temporary files plus rename, rejects symlinked/hard-linked output surprises, and does not modify output in `--check` mode
  - preserves or adds `$schema` as above
  - supports `--check`
- `generate-readme.mjs`:
  - reads map + manifest
  - replaces only one exact marker-delimited catalog section (reject missing/duplicate/reversed markers), never rewrites hand-maintained README content outside the markers
  - lists local and external skills and recommendation mappings; escape untrusted Markdown/HTML text and validate URL construction, including nested paths and unusual punctuation, without executing skill content
  - supports `--check`
- `configure-registry.mjs`:
  - validates the new `owner/repo` identity
  - rewrites `registryId` in `skills-map.json`
  - rewrites every **declared local** skill ID and its reference in `alwaysRecommend`, `technologies[].skills`, `technologySkills[].skills`, `combinations[].skills`, `combinationSkills[].skills`, and `frontendBonusSkills`
  - uses the original manifest's **exact set of local IDs**; never a bare prefix replacement (external IDs can intentionally share a local-looking prefix)
  - preserves `externalSkills`, external IDs, `$schema` values of **any JSON type**, and unknown keys at all relevant levels
  - regenerates manifest and README, and installs downstream `AGENTS.md` only if the recognized maintainer guide is present
  - verifies all input documents, marker structure, expected local IDs, and output models **before mutating**; stages all changed files with backups and provides rollback on failure (cross-file crash atomicity is not claimed)
  - idempotent at the **byte level** for a second run with the same identity; a rejected rewrite makes no partial changes

**Cross-implementation contract:** Nosey's in-process TypeScript `registry init` and this standalone template configurator use the same versioned golden input/output fixtures, including nested local skills, external prefix collisions, unknown fields, null optional map arrays in v1, custom `$schema` objects, malformed input, README markers, and `AGENTS.md` conversion. Generated fixtures are **test data**, never bundled parser/schema dependencies.

### Registry validation (not skill validation)

No `registry.json` support. Validation compares only manifest and map and silently ignores any stray `registry.json`.

Skill content and frontmatter quality are out of scope. Agnix owns `SKILL.md` validation: naming, descriptions, instructions, links, and unsafe behavior. The generator only reads metadata needed for the manifest, and the validator only checks JSON structure, paths, IDs, and references.

1. **Latest Nosey schemas, without `ajv`**
   - Fetch manifest and map schemas from `rigerc/nosey/main` on every run using Node 22 `fetch`, with a timeout and explicit HTTP/error handling.
   - Fail closed on fetch, parse, unresolved reference, unknown validation keyword, or schema-evaluation errors; no copies, pins, cache, or fallback.
   - Implement only the JSON Schema Draft 2020-12 **keywords currently exercised by the published schemas**: local `$ref`/`$defs`, `type`, `required`, `properties`, `propertyNames`, `additionalProperties`, `items`, `minItems`/`maxItems`, `minLength`/`maxLength`, `minProperties`/`maxProperties`, `pattern`, `enum`, `const`, `allOf`, `anyOf`, `not`, `if`/`then`/`else`, and `dependentSchemas`. Extend this list only when verified schema changes require it.
   - Ignore **an explicit reviewed allowlist** of annotation-only fields (`$id`, `$schema`, `title`, `description`, `examples`, `$comment`, `default`, `deprecated`, `readOnly`, `writeOnly`, and currently defined `x-parserOnly`, `x-normalization`, `x-builtInTechnologies`, and planned `x-builtInCombinations`). Do **not** treat an arbitrary future `x-*` key as safe by default. Do not descend into annotation payloads (e.g., `examples` and the technology catalog) as if they were subschemas. Unknown schema keywords anywhere in a real subschema, including inactive branches, fail closed.
   - Traverse both fetched schema _trees_ before evaluating any instance; inspect root, definitions, property schemas, array schemas, conditional and dependent schemas. Resolve `$ref` only to local JSON Pointers within the **same fetched document**, applying JSON Pointer `~0`/`~1` decoding; reject dangling pointers, remote refs, invalid targets, and recursive cycles not explicitly supported. Never fetch code or dependencies indicated by any schema value.
   - Enforce JSON Schema semantics for `$ref` **and its sibling constraints** (the published `SkillPath` uses this), `if` without matching `then`/`else`, `dependentSchemas`, `not`, `anyOf`, and property evaluation. Accept boolean schemas where allowed or fail clearly during schema coverage analysis; never mistake a false subschema for an annotation.
   - Use Draft 2020-12-compatible JSON value comparison for `const`/`enum` (including structural object and array equality), precise string length in **Unicode code points** (`[...text].length`) for schema `minLength`/`maxLength` versus the **separate UTF-16 code-unit** limit on regex _source_, integer/number differentiation, JS-compatible regular-expression behavior, and simultaneous rather than short-circuited sibling applicability. Log exact JSON paths/keywords on rejection. A subset evaluator is **not** advertised as full JSON Schema compliance.
   - Live network: only the two hard-coded HTTPS raw URLs; request timeout, explicit HTTP status, bounded body size, JSON parse/shape checks, error messages naming the URL; fail closed on 403/404/429/5xx, timeout, invalid JSON, or changed schema vocabulary. Do not consume data-dependent redirects to another origin. No production cache or offline fallback.
   - `--schemas <dir>` permits local **test/CI fixture schemas** only when explicitly supplied, and `--root <dir>` permits isolated fixture registries; they are not production fallbacks. `npm run validate` and `npm run check` always fetch live schemas, regardless of the instance `$schema` value. Schema fixtures are never shipped as substitute canonical schemas in the template.
   - **Nosey schema-PR compatibility gate:** in Nosey CI (where `ajv` already exists), run the template validator against the _proposed checked-out_ schema directory and compare the verdict on explicit corpus cases with Ajv 2020 and Nosey's own parser and integration results. Block a Nosey schema PR if the released template evaluator lacks a new keyword, mis-evaluates a current keyword, or produces an unacceptable difference. If support must change, merge and publish the compatible template PR **first**, then merge the schema PR. This is a cross-repository release procedure, not a new runtime dependency.
   - The instance `$schema` is an annotation only; do not dereference it.

2. **Integration checks**
   - manifest and map `registryId` match
   - manifest paths normalized, contained, existing, regular, non-symlink
   - unique skill IDs and paths
   - map references resolve to **declared** local or external skills, including `alwaysRecommend` (Nosey's current merge filters stale `alwaysRecommend` silently; strengthen Nosey validation or explicitly revise the parity test—**do not silently accept divergent behavior**)
   - local manifest IDs equal `registryId + '/' + relative directory` and match paths exactly; reject references to syntactically valid but undeclared skill IDs
   - unique technology/combination/external-skill IDs **and** association keys; reject duplicate local/external collisions, unknown technology/combination references, and invalid combination `requires`. Resolve built-in technology IDs from the fetched schema's `x-builtInTechnologies` and built-in combination IDs from a **new informational** Nosey schema annotation `x-builtInCombinations` generated from `COMBO_SKILLS_MAP` (section 2). Do not vendor a stale built-in catalog; additions to the annotation allowlist must be reviewed and differentially tested.
   - regex compilation, flags, 512 UTF-16-unit limit
   - external source shape
   - v1 maps reject `externalSkills`
   - MCP `configFiles` path rules, parser-only detection key constraints, bounded pattern arrays, and strict unknown fields where Nosey's parser rejects them; use Nosey source and named conformance fixtures as the behavioral reference
   - `registry.json` is unsupported; a stray file is ignored silently

`npm run check` = generate checks + latest-schema validation + Node built-in tests. All scripts execute directly with the installed Node runtime; no installation occurs.

### Template tests

- Generator: deterministic output, nested IDs, missing-name fallback, `--check` drift.
- Frontmatter extractor: plain/quoted/block scalars, BOM, CRLF, comments, nested YAML ignored, complex metadata falls back/omits without interpreting arbitrary YAML; generator does not reject skill content quality (agnix owns that).
- README: marker-only replacement, local and external catalog entries, `--check`.
- Both committed JSON files contain the canonical `$schema` URLs.
- Validator: latest-schema fetch success/failure/timeout/size cap/redirect protection, `--schemas` override, integration failures, every current schema assertion/applicator keyword, unsupported-keyword rejection even in inactive branches, sibling `$ref`, Boolean subschemas, `$ref` resolution, and negative JSON fixtures. Test malformed/recursive pointers and do not recurse into annotation payloads.
- Schema drift: check the **live** schema keyword inventory against the supported evaluator; run the **differential conformance suite in Nosey** against the proposed checked-out schemas before either PR merges. Include cases where schema accepts but parser rightly rejects under `x-parserOnly` rules; require one-way structural compatibility (`Nosey parser accepts ⇒ schema accepts`) rather than falsely demanding equality for every parser-only rule.
- Conformance specifics: `$ref` siblings, v1 presence of `externalSkills` even as `[]`/`null`, map nullable collections, non-string `$schema` annotations, optional unknown fields, nested IDs, unique IDs/paths, invalid regex flags, 512 UTF-16 regex limit, Unicode code-point schema length, MCP config paths, builtin technology/combination IDs, and `alwaysRecommend` reference behavior.
- Configure: identity rewrite in every mapping group, external-ID preservation under same-prefix collisions, byte-level idempotency, recognized `AGENTS.md` conversion, preflight validation, failure rollback, unknown-field preservation, and golden outputs shared with Nosey.
- Template ships no example skill; `skills/` contains only `.gitkeep`.
- `AGENTS.md` exists, is maintainer-focused, and includes the downstream replacement notice. The separate downstream guide is installed when configured; user-owned guides are not overwritten.
- `package.json` contains no package dependencies or dev dependencies; no lockfile or `node_modules` is necessary.

### Agnix

- Agnix is the only skill validator: it owns frontmatter, naming, descriptions, instructions, references, and unsafe behavior.
- Keep the example's security escalations.
- Pin the **GitHub Action** `agent-sh/agnix` by a verified **full immutable commit SHA** and separately pin the agnix tool release to **`v0.59.1` only after confirming that release and its archive/checksum exist**. The current template workflow uses `agent-sh/agnix@v0` with `version: v0.59.0`; do not fabricate a new action SHA. Provision only as a CI step, not an npm package or install-time requirement for generators.
- Local: `npm run lint`, optional `npm run lint:strict`, invoke a separately installed `agnix` on `PATH` and fail with a clear message if absent; neither command installs it.
- Keep both remediation and mapping prompts.

### CI

**`ci.yml`**

- `changes` job always runs:
  - PR: merge-base diff of `skills/**` including added, modified, deleted, and renamed skill files; fetch appropriate history and handle missing/invalid merge bases with a fail-closed result
  - push: `before` → `head` diff of `skills/**`, including zero/unknown `before` SHAs, new branches, and force pushes; if the diff cannot be resolved, run agnix rather than silently skip it
  - `workflow_dispatch`: force `skills=true` (**fix current template behavior, which sets manual dispatch to `skills=false`**)
- `registry` job always runs, with Node 22 installed by the runner and **no package installation**:
  - assert `package.json` has no `dependencies` or `devDependencies`, no `package-lock.json`, `npm-shrinkwrap.json`, `node_modules`, or tracked vendored libraries; prohibit package-manager install steps and Node loader/import-map tricks that introduce remote code
  - `npm run generate:check`
  - `npm run validate`
  - `npm test` (`node --test`); `check` steps **must not change tracked files** and PR CI compares the generated diff against committed artifacts
- `agnix` job:
  - `needs: changes`
  - `if: needs.changes.outputs.skills == 'true'`
- Job gating, not workflow-level `paths`, so required checks still report. `changes` and `registry` jobs always complete; agnix skips only when no `skills/**` changes. Tests cover manual dispatch, initial push, rename, delete, and no-change events. Pin checkout/setup-node and agnix action SHAs. Code-scanning SARIF upload remains best-effort, but agnix audit failures block its job.
- Node 22, least privilege, concurrency, SHA-pinned actions.

**`generate.yml`**

- On `main` pushes touching `skills/**`, map, generators, or `package.json` (no lockfile).
- Regenerates manifest + README and commits **only** those two files; verify diff and avoid triggering a push loop. **All PRs changing skills, the map, or relevant generator code must already include updated generated files**, because `generate:check` is required in PR CI. Generated main-branch commits are a safety net; if a prior PR fails generated-output checks, it does not merge. Add an integration test for both PR and push/generate behavior. Do not auto-commit on PR or weaken its check.

**`template-sync.yml`**

- Keep the reviewed upstream-update flow.
- `.templatesyncignore` (which uses **Git pathspecs**, not `.gitignore` syntax) excludes `skills/**`, identity/mappings (`skills-map.json`), manifest, README, LICENSE, and `AGENTS.md`. The external downstream guide source `.agents/templates/registry-AGENTS.md` may sync as infrastructure, but must not overwrite a derived registry's root guide. Remove the obsolete `registry.json` entry. Verify sync PRs never modify downstream-owned content.

### Agnix limitation

Agnix does not auto-run for changes limited to `.agnix.toml`, `.agents/prompts/**`, or workflows. `workflow_dispatch` forces a full audit.

---

## 2. Nosey repository changes (`rigerc/nosey`)

**Repo:** Nosey only. Everything in this section happens in the Nosey repository. `template/registry/` is a submodule, not a second editable copy of the template.

### Submodule and release provenance

- Add `template/registry/` pointing at `rigerc/nosey-registry-template` and `.gitmodules` mapping the canonical upstream URL. Pin the gitlink to the merged template commit SHA `T`. Do not record a branch as release provenance.
- Record exactly **one** approved template revision in a small trusted Nosey source constant, for example `src/lib/registry/template-source.ts` exporting `templateCommit = T` and `templateTree = TREE(T)` (the Git tree hash of the upstream revision). Do not copy template scripts into the Nosey distribution. A build-time check uses the gitlink and `git rev-parse <gitlink>^{tree}` to verify these literals; no value is taken from untrusted registry data.
- Remove `docs/example/registry/` from Nosey **after** copying and adapting every retained prompt, severity config, PR checklist, and `.gitkeep` file in the template PR.
- CI and development check out submodules recursively. New Nosey CI smoke checks inspect the submodule and run its direct Node scripts without installing its dependencies; Nosey itself still runs `npm ci` under Node 24.
- The published CLI does not need a submodule checkout at runtime: it uses an **embedded SHA/tree provenance constant** and an HTTPS download from that commit. The submodule is the development/release verification reference, not a mandatory runtime asset.
- Template content is changed in the template repo, never from inside this submodule. After upstream merge, update the gitlink and the trusted commit/tree references in the same Nosey PR; its CI rejects any mismatch.

### Local archive and GitHub-template mode: two distinct gates

**Observed:** Current `src/lib/registry/template.ts` resolves the upstream default branch with GitHub API and then downloads `tar.gz/<resolved SHA>`. This pins only that _individual download_, not the template revision approved for a Nosey release. Current `src/lib/registry/init.ts --github` calls `createUsingTemplate`; GitHub creates a new, independent commit, so comparing the generated commit SHA with the upstream SHA would be incorrect.

**Required revised behavior:**

1. **Local (`registry init`, including `--no-git`):** Download the archive from `https://codeload.github.com/rigerc/nosey-registry-template/tar.gz/T` using the **packaged `T`**, never the mutable default-branch HEAD. Keep the existing archive parser's checksum, traversal, type, byte, entry-count, timeout, symlink, and destination-reservation protections. Preserve data-only extraction; no template script is executed. Return/report `T` as actual archive provenance. Verify appropriate source-archive provenance in transport tests; do not claim that a network response proves authenticity solely because a URL contains the SHA.
2. **GitHub creation preflight:** Preserve the existing GitHub `createUsingTemplate` UX initially. Before creating a remote, query the template repository's default-branch HEAD and require it equals `T`. If upstream has moved, **fail before creating the remote** with a precise compatibility error and instructions to update Nosey or use pinned local initialization. This reduces but cannot eliminate a time-of-check/time-of-use race.
3. **GitHub creation post-check:** After the new generated repository is cloned, but **before** identity rewriting or push, compare the checked-out, unmodified **Git tree hash** with `templateTree`. Equal tree content (not equal commit ID) is the acceptance rule for GitHub's independent history. If unequal, fail without writing a configured commit/pushing; preserve the created remote and local state and produce a recovery instruction rather than deleting a remote that may contain user data. This closes the preflight-to-creation race.
4. **Escape hatch is an explicit design gate, not a silent fallback:** If GitHub's template API cannot reliably reproduce an equal content tree in a test repository, **block** this design. Obtain approval to replace `createUsingTemplate` with a flow that creates an empty GitHub repo and pushes a configured checkout of the same pinned archive; do not disable the tree check. Document GitHub API permission and cleanup implications of that change before implementing it.
5. **Release cadence:** A template PR merged to `main` immediately makes strict `--github` creation fail for an older Nosey release until that Nosey release moves its pin. Document this real operational cost, keep a tested previous release available, and coordinate merge/publication. Local archive initialization keeps working at `T` while the revision remains fetchable. This is the chosen **pin consistency vs. GitHub-default-branch availability** trade-off.

**Automated invariant:** Nosey CI compares `T`, the submodule gitlink, `templateTree`, and the upstream tree of `T`; the test transport asserts the exact archive request is keyed by `T`; a GitHub-mode test exercises preflight equal/mismatch and post-check equal/mismatch/changed-between-checks. No test assumes `--github` provides upstream commit provenance directly.

### Nosey root AGENTS.md

Add a short "Registry template" section to Nosey's existing `AGENTS.md`:

- `template/registry/` is a pinned submodule of `rigerc/nosey-registry-template`.
- Change template content upstream in the template repo; never edit it through the submodule.
- After upstream merges, bump the Nosey gitlink in a separate commit.
- Nosey owns the schema contract in `schemas/registry/`; the template references the latest public URLs and keeps no copies.
- Nosey no longer ships `registry-tools`; the template owns generation and validation.
- `registry init` **locally** downloads the release-pinned template commit and never executes template code; `--github` verifies current template HEAD before creation and generated content tree immediately after clone.
- Check out with `--recurse-submodules`; CI does the same.
- Schema changes require the cross-repo compatibility gate; newly unsupported keywords block Nosey schema PRs until a compatible template revision merges. Update submodule and release provenance when publishing a new template pin.
- Link `docs/plans/registry-template-rebuild.md` for the full plan.

### Remove old tooling

- Delete `registry-tools/`.
- **Rewrite, do not remove,** `scripts/check-registry-package.ts` to assert the new package invariant: `npm pack` contains both schema JSON documents, contains neither `registry-tools` nor a copied template, and the packaged CLI starts without a submodule checkout. Remove its old fixture/tool assumptions; retain meaningful package verification.
- Remove `registry-tools` from package `files`.
- Remove `test:registry` (it currently executes `registry-tools/*.test.mjs`); replace useful behavior checks in regular Nosey Vitest tests and the template's Node tests. **Keep `registry:package:check`**, but repoint it at the rewritten package smoke test. Update `package.json` `files`, `scripts`, and CI invocations together.
- Delete `src/lib/registry/tools.ts`.
- Delete `docs/registry-contract.md` **only after** porting its useful security, release, transport, and ownership notes into `docs/architecture.md`, `docs/registry-schema.md`, README, and the revised plan. Update legal notices: [`THIRD_PARTY_NOTICES.md`](https://github.com/rigerc/nosey/blob/main/THIRD_PARTY_NOTICES.md) currently credits the packaged configurator; preserve any attribution still required for ported behavior and remove obsolete packaged-file claims only after a license review.
- Update `README.md` and `docs/registry-schema.md`:
  - remove the `registry.json` document row and initializer references
  - document the `$schema` URLs in both JSON files
  - state that the dependency-free template fetches latest schemas with no copies and fails closed on unsupported schema keywords
  - document Node 22 as the only **template** tooling runtime, **Node 24+ for Nosey**, and clarify agnix as a separate skill-linting tool
  - remove claims that Nosey CI **owns** template generators; clarify that Nosey CI retains **submodule smoke, cross-repo contract, schema compatibility, and identity parity** gates while the template repo owns full generator tests
- Clean up stale `registry.json` mentions in both schema descriptions/examples and generated docs without changing the JSON contract accidentally. Keep schema `schemaVersion` values (manifest v1; map v1/v2), parser normalization semantics, permissive instance `$schema` annotations, and existing schema `$id` references **stable** unless a separately approved schema-identity migration is performed. Run `npm run docs:schema` and `npm run docs:schema:check` after editing source schema annotations.
- Extend `scripts/build-schema-technologies.ts` or a similarly owned schema metadata generator to include a **nonasserting** `x-builtInCombinations` inventory derived from `COMBO_SKILLS_MAP`, parallel to existing `x-builtInTechnologies` derived from `SKILLS_MAP`. Only IDs/names needed for reference checks belong here; no code execution or copied runtime regexes. Update the template's annotation allowlist to accept this field and Nosey's schema meta/conformance tests, **in the template-before-schema merge order**. Reject stale generated builtin metadata in CI.
- Preserve Nosey's existing `nosey schema skills-map` / `nosey schema manifest` offline commands and their packaged local schemas. They are separate from the template's mandatory _live_ schema URLs.

### Init/configuration

- Keep the current **safe destination reservation, archive extraction, `--github` error recovery, and no-untrusted-code-execution** rules from `init.ts` and `template.ts`, with the release pin/content-tree additions above. Local and remote initialization remain separate code paths with separate failure tests.
- Replace `configureRegistryIdentity`'s packaged subprocess in `src/lib/registry/init.ts` with a **trusted in-process TypeScript transformation**. Never invoke `node` on scripts present in the downloaded/copied template, even if those scripts match trusted filenames.
- Implement and test all of the following in-memory _before_ writing:
  - Read `skills-map.json`, `skills-manifest.json`, README, and optional recognized template `AGENTS.md` as fixed regular non-symlink files subject to existing bounds; require map/manifest identities to match; accept valid v1 maps with absent `externalSkills` and nullable optional collections as Nosey currently does.
  - Use **`skills-map.json.registryId` as the sole old identity source**. Derive the exact set of declared local IDs from `manifest.skills[*].id`; validate IDs and path correspondence. Never infer local status from matching the old registry-prefix string alone.
  - Rewrite map `registryId`; rewrite every reference in `alwaysRecommend`, `technologySkills[].skills`, `combinationSkills[].skills`, `technologies[].skills`, `combinations[].skills`, and `frontendBonusSkills` **only where its value belongs to the declared local ID set**.
  - Rewrite manifest local IDs and its `registryId`, preserving skill `name`, `path`, and `description` and any unknown manifest fields; reject a stray local-looking undeclared reference instead of silently mutating it.
  - Preserve `externalSkills` entries and ID spellings **exactly**, even when they share the old registry's prefix; preserve unknown top-level and nested keys and both `$schema` annotations **verbatim, including non-string JSON values**. Do not roundtrip through typed models that discard unknown data.
  - Rewrite only the intended README registry identifier/catalog line(s); reject missing/ambiguous markers instead of broad string replacement. Do not regenerate by executing copied template scripts.
  - Replace only a **recognized** maintainer-root `AGENTS.md` using the known downstream guide content from the pinned trusted template files; do not overwrite a user-authored guide. Test both template manual configure and Nosey init against the same expected content.
  - Run existing Nosey parser+merge checks on transformed in-memory documents, including manifest/map identity, reference resolution, and relevant builtin technology/combination IDs; validate files/paths on disk without following unsafe links; stage and atomically rename files with rollback on failure. **No partially rewritten registry** is left by recoverable errors. Cross-file crash atomicity is not guaranteed.
  - Require byte-level idempotency for a second configure with the same requested `owner/repository`.
- `registry validate` stops reading `registry.json`; no warning, migration, or compatibility path. A stray file is ignored **even if malformed or a symlink**, since its name is no longer an input. Preserve the existing manifest/map security checks in `loadLocalRegistry` and `validateRegistry`.
- Remove `registry.json` from `readRegistryFile`'s fixed name union and related types/imports. Remove `validateRegistry`'s old optional-registry branch and `parseManifest({...settings, skills: []})` workaround.
- **Intentional validation behavior clarification:** current `mergeRegistries` filters unknown `alwaysRecommend` IDs, while it rejects other dangling map references. This plan requires registry authors' `alwaysRecommend` references to resolve; add an explicit dangling-reference rejection during Nosey registry validation (or document an approved exemption and align the template validator). Test the selected behavior in both codebases; do not claim Nosey already enforces it.
- The template's `configure-registry.mjs` remains for manual template use; it may run its **own checked-in** generators, but the Nosey runtime may not.
- Test that GitHub web-template creation outside the CLI leaves the upstream maintainer `AGENTS.md` until the owner explicitly runs template configure. The README must warn about this unconfigured state.

### Retire `registry build`

- Remove from `src/lib/registry/cli.ts` and help text.
- Remove the build action from `src/screens/RegistryManager.tsx`.
- Remove `buildRegistry` from `src/lib/registry/commands.ts`.
- Update fixtures, all CLI help and JSON usage snapshots, UI keyboard hints, documentation, and tests. Verify there is no hidden `buildRegistry` import anywhere (`tests/helpers/registry-fixture.ts` currently uses it).
- Registries generate via their own `npm run generate` or template CI. `nosey registry validate` is **read-only** and never regenerates data; direct `node scripts/generate-*.mjs` remains supported without `npm install`. No Nosey-side generation fallback.

### Nosey tests and contract gates

- Rewrite `tests/helpers/registry-template.ts` without `registry-tools` or `registry.json`. Keep the current **offline synthetic tarball/transport** strategy; update its expected requested SHA to `T`, its sample files to the new template layout, and its `.template/state.json` fixture as appropriate. Synthetic test data is not a vendored copy of the live template.
- `tests/helpers/registry-fixture.ts`: stop calling `buildRegistry`; directly write coherent map/manifest fixtures for runtime behavior tests. Check other imports of removed tools and update `tests/registry-configuration.test.ts`, `tests/registry-template.test.ts`, `tests/registry-init.test.ts`, `tests/registry-template-download.test.ts`, `tests/registry-github-init.test.ts`, `tests/registry-integration.test.ts`, `tests/registry-commands.test.ts`, `tests/nosey-ui.test.tsx`, and packaging tests by inspecting each file—not by blind search/replace.
- Keep **complete generator, frontmatter, README, and zero-dependency validator unit tests** in the template repository. Retain **cross-repo compatibility, security, init, download/extraction, identity parity, loading, merging, and validation** tests in Nosey. Do not weaken tests solely to make deleted `registry-tools` paths disappear.
- Shared golden fixtures: keep authoritative input/output examples under template `scripts/test/fixtures/identity/`; read them via the Nosey submodule in CI for parity tests. Never depend on a copied template `node_modules` or external schema cache. Assert matching JSON semantics, meaningful README region, `AGENTS.md`, external-ID preservation, failure atomicity, and byte-level second-run idempotency.
- Differential schema tests in Nosey (which already has Ajv as a devDependency): compare `Ajv2020` against the template's bounded evaluator for supported schema validation verdicts, plus independently asserted Nosey parser+merge expected results. Reject false acceptance of schema-invalid data; record parser-only rejects separately; use the same specific fixtures and live checked-out proposed schemas for the schema PR gate. Include unexercised branches and the new builtin-combinations annotation.
- Add or retain the following explicit test cases:
  - map/manifest `registryId` mismatch, invalid path, symlinked and escaping paths, duplicate IDs, duplicate association keys, regex flags/UTF-16 limits, invalid external sources, and dangling references (including the `alwaysRecommend` policy);
  - non-string custom `$schema` is preserved and never dereferenced by **Nosey**; the **template validator**, not Nosey, fetches the two hard-coded latest URLs and ignores instance annotation targets;
  - Nosey initialization works on a representative pinned archive with no submodule available on the user's machine; no template script is executed even when a fixture replaces scripts with `throw` statements;
  - GitHub template mode: preflight refuses moved HEAD before creating remote; postclone compares **tree hash** and rejects mismatches; equal content with different commit hash succeeds; post-create failure retains the remote and preserves recovery instructions;
  - runtime packaged template SHA equals submodule gitlink, runtime tree hash equals upstream tree, and `npm pack` contains both schemas but no `registry-tools`, no duplicate submodule contents, and no requirement for an installed template package;
  - template submodule contains expected files and no schema copies, `registry.json`, example skill, or package dependencies;
  - old `registry.json` is ignored without warning or migration **even if corrupt**; all old build/UI commands are absent;
  - deterministic configured output, data-only initializer, downstream `AGENTS.md` replacement and user-authored-guide protection, rollback of partial write errors, and idempotency.
- Keep `tests/schema-command.test.ts`, generated schema reference checks, and schema-parser one-way conformance. Add tests for `x-builtInCombinations` generated metadata if introduced; avoid changing runtime schema `schemaVersion` or the stable `$id` accidentally.

---

## 3. Execution order and merge gates (cross-repo)

1. **Capture the baseline and record decisions (both repos):** Reinspect both `main` heads; snapshot Nosey's schema/parser expected verdicts, `npm pack` contents, current template test inputs, source attribution, and GitHub `createUsingTemplate` behavior. Create/commit this plan in Nosey's `docs/plans/` when the work begins. Verify that the chosen agnix `v0.59.1` and immutable action SHA exist; record action SHA in the PR.
2. **Create compatibility fixtures before replacement:** Assemble the shared identity golden fixtures, schema differential corpus, mutable-schema keyword audit, security fixtures, and fake GitHub transport tests. Document separately the chosen dangling-`alwaysRecommend` behavior and the new `x-builtInCombinations` annotation.
3. **Template implementation PR:** Rebuild the template from its root with only Node 22 built-ins, migrate/adapt Nosey's example prompts, implement generators/configure/validator, add downstream guide, workflows, test suite and schema annotation URLs. Verify `npm run check`, read-only checks, `git diff --check`, agnix smoke, and no dependencies/lockfile. Open PR **with generated files already committed**.
4. **Premerge parity gate:** In a temporary Nosey CI/test checkout, execute template validator `--schemas <proposed Nosey schemas>` and the differential corpus against Ajv and Nosey's parser; compare both configurators' fixtures. Resolve every unacceptable difference **before** merging template. This test harness belongs in Nosey despite the implementation under review living upstream.
5. **Merge the template PR:** Record the exact merged commit `T` and Git tree `TREE(T)`; verify the upstream repository's default branch resolves to `T` before proceeding. Freeze the pin for the Nosey integration PR.
6. **Nosey integration PR, additive first:** Add `template/registry` submodule and trusted commit/tree constants; modify local-download and GitHub initialization paths to enforce pin/tree rules; port the trusted TypeScript configurator. Add shared parity, offline init, packaged CLI, and GitHub preflight/postclone tests. **Do not remove old tooling until these replacement tests pass.**
7. **Nosey integration PR, cleanup second:** Retire `registry build` across CLI/TUI/helpers; delete old `registry-tools` and `docs/example/registry` only after migration; remove `registry.json` reads and update docs/schema metadata and licensing. Add/enable Nosey schema-PR compatibility checks and `x-builtInCombinations` generation. Change schema annotations only in the reviewed template-before-schema order.
8. **Nosey full validation (Node 24):** Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:schema:check`, `npm run schema:technologies:check`, `npm pack --dry-run --json`, `node dist/cli.js --plain`, plus existing `doctor --json` and `scan . --json` smoke tests. Test CLI init from the **packed artifact** without a submodule checkout or downloaded template code execution. Keep all existing general Nosey CI jobs.
9. **Template final validation (Node 22, clean checkout):** Do **not** install packages. Run `node --version`, `npm run generate:check`, `npm run validate`, `npm test`, `npm run check`, `git diff --check`, check tracked files unchanged, and a separate provisioned pinned agnix audit. Verify manual-dispatch diff behavior in workflow tests. Do not claim live-schema checks pass if network is unavailable; record an explicit blocked gate.
10. **Release verification and publication:** Compare the submodule gitlink, `T`, `TREE(T)`, fetched archive URL, and GitHub-generated content tree; validate recovery flows when `main` advances. Merge Nosey only if checks pass and publish a compatible Nosey release promptly. Record the final SHA, tree, URLs, command output, fixture count, and exact PR scopes; never report a test as passed unless executed.

## 4. Acceptance criteria and evidence (by repo)

**Release-blocking cross-repo criteria**

- [ ] Proposed schema changes are run through the template's current bounded evaluator **and** Ajv 2020 reference validation, with parser-only outcomes independently asserted. Unsupported keywords, bad refs, or a structural false acceptance block merge.
- [ ] A Nosey schema PR cannot merge incompatibly ahead of its corresponding template PR. Live schema fetch failure fails template validation transparently; offline fixture overrides are explicit test-only switches.
- [ ] Exactly one approved template commit `T`: submodule gitlink = packaged local archive SHA = trusted source constant. Source tree hash matches packaged template tree reference; GitHub-generated commits are verified by **tree content**, not commit ID.
- [ ] Both configurators agree on shared golden fixtures, preserve local/external distinctions and all custom JSON annotations, perform no untrusted script execution, and are byte-idempotent; rejected operations leave input unmodified.
- [ ] PRs include generated artifacts; read-only generation checks run on both PR and push; manual CI dispatch forces agnix, with only `skills/**` changes triggering automatic skill audits.
- [ ] No released downstream registry retains the template maintainer guide **after running either configuration path**; web-created-but-unconfigured repositories are explicitly warned and tested.
- [ ] Nosey remains Node 24+ with its npm dependencies; the template's Node 22 tooling uses **zero project package dependencies**, installers, lockfiles, or vendored code.

**Evidence expectations:** For each release-blocking item, attach the relevant CI log/test output, fixture filenames, and observed SHA/tree. A specification or an unexecuted test is not proof.

**Template repo**

- All generation, configuration, registry validation, and tests run on Node 22 built-ins alone: no `yaml`, `ajv`, npm/pip packages, vendored libraries, `npm ci`, `npm install`, or `package-lock.json`.
- The frontmatter reader is explicitly metadata-only, supports documented scalar forms, and does not claim complete YAML parsing.
- The JSON Schema evaluator enforces every current Nosey schema assertion/applicator keyword and fails closed on unsupported schema changes; live fetch and offline fixtures are covered.
- CI passes; agnix is skipped without `skills/**` changes and runs when they change.
- Manual dispatch always runs agnix.
- `generate.yml` commits manifest + README on `main`.
- No `registry.json` exists.
- `skills-map.json` drives identity; manifest and README are generated from it.
- Both JSON files contain the latest Nosey `$schema` URLs.
- Skill content and frontmatter validation is left to agnix; generators only extract metadata and the validator only checks registry JSON and references.
- The template ships no example skill; `skills/` contains only `.gitkeep`.
- The template root includes `AGENTS.md` covering template maintenance: repository boundaries, source of truth, editing rules, commands, schema annotations, CI, template sync, safety, and done criteria.
- `AGENTS.md` is maintainer-only guidance, opens with a downstream replacement notice, and is listed in `.templatesyncignore`. Both configure implementations replace only the verified maintainer guide; never overwrite user-authored instructions.
- `--check` commands do not write; generated manifest and README are committed in PRs; both README catalog marker placement and Markdown escaping are tested.
- CI tests cover live network outage, schema drift, PR/push generation, workflow/manual agnix gating, symlinks and escaping paths, and regression against the current schema keyword inventory.
- The schema's `x-builtInCombinations` annotation is a reviewed informational extension, **not** a new instance validation keyword or a change to `schemaVersion`.

**Nosey repo**

- `docs/example/registry/` and `registry-tools/` are gone.
- `template/registry/` is a submodule pinned to the merged template commit.
- Nosey's root `AGENTS.md` documents the submodule workflow and forbids direct template edits through the submodule.
- Nosey init copies the template, rewrites identity without executing template code, and validates the result.
- `registry build` is removed; registries generate via their own `npm run generate` or template CI.
- `npm pack` contains schemas but no registry tooling.
- Existing registries with `registry.json` still load because Nosey reads only manifest and map; the file is ignored without warning or migration, regardless of its contents.
- No `buildRegistry` imports or build commands remain in CLI, UI, helpers, package files, notices, or docs; `registry validate` is read-only.
- The packaged CLI uses the release template SHA/tree without relying on an installed submodule; GitHub template generation has both preflight SHA and postclone content-tree checks, with safe remote-recovery behavior.
- All old schema/docs references to `registry.json` and unused generator paths have been deliberately audited; generated schema docs are current; stable `$id` values remain unchanged unless explicitly reviewed.
- Schema-PR compatibility CI, identity conformance CI, and package smoke CI are present and blocking; no replacement generation code runs from a downloaded registry.
