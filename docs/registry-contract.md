# Registry contracts and template ownership

The standalone [registry template](https://github.com/rigerc/nosey-registry-template)
owns registry generators, validation, Agnix skill linting, CI and downstream
updates. Its scripts use Node.js 22 built-ins and need no package installation.
Nosey remains a Node.js 24+ npm application. Nosey owns the formats it reads
(manifest v1 and map v1/v2), the offline schema commands, and in-process identity
configuration. The template refers to Nosey's public latest schemas; it does not
ship schema copies.

## Initialization and release consistency

Local initialization downloads an archive at the exact template commit trusted by
that Nosey release. It checks the archive source commit and content tree before
writing the destination, then configures identity with trusted Nosey TypeScript.
It never runs acquired template or registry scripts. `registry build` and the old
Nosey-side generator/configuration tooling are retired. A stray `registry.json` is
ignored; Nosey does not read legacy registry settings or provide a compatibility
path. `skills-map.json` is the canonical identity document.

GitHub initialization has a separate release gate because GitHub's template API
creates from the current default branch, not from Nosey's pinned archive. The
operation checks that the current upstream revision is the approved revision and
verifies the created repository tree before configuration. A new upstream default
branch commit can temporarily disable `--github` on older Nosey releases while
local pinned initialization remains available. If the pinned archive cannot be
fetched, initialization fails closed; update Nosey's reviewed provenance pin after
the upstream template change has been reviewed and released. GitHub setup failures
retain the created remote and report recovery steps rather than deleting it or
retrying repository creation.

GitHub web “Use this template” does not run configuration. The maintainer
`AGENTS.md` remains until the registry owner runs the template's configure command.
Template generators and validation are maintained and tested in the template
repository; Nosey tests schema and identity compatibility against the pinned
template during development and release checks.

## Package and schema contract

The Nosey package contains its CLI, registry schemas, third-party notices and the
Apache license required for retained identity-configuration attribution. It does
not contain the template checkout, copied template scripts or the retired
`registry-tools/` directory. A packed-package smoke installs the package in an
isolated temporary directory and checks offline schema output and initialization
without Git or other installed tools.

Both registry JSON identities use Nosey's public latest schema URLs. Nosey schema
commands work offline from its packaged schemas. Template validation fetches the
latest public schemas and fails closed on unsupported keywords. `$schema` values
are data annotations for Nosey and are not dereferenced during registry loading.
See the [registry schema reference](registry-schema.md) for document fields and
parser-only rules.

## Archive and Git safety

Archive extraction checks checksums, paths, entry types, byte and entry-count
limits, timeouts and destination reservation. Local and GitHub initialization use
separate failure paths. GitHub creation may leave a remote behind if cloning,
configuration, commit or push fails; recovery preserves useful local state and
never automatically retries creation. Tokens are not stored in remote URLs or
repository configuration.
