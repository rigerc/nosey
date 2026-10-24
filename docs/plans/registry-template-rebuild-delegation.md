# Registry template rebuild — issue and delegation proposal

Original proposal snapshot: **2026-10-24 01:37 UTC**. Mode: **Execute — approved backlog complete**. The user approved the batch with “Proceed.” Created and read-back verified **18 issues and 18 project items**, all **Todo / unclaimed**, using authenticated GitHub CLI because the MCP still returns Bad credentials. No worker claims/launches, merges or releases were performed. See the execution record below.

Authoritative requirements: [revised specification](registry-template-rebuild.md). It is an exact copy of the supplied `registry-template-rebuild-revised.md` (SHA-256 `55ba0b8656e439784ba80a247b4eb57d5ea715f4e7d39cdd9c6b4235d3d91294`), replacing the older local plan that required yaml/ajv in the template. The prior local draft is preserved at `/tmp/nosey-rebuild-plan-lazuvydh/registry-template-rebuild.md`. Both plan files are local/uncommitted; no GitHub source permalink exists yet.

## Baseline and evidence quality

**Observed via read-only GitHub CLI/API:**

- Project [Registry template rebuild](https://github.com/users/rigerc/projects/11), ID `PVT_kwHOAQIga84BoeE4`, open, **0 items**, linked only to `rigerc/nosey`. This is the current project; do not reuse deleted predecessor `PVT_kwHOAQIga84Bod6N`.
- Project fields: Status = Todo / In Progress / Done; existing agent_claimed_by, agent_claimed_at and agent_status = unclaimed / in_progress / review / blocked / completed. Agent fields need no reprovisioning.
- No iteration field exists on this project, so no current project iteration is configured. MCP sprint state could not be read.
- [Nosey main](https://github.com/rigerc/nosey/commit/09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b): `09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b`; tree `831224dd779968cf9f190d3b7f6bd4949d1e79cb`.
- [Template main](https://github.com/rigerc/nosey-registry-template/commit/9b7c2cc895484002c3641d63f2759e1542308179): `9b7c2cc895484002c3641d63f2759e1542308179`; tree `a096426a2521360dd7966514d196b693a51c99d8`. Neither hash is the future approved template T.
- Both repositories have **0 open issues, 0 open PRs and 0 open milestones**. GraphQL totals and pagination were checked; issue listings returned no historical issues either. There are no observed duplicate issues to reuse or open review queues.
- The local checkout HEAD matches Nosey main. Pre-existing work includes modified .gitignore, untracked docs/plans and my-skills-registry; unrelated files remain untouched.
- [agnix v0.59.1](https://github.com/agent-sh/agnix/releases/tag/v0.59.1) exists and publishes platform archives/checksum assets. The [current v0 Action commit](https://github.com/agent-sh/agnix/commit/36c6801f79a12fb1c639696d4095182a322362f2) resolves to `36c6801f79a12fb1c639696d4095182a322362f2`. These are inspected API facts, **not** proof that an archive checksum, action internals or agnix execution has passed.
- Current [template CI](https://github.com/rigerc/nosey-registry-template/blob/9b7c2cc895484002c3641d63f2759e1542308179/.github/workflows/registry-ci.yml) installs packages, permits generated drift, uses mutable agnix v0 and skips manual audits. These require replacement.
- Current Nosey [init](https://github.com/rigerc/nosey/blob/09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b/src/lib/registry/init.ts) invokes packaged configuration; [commands](https://github.com/rigerc/nosey/blob/09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b/src/lib/registry/commands.ts) reads registry.json and implements build; [merge](https://github.com/rigerc/nosey/blob/09ba7cc78e46a34f9ca24fdc4a355a0ea57b508b/src/lib/registry/merge.ts) filters unknown alwaysRecommend IDs. These are existing behavior, not completed changes.

**Unavailable/unknown:** The project-manager MCP discovers tools, but project/agent/sprint reads fail with `Bad credentials - https://docs.github.com/rest`. CLI authentication succeeds; it was used only for read-only fallback. Registered agents, live worker capacity, budgets, heartbeats, stale claims, delivery window and independent reviewer identities remain **unknown**. The discover endpoint accepts only domain/query in its advertised schema; a request for includeSchemas returned summaries only, so mutation schemas/behavior must be rechecked after reconnecting. Discovery also reports no configured healthy AI provider; this proposal was decomposed manually.

Implementation progress is unknown beyond repository observations; this planning session ran no application, template, parity or release tests. Project completion percentages are not inferred from an empty board.

## Proposed GitHub change batch

The user approved this scope with “Proceed.” It was executed through authenticated GitHub CLI after fresh MCP reads still failed with Bad credentials; the original batch outline is retained below:

- **Create 18 issues:** 10 in rigerc/nosey and 8 in rigerc/nosey-registry-template.
- **Add 18 existing issue content IDs** to project `PVT_kwHOAQIga84BoeE4`; set Status to Todo and agent_status to unclaimed using the verified fields/options.
- **Update 0 existing issues**, create 0 milestones/sprints, assign 0 humans/agents, close 0 issues, publish 0 status updates, trigger 0 workflows, merge 0 PRs and publish 0 releases.
- Do not provision agent fields again. Template issue items can be added by content ID without altering project-repository links; linking the template repository would be a separate proposed write.
- Preserve the local proposal IDs below only as planning keys. After issue creation, replace dependencies with real full cross-repository issue URLs (`Depends on rigerc/nosey#N` etc.), record returned node IDs/URLs and verify read-back. Do not fabricate issue numbers.
- Before any write, refresh heads, project items and duplicates. Create sequentially in dependency order; after an ambiguous response, search/read before retrying. Record partial success and canonical URLs so a resumed run does not duplicate work.

This batch authorizes only the stated backlog writes if approved. Worker execution, assignments and merge/release gates have separate contracts. A server-side agent claim does not create a running harness.

## Delivery order, capacity and gates

Priority P0 means a prerequisite or release-blocking correctness/security gate; P1 means necessary supporting delivery. These are proposed body values, not claims that project priority fields or labels exist.

Effort is a rough, uncalibrated **focused engineering-day** range including task-level validation, not a deadline or a model token estimate. Total: **48–81 engineering-days**; cross-task coordination, human review, approval and publication wait time are additional. There is no verified capacity from which to promise a calendar date.

1. D01 establishes committed source, baseline and policy.
2. T01 defines shared fixtures; N01 builds differential/security baseline. T02/T06 can proceed after T01 when actual capacity exists.
3. T02/T03 cover generation, T04/T05 cover schema/integration validation, T06 covers guidance/sync; T07 composes configuration and T08 completes template CI.
4. N02 implements a trusted TypeScript transformer and compares both implementations **before the template merges**, using an explicit candidate checkout in Nosey tests. This avoids a cycle where template acceptance waits on a submodule pin that cannot exist until acceptance.
5. G01 is the authorized template merge/provenance handoff. Only then may N03 pin the merged commit/tree. N04 wires initialization; N05 retires legacy input handling and enforces the approved recommendation rule.
6. N06 removes old build/tooling only after replacement tests pass. N07 lands metadata/docs only after compatible template support merges. N08 enforces all CI/package and release gates.

The main prerequisite chain is D01 → T01 → N01 → T04 → T05 → T07 → T08 → N02 → G01 → N03 → N04 → N06 → N08. N02 also needs the guidance/generator/configurator branches; N07 is an additional mandatory N08 prerequisite. These are dependency constraints, not a measured schedule.

**Delegation status:** all 18 proposals are unassigned; due dates and named review owners are unknown. Role suggestions below express skills, not registered identities. Keep at most one active claim per live worker and respect each explicit dependency. Do not assign a gate whose blockers are open. Avoid concurrent edits to the same template scripts/schema/fixtures; coordinate shared contracts before splitting work.

**Worker handoff:** once approved issues and suitable live workers exist, provide canonical issue/project URLs, the committed requirement permalink, acceptance criteria and permitted repository/file scope. Require a branch/PR with head SHA, actual command results/fixture counts, unresolved risks and an independent review recommendation. The running harness sends factual heartbeats below its configured stale threshold and actual token usage; never fabricate either. Check in at contract changes, candidate PR readiness and failed gates; mark blocked promptly with evidence. Escalate scope expansion, parity failures, unsafe recovery or budget limits to the coordinator. PM must verify returned worker/provider/options and live capacity before delegating execution.

## Issue-ready proposals

All issues share this definition of done: acceptance criteria met with actual logs; relevant tests/CI pass; generated artifacts/docs and necessary attribution updated; independent review complete; no unresolved blocking defect. Closing or merging requires separate scoped authority. Each issue remains unassigned until verified owner/reviewer selection. Source links below are local until D01 commits the plan; replace them with the committed canonical GitHub permalink before creation.

### D01 — Record the revised contract, baseline evidence, and release decisions

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 1–2 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: release coordinator. **Review owner:** unassigned; requires independent maintainer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Commit the supplied revised specification and record both repository heads, package inventory, ownership boundaries, attribution, agnix pin evidence, and the validation policy. No implementation or remote mutation is part of this planning task.

**Source:** [revised specification](registry-template-rebuild.md#3-execution-order-and-merge-gates-cross-repo). **Dependencies:** none; ready for owner selection after approval and reconnection.

**Acceptance criteria:**

- [ ] Commit docs/plans/registry-template-rebuild.md from the revised attachment; remove the old yaml/ajv requirement from the authoritative plan and link the committed source in every issue.
- [ ] Reinspect both main SHAs and tree hashes immediately before work; capture current package tarball inventory and schema/parser/security baselines with executed-command logs.
- [ ] Record the selected policy: registry validation rejects undeclared alwaysRecommend IDs; record x-builtInCombinations as a nonasserting annotation requiring template-first compatibility.
- [ ] Verify the agnix v0.59.1 archive against its checksum and inspect the immutable Action commit before use; API asset existence alone is insufficient verification.
- [ ] Record the GitHub template tree-equality experiment and a release owner decision path; failure blocks the design rather than disabling the check.
- [ ] Name accountable workers and independent reviewers only after capacity checks. No deadline, worker process, or approval to merge/release is implied.

**Work product / evidence:** Committed source permalink, baseline SHA/tree and package logs, policy notes, verified tool checksum/action inspection, GitHub experiment evidence.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T01 — Define shared identity golden fixtures and transformation contracts

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P0 · **Estimate:** 2–3 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: contract engineer. **Review owner:** unassigned; requires independent Nosey maintainer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Add versioned authoritative input/output fixtures under scripts/test/fixtures/identity and the agreed marker/guide recognition contract. These are test data, not vendored schema/parser dependencies.

**Source:** [revised specification](registry-template-rebuild.md#identity-and-generation). **Dependencies:** D01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Fixtures specify nested local IDs and every map reference location: alwaysRecommend, technologies, technologySkills, combinations, combinationSkills, and frontendBonusSkills.
- [ ] Include external IDs sharing a local-looking prefix, custom $schema values of every relevant JSON type, unknown top-level/nested keys, map v1 nullable arrays, and absent externalSkills.
- [ ] Include malformed JSON, identity/path mismatch, undeclared local-looking references, missing/duplicate/reversed README markers, and invalid requested owner/repo.
- [ ] Specify exact maintainer sentinel plus verified guide content, canonical downstream guide output, user-owned guide preservation, and conflicting maintainer-like guide rejection.
- [ ] Specify unchanged inputs on rejected operations, injected write-failure rollback, and byte-identical second configuration.
- [ ] Document schema structural verdicts separately from parser-only and integration verdicts; fixture consumers can identify intentional policy differences.

**Work product / evidence:** Versioned fixture inventory with expected files and named negative outcomes, reviewed by both repository maintainers.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N01 — Build the differential corpus and offline security transport baseline

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 3–5 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: conformance engineer. **Review owner:** unassigned; requires independent schema reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Prepare Nosey-owned Ajv2020/parser/integration corpus and parameterized candidate-template harness before replacement. Preserve current runtime behavior in baseline observations.

**Source:** [revised specification](registry-template-rebuild.md#nosey-tests-and-contract-gates). **Dependencies:** D01, T01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Run explicit expected schema verdicts with Ajv2020 and separately assert Nosey parser+merge outcomes; do not require equality for x-parserOnly cases.
- [ ] Cover all current schema keywords, inactive branches, boolean schemas, local pointer escaping/cycles/bad targets, $ref siblings, structural const/enum equality, and Unicode code-point string lengths.
- [ ] Cover v1 externalSkills presence as []/null, nullable arrays, unknown fields, duplicate association keys, regex flags/512 UTF-16-unit source limits, MCP config paths, built-in IDs, and dangling references.
- [ ] Add fake GitHub transport cases for preflight equality/mismatch, changed HEAD during creation, equal trees with different commits, and postclone mismatch preserving recovery state.
- [ ] Retain archive checksum/traversal/type/byte/entry/timeout/link/reservation cases and malicious template scripts; no network or downloaded code execution in offline tests.
- [ ] Harness accepts an explicit candidate template checkout premerge and will use the submodule postmerge. Candidate overrides cannot alter the packaged runtime pin.

**Work product / evidence:** Named corpus and transport fixtures, executed baseline results, supported-keyword audit, explicit policy delta for alwaysRecommend.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T02 — Implement bounded metadata extraction and deterministic manifest generation

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P1 · **Estimate:** 3–5 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: template generator engineer. **Review owner:** unassigned; requires independent security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Implement Node 22 built-in metadata reader and generate-manifest.mjs. Skill-quality validation remains with agnix.

**Source:** [revised specification](registry-template-rebuild.md#identity-and-generation). **Dependencies:** T01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Metadata-only lexical extraction handles documented plain/single/double/block scalars, block indent/chomp fixtures, BOM, CRLF, comments, and quoted punctuation.
- [ ] Unsupported or nonscalar metadata gives actionable diagnostics; missing/blank name falls back to the directory, and absent/blank description is omitted without judging skill quality.
- [ ] Map registryId drives nested local IDs; traversal and final output order are deterministic across locale and filesystem enumeration.
- [ ] Reject symlinked skills roots, do not follow directory/SKILL.md links or escaping realpaths, and enforce 20,000-entry/file-size bounds.
- [ ] Use exclusive temporary files and atomic rename, reject symlink/hard-link output surprises, and prove --check never writes.
- [ ] Preserve existing $schema values, add canonical annotation only when absent, and retain only skills/.gitkeep in shipped template skill content.

**Work product / evidence:** Node 22 unit-test output, deterministic generation fixtures, read-only and link-safety regression evidence.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T03 — Generate a safe README catalog without changing authored content

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P1 · **Estimate:** 2–3 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: template generator engineer. **Review owner:** unassigned; requires independent documentation/security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Implement generate-readme.mjs using map and manifest; keep one precise generated region.

**Source:** [revised specification](registry-template-rebuild.md#identity-and-generation). **Dependencies:** T01, T02 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Generate local/external skills and recommendation mappings with deterministic ordering, including nested skill paths.
- [ ] Replace exactly one valid marker pair; missing, duplicate, or reversed markers reject without changes.
- [ ] Escape untrusted Markdown and HTML and validate generated URLs for punctuation/path edge cases.
- [ ] Preserve all hand-authored bytes outside the generated region; --check reports drift without writing.
- [ ] Commit generated README and manifest with changes, and include standalone direct Node command coverage.

**Work product / evidence:** Marker and escaping fixtures, byte-preservation and --check tests, committed generated output.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T04 — Implement fail-closed schema coverage and the bounded evaluator

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P0 · **Estimate:** 5–8 engineering-days (low confidence).

**Accountable owner:** unassigned; suggested capability: schema evaluator engineer. **Review owner:** unassigned; requires independent JSON Schema reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Implement scripts/lib/schema-validator.mjs with Node 22 built-ins. This is a bounded evaluator, not full Draft 2020-12 support.

**Source:** [revised specification](registry-template-rebuild.md#registry-validation-not-skill-validation). **Dependencies:** T01, N01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Prewalk every real subschema, including inactive branches and definitions; unsupported validation keywords fail before instance evaluation.
- [ ] Support the reviewed current keyword inventory plus explicitly tested maxProperties/else; allow only named annotation fields, including reviewed x-builtInCombinations, without descending into annotation payloads.
- [ ] Allow same-document JSON Pointer refs with ~0/~1 decoding; reject remote, dangling, invalid-target and unsupported cyclic refs without fetching code.
- [ ] Correctly evaluate boolean schemas, $ref sibling constraints, conditionals, dependentSchemas, allOf/anyOf/not, object/array constraints and propertyNames/additionalProperties.
- [ ] Use structural JSON equality for const/enum, Unicode code points for schema lengths, integer/number semantics, and applicable sibling constraints.
- [ ] Report paths and keywords precisely; run the explicit differential corpus against Ajv2020 from the Nosey harness before template acceptance.
- [ ] Any unexplained false acceptance or unacceptable parity difference blocks merge and triggers constraint review; do not silently weaken validation.

**Work product / evidence:** Keyword coverage report, unit tests and Nosey-owned differential logs with named expected verdicts.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T05 — Validate live registry schemas and integration references safely

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P0 · **Estimate:** 4–6 engineering-days (low confidence).

**Accountable owner:** unassigned; suggested capability: registry validation engineer. **Review owner:** unassigned; requires independent Nosey runtime reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Implement validate-registry.mjs, fixed live schema transport, and integration checks. Validate registry data and references; agnix owns skills.

**Source:** [revised specification](registry-template-rebuild.md#registry-validation-not-skill-validation). **Dependencies:** T02, T04 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Fetch exactly the two canonical Nosey main HTTPS URLs on every production run with timeout, bounded bodies, HTTP/JSON shape checks and no cross-origin redirects, cache, or offline fallback.
- [ ] Fail transparently on outage, 403/404/429/5xx, timeout, malformed JSON, schema drift, unsupported keywords and bad refs. Ignore instance $schema targets.
- [ ] Provide explicit --schemas and --root fixture switches only; npm run validate/check retain live defaults.
- [ ] Enforce matching identities, exact local ID/path correspondence, unique local/external IDs/paths/association keys, safe existing regular paths, and declared references including alwaysRecommend.
- [ ] Use fetched x-builtInTechnologies and reviewed x-builtInCombinations for built-in references. Before the combination annotation is published, required built-in combination lookup must fail explicitly; empty/no-lookup inputs may pass. Exercise proposed annotation data through explicit Nosey CI fixture schemas, never a production hard-coded fallback.
- [ ] Enforce external source shape, v1 externalSkills exclusion, valid technology/combination references/requires, regex flags/limits and MCP/parser-only path/key constraints.
- [ ] Ignore stray registry.json silently, including malformed content or links; never read skill content for quality validation.
- [ ] Read-only tests cover links, escapes, limits, each integration failure and network failure. No package dependencies or installers.

**Work product / evidence:** Live-check output plus offline network/integration fixtures, expected built-in annotation transition, unchanged tracked files.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T06 — Migrate template guidance and preserve downstream ownership in sync

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P1 · **Estimate:** 2–4 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: template maintainer. **Review owner:** unassigned; requires independent documentation/licensing reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Adapt reusable Nosey guidance, add maintainer/downstream guides, and preserve reviewed template-sync infrastructure.

**Source:** [revised specification](registry-template-rebuild.md#agentsmd-content-plan-template-repo). **Dependencies:** T01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Copy/adapt .agnix.toml, remediation/mapping prompts, PR template and .gitkeep from Nosey; replace registry.json/Make/install assumptions and preserve attribution/security escalations.
- [ ] Root AGENTS.md is maintainer-focused with a unique recognition sentinel and immediate downstream replacement notice; canonical downstream guide lives at .agents/templates/registry-AGENTS.md.
- [ ] README clearly warns that GitHub web-template creation remains unconfigured until configure runs.
- [ ] Use Git pathspec semantics in .templatesyncignore to protect skills, map, manifest, README, LICENSE and root AGENTS.md; remove obsolete registry.json entry.
- [ ] Keep template-sync workflow/security behavior and show that infrastructure sync cannot overwrite downstream-owned files or root agent instructions.
- [ ] Document Node 22 built-ins, generation/read-only checks, live schema failure, separate agnix, repository boundaries and reviewed update workflow.

**Work product / evidence:** Adaptation/source-attribution checklist, guide recognition fixtures and sync pathspec tests.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T07 — Configure identity with exact local-ID rewrites and recoverable writes

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P0 · **Estimate:** 3–5 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: identity transformation engineer. **Review owner:** unassigned; requires independent security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Implement manual configure-registry.mjs over two JSON documents, README and recognized guide using the shared fixtures.

**Source:** [revised specification](registry-template-rebuild.md#identity-and-generation). **Dependencies:** T01, T02, T03, T05, T06 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Validate requested owner/repo and coherent input models before mutation; skills-map.registryId is the old identity source.
- [ ] Rewrite only IDs in the original manifest's exact declared local set across every agreed map reference collection; never use prefix-only replacement.
- [ ] Preserve externalSkills/IDs, nested unknown fields and existing $schema of any JSON type; reject undeclared local-looking references.
- [ ] Generate manifest/README and replace only verified maintainer AGENTS.md with the canonical downstream guide; preserve user-owned instructions and reject ambiguous maintainer-like content.
- [ ] Validate all output and marker/path/link constraints before staging; use backups/rollback for recoverable cross-file failures without claiming crash atomicity.
- [ ] Every shared fixture passes; same identity on second run is byte-idempotent and all rejected operations leave inputs unchanged.

**Work product / evidence:** Shared fixture output, injected failure/rollback and byte-idempotency logs under Node 22.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### T08 — Replace template CI and package scripts without installation steps

**Repository:** `rigerc/nosey-registry-template` · **Priority:** P0 · **Estimate:** 3–5 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: template CI engineer. **Review owner:** unassigned; requires independent CI/security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Rebuild scripts-only package interface, required CI, generation safeguard and retained sync workflow; remove legacy template content after replacements.

**Source:** [revised specification](registry-template-rebuild.md#ci). **Dependencies:** T02, T03, T05, T06, T07 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Require Node 22; remove dependencies/devDependencies, installers, package-lock/shrinkwrap, demo skills, registry.json and redundant legacy scripts/Make content. Keep licenses/notices and security behavior.
- [ ] generate:check runs manifest and README checks; check includes generation, live validation and built-in tests; direct Node invocations work and checks leave tracked files unchanged.
- [ ] Registry/changes jobs always report on PR/push without workflow-level path filtering. agnix runs only for skills changes or manual dispatch.
- [ ] Diff tests cover PR merge base, initial/force push, missing/zero before SHA, rename/delete/no-change, and unresolved history defaulting to audit; manual dispatch always forces audit.
- [ ] Pin checkout/setup-node/agnix actions by reviewed immutable SHA and agnix v0.59.1 after checksum verification. Best-effort SARIF upload does not suppress audit failure.
- [ ] generate.yml commits only manifest+README on relevant main pushes, avoids loops, and never excuses missing generated artifacts in a PR.
- [ ] Retain reviewed template-sync flow and least privilege/concurrency; CI rejects dependencies, vendored libraries, loaders/import-map tricks and install steps.
- [ ] Attach clean-checkout Node 22 generate:check, live validate, npm test, check, diff and separately provisioned agnix logs; outage is a blocked gate.

**Work product / evidence:** Workflow event test matrix, immutable tool pins, clean-checkout logs and complete proposed template PR.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N02 — Implement trusted identity transformation and run premerge parity

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 4–7 engineering-days (low confidence).

**Accountable owner:** unassigned; suggested capability: Nosey identity/conformance engineer. **Review owner:** unassigned; requires independent cross-repo security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Build a trusted pure/in-process TypeScript transformation with candidate-template parity in the Nosey PR/test checkout. Do not switch shipped acquisition or remove old tooling yet.

**Source:** [revised specification](registry-template-rebuild.md#initconfiguration). **Dependencies:** N01, T07, T08 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Read bounded fixed regular files and operate on lossless raw JSON so custom annotations/unknown fields survive; infer local IDs exclusively from the original manifest and map identity.
- [ ] Match all shared identity, README, guide, rollback, malformed-input and second-run byte-idempotency fixtures against the template configurator.
- [ ] Validate transformed documents with Nosey parser/integration checks and never invoke copied template scripts; malicious throw-script fixtures prove runtime isolation.
- [ ] Run candidate evaluator against checked-out proposed schemas and Ajv2020 plus separately expected parser/merge verdicts; enforce one-way structural compatibility.
- [ ] Run both current and proposed x-builtInCombinations annotation cases from Nosey-owned fixtures. Record and test the approved alwaysRecommend tightening; unexplained divergence blocks acceptance.
- [ ] Attach actual fixture counts, commands, verdict matrix and candidate SHA/tree. No template merge before independent review of parity evidence.
- [ ] Keep candidate harness override test-only; no runtime default-branch fallback or weakening of provenance checks.

**Work product / evidence:** Nosey draft PR/worktree test artifacts and independent candidate-template acceptance recommendation.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### G01 — Accept the template candidate and record its approved commit and tree

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 1–2 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: release coordinator. **Review owner:** unassigned; requires authorized independent maintainer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Record the human-authorized template merge and release handoff. This issue is a gate; creating or assigning it grants no merge authority.

**Source:** [revised specification](registry-template-rebuild.md#3-execution-order-and-merge-gates-cross-repo). **Dependencies:** N02, T08 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Confirm template PR includes generated artifacts, live validation, all tests, agnix smoke, identity parity, schema differential and security evidence.
- [ ] Resolve every blocking parity or GitHub tree-reproduction objection; a failed content-tree design requires explicit approval for an alternative flow.
- [ ] Obtain explicit scoped authorization before merge; never infer authorization from the planning batch.
- [ ] After authorized merge, record actual merged commit T and TREE(T) and verify upstream default HEAD equals T.
- [ ] Freeze T/tree for the Nosey integration and document that older strict --github releases refuse advanced upstream HEAD while pinned local initialization remains available.
- [ ] Record the release publication coordinator/checkpoint without inventing a date; do not merge Nosey or publish from this task.

**Work product / evidence:** Merged template PR URL, merge approval, exact T/TREE(T), HEAD read-back and release coordination note.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N03 — Pin template provenance and enforce local/GitHub acquisition gates

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 4–6 engineering-days (low confidence).

**Accountable owner:** unassigned; suggested capability: Nosey transport/security engineer. **Review owner:** unassigned; requires independent security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Add .gitmodules/template/registry at approved T, trusted packaged SHA/tree metadata, and acquisition consistency rules.

**Source:** [revised specification](registry-template-rebuild.md#local-archive-and-github-template-mode-two-distinct-gates). **Dependencies:** G01, N01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Submodule gitlink equals trusted T; trusted tree equals upstream TREE(T). Keep constants in packaged runtime and never read provenance from downloaded data.
- [ ] Local init and --no-git request codeload archive keyed by packaged T and report that provenance, while preserving existing extraction/reservation security bounds.
- [ ] Runtime works without a checked-out submodule and executes no acquired scripts; exact URL alone is not claimed as content authentication.
- [ ] GitHub mode checks upstream HEAD before remote creation and refuses mismatches; postclone checks the unmodified content tree before configuration/push.
- [ ] Equal tree with different GitHub commit succeeds; TOCTOU change/mismatched tree fails and preserves remote/local recovery state without deleting user data.
- [ ] Fake transport covers equality/mismatch/race paths; an authorized test repository validates real API tree reproducibility before release.
- [ ] Template content is changed upstream only; gitlink bump follows the template merge.

**Work product / evidence:** Gitlink/constants/tree comparison, exact-request transport tests, extraction regressions and GitHub recovery/tree evidence.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N04 — Wire trusted configuration into initialization and validate replacement paths

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 2–4 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: Nosey initialization engineer. **Review owner:** unassigned; requires independent runtime/security reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Replace configureTool subprocess usage in initialization with the trusted transformation and proven write/rollback adapter. Keep old tooling until replacement evidence passes.

**Source:** [revised specification](registry-template-rebuild.md#initconfiguration). **Dependencies:** N02, N03 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Local and GitHub initialization use trusted in-process TypeScript with all prevalidated documents, safe files, staged writes/rollback and final parser/integration validation.
- [ ] Initializer never spawns node on downloaded scripts or invokes downloaded generation code; packed-runtime malicious-script fixtures pass.
- [ ] Use authoritative shared golden fixtures via submodule in CI without template node_modules or schema caches.
- [ ] Cover owner/repo rewriting, external-prefix collisions, nullable v1 arrays, custom annotations/unknown keys, marker failures, guide replacement/user preservation and repeat-byte idempotency.
- [ ] Preserve destination reservation and remote recovery; rejected operations do not leave partially rewritten state.
- [ ] Replacement init, offline archive, package-independent startup and GitHub tests pass before N06 removes legacy tooling.

**Work product / evidence:** Executed replacement test logs and code diff identifying every removed subprocess call.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N05 — Make registry validation read-only and enforce declared recommendations

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 2–3 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: Nosey registry validation engineer. **Review owner:** unassigned; requires independent compatibility reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Retire registry.json reads/types/optional validation branches and add the specified alwaysRecommend validation. Preserve manifest/map security and ordinary scan merge semantics unless required.

**Source:** [revised specification](registry-template-rebuild.md#initconfiguration). **Dependencies:** N02, G01 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] readRegistryFile fixed-name types and readers/commands accept only remaining inputs; validate never opens registry.json.
- [ ] Existing registries load/validate with an irrelevant malformed file, symlink or oversized registry.json, without warning, migration, writes or link following.
- [ ] Explicit registry validation rejects dangling alwaysRecommend with named fixture coverage in both validators; other declared-reference checks remain enforced.
- [ ] Preserve manifest/map identity, bounds, safe path checks, v1/v2 normalization and non-string $schema annotations.
- [ ] Prove registry validate is read-only and never regenerates files. Update the independent verdict matrix for this intentional behavior change.

**Work product / evidence:** Malformed/link legacy-file fixtures, dangling-reference parity logs, before/after file hashes.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N06 — Retire registry build and remove replaced tooling after migration

**Repository:** `rigerc/nosey` · **Priority:** P1 · **Estimate:** 2–4 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: Nosey CLI/UI engineer. **Review owner:** unassigned; requires independent CLI/UI reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Remove build command, TUI action, helpers and packaged registry-tools; delete example assets only after verified upstream adaptation.

**Source:** [revised specification](registry-template-rebuild.md#retire-registry-build). **Dependencies:** N04, N05, T06 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Remove buildRegistry and registry build from CLI/help, RegistryManager actions/keyboard hints, commands, exports, helpers and snapshots.
- [ ] Replace build-based fixture helpers with directly authored coherent map/manifest data; retain meaningful runtime/UI/plain regression coverage.
- [ ] Delete src/lib/registry/tools.ts and registry-tools; remove package files/test:registry entries and update npm test composition together.
- [ ] Delete docs/example/registry only after T06 adaptation/attribution verification; no Nosey generator wrapper/fallback is added.
- [ ] Keep registry:package:check and rewrite its implementation through N08; preserve unrelated general CI/test commands.
- [ ] Audit imports, executable surfaces and documentation references deliberately; historical removal notes and stable schema $id strings are reviewed exceptions to search results.

**Work product / evidence:** Source/import audit, interactive and headless help/command tests, adapted-asset migration checklist.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N07 — Publish combination metadata and align schema, docs and attribution

**Repository:** `rigerc/nosey` · **Priority:** P1 · **Estimate:** 2–4 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: Nosey schema/documentation engineer. **Review owner:** unassigned; requires independent schema/licensing reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Generate nonasserting combination inventory and update author-facing docs/root AGENTS/notices after compatible template support exists.

**Source:** [revised specification](registry-template-rebuild.md#remove-old-tooling). **Dependencies:** G01, N04, N05 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] Generate x-builtInCombinations from COMBO_SKILLS_MAP alongside x-builtInTechnologies; CI detects stale metadata and evaluator allowlist support is already merged.
- [ ] Preserve schemaVersion, stable $id strings, parser normalization and permissive instance $schema types; annotations do not become new instance assertions.
- [ ] Remove stale registry.json/generator claims from schema descriptions/examples and regenerate reference docs; preserve offline Nosey schema commands/package schemas.
- [ ] Document template Node 22 built-ins/no installation versus Nosey Node 24/npm; distinguish live template validation, agnix, template generator ownership and Nosey parity/smoke gates.
- [ ] Root AGENTS documents upstream-only template edits, recursive checkout/gitlink workflow, SHA/tree consistency and schema compatibility gates, linking the committed plan.
- [ ] Port useful docs/registry-contract.md security/release/ownership material before deletion; preserve necessary notices and complete license review.
- [ ] Document GitHub web-template unconfigured guidance and strict --github availability/recovery when main advances.

**Work product / evidence:** Generated metadata/docs check output, stable-ID diff, documentation link audit and attribution review.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

### N08 — Enforce cross-repo CI, package smoke and final release evidence

**Repository:** `rigerc/nosey` · **Priority:** P0 · **Estimate:** 3–5 engineering-days (medium confidence).

**Accountable owner:** unassigned; suggested capability: release verification engineer. **Review owner:** unassigned; requires independent release reviewer. **Due:** unknown. **Milestone/sprint:** none confirmed.

**Why / scope:** Finish blocking CI and package smoke, run complete clean-checkout gates, and produce a release recommendation. Merge/publication remain separately authorized.

**Source:** [revised specification](registry-template-rebuild.md#4-acceptance-criteria-and-evidence-by-repo). **Dependencies:** N03, N04, N05, N06, N07 (proposal IDs; resolve to real issue URLs before creation).

**Acceptance criteria:**

- [ ] CI checks out submodules and blocks incompatible schema PRs using proposed schemas, the pinned current template evaluator, Ajv2020 and separately asserted parser/integration corpus.
- [ ] CI runs shared identity fixtures and verifies T equals gitlink/runtime SHA and tree equals upstream TREE(T); keep all existing general Nosey CI jobs.
- [ ] Rewrite check-registry-package.ts: npm pack includes both schema JSONs and trusted runtime provenance, excludes registry-tools and duplicated template contents, and packed CLI runs without submodule.
- [ ] Packed CLI init uses representative pinned archive without acquired code execution; retain schema commands, doctor --json, scan . --json and --plain smoke evidence.
- [ ] On Node 24 run npm ci, typecheck, npm test, build, docs:schema:check, schema:technologies:check, registry:package:check, pack --dry-run --json and documented CLI smokes.
- [ ] In a clean template checkout on Node 22 without installation, run generate:check, live validate, npm test, check, git diff --check, unchanged-tracked-files verification and separately provisioned agnix.
- [ ] Attach actual command exits, fixture counts, immutable PR/head/T/tree URLs and GitHub tree/recovery proof; record unavailable network checks as blocked.
- [ ] Recommend merge/release only after independent review and no blocking objections; obtain separate explicit approval for merging, closing work or publication.

**Work product / evidence:** CI logs and packed-artifact smoke report, final cross-repo acceptance checklist, release recommendation with unresolved gates.

**Definition of done:** shared definition above plus all issue-specific criteria and independent review. **Escalation:** any failed acceptance gate, scope expansion, conflicting contract, or unsafe recovery blocks the task; do not weaken checks or close dependencies to continue.

## Release-blocking evidence map

- Schema parity, unknown vocabulary and network failures: N01 → T04/T05 → N02 → N08.
- Exact template commit/tree and both acquisition modes: D01 experiment → G01 → N03 → N04 → N08.
- Cross-implementation identity/annotation/guide/idempotency/rollback contract: T01 → T06/T07 and N02 → N04 → N08.
- Generated files committed, read-only checks, manual agnix and skill-only automatic audits: T02/T03 → T08 → N08.
- Downstream guide installed by either configurator; web-created unconfigured warning: T06/T07 → N02/N04 → N07.
- Runtime boundaries: T08 proves Node 22/no package dependencies; N08 proves Nosey Node 24/npm and packed-artifact behavior.
- No legacy registry.json reads or build surfaces: N05 → N06/N07 → N08.
- Template-before-schema annotation support: T04/T05 → N02/G01 → N07 → N08.
- Attribution and no premature source deletion: D01/T06 → N06/N07.

## Health, decisions and next checkpoint

**Delivery status: approved backlog created and verified; implementation not started by this session.** MCP authentication remains broken, but the authenticated GitHub CLI completed the authorized issue/project batch. No capacity/review window is confirmed. Confidence in the high-level ordering is medium; effort confidence is low for the custom evaluator, parity and GitHub tree behavior.

Current observed counts: project **18 items**; open issues **10/8**, PRs **0/0**, milestones **0/0** for Nosey/template. All 18 created tasks are Todo / unclaimed and unassigned; 0 execution delegations were started. Registered/stale/budget-exhausted worker counts remain unknown. The initial baseline above is historical.

Risk owners are not yet assigned. The release coordinator must resolve custom-evaluator parity risk, GitHub tree-reproduction viability, latest-schema drift, strict GitHub-init availability between releases, cross-file rollback limitations and the tool authentication failure. A failing gate is a blocker, not a passed test or approval to revise the contract.

**Authorization:** the user approved the concrete 18-issue/18-project-item batch by replying “Proceed.” No additional bulk approval is pending. The explicitly invoked [skill](../../.agents/skills/github-project-delegation/SKILL.md) governs the batch; authorization did not include implementation, claims, merges, issue closure or publication.

**Next checkpoint:** select a verified accountable owner and independent reviewer for D01, then perform its baseline/contract work. Do not claim or launch workers without scoped execution authorization and verified capacity. MCP agent health remains unavailable. No scheduler or unattended monitoring has been started.

## Execution record

**Verified at:** 2026-10-24T01:48:50.573017+00:00. Each issue body and project item was read back after mutation. Both canonical source comments were verified against the original document text.

Full revised source: [part 1](https://github.com/rigerc/nosey/issues/40#issuecomment-6378352068), [part 2](https://github.com/rigerc/nosey/issues/40#issuecomment-6378352350). Source SHA-256 remains unchanged. These source snapshots bridge the period before D01 commits the plan.

| Plan key | Created issue                                                                                    | Depends on                                                                                                                                                                                                                                                                                                                                         | Project state    |
| -------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D01      | [rigerc/nosey#40](https://github.com/rigerc/nosey/issues/40)                                     | None                                                                                                                                                                                                                                                                                                                                               | Todo / unclaimed |
| T01      | [rigerc/nosey-registry-template#16](https://github.com/rigerc/nosey-registry-template/issues/16) | [D01](https://github.com/rigerc/nosey/issues/40)                                                                                                                                                                                                                                                                                                   | Todo / unclaimed |
| N01      | [rigerc/nosey#41](https://github.com/rigerc/nosey/issues/41)                                     | [D01](https://github.com/rigerc/nosey/issues/40), [T01](https://github.com/rigerc/nosey-registry-template/issues/16)                                                                                                                                                                                                                               | Todo / unclaimed |
| T02      | [rigerc/nosey-registry-template#17](https://github.com/rigerc/nosey-registry-template/issues/17) | [T01](https://github.com/rigerc/nosey-registry-template/issues/16)                                                                                                                                                                                                                                                                                 | Todo / unclaimed |
| T03      | [rigerc/nosey-registry-template#18](https://github.com/rigerc/nosey-registry-template/issues/18) | [T01](https://github.com/rigerc/nosey-registry-template/issues/16), [T02](https://github.com/rigerc/nosey-registry-template/issues/17)                                                                                                                                                                                                             | Todo / unclaimed |
| T04      | [rigerc/nosey-registry-template#19](https://github.com/rigerc/nosey-registry-template/issues/19) | [T01](https://github.com/rigerc/nosey-registry-template/issues/16), [N01](https://github.com/rigerc/nosey/issues/41)                                                                                                                                                                                                                               | Todo / unclaimed |
| T05      | [rigerc/nosey-registry-template#20](https://github.com/rigerc/nosey-registry-template/issues/20) | [T02](https://github.com/rigerc/nosey-registry-template/issues/17), [T04](https://github.com/rigerc/nosey-registry-template/issues/19)                                                                                                                                                                                                             | Todo / unclaimed |
| T06      | [rigerc/nosey-registry-template#21](https://github.com/rigerc/nosey-registry-template/issues/21) | [T01](https://github.com/rigerc/nosey-registry-template/issues/16)                                                                                                                                                                                                                                                                                 | Todo / unclaimed |
| T07      | [rigerc/nosey-registry-template#22](https://github.com/rigerc/nosey-registry-template/issues/22) | [T01](https://github.com/rigerc/nosey-registry-template/issues/16), [T02](https://github.com/rigerc/nosey-registry-template/issues/17), [T03](https://github.com/rigerc/nosey-registry-template/issues/18), [T05](https://github.com/rigerc/nosey-registry-template/issues/20), [T06](https://github.com/rigerc/nosey-registry-template/issues/21) | Todo / unclaimed |
| T08      | [rigerc/nosey-registry-template#23](https://github.com/rigerc/nosey-registry-template/issues/23) | [T02](https://github.com/rigerc/nosey-registry-template/issues/17), [T03](https://github.com/rigerc/nosey-registry-template/issues/18), [T05](https://github.com/rigerc/nosey-registry-template/issues/20), [T06](https://github.com/rigerc/nosey-registry-template/issues/21), [T07](https://github.com/rigerc/nosey-registry-template/issues/22) | Todo / unclaimed |
| N02      | [rigerc/nosey#42](https://github.com/rigerc/nosey/issues/42)                                     | [N01](https://github.com/rigerc/nosey/issues/41), [T07](https://github.com/rigerc/nosey-registry-template/issues/22), [T08](https://github.com/rigerc/nosey-registry-template/issues/23)                                                                                                                                                           | Todo / unclaimed |
| G01      | [rigerc/nosey#43](https://github.com/rigerc/nosey/issues/43)                                     | [N02](https://github.com/rigerc/nosey/issues/42), [T08](https://github.com/rigerc/nosey-registry-template/issues/23)                                                                                                                                                                                                                               | Todo / unclaimed |
| N03      | [rigerc/nosey#44](https://github.com/rigerc/nosey/issues/44)                                     | [G01](https://github.com/rigerc/nosey/issues/43), [N01](https://github.com/rigerc/nosey/issues/41)                                                                                                                                                                                                                                                 | Todo / unclaimed |
| N04      | [rigerc/nosey#45](https://github.com/rigerc/nosey/issues/45)                                     | [N02](https://github.com/rigerc/nosey/issues/42), [N03](https://github.com/rigerc/nosey/issues/44)                                                                                                                                                                                                                                                 | Todo / unclaimed |
| N05      | [rigerc/nosey#46](https://github.com/rigerc/nosey/issues/46)                                     | [N02](https://github.com/rigerc/nosey/issues/42), [G01](https://github.com/rigerc/nosey/issues/43)                                                                                                                                                                                                                                                 | Todo / unclaimed |
| N06      | [rigerc/nosey#47](https://github.com/rigerc/nosey/issues/47)                                     | [N04](https://github.com/rigerc/nosey/issues/45), [N05](https://github.com/rigerc/nosey/issues/46), [T06](https://github.com/rigerc/nosey-registry-template/issues/21)                                                                                                                                                                             | Todo / unclaimed |
| N07      | [rigerc/nosey#48](https://github.com/rigerc/nosey/issues/48)                                     | [G01](https://github.com/rigerc/nosey/issues/43), [N04](https://github.com/rigerc/nosey/issues/45), [N05](https://github.com/rigerc/nosey/issues/46)                                                                                                                                                                                               | Todo / unclaimed |
| N08      | [rigerc/nosey#49](https://github.com/rigerc/nosey/issues/49)                                     | [N03](https://github.com/rigerc/nosey/issues/44), [N04](https://github.com/rigerc/nosey/issues/45), [N05](https://github.com/rigerc/nosey/issues/46), [N06](https://github.com/rigerc/nosey/issues/47), [N07](https://github.com/rigerc/nosey/issues/48)                                                                                           | Todo / unclaimed |

Machine-readable node IDs, item IDs, source URLs, body hashes and verified write history are in [registry-template-rebuild-issues.json](registry-template-rebuild-issues.json).

The project has exactly 18 items after this batch. Open issue counts are 10 Nosey / 8 template; both repositories still have 0 open PRs and 0 open milestones. No existing issue was repurposed, no assignee or agent was claimed, and no implementation test/CI run, workflow trigger, merge, release or issue closure was performed.
