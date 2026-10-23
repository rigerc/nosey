# Registry template maintenance

Nosey owns the registry parsers, configuration tools, generators, and schemas.
The template owns its README, workflows, Makefile, skills, and example registry data.

## Quick how-to

From the Nosey checkout, copy the current canonical files into a template checkout:

```bash
npm run registry:template:sync -- ../nosey-registry-template
npm run dev -- registry validate ../nosey-registry-template
```

Run the template's own checks, review the diff, and open a PR. The sync command
copies configuration tools, generators, attribution, and the three template JSON
examples. It checks those JSON files for freshness too. Sync only accepts the
`example/agent-skills` template identity, so it cannot overwrite configured registries.
Template skills, README, and workflows stay untouched. No release, commit
hash, contract manifest, or GitHub access is required to sync local files.
Existing copies of those maintained files are overwritten, including local edits.

## Validation

The template ships no JSON Schema files, schema reference, or `$schema` annotations.
Schemas and their reference documentation stay in Nosey under `schemas/registry/`
and `docs/registry-schema.md`.

Nosey validates registry JSON through its parsers using `schemaVersion`, before and
after configuration. Initialization runs only Nosey's packaged tools. The template
needs registry JSON, referenced skill files, and a README with catalog markers.
Use a new document `schemaVersion` for incompatible format changes.

Canonical source changes can be checked against the offline fixture with
`npm run registry:template:check`. Refresh that fixture using the same sync command:

```bash
npm run registry:template:sync -- tests/fixtures/registry-template
```

## Creation and recovery

Local initialization downloads the template's default branch at one resolved
commit, then configures and validates it. Network access is required, including
with `--no-git`. That mode needs neither Git nor `gh`. Downloads and extraction
remain bounded, unsafe archive entries are rejected, and failed local scaffolds
are removed. Default local Git initialization starts without an upstream remote.

GitHub initialization uses `gh --template`, clones the generated repository,
configures identity, commits, and pushes the current branch. It preserves the
clone's history and origin. A remote may exist before local setup finishes;
errors report completed stages and recovery instructions. Useful clones are kept.
Do not repeat creation after a partial failure; follow those recovery instructions.

The template's existing monthly sync workflow proposes reviewed updates for
registries. Enable Actions and permission for Actions to create PRs. Its exclusions
protect registry identity, mappings, generated output, skills, and workflows;
review those separately and regenerate output after accepting tool updates.
