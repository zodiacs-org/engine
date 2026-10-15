# Draconic chart project plan

All implementation, tests, documentation and local tooling stay in `draconic/`.
The engine, its packed files and release archives stay unchanged. Each session
completes the next unchecked milestone, runs its checks, ticks it here and adds
a line to `CHANGES.txt`. Git operations belong to the external harness.

- [x] M1 Create an isolated private TypeScript project, implement a pure longitude rotation primitive with input validation, and document hand-derived synthetic arithmetic with Vitest coverage.
- [x] M2 Add an engine adapter using relative source imports for natal casting and true or mean north-node selection, preserving engine input settings and flags.
- [x] M3 Implement the pure chart transformation for bodies, angles and existing house cusps, refresh position annotations, and reuse engine house helpers without recasting rotated houses.
- [x] M4 Cover absent coordinates, unknown birth time, requested versus computed house systems and polar fallback with synthetic integration tests.
- [x] M5 Implement structured natal tropical versus draconic comparisons with explicit circular delta units and boundary conventions, without interpretation.
- [x] M6 Attach engine natal receipts and separate draconic convention metadata, preserving time basis and provenance without claiming the engine issued a draconic receipt.
- [x] M7 Add the `draconic chart` CLI with strict arguments, synthetic JSON input, explicit mean-node selection, JSON output and useful errors.
- [ ] M8 Add `draconic compare`, plain text rendering for both commands and CLI subprocess tests covering exit codes and output streams.
- [ ] M9 Add small synthetic examples and usage documentation for the library and CLI, citing the arithmetic tests for every numerical example and describing scope and limits.
- [ ] M10 Audit validation, mutation isolation, receipts and package exclusion; run the complete standalone checks and record the final supported behavior and remaining limits.

## Conventions and implementation constraints

Subtract the selected natal north-node longitude from each natal longitude and
reduce it into the canonical circle. True north node is the default; mean north
node is an explicit option. Read both from the engine's public chart APIs.
Rotate existing natal bodies, angles and cusps together. In particular, do not
construct new whole-sign cusps from the rotated ascendant. Retain the original
natal receipt separately from the derived result and state the chosen node,
its natal longitude, rotation formula, units and house convention.

Use hand-derived exact arithmetic on invented charts for rotation expectations.
Engine integration comparisons establish wiring and preservation, not independent
astronomical accuracy. Use no interpretation, predictions, personal birth data,
Swiss Ephemeris material, paid APIs or secrets. Do not add progressions,
directions, harmonics, relocation, returns or an HTTP chart API.

## Standalone verification

Keep dependencies and generated output local and ignored. Use the local package's
Vitest and TypeScript commands on Node 22. Check the engine package's file list
without rebuilding or writing its `dist/`. The repository package-content check
requires an existing engine build; if absent, record that limitation and verify
that an npm dry run with scripts disabled excludes `draconic/`.

## M1 session verification

`npm run typecheck` and `npm test` passed in this folder on Node 22.22.2.
The runtime was provisioned inside the ignored `.cache/npm` folder because
the system Node is an earlier major version. The dependency lockfile is local
to this project; installation used scripts disabled.

An engine `npm pack --dry-run --json --ignore-scripts` report was checked to
exclude every path starting with `draconic/`. It wrote no archive.
`npm run package:contents` could not complete: the existing checkout has no
engine `dist/`, so the check reported missing `dist/calc.d.ts`. The engine was
not built because this task prohibits writing its `dist/`. No files outside
`draconic/` were changed. M2 is next.

## M2 session verification

Added `castNatal` with the engine's true north node as the default and explicit
mean north-node selection through `chartPoints(natal)`. The returned natal
chart retains engine settings, canonical flags, time basis and deltaT metadata.
Node options reject unsupported values and unknown keys. Synthetic integration
tests check both node paths, supported input scales with pinned deltaT,
canonical flags, caller-input isolation and propagated engine validation.
These comparisons establish adapter wiring, not astronomical accuracy.

`npm run typecheck` and `npm test` passed in this folder on Node 22.22.2.
The local dependency installation used scripts disabled. Vitest and TypeScript
resolve the engine's pinned ephemeris from this folder without a root install.
The engine npm dry run with scripts disabled excludes `draconic/` and wrote
no archive. `npm run package:contents` again stops at missing `dist/calc.d.ts`;
the engine build remains absent and was not generated. All session changes
are inside `draconic/`. M3 is next.

## M3 session verification

Added the pure `transformNatal` API and separate derived coordinate types.
Bodies, all angles and existing cusps rotate together; body annotations are
refreshed and the engine's `houseOf` assigns longitude-only houses against
the rotated cusps. Whole-sign cusps keep their sequence and natal system
label. Latitude is retained; natal speeds, retrograde flags and aspects are
omitted from this position snapshot. Node selection metadata retains the
natal longitude. No engine chart or receipt is claimed for the derived object.

The synthetic fixture's body, angle, cusp and house expectations are derived
by hand in `test/ARITHMETIC.md` and checked in `test/transform.test.ts`.
Tests also cover explicit mean-node rotation with the true-node body rows
retained, exact cusp inclusion, sign-boundary rounding, invalid consumed
coordinates, incomplete cusps and independent output from frozen inputs.
Integration with `castNatal` checks wiring only, not astronomical accuracy.

TypeScript checking and the complete standalone Vitest suite passed on the
local Node 22.22.2 runtime. An engine npm dry run with scripts disabled was
checked to exclude `draconic/` and wrote no archive. With its npm cache inside
this project, `npm run package:contents` stops at missing `dist/calc.d.ts`,
as in earlier sessions; no engine build was generated. All session changes
are inside `draconic/`. M4 is next.

## M4 session verification

Added `test/availability.test.ts` with synthetic engine integration cases for
both node choices. Missing coordinates and unknown time retain null angles,
cusps and body house assignments. Unknown time preserves the supplied instant
and its body and selected-node positions, including at polar sites, without
deriving a fallback flag when houses are absent. Tests retain canonical flags
and the requested system alongside the computed system for ordinary houses
and Placidus or Koch polar fallback in either hemisphere. The fallback cusps
are the engine's existing whole-sign cusps under rotation. Zero coordinates
remain a supplied site. Source objects remain unchanged by transformation.
These checks establish wiring and preservation, not astronomical accuracy;
no production code changes were needed. The local README documents availability
and where to read requested versus computed systems.

TypeScript checking and the complete standalone Vitest suite passed on the
local Node 22.22.2 runtime. The engine npm dry run with scripts disabled
excludes `draconic/` and wrote no archive. `npm run package:contents` stops at
missing `dist/calc.d.ts`; the engine build is absent and was not generated.
All session changes are inside `draconic/`. M5 is next.

## M5 session verification

Added pure `compareNatal` and `signedLongitudeDelta` APIs. Comparisons pair
natal tropical and derived draconic body, angle and ordered cusp longitudes
from one source, retain the selected node and computed house system, and
record units, direction, signed delta range and the positive half-circle tie.
Absent geometry stays null. Deltas use actual rotated coordinates, including
rounding, rather than copying the nominal node offset. Output objects are
independent, with no interpretation, aspects or engine receipt claim.

The hand-derived synthetic comparisons and boundary arithmetic are documented
in `test/ARITHMETIC.md` and enforced by `test/compare.test.ts`. They cover
origin wraparound, exact and adjacent half-circle differences, zero and
subnormal values, both node choices, validation and frozen input isolation.
Synthetic engine integration checks cover missing coordinates, unknown time,
ordinary houses and polar fallback. Those comparisons check wiring and
preservation only, without claiming independent astronomical accuracy.

TypeScript checking and the complete standalone Vitest suite passed on the
local Node 22.22.2 runtime. The engine npm dry run with scripts disabled
excludes `draconic/` and wrote no archive. `npm run package:contents` stops
at missing `dist/calc.d.ts`; the engine build is absent and was not generated.
All session changes are inside `draconic/`. M6 is next.

## M6 session verification

Added `draconicChart` and `draconicCompare` result wrappers. Each casts a natal
chart once, captures its unchanged engine natal envelope, and derives rotated
positions or deltas from the same chart. Separate library conventions record
the selected node and its natal longitude, Aries origin, units, rotation and
endpoint policy, cusp preservation and snapshot scope. The engine receipt
remains tropical and natal-only. Explicit receipt context preserves original
instant spelling, local resolution, extensions and claimed provenance through
the engine codec, without inferring unavailable context or authenticating it.

Synthetic integration checks in `test/results.test.ts` cover both node paths,
single casting, receipt serialization and replay, time scales, model and pinned
deltaT, unknown time, absent location, polar fallback, context validation and
mutation isolation. They check wiring and preservation only; the existing
hand-derived rotation and delta cases remain the arithmetic references.
The local README documents the wrappers and the receipt scope.

TypeScript checking and the complete standalone Vitest suite passed on the
local Node 22.22.2 runtime. The engine npm dry run with scripts disabled
excludes `draconic/` and wrote no archive. `npm run package:contents` stops at
missing `dist/calc.d.ts`; the engine build is absent and was not generated.
Project source, test and documentation files remain below the requested file
size limit, and the documentation has no em dash characters. All session
changes are inside `draconic/`. M7 is next.

## M7 session verification

Added the `draconic chart` CLI with explicit file or standard input, default
true or explicit mean north-node selection, and JSON output from the existing
receipt-bearing library wrapper. Input requires a caller declaration of
synthetic origin, accepts only known JSON birth fields and delegates their
values to the engine for validation. Original string instant spelling is
captured in the natal receipt; no local resolution or provenance is inferred.
Arguments reject duplicates, unknown options, missing values and extra tokens.
Input reads are bounded and UTF-8 is validated. Errors have defined exit
codes and use standard error without partial JSON output.

The private executable and npm script use a local source loader to transpile
TypeScript in memory and resolve the pinned ephemeris without a root install
or engine build. Tests in `test/cli.test.ts` cover parsing, validation, node
selection, receipt preservation, settings, bounds and diagnostics. Subprocess
checks in `test/cli-runner.test.ts` cover execution from outside the checkout,
local files with spaces, missing files, directories and oversized streams.
These checks establish command wiring and preservation, not astronomical
accuracy. Usage and the synthetic input declaration are documented locally.

TypeScript checking and the complete standalone Vitest suite passed on the
local Node 22.22.2 runtime. The engine npm dry run with scripts disabled
excludes `draconic/` and wrote no archive. `npm run package:contents` stops at
missing `dist/calc.d.ts`; the engine build remains absent and was not generated.
Project files remain below the requested file size limit, and documentation
has no em dash characters. All session changes are inside `draconic/`.
M8 is next.
