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

# M3 validation record

Checked on 2026-10-15 using Node 22.22.2. This milestone adds
`starPositionAt`, using the frozen SAO inputs, FK5 orientation and spin,
proper-motion propagation, observer Roemer delay and relativistic aberration.
It reuses the engine clock, Earth and observer states, precession and nutation.
Results retain the source row and catalogue receipts, time basis, unknown
distance and correction limitations. Tests enforce these contracts without
presenting engine parity as independent accuracy evidence.

The complete local check and the separate independent comparison passed:

```sh
npm --prefix occultations run check
npm --prefix occultations run test:astrometry
python3 occultations/scripts/astrometry-reference.py --verify-published-source
```

The ordinary suite checks analytic motion, polar geometry, RA wrapping,
parallax sign and units, radial perspective, observer light-time modulation,
aberration, both engine time boundaries, complete and absent proper motion,
immutable JSON receipts, observer effects and true-frame consistency. Synthetic
missing-motion catalogue variants are confined to tests; the retained SAO data
is unchanged. The published ERFA component tests use the independently sourced
values in `test/fixtures/erfa-published.json`. The separate source check fetched
the versioned ERFA test file, matched its recorded digest, and verified every
retained input and expected value against that source.

The extended suite uses the fixed register and preregistered acceptance
criteria in `test/fixtures/astrometry-cases.json` and
`test/fixtures/ASTROMETRY.md`. PyERFA 2.0.1.5 with NumPy 2.2.6 generated
independent results under `.generated/`; no generated reference data is
committed. The test requires matching generator and input digests, the pinned
tool versions, and every registered case. It enforces maximum angular errors
of 1e-6 arcseconds for motion, FK5 spin and aberration, and 0.1 arcseconds
for the complete geocentric apparent reduction.

The full reduction comparison covers the registered named SAO stars at
1800-01-02T12:00:00, 1900-03-20T12:00:00, 2000-06-15T12:00:00,
2025-01-14T03:00:00, 2099-09-15T06:00:00 and 2199-12-15T18:00:00,
all on TT. The independent chain uses ERFA Earth states and IAU 2006/2000A
frames, with no solar deflection or potential term. ERFA's ephemeris warnings
at the boundary epochs are retained and asserted. Both models use the same
historical SAO measurements and omit unavailable distance and radial velocity.
Passing these gates establishes reduction agreement over those cases, not
catalogue astrometric accuracy, topocentric timing accuracy, event completeness
or a universal bound. No held-out contact reference from M4 was used.

A fresh Node process imported the local bundle and returned a receipted
topocentric Spica direction and a successful Moon sample at the README's
synthetic station. The stellar result round-tripped through JSON with its
unknown distance preserved. Source-size, documentation, dependency pin,
root npm exclusion and changed-path isolation checks passed.

The root `npm run package:contents` was attempted with its cache redirected
inside this folder. It still stops at `packed package is missing dist/calc.d.ts`.
This task forbids creating or changing root `dist/`; no root build was run.
Full root package, archive rebuild and conformance gates are not claimed as
passed. All authored changes are inside `occultations/`, and git metadata,
release archives and the root npm package remain unchanged.
