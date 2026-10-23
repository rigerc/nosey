# Registry contracts and template ownership

The standalone [registry template](https://github.com/rigerc/nosey-registry-template)
owns its generator, integrity validator, Agnix policy, GitHub Actions, tests,
and upstream template synchronization. Generated registries own their skills,
registry identity, skill mappings, and README. Template upgrades are reviewed
infrastructure PRs, not copies of one registry's content into another.

Nosey owns the schema and parsing contracts it consumes:
`schemas/registry/skills-manifest.schema.json`,
`schemas/registry/skills-map.schema.json`, and
`src/lib/registry/validate.ts`. The supported document versions are manifest v1
and mapping v1/v2. Breaking document changes require new `schemaVersion` values.

## Contract tests

The representative template fixture is `tests/fixtures/registry-template/`.
`tests/registry-standalone-template.integration.test.ts` exercises its
manifest generator and integrity checker against Nosey's actual loader,
validator, and local initialization. The existing
`tests/registry-github-init.test.ts` covers GitHub template generation
using mocked GitHub calls and local Git, without creating remote repositories.

When the template changes, update the fixture from an approved upstream
commit and open a reviewed Nosey PR for the compatibility changes.
Do not use Nosey's internal generator as the template's source of truth.
The historical `registry:template:sync` copying path is legacy; it is
not part of the standalone template's publishing or downstream update model.

## Initialization and recovery

Local initialization downloads an immutable template commit, configures the
registry ID, then verifies the Nosey contract. GitHub initialization invokes
GitHub's template generation API, clones the created repository, configures it
and pushes the first configured commit. Initialization does not execute scripts
from the downloaded template.

Template provenance in `.template/state.json` is preserved during registry
identity configuration. The template's own update workflow later proposes
three-way-merged infrastructure updates. Workflow updates require an authorized
`TEMPLATE_SYNC_TOKEN`; see the template's `TEMPLATE_UPDATES.md`.

Legacy `nosey registry build` remains available for older registries during
migration. It must never execute registry-provided scripts. Maintainers of
standalone repositories should run their own `make generate && make check`,
with Agnix as a separate required CI job.
