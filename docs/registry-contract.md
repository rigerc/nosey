# Registry contracts and template ownership

The standalone [registry template](https://github.com/rigerc/nosey-registry-template)
owns manifest generation, validation, Agnix, CI and downstream updates. The
template independently tests all of these behaviors; Nosey does not publish,
copy or synchronize template source files.

Nosey owns the registry formats it consumes (manifest v1, map v1/v2) in
`schemas/registry`, and the parser/loader contract. Incompatible schema
changes require an incremented `schemaVersion`.

## Testing without a vendored template

The repository does **not** vendor the template for tests or initialization.
Test initialization uses an ephemeral, minimal synthetic registry created by
`tests/helpers/registry-template.ts`, with a mocked GitHub archive transport.
These tests verify Nosey's creation, identity rewriting, archive-extraction
security, schema loading and installed package behavior entirely offline.
The helper is not a template release and must not be published as one.

Template tools, Agnix and synchronization are tested and maintained in the
separate `rigerc/nosey-registry-template` repository. Verify interoperability
against an approved real template revision during releases, rather than
vendoring the template into Nosey source control.

The illustrative layout in `docs/example/registry/` is documentation only. It
is not a template release, is not executed by CI, and must not be used for
initialization.

## Registry creation

Local creation fetches an immutable upstream template commit and configures
the registry ID without executing code from the downloaded repository.
GitHub creation uses the GitHub template API then clones and configures the
created repository. Template provenance under `.template/state.json` remains
unchanged by Nosey's identity rewrite. Downstream updates are proposed via
the template's own reviewed PR workflow.

The older packaged `registry-tools` remain a Nosey-internal compatibility
implementation for `nosey registry build` and safe initialization. They are
**not** copied into the template; the old `registry:template:sync` copying
command and its fixture freshness checks have been removed. Template
maintainers should use `make generate`, `make check` and Agnix CI in the
template repo instead.
