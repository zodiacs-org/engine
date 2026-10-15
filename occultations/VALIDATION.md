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

# M4 validation record

Checked on 2026-10-15 using Node 22.22.2. The
[event reference contract](test/fixtures/events/EVENTS.md) freezes independent
USNO and NAOJ published predictions, development and held-out event groups,
source receipts and maximum-error criteria before event implementation.
No workbench conjunction, appulse, contact or outline result was evaluated.
The freeze records that fact and the preceding source commit.

The local check passed:

```sh
npm --prefix occultations run check
```

The new Vitest tests enforce the frozen bytes and partitions, source locators,
finite complete check sets, individual maximum errors, circular position-angle
differences, historical noon-based clocks, local-longitude offsets, TT labels,
JST conversions, planetary disk-crossing durations and exact outline-node
longitudes. The arithmetic checker uses synthetic inputs to test rejection of
missing, extra, nonfinite and excessive results. These tests establish source
transcription and acceptance rules, not astronomical accuracy. Existing
stellar tests, type checking, catalogue validation, local build and isolation
checks also passed.

The online auditor was run for each id in the frozen source register:

```sh
npm --prefix occultations run references:verify-source -- --source ID
```

Every registered source passed. Historical scan and OCR bytes matched their
original lengths and digests; the full OCR was streamed without saving it.
NAOJ static pages and numerical map files also matched. CGI illustration
filenames change between requests, so conjunction and local-contact pages
use a narrowly specified filename normalization while preserving the
original raw receipts. The contact audit retains a separate fetch receipt;
every retained contact row matched that response. All remaining page bytes
are checked, including the result tables. Map data links are discovered
without saving their wrapper HTML, executing downloaded code or contacting
a map provider. Downloads and research files remain ignored.

USNO scan transcriptions were reviewed visually. An additional source review
checked the NAOJ conjunction/appulse dates, times, coordinate differences and
clock conversions, and the modern contact/outline semantics. Source model
uncertainties and inferred conventions remain explicit. The same historical
Washington event has alternative station inputs; both are required, with no
selection by residual. No numerical threshold was chosen from a workbench
event result, and no accuracy claim follows from the frozen gates. Precision
geocentric appulse, terrain, horizon, phase and global topology validation
remain future work as listed in the contract.

The root `npm run package:contents` was attempted with its cache inside this
folder and stopped at `packed package is missing dist/calc.d.ts`. Root build
output is outside this task's permitted scope, so no root build was run.
The local scope check confirms source sizes, prose rules, dependency pin,
private-package status, exclusion from root npm file selection and changes
only under `occultations/`. Full root package, archive rebuild and conformance
gates are not claimed as passed. No git metadata, release archive or root npm
package file was changed.

# M5 validation record

Checked on 2026-10-15 using Node 22.22.2. The geocentric conjunction API
searches equal right ascension or ecliptic longitude through the engine's
crossing solver and existing planet/star adapters. It returns immutable
receipts on events, empty searches and refusals. No appulse, occultation
contact or visibility calculation is claimed by this milestone.

The complete local check passed:

```sh
npm --prefix occultations run check
```

This ran TypeScript validation, all ordinary Vitest tests, the offline
catalogue check, local bundle build and scope check. The new
`test/conjunction-geometry.test.ts` and `test/conjunction-edge-review.test.ts`
use independent analytic trajectories to check angular wrap, antipodes,
relative stations, exact touches, budget exhaustion, clipped windows and
integer-millisecond ownership before and after the Unix epoch. A false root
introduced by the inherited solver's circular rounding is explicitly refused.
`test/time-seams.test.ts` checks every declared leap change, the delta-T
handover and both IERS boundaries, including ownership at the inclusive
table endpoint. These are geometry and clock integration checks, not
independent physical timing evidence.

`test/conjunctions.test.ts` checks actual engine and SAO delegation,
right-ascension versus ecliptic event identity, reversed pairs, adjacent
window replay, JSON serialization, immutability, source provenance on empty
stellar searches, malformed requests and complete-list refusals. All
position evaluations, root verification and output samples share one finite
budget; exhaustion never returns earlier events as a complete list.

`test/conjunction-references.test.ts` passes all four frozen NAOJ development
conjunction cases: right ascension and ecliptic longitude for Jupiter/Saturn
on 2020-12-21 and Moon/Mars on 2024-01-10. Each requested window must yield
exactly one event. Source TT windows are converted through the engine clock,
and returned instants are converted back to nominal TT seconds for the
comparison. The unchanged preregistered maximum absolute errors are 3600 s
for the planetary pair and 180 s for the lunar pair, enforced individually
through `assertReferenceChecks`. These are acceptance limits, not measured
maximum residuals or general accuracy bounds. The hour-rounded planetary
reference establishes coarse agreement only. Source conventions and locators
remain in [the frozen contract](test/fixtures/events/EVENTS.md).

No held-out event was evaluated, and no frozen source, partition or threshold
was changed. Stellar conjunction integration does not establish catalogue
timing accuracy. The finite development corpus does not validate minima,
contact times, global outlines, search completeness or arbitrary tangencies.
The receipt explicitly describes sampled completion and inherited limitations.

A fresh Node process imported the generated bundle and successfully returned
a lunar conjunction, a Moon/Spica conjunction with catalogue provenance, and
a zero-position-sample clock-seam refusal. The lunar result round-tripped
through JSON. Generated bundle and catalogue files remain ignored.

The root `npm run package:contents` was attempted with its cache inside this
folder and stopped at `packed package is missing dist/calc.d.ts`. Creating
root build output is forbidden for this task, so no root build was run.
Full root package, archive rebuild and conformance gates are not claimed as
passed. The local scope check confirms source sizes, prose rules, dependency
pin, private-package status, exclusion from root npm file selection and
changes only under `occultations/`. Git metadata, release archives and root
package files were not changed.

# M6 validation record

Checked on 2026-10-15 using Node 22.22.2. `searchAppulses` finds sampled
geocentric spherical-separation minima for distinct Moon/planet or
planet/planet targets. A caller supplies the inclusive angular limit.
The engine crossing solver searches a centered difference of squared chord
distance; a factored haversine kernel avoids cancellation at shallow minima.
Minimum verification, stencil and output positions share one finite budget.
Events, empty searches and whole-search refusals carry immutable receipts.

The complete local check passed:

```sh
npm --prefix occultations run check
```

This runs no-emit TypeScript, all ordinary Vitest tests, catalogue validation,
the local bundle and scope checks. `test/appulse-geometry.test.ts` uses
independent analytic trajectories for coincidence, longitude wrap, poles,
antipodal maxima, minima without coordinate conjunctions, slow motion,
constant separation, stationary touches and zero plateaus. It checks
millisecond window ownership before and after the Unix epoch, bounded work
and refusal of false zeros caused by the inherited solver's circular
rounding. An independently defined asymmetric chord polynomial checks the
finite-difference bias explicitly. These are numerical geometry checks,
not physical timing evidence.

`test/appulses.test.ts` exercises the actual engine on the Moon/Mars
development day, 2024-01-10, and Jupiter/Saturn on 2020-12-21. It checks
spherical separation against a separate formula on the same position
inputs, distinguishes both coordinate conjunctions, and checks pair
reversal, inclusive caps, immutable JSON replay, normalized inputs, budgets
and zero-sample refusals for clock or range boundaries reached only by the
stencil. These are integration checks rather than independent ephemeris
accuracy measurements. Stencil and limits are enforced by those tests;
all position calls stay in the recorded expanded evaluation interval.

`test/appulse-references.test.ts` passes the unchanged frozen NAOJ
Jupiter/Saturn development appulse on 2020-12-21, requiring exactly one
event and the preregistered maximum absolute timing error of 3600 s through
`assertReferenceChecks`. The source gives an approximate hour in JST,
already converted to UTC in the frozen fixture. Its center/site is not
specified, so the gate establishes coarse occurrence only. This acceptance
limit is not a measured maximum residual, precision geocentric validation
or a general timing bound. Source conventions, provenance and limitations
remain in [the reference contract](test/fixtures/events/EVENTS.md).

No held-out event was evaluated and no source fixture, partition or error
criterion changed. Precision geocentric Moon/planet minimum times remain
unvalidated. The receipt exposes finite-difference bias, shallow-minimum
sensitivity, sampled completeness and inherited close-root merging. M6
does not establish occultation candidates, contacts or visibility outlines.

A fresh Node process imported the generated bundle and checked lunar and
planetary appulses, JSON serialization, adjacent-window ownership at each
returned instant and a halo-only clock refusal with no position samples.
Generated catalogue and bundle files remain ignored.

The root `npm run package:contents` was attempted with its cache inside this
folder and stopped at `packed package is missing dist/calc.d.ts`. Creating
root build output is forbidden for this task. No root build was run, and
full root package, archive rebuild and conformance gates are not claimed
as passed. The local scope check passed source sizes, prose rules, dependency
pin, private-package status, exclusion from root npm file selection and
changes only under `occultations/`. Git metadata, release archives and root
package files were not changed.
