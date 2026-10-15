# M1 validation record

Checked on 2026-10-15 using Node 22.22.2. This is a foundation/integration
record, not contact-time or sky-position accuracy evidence.

From `occultations/`, a clean installation from the committed lockfile and
the complete local check passed:

```sh
npm ci --cache .cache/npm --ignore-scripts --no-audit --no-fund
npm run check
```

The check runs no-emit TypeScript validation, the Vitest input and engine
integration tests, the local esbuild bundle and the scope checker. Test
expectations come from calendar semantics, explicit API contracts and direct
engine delegation. No engine parity assertion is an independent accuracy test.

The built module was imported in a fresh Node process and returned a receipted
topocentric Moon sample at the synthetic station in README.md. The local build
and dependency caches are ignored. No root build or archive packing was run.

The repository's `npm run package:contents` was also attempted. It stopped
with `packed package is missing dist/calc.d.ts`: this checkout has no root
`dist/`, and the task forbids changing it. The separate scope check verified
the root package identity and its dry-run file selection, with lifecycle
scripts disabled, and found no occultations files selected. Full built-package
contents, archive rebuilds and the root conformance gates are not claimed as
passed by this session.

All changed paths are under `occultations/`. Catalogue records and independent
contact fixtures remain future milestones; SOURCES.md records leads and the
licensing and convention questions still to resolve.
