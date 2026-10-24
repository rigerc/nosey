# Registry template rebuild: D01 baseline evidence

Captured 2026-10-24 for [D01](https://github.com/rigerc/nosey/issues/40). The
authoritative contract is [registry-template-rebuild.md](registry-template-rebuild.md),
which was normalized by the repository Markdown formatter when committed. The
original attachment/source-comment SHA-256 is
`55ba0b8656e439784ba80a247b4eb57d5ea715f4e7d39cdd9c6b4235d3d91294`;
the formatted committed specification SHA-256 is
`2e8b7f871050c5aeb28a056f43f0bf38d4cbabdc6ddd0865ac5e499133db5932`. Formatting changes tables and emphasis syntax; source snapshots preserve the original bytes. This is a point-in-time baseline; recheck upstream heads
before implementation or release decisions.

## Repository heads and runtime

Commands: `git rev-parse main main^{tree}` in Nosey;
`git -C ../nosey-registry-template rev-parse HEAD HEAD^{tree}` in the sibling
checkout; `node --version`; `npm --version`.

| Repository                       | Ref    | Commit                                     | Git tree                                   |
| -------------------------------- | ------ | ------------------------------------------ | ------------------------------------------ |
| `rigerc/nosey`                   | `main` | `09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b` | `831224dd779968cf9f190d3b7f6bd4949d1e79cb` |
| `rigerc/nosey-registry-template` | `main` | `9b7c2cc895484002c3641d63f2759e1542308179` | `a096426a2521360dd7966514d196b693a51c99d8` |

Runtime observed: Node `v24.22.1`, npm `11.19.1`. Nosey is version `0.1.0`,
requires Node `>=24`, and uses npm. Its direct dependencies are Ink, jsonc-parser,
meow, Octokit, React, smol-toml, string-width and Zod; dev dependencies include
Ajv `^8.20.0`, Vite+ `1.3.0`, Vitest `5.0.5`, TypeScript `^5.9.3`, tsx and
the React/Node types. `package-lock.json` is tracked. Template baseline declares
Node `>=20`, npm scripts `validate` and `test`, Ajv `^8.20.0`, and a tracked
package lock. Its current workflow uses Node 22 but runs `npm ci --ignore-scripts`
and Make commands; its manual dispatch sets `skills=false`, so Agnix is skipped.
The revised contract requires Node 22 built-ins in the template and no package
dependencies, installer, or lockfile. Nosey remains Node 24+ with npm.

`npm pack --dry-run --json` (run in the present checkout) succeeded: 115 entries,
3,156,654 packed bytes, 4,574,410 unpacked bytes, SHA-1
`1218b949ec0375cf5c7f0c506d9a0b80d6e3aa35`. The package includes the two
registry schemas and the legacy `registry-tools/` directory. This inventory is
from the working feature checkout after the documentation snapshot; application
files are unchanged from the captured `main` head.

## Schema and parser baseline

Inspected `schemas/registry/skills-map.schema.json`,
`schemas/registry/skills-manifest.schema.json`, `src/lib/registry/validate.ts`,
`src/lib/registry/merge.ts`, and `tests/fixtures/registry-schema/`.

Schema vocabulary observed by walking the schema-bearing locations in both
schemas (`$defs`, `properties`, `propertyNames`, `items`, and applicator
subschemas), rather than treating arbitrary annotation payloads as schemas
(counts omitted):

- Standard: `$schema`, `$id`, `$ref`, `$defs`, `type`, `title`, `description`,
  `examples`, `required`, `properties`, `propertyNames`, `items`,
  `additionalProperties`, `const`, `enum`, `pattern`, `minLength`,
  `maxLength`, `minItems`, `maxItems`, `minProperties`, `allOf`, `anyOf`,
  `not`, `if`, `then`, and `dependentSchemas`.
- Custom annotations: `x-builtInTechnologies`, `x-normalization`,
  `x-parserOnly`.

Schema-declared parser-only policies include uniqueness by property, external
source shape, regex compilation and flags, the 512 UTF-16-code-unit regex
limit, content-pattern empty strings, path normalization, and path lexical
edges. Nosey also enforces integration/security conditions outside structural
JSON Schema validation: registry ID agreement, safe and existing skill paths,
duplicate IDs/association keys, external identity conflicts, and resolvable
references. The fixture corpus distinguishes `valid`, schema `invalid`, and
`parser-only` cases; it includes map and manifest cases for duplicate IDs,
unsafe paths, invalid regexes, and length/Unicode behavior.

**Observed behavior:** `mergeRegistries` filters undeclared `alwaysRecommend`
IDs and emits a warning. The explicit `validateRegistry` command calls
`mergeRegistries` and throws if that result contains warnings, so an undeclared
ID fails explicit registry validation even though merge itself filters it.
Other consumers of merge results can observe the filtered registry plus its
warning; test both paths explicitly.

**Selected revised policy:** validation rejects every undeclared
`alwaysRecommend` skill ID. This agrees with the current explicit
`validateRegistry` behavior; the merge path's filtering alone would not
establish that policy.

**Selected annotation policy:** `x-builtInCombinations` is informational,
nonasserting metadata. It must not become an instance-validation keyword.
Template-first compatibility is required before changing schema annotations;
do not imply older consumers understand it.

## Attribution and ownership baseline

`docs/registry-contract.md` assigns formats and runtime loading/validation to
Nosey; template generation, validation, Agnix, CI and downstream update tooling
belong to `rigerc/nosey-registry-template`. Nosey’s `docs/example/registry/`
contains reusable prompts, `.agnix.toml`, a PR template, and `.gitkeep`; it is
illustrative material, not a released template. The template currently has its
own license and contributor-maintained files; preserve their existing notices
and attribution when rebuilding. The revised plan requires a one-way adapted
copy of Nosey’s example prompts/configuration into the template before removing
the Nosey example. Neither repository should silently claim ownership of the
other’s runtime or generated output.

## Agnix release and immutable Action verification

Read-only GitHub API commands:

```sh
gh api repos/agent-sh/agnix/releases/tags/v0.59.1
gh api repos/agent-sh/agnix/git/ref/tags/v0.59.1
gh api repos/agent-sh/agnix/git/tags/50a3096d95cdb17219a73648e4532e6120168c71
gh api repos/agent-sh/agnix/contents/action.yml?ref=50a3096d95cdb17219a73648e4532e6120168c71
```

The `v0.59.1` release exists. Its Linux x86_64 GNU archive is
`agnix-x86_64-unknown-linux-gnu.tar.gz`; GitHub reports asset digest
`sha256:69b67baa29e05b5844a0f01a02b937409635262e69295ba627c48990cf89fcc5`.
Downloaded it to `/tmp/nosey-d01/agnix.tar.gz`; `sha256sum` returned the same
digest. The signed release tag object `50a3096d95cdb17219a73648e4532e6120168c71`
peels to commit `182f69774807d9df7c82dcde8240ca0c595e7c83` (`release: v0.59.1
(#1708)`). Inspected `action.yml` at that immutable commit; it declares the
expected audit inputs (`path`, `format`, `version`, `fail-on-error`) and the
action implementation. Pin the Action to that full commit SHA and pass tool
version `v0.59.1`; do not use the moving `@v0` ref. The current template still
uses `agent-sh/agnix@v0` and `v0.59.0`.

## GitHub template behavior and release decision

Read-only `gh api repos/rigerc/nosey-registry-template` confirms the repository
is public, has default branch `main`, and GitHub reports `is_template: true`.
The local `main` commit and tree were also captured above. This confirms the
template is enabled, but does **not** establish what commit/tree GitHub creates
for a generated repository. No test repository was created or deleted, so no
live `createUsingTemplate` equality result is claimed.

**Pending blocking experiment:** with an explicitly provisioned disposable
repository and authorized cleanup, create from the template API, fetch the
generated repository, and compare its root Git tree content to the pinned
upstream template tree. Record both tree hashes and result. If GitHub-generated
content differs, stop and return to the release owner for a design decision;
do not weaken the equality gate. The release owner must also approve the exact
template commit/tree pin after the template PR merges and its default branch is
verified. D01 does not assign an owner or reviewer: none was capacity-checked.

## Commands and observed results

- `gh issue view 40 --repo rigerc/nosey --json number,title,body,url,state,labels`:
  succeeded; issue open, D01 acceptance criteria and attachment SHA reviewed.
- `git rev-parse main main^{tree}` and sibling `rev-parse HEAD HEAD^{tree}`:
  succeeded; values recorded above.
- `node --version`, `npm --version`: succeeded; versions recorded above.
- `npm pack --dry-run --json`: exit 0; inventory recorded above.
- GitHub release/ref/tag/tree and repository metadata reads: succeeded.
- `curl -fsSL <v0.59.1 Linux archive>` and `sha256sum`: exit 0; digest matched
  the GitHub asset digest.
- Live GitHub generated-repository/tree comparison: **not run**; remains a
  blocking design gate. No remote repository was created or deleted.

## Implementation verification updates

The original baseline above is historical. The following evidence updates its pending items without claiming the unmerged integration is complete.

### Live GitHub template-tree experiment

The required baseline `createUsingTemplate` experiment passed against upstream `main` at `9b7c2cc895484002c3641d63f2759e1542308179`. Its tree was `a096426a2521360dd7966514d196b693a51c99d8`. The generated initial commit `413190b854f9661f4f8d2470bc9491da6b2629ee` had the same tree; source HEAD was unchanged on read-back. Independent commit IDs with equal content trees are therefore observed behavior.

The private [integration-test repository](https://github.com/rigerc/nosey-template-rebuild-smoke-20261024-31bdce) is retained for user-controlled cleanup. No acquired repository code ran and no dependency installer was invoked. The command/hash journal is `/tmp/nosey-template-github-tree-experiment.json`. This test used the historical default branch, not the new candidate or a release pin.

### Template candidate and cross-repository gates

[Template PR #24](https://github.com/rigerc/nosey-registry-template/pull/24) is a draft and is linked to the implementation thread. Its initial `47ff8ce` head passed hosted CI. Independent Luna/medium reviews covered the bounded generators, schema evaluator/validator, guidance/sync, transactional configuration and CI/package policy; their concrete findings were corrected in follow-up commits. Later candidate `4a7b51c` passed a clean no-install Node 22 run of all 84 tests, live schema validation, generation checks, and both agnix modes. These results apply to those exact historical heads; final raw-key/UTF-8 preservation probes remain under correction before the candidate is finalized.

The parent independently ran the proposed-schema comparison: 129 registry fixtures, 22 semantic cases, 12 annotation cases, and six unsupported-schema rejections. Shared identity parity subsequently passed 11 executable file-operation fixtures and 14 real configuration syntax cases; local identity grammar is shared rather than inferred from a missing directory. New proposed schema inventories contain 230 technologies and 33 combinations, generated from runtime data. No schema or template PR has been merged.

### Nosey integration status

The trusted identity transformation/file adapter, conformance gates, provenance helpers, read-only two-document validation and proposed schema documentation are committed on the feature branch. Initialization still uses the legacy path until an approved merged template revision can be pinned. There is no approved release commit/tree constant or submodule gitlink yet.

A full transitional Nosey unit run observed 431 passing and two failing tests. One stale `registry.json` identity assertion was corrected at `db2e0eed6f92767adfe8df27edc84fa320c29b67`; the integration/command subset then passed 39 tests, with typecheck and lint passing. The remaining known legacy initializer expectation belongs to N04/N06. A complete post-integration suite is still required; no full Nosey acceptance is claimed.

All delegated implementation and review workers use `gpt-6-luna` with `reasoningEffort: medium`. Project-manager MCP authentication remains unavailable; authenticated GitHub CLI is the recorded fallback. No agent registration, token usage, merge, issue closure or release success is fabricated.

### Reviewed correction candidate and upstream merge read-back

On resuming, GitHub reported that `rigerc` had merged template PR #24 at `2026-10-24T03:06:15Z`, producing commit `4f9839be62554f329e54351ae788ea0541ac7eeb` and tree `b739115e99cd638b2fcf4336f9310d7a3d23a33e`. That merge contained the initial `47ff8ce` head, so the five subsequent correction commits were submitted separately as [template PR #25](https://github.com/rigerc/nosey-registry-template/pull/25). The parent did not perform the merge.

PR #25's exact head is `1c62fa74f8f82b8e13fcd0c7a0e53b93c25eafc3`, with tree `66889743d2c7dc4b5f5584232e62db19b60b23bd`. It corrects file limits and rollback reporting, local identity grammar, generation ordering and traversal bounds, action-pin enforcement, opaque JSON keys and exact UTF-8 handling. An independent Luna/medium reviewer accepted that candidate and reran all 85 Node 22 tests, generation checks, live validation and the dependency policy in an isolated checkout. Both Agnix modes previously passed at that same head. Hosted push and pull-request checks passed on read-back; the push-only Agnix job was intentionally skipped, while the PR audit passed.

The parent independently verified preservation of raw `diagnostics`, own `__proto__` and `constructor` fields, a null `$schema`, normal object prototypes, and authored README BOM/CRLF bytes. Nosey corrections `d9d77386d447a35e9ea7313bc7903832e35ac1ac` and `f3d8c8769e3bebc1144fa4c01fd06f4e9a1736a1` align conflicting maintainer-guide detection, including BOMs, prefixed sentinels and a maintainer header without a sentinel. The focused suite passed 17 tests, with typecheck, targeted lint and formatting passing.

After those corrections, the parent reran both actual candidate gates under Node 24: schema conformance passed 132 registry fixtures, 22 semantic cases and 12 annotation cases, with six unsupported schemas rejected; identity conformance passed 18 file-operation cases and 14 executable syntax cases. The file-operation count includes five additional guide-policy cases. PR #25 still requires merge approval before its actual merged commit/tree can become Nosey's trusted pin. Initialization, removal of legacy tooling, submodule/packaging CI and final full-suite acceptance remain pending; none of these results claim completion of those gates.
