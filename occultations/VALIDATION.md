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

# M2 validation record

Checked on 2026-10-15 using Node 22.22.2. The catalogue source is SAO's NASA
ADC J2000 edition, corrected through May 1991, supplied by HEASARC. The
catalogue-specific government-work determinations and the retained original
documentation are recorded in `data/sao-rights.json` and SOURCES.md.

The complete local check passed:

```sh
npm --prefix occultations run check
```

This runs no-emit TypeScript, all local Vitest tests, offline catalogue
normalization, the local bundle and scope checks. `test/catalogue.test.ts`
checks the frozen source and documentation digests, named-star coverage,
selection thresholds, parsed field units, analytic motion conversion,
missing versus measured-zero motion, duplicity/variability semantics,
response truncation and corruption, and immutable receipts. Source-value
assertions test transcription; no test in this milestone establishes
stellar-position or contact-time accuracy.

The parent TAP query was fetched and its exact bytes verified against
`data/sao-acquisition.json`. Extraction reproduced the committed source
records byte for byte. The network and cached-source paths both passed:

```sh
npm --prefix occultations run catalogue:verify-source
node occultations/scripts/catalogue.mjs --extract occultations/.cache/catalogue/sao-query.txt
```

The fixed selection uses catalogue visual magnitude at most 4.5 and
absolute J2000 ecliptic latitude at most 8 degrees, plus the named inclusions.
The query contains 872 parent rows and the extract contains 119 rows.
Acquisition metadata pins the parent count and digest; extraction enforces
them, and the catalogue tests enforce the subset count and the selection
boundaries. This is coverage of the frozen catalogue selection only, with
no claim about event completeness over a time span. Generated normalized
data and the downloaded parent query remain ignored.

A fresh Node import of `.generated/index.mjs` returned the catalogue with
its receipt and a successful Moon position through the existing adapter.
The generated SAO documentation digest matched its retained source copy.
The local bundle carries the engine's licence files and the new SAO notice,
original documentation, rights receipt and alias register.

The repository's `npm run package:contents`, with its npm cache redirected
inside `occultations/.cache/`, again stopped at `packed package is missing
dist/calc.d.ts`. The task forbids changing that root build output. The local
scope check passed the root package's dry-run file selection and confirmed
that it excludes this folder. Full root built-package, archive rebuild and
conformance gates are not claimed as passed. All changed paths remain under
`occultations/`; no archive, root source, root package metadata or git
metadata was changed.
