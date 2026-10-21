# Skills catalogue builder

Builds a merged, de-duplicated `skills-catalog.json` from
[officialskills.sh](https://officialskills.sh/) and omgskills' gold basket, excluding every
ID this project already maps in [`source/data/skills-map.ts`](../source/data/skills-map.ts).

The exclusion set is read from the typed map with a direct import — `SKILLS_MAP`,
`COMBO_SKILLS_MAP` and `FRONTEND_BONUS_SKILLS` — so no network request is made for it and the
catalogue can never be built against a stale upstream copy of that file.

Requires Node.js 22.9+ with experimental type stripping (or Node.js 22.18+ for direct `.ts`
execution). No npm dependencies.

## Run

```sh
node --experimental-strip-types scripts/build-skills-catalog.ts --output skills-catalog.json
node --experimental-strip-types scripts/build-skills-catalog.ts --refresh
node --experimental-strip-types scripts/build-skills-catalog.ts --workers 6 --delay 0.4
node --experimental-strip-types scripts/build-skills-catalog.ts --limit 10 --no-verify
node --experimental-strip-types scripts/build-skills-catalog.ts --cache-ttl 0
```

## Test

```sh
npm run test:catalog
# same as: node --experimental-strip-types --test scripts/build-skills-catalog.test.mjs
```

## Important behaviour

- `--cache-ttl 0` makes a _frozen snapshot_: a fully warm cache takes no network requests, but
  cannot detect new changes upstream. Pass `--refresh` to fetch fresh data.
- `outdated: true` means a problem was established from the information available.
  `outdated: false` means the checked snapshot was healthy. `outdated: null` means the answer
  was inconclusive.
- A complete GitHub tree with zero `SKILL.md` files proves `missing`. A nonempty tree without
  an identified matching skill is `unresolved` (a filename listing cannot establish what a
  file's frontmatter says).
- Tree discovery examines all `SKILL.md` frontmatters for small repositories (up to 24 listed
  skill files); in larger repositories it probes directories matching the skill's name. An
  inconclusive result remains `unresolved` rather than `missing`.
- A retrieved file must be named `SKILL.md` (case-insensitive), have closed YAML frontmatter,
  and name the requested skill. Unrelated `SKILL.md` files do not establish a match.
- The `name_mismatch` flag, `moved` flag, and `changed_since_last_build` comparison are
  independent, so multiple findings can coexist.
- `--no-verify` carries historical hashes into the output without updating their `checked_at`,
  retaining the baseline for the next verified run.
- GitHub API tokens are scoped to `api.github.com` only. Retries and request spacing are
  shared by all worker tasks.

## Verification

24 dependency-free mocked tests pass via `npm run test:catalog`. The full live scrape is not
part of automated testing; run it manually with `--refresh` when the upstream sites change.

## Propose mappings with Kev (read-only)

The existing catalog builder excludes skill IDs already assigned in
`SKILLS_MAP`, `COMBO_SKILLS_MAP`, and `FRONTEND_BONUS_SKILLS`. This separate
script processes each remaining skill **one at a time**. It evaluates **every
technology** in the existing `SKILLS_MAP` and **every multi-technology
combination** in `COMBO_SKILLS_MAP`, even when the relevant technology name is
absent from the skill title or description. There is no lexical candidate
filter, embedding index, or `top-k` threshold.

Each skill is a processing unit. A single shared SKILL.md/metadata state is
sent with independent System One yes/no questions. The questions are divided
into bounded, sequential batches so that the entire set is not forced into
one oversized inference request. The batch size defaults to 24 questions;
each request receives the same skill state. After both sets of yes/no
judgments, a separate `choice` question identifies skill scope
(technology-specific, combination-specific, task-specific, general, unclear).

No skill is installed, no scanned project is modified, and
`source/data/skills-map.ts` is **never changed by this command**.
Outputs are review proposals, not approved mappings.

### Quick start

Requires Node 22.9+ for type stripping, as with the catalog builder.

```sh
# Refresh existing catalog, including SKILL.md verification.
npm run skills-catalog -- --output skills-catalog.json --refresh

# Offline dry-run: all technologies, all probabilities null.
npm run skills-map:propose -- --no-model --limit 3 \
  --output out/skill-mapping/offline-proposals.json

# Start a local Kev server in another terminal (see jaredpalmer/kev):
# uv run --extra serve python -m kev.serve --run jaredpalmer/kev-4b --port 8009

# Evaluate each skill using SKILL.md where verified, 24 questions/request.
npm run skills-map:propose -- --fetch-docs --batch-size 24 \
  --input skills-catalog.json \
  --output out/skill-mapping/proposals.json \
  --review-output out/skill-mapping/review.json

# Resume after interruption, or retry failed skills (omit --review-output).
npm run skills-map:propose -- --fetch-docs --batch-size 24 \
  --output out/skill-mapping/proposals.json

# Ignore previously completed results and re-evaluate all skills.
npm run skills-map:propose -- --fetch-docs --restart \
  --output out/skill-mapping/proposals.json

npm run test:map
```

The default endpoint is `http://127.0.0.1:8009/v1/systemone`, using
`kev-latest`. Set `KEV_BASE_URL`, `KEV_MODEL`, and (for protected servers)
`KEV_API_KEY` as needed. `--url` and `--model` override the first two.
`--batch-size N` (1..64) is the maximum **number of independent questions
per Kev request**; it is _not_ a skills-per-batch setting.
`--limit N` bounds the number of skills processed.
`--no-model` records every candidate with null probabilities, so it is useful
for inspecting coverage but **does not** evaluate relevance.
`--restart` disables checkpoint reuse.

### Incremental checkpoints and recovery

The script writes the JSON proposal file atomically **after each skill**,
recording `completed`, `total`, and `reused`. On rerun with the same output
path it reuses only fully evaluated skills (or fully enumerated no-model
skills) whose fingerprint matches. Failed/partially evaluated skills are
re-evaluated in full. The fingerprint and output metadata include the
model name, endpoint, question specification, registry hash, document
verification metadata, fetch mode, batch size, and skill metadata.

An interrupted run keeps the already completed per-skill records. A changed
catalog skill or registry causes reevaluation. When `--fetch-docs` is enabled,
refresh the catalog first: a matching catalog SKILL.md hash is the cache
key for the retrieved documentation. Changing model weights without changing
the model identifier or endpoint is **not detected**; pin and change model
revisions explicitly when reproducibility matters.

A pre-existing `--review-output` path is never overwritten, even on resume.
Generate the review template only when it does not yet exist. To resume
scoring with an existing review file, omit `--review-output`; preserve any
reviewer edits separately.

### Trust, evidence and output

`--fetch-docs` reads SKILL.md only when the catalog's prior verification
establishes its identity. The mapper rechecks frontmatter, refuses stale
responses, and checks the content against the recorded SHA-256. Missing,
unverified or changed documents are not treated as authoritative. All
retrieved skill content is untrusted task data, never executable instructions.

- `technologies[]`: _every_ canonical technology ID, name, Kev probability
  of **yes** and an initial review band (`strong` >= 0.90, `review` >= 0.55,
  `weak` otherwise).
- `combinations[]`: every existing multiple-technology combo, with its
  `requires` IDs and an independent probability that the joint requirement
  applies to the skill.
- `scope`: classified in its own second-step question.
- `evaluation`: `evaluated`, `partial`, `failed`, or `not_evaluated`.
  Any batch failure leaves that batch's candidates with null probability and
  `not_evaluated` bands; the script records the error and continues other
  batches, then exits nonzero if errors remain.
- `fingerprint`, `skill_md_sha256`, `document_sha256`, `registry_sha256`,
  `document_status`, and `verified`: change-detection and provenance metadata.
- `--review-output`: a pending human decision template with empty approval
  arrays; no automatic writes to `skills-map.ts`.

Thresholds are **review routing heuristics**, not validated precision or
calibration guarantees. A low `noul` score means a negative applicability
decision; it is not a model failure or low confidence. Do not automatically
approve entries just because their positive probability exceeds 0.90.

### Next steps

This PR does not automatically edit TypeScript mappings, install skills, or
fine-tune Kev. Calibrate on human-reviewed positive and negative
skill-to-technology edges before applying proposals. The normal SkillSense
runtime remains deterministic and read-only.
