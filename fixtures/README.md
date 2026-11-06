# Fixtures

## `manifest.example.json`

The fixed Day-1 manifest used to agree the on-chain schema between the Rust
contract and the TypeScript packer. It is a schema fixture, not a real agent: the
`bundle_sha256` is a placeholder and the URI points at `.invalid`.

### Canonicalisation rule

`contracts/registry/src/manifest.rs` hashes **canonical JSON**, not the prettified
file above. The canonical form is:

* keys in exactly this order: `schema_version`, `name`, `description`,
  `runtime_hint`, `bundle_sha256`, `task_kind`, `manifest_uri`
* no insignificant whitespace
* no JSON escaping is possible, because every text field is restricted to
  printable ASCII excluding `"` and `\`

For this fixture the canonical bytes are:

```
{"schema_version":"1","name":"Docs Reporter","description":"Produces a repository documentation report.","runtime_hint":"hermes","bundle_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","task_kind":"docs_report_v1","manifest_uri":"https://example.invalid/bundles/docs-reporter.tar.gz"}
```

Expected SHA-256 (lowercase hex):

```
047e40193f92744a8b439ce91b8fb58bbb4a0de8f76d6e33513b864430235763
```

`contracts/registry/src/manifest.rs` asserts this exact string and hash, so a
change to the canonicalisation is a deliberate schema migration rather than a
silent divergence between languages.

The bundle hash inside the manifest commits to the archive bytes. That is an
integrity commitment only: it does not prove authorship, availability, secrecy,
or that the runtime actually executes what was published.
