# Registry template rebuild: D01 baseline evidence

Captured 2026-10-24 for [D01](https://github.com/rigerc/nosey/issues/40). The
authoritative contract is [registry-template-rebuild.md](registry-template-rebuild.md),
whose SHA-256 is
`55ba0b8656e439784ba80a247b4eb57d5ea715f4e7d39cdd9c6b4235d3d91294` (matches
the issue attachment). This is a point-in-time baseline; recheck upstream heads
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

Schema vocabulary observed (applicators/assertions and document annotations;
counts omitted because the inventory is the set of used keywords):

- Standard: `$schema`, `$id`, `$ref`, `type`, `title`, `description`,
  `examples`, `required`, `properties`, `items`, `additionalProperties`,
  `const`, `enum`, `pattern`, `minLength`, `maxLength`, `minItems`,
  `maxItems`, `allOf`, `anyOf`, `not`, `if`, `then`, and `dependentSchemas`.
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

**Selected revised policy:** validation rejects every undeclared
`alwaysRecommend` skill ID. Current `mergeRegistries` filters unresolved IDs
before adding recommendations, so current merge behavior is not proof that
validation rejects them. Test validation and merging explicitly.

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
