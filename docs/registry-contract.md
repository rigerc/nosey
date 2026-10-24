# Registry contracts and template ownership

The standalone [registry template](https://github.com/rigerc/nosey-registry-template)
owns manifest and README generation, registry validation, Agnix skill linting,
template CI and downstream updates. Template scripts use Node.js 22 built-ins and
do not require package installation. Nosey remains a Node.js 24+ npm application;
its CI owns the proposed submodule smoke, schema compatibility, identity parity,
package and security gates. Nosey does not publish or copy template source files.

Nosey owns the registry formats it consumes (manifest v1, map v1/v2) in
`schemas/registry`, and the parser/loader contract. Incompatible schema changes
require an incremented `schemaVersion`; informational `x-builtInTechnologies`
and `x-builtInCombinations` inventories do not change instance validation.

## Testing and schema compatibility

Synthetic initialization fixtures remain separate from the release template.
They verify Nosey's creation, identity rewriting, archive-extraction security,
schema loading and installed-package behavior offline. When present, the proposed
recursive `template/registry/` submodule pins the approved source for development
and CI; the packaged CLI remains independent of that checkout.

Template generators, the bounded live-schema evaluator, Agnix and synchronization
are tested and maintained in the separate template repository. Template validation
fetches the latest public Nosey schemas and fails closed on unsupported keywords;
instance `$schema` annotations are preserved as data and never dereferenced by
Nosey. Nosey uses its local schemas for offline commands and compares schema
behavior with the template implementation before a schema change can merge.
Template changes merge first; schema annotations are added only after compatible
template evaluator support is available. Built-in inventories contain IDs and
names only and remain informational.

The illustrative layout in `docs/example/registry/` is documentation only. It is
not a template release and must not be used for initialization.

## Registry creation and release gates

The proposed local creation flow fetches an immutable, release-pinned template
archive and configures registry identity without executing downloaded code. The
proposed GitHub flow checks that upstream default-branch HEAD matches the supported
revision before creating a remote, then compares the cloned repository tree with
the approved tree before identity rewriting or push. A new upstream default-branch
commit temporarily blocks `--github` for older Nosey releases until Nosey updates
its pin. Failed post-creation checks retain the remote and provide recovery steps;
they never delete a possibly user-owned repository.

GitHub web “Use this template” does not run configure. The maintainer `AGENTS.md`
therefore remains until the owner explicitly runs the template configure command.
Downstream infrastructure updates are proposed through the template's reviewed PR
workflow. Sync excludes registry identity, mappings, generated output, skills and
workflows so maintenance cannot overwrite registry-owned data.

Nosey owns registry schemas, parsers, loaders and merge semantics. The template owns
generation and validation. Nosey initialization must never invoke scripts from the
downloaded template; identity rewriting is a trusted in-process Nosey operation.
The target contract has no `registry.json` compatibility path or Nosey-side
generation fallback. Existing notices for currently packaged `registry-tools`
remain until the separately scoped cleanup removes those files and a license review
confirms which attribution is still required.

## Archive and Git safety

Archive extraction remains data-only and retains checksum, traversal, entry-type,
byte, entry-count, timeout, symlink and destination-reservation protections. Local
and GitHub initialization use separate failure paths. GitHub creation can leave a
remote behind if clone, configuration or push fails; report completed stages and
recovery commands, preserve useful local state and never automatically retry
creation. Tokens must not enter remote URLs or repository configuration. These
security and recovery constraints apply while the proposed release gates are
implemented.
