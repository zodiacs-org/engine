# Harmonics and Uranian dials plan

Work only in `harmonics/`. Keep the engine sources, package metadata, build
output and carried archives unchanged. Each session implements the next
unchecked milestone, runs its checks, marks it complete and appends a line to
`CHANGES.txt`. The harness handles git writes and the draft pull request.

- [x] M1 Set up an isolated private TypeScript project and Vitest runner; implement pure harmonic longitude charts with validated named points, a configurable harmonic ceiling and hand-derived arithmetic tests.
- [x] M2 Add an engine chart adapter using relative source imports, reuse natal chart casting and the natal receipt creator, preserve the original receipt and chart flags, and keep unknown point speeds absent.
- [x] M3 Add harmonic aspect detection using the engine's configured aspect policy and matcher, with explicit orb units and per-harmonic scaling; test custom angles, wraparound and inclusive boundaries.
- [x] M4 Reuse `src/techniques/aspect-patterns.ts` for supported harmonic aspect patterns, documenting its fixed major-aspect limits and refusing unsupported pattern policies rather than inventing graph results.
- [x] M5 Implement harmonic strength spectra with a documented deterministic scoring formula, configurable harmonic selection and weights, pair contributions and hand-derived ranking tests.
- [x] M6 Implement Uranian dial projections for the requested 90, 45 and 22.5 degree circles, preserving full source longitudes and testing circular distances and seam contacts.
- [x] M7 Implement canonical planetary pictures and A+B-C sensitive points with configurable contact orbs, explicit repeated-member rules and arithmetic tests.
- [x] M8 Implement midpoint-tree listings by calling `src/points.ts` midpoint helpers, covering both axes, antipodal ties, dial contacts, ordering and deduplication.
- [x] M9 Add the offline `harmonics chart` CLI with strict JSON input validation, synthetic fixture examples, structured JSON output and receipts for chart calls.
- [x] M10 Add `harmonics spectrum` and `harmonics dial` CLI commands, shared option parsing, configurable analysis settings and command integration tests.
- [ ] M11 Document the library and CLI contracts, units, scoring choices, midpoint conventions, receipt scope and limitations; cite tests for numerical examples and keep all fixtures synthetic and small.
- [ ] M12 Run project typechecking and Vitest integration checks, verify package exclusion and repository isolation, review deterministic outputs and record remaining limitations with reproducible validation commands.

## Reuse boundaries

Read engine modules through relative source imports without rebuilding
`dist/`. Reuse `src/signs.ts` for longitude normalization, chart casting and
`src/receipt.ts` for chart provenance, `src/configured-aspects.ts` for
configurable aspect matching, `src/techniques/aspect-patterns.ts` for its
supported patterns, and `src/points.ts` for midpoints. Do not implement an
ephemeris, house system, replacement aspect matcher or midpoint formula.

The pure longitude API operates on supplied data and claims no engine
receipt. An adapter that casts a chart must carry the engine's original
receipt alongside the derived harmonic or dial analysis. Harmonic positions
are longitude transforms, not newly computed astronomical positions.

## Validation and storage

Use synthetic named points and invented birth inputs. Derive arithmetic
expectations independently in test comments and documentation; do not pin
prior program output as an accuracy reference. Keep package tooling and its
lockfile inside this folder. Ignore dependencies, caches, coverage and bulk
generated data locally, and keep committed files below the requested size
limit. Never invoke git writes, publishing or release workflows.

## M1 validation

Project typechecking and Vitest passed on Node 22.22.2 with `npm run check`.
The engine's `npm pack --dry-run --json --ignore-scripts` manifest contains
no `harmonics/` paths. The root `npm run package:contents` command could not
finish because this checkout has no `dist/` and it requires `dist/calc.d.ts`.
The engine build was not run, in accordance with this project's restriction
on writing `dist/`. The next session starts at M2.

## M2 validation

Added the separate `./engine` source entry with `castChart` and
`castHarmonicChart`. The adapter retains the natal envelope and flags, optionally
includes engine angles and chart points, and scales only known source speeds.
It uses relative engine imports with the ephemeris dependency pinned and
resolved inside this project.

On Node 22.22.2, a clean `npm ci` followed by `npm run check` passed. The
hand-derived arithmetic and adapter delegation checks are in
`test/engine.test.ts`; they check transform correctness and receipt scope,
not ephemeris accuracy. `git diff --check` passed. All changed and untracked
files are inside `harmonics/`, below the requested file size limit, with no
em dash in documentation.

With a writable npm cache inside `harmonics/.cache/`, the root engine's
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project.
No archive was created. `npm run package:contents` still fails because this
checkout has no `dist/calc.d.ts`; no engine build or root dependency installation
was performed. The next session starts at M3.

## M3 validation

Added the pure `findHarmonicAspects` API using the engine policy factory and
configured matcher. Rule, luminary and body-cap limits use configurable
inverse-harmonic or fixed scaling. Known speeds and the stationary threshold
scale with the harmonic. Missing speeds and overflow reject explicitly.
Results retain the unscaled and effective policies alongside the harmonic
coordinates; a cast source envelope stays separate and unchanged.

On Node 22.22.2, `npm run check` passed. Hand-derived expectations and engine
delegation checks are in `test/harmonic-aspects.test.ts`, covering custom
angles, seam contacts, inclusive boundaries, motion, caps, ordering and
receipt preservation. `README.md` states orb units, scaling formulas,
floating-point limits and the explicit filtering required for unknown speeds.

`git diff --check` passed. All changed and untracked files remain inside
`harmonics/`; project files meet the size limit and documentation has no em
dash. The root `npm pack --dry-run --json --ignore-scripts` manifest excludes
this project, with a writable npm cache under `harmonics/.cache/`. The root
`npm run package:contents` still fails at missing `dist/calc.d.ts`. No engine
build, archive creation or git mutation was performed. The next session
starts at M4.

## M4 validation

Added the separate `./patterns` entry with `findHarmonicPatterns`, reusing the
engine's historical major-aspect matcher, pattern detector and containment
helper. Supported policies select physical bodies and major-aspect subsets
with fixed engine limits. Unsupported orb scaling, caps, custom angles and
motion settings reject before graph detection. The result records historical
arithmetic explicitly, preserves engine roles and containment, and keeps the
source natal envelope separate.

On Node 22.22.2, `npm run check` passed. Hand-derived tests in
`test/harmonic-patterns.test.ts` cover figures, complete edges, fixed ordinary
and luminary boundaries, subsets, empty selections, ordering, seam reduction,
unsupported settings, receipt preservation and frozen snapshots. The isolated
`test/pure-entry.test.ts` rejects chart or ephemeris imports from the default
entry. `README.md` documents the separate entry's inherited static engine
dependencies and the difference from configured-aspect arithmetic.

`git diff --check` passed. All changed and new files are inside `harmonics/`,
below the file size limit, and documentation contains no em dash. The root
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project.
With Node 22 and a writable cache inside `harmonics/.cache/`, the root
`npm run package:contents` still fails at missing `dist/calc.d.ts`. No engine
build, archive creation or git mutation was performed. The next session
starts at M5.

## M5 validation

Added the pure `harmonicSpectrum` API through the default entry. It delegates
every selected harmonic to the configured aspect matcher, defaults to
conjunction analysis, and reports weighted linear orb falloff, all-pair
normalization, match contributions and deterministic rankings. Configurable
body and aspect weights are snapshotted and validated; unknown speeds and
overflow reject. The scoring formula and its arithmetic limits are documented
in `README.md`, with numerical examples enforced by
`test/harmonic-spectrum.test.ts` over the exact invented rows stated there.

On Node 22.22.2, `npm run check` passed. The spectrum tests derive rankings,
weight changes, zero-orb and inclusive boundary behavior, motion-specific caps,
custom rules, seam contacts and permutation stability independently by integer
and binary-fraction arithmetic. Matcher delegation, source receipt preservation,
frozen snapshots and the ephemeris-free default entry also pass. These tests
check arithmetic and integration, not ephemeris accuracy or predictive validity.

`git diff --check` passed. Changed and new files remain inside `harmonics/`,
below the file size limit, with no em dash in documentation. The root
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project,
using Node 22 and a writable npm cache under `harmonics/.cache/`.
The root `npm run package:contents` still fails at missing `dist/calc.d.ts`.
No engine build, archive creation or git mutation was performed. The next
session starts at M6.

## M6 validation

Added the pure `projectDial` and `dialDistance` APIs through the default
entry, with supported circles exported as `DIAL_CIRCLES`. Projections retain
normalized full zodiac longitudes and source sectors. Configurable inclusive
contact orbs stay in longitude degrees, with canonical pair labels and
deterministic ordering. Unknown speeds are accepted without motion claims;
derived rows and contacts are frozen snapshots. `README.md` documents the
geometry, binary64 rounding limits and source-only receipt scope.

On Node 22.22.2, `npm run check` passed. The hand-derived synthetic tests in
`test/dial.test.ts` cover every supported sector, exact seams, wraparound
distances, half-circle ties, default and zero orbs, inclusive boundaries,
permutation and rotation stability, rejected inputs and receipt preservation.
The default entry's ephemeris and casting isolation check also passes. These
checks establish projection arithmetic and integration, not ephemeris accuracy
or predictive validity.

`git diff --check` passed. Changed and new files remain inside `harmonics/`,
below the file size limit, with no em dash in documentation. The root
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project,
using Node 22.22.2 and a writable npm cache under `harmonics/.cache/`.
The root `npm run package:contents` still fails at missing `dist/calc.d.ts`.
No engine build, archive creation or git mutation was performed. The next
session starts at M7.

## M7 validation

Added the pure `findPlanetaryPictures` API through the default entry. It
enumerates canonical A+B-C sensitive points from normalized zodiac sources
and tests each disjoint pair-sum picture once on the selected dial. Configurable
inclusive contact orbs reuse the dial implementation. The default requires
distinct labels; explicit doubled mode permits repetition within either pair
while excluding shared-label cancellations. Structured labels avoid expression
id collisions. Full sensitive longitudes, sectors, source targets and frozen
snapshots remain available alongside deterministic picture listings.

On Node 22.22.2, `npm run check` passed. Hand-derived synthetic expectations in
`test/planetary-pictures.test.ts` cover every admissible formula for the
documented fixture, all supported circles, seams, zero and inclusive boundaries,
repeated members, canonical deduplication, ordering, normalization and receipt
preservation. `test/pure-entry.test.ts` also exercises pictures while rejecting
casting and ephemeris imports. `README.md` documents the formula, canonical
orientation, repeated-member rules and ordinary binary64 rounding limits.
These checks establish arithmetic and integration, not ephemeris accuracy
or predictive validity.

`git diff --check` passed. Changed and new files remain inside `harmonics/`,
below the file size limit, with no em dash in documentation. The root
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project,
using Node 22.22.2 and a writable npm cache under `harmonics/.cache/`.
The root `npm run package:contents` still fails at missing `dist/calc.d.ts`.
No engine build, archive creation or git mutation was performed. The next
session starts at M8.

## M8 validation

Added the pure `midpointTrees` API through the default entry. Each canonical
distinct-label pair calls the engine's `src/points.ts` midpoint helper on
normalized full zodiac sources. Both near and opposite endpoints retain their
source longitudes and dial projections. Label order fixes antipodal ties.
Center trees exclude self-member pairs, group matching endpoints into one
row per formula, and preserve distinct formulas at coincident coordinates.
Inclusive contacts check both rounded endpoints independently and sort by
orb then pair labels. Results are frozen snapshots with structured labels.

On Node 22.22.2, `npm run check` passed. Hand-derived synthetic expectations
in `test/midpoint-trees.test.ts` cover all supported dials, source-before-fold
geometry, both endpoints, exact and nearby antipodal ties, endpoint roundoff,
seam and inclusive boundaries, canonical ordering and deduplication, empty
trees, rejected inputs and receipt preservation. Helper-spy checks establish
delegation; `test/pure-entry.test.ts` verifies that midpoint analysis through
the default entry imports no chart API or ephemeris. `README.md` documents
units, conventions, numerical examples and receipt scope with test references.
These checks establish arithmetic and integration, not ephemeris accuracy
or predictive validity.

`git diff --check` passed. All changed and new files remain inside
`harmonics/`, below the requested file size limit, with no em dash in
documentation. The root `npm pack --dry-run --json --ignore-scripts` manifest
excludes this project, using Node 22 and a writable npm cache inside
`harmonics/.cache/`. The root `npm run package:contents` still fails at missing
`dist/calc.d.ts`. No engine build, archive creation or git mutation was
performed. The next session starts at M9.

## M9 validation

Added the offline `harmonics chart` executable and npm script. The local
source runner uses pinned esbuild to compile in memory without writing an
engine build or bundle. File and stdin requests accept either supplied points
or a birth input, with strict field and duplicate-key checks, bounded UTF-8
input, explicit harmonic ceilings and birth-only supplemental-point options.
The command reuses the pure transform and casting adapter. Cast results retain
the original natal envelope, flags, instant spelling and claimed Node runtime;
derived coordinates remain outside the receipt's scope. Errors produce JSON
on stderr with no partial stdout result.

On Node 22.22.2, a clean `npm ci` followed by `npm run check` passed.
`test/cli-input.test.ts` covers request, byte, depth and argument boundaries.
`test/cli.test.ts` exercises the executable with network transports blocked,
checks hand-derived fixture arithmetic, deterministic file/stdin output,
receipt replay, unknown time, pinned TT, polar fallback and error channels.
`test/cli-pure.test.ts` rejects chart API and ephemeris imports for supplied
points. Both committed fixtures are synthetic. The README documents contracts
and names the tests enforcing its numerical examples and limits.

`git diff --check` passed. All changed and new files remain inside
`harmonics/`, below the requested size limit, with no em dash in documentation.
The root `npm pack --dry-run --json --ignore-scripts` manifest excludes this
project, using a writable npm cache inside `harmonics/.cache/`.
The root `npm run package:contents` still fails at missing `dist/calc.d.ts`.
No engine build, archive creation or git mutation was performed. The next
session starts at M10.


## M10 validation

Added offline `harmonics spectrum` and `harmonics dial` commands through shared
strict argument parsing and the existing bounded JSON decoder. Spectrum flags
expose harmonic selections, configurable ceilings, orb scaling, complete engine
aspect policies and body/aspect weights. Dial flags expose all supported
circles, inclusive contact allowances and repeated-member settings; outputs
retain full planetary-picture and midpoint-tree results. Explicit source-label
filtering precedes analysis without altering the complete cast source envelope.
Unknown speeds reject for spectrum rather than becoming stationary values.

On Node 22.22.2, `npm run check` passed. Hand-derived synthetic expectations
in `test/cli-analysis.test.ts` check spectrum scores and contributions, custom
angles, motion caps, harmonic selection, every supported dial circle, sensitive
points, both midpoint endpoints, seams and formula deduplication. The tests
also exercise strict option validation, complete file/stdin output agreement,
source filtering, original receipt identity, single casting and executable
error channels with network transports blocked. The extended
`test/cli-pure.test.ts` rejects chart API and ephemeris imports for every
supplied-point command. `README.md` documents CLI flags, units, output fields,
receipt scope and the precise arithmetic examples enforced by these tests.
These checks establish arithmetic and integration, not independent ephemeris
accuracy or predictive validity.

`git diff --check` passed. Changed and new files remain inside `harmonics/`,
below the requested size limit, with no em dash in documentation. The root
`npm pack --dry-run --json --ignore-scripts` manifest excludes this project.
The root `npm run package:contents` still fails at missing `dist/calc.d.ts`;
no engine build or archive creation was performed. No git mutation, publishing
or release workflow was performed. The next session starts at M11.
