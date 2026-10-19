# Session validation

## M1

Runtime: Node.js 22.22.2, selected through `npm exec --package node@22.22.2`.
Dependencies were installed only under `events/`, with an npm cache in `/tmp`.

Passed:

- `npm run typecheck --prefix events`
- `npm test --prefix events`, including analytic root tests and an npm dry-run
  file-list assertion that the parent package excludes `events/`.

The first test run exposed an assertion that treated the callback's signed zero
as unsigned zero. The assertion now checks the actual analytic residual,
including its sign, and the rerun passed.

`npm run package:contents` was attempted and failed because the parent checkout
has no `dist/calc.d.ts`. No parent build was run: this project's instruction
requires leaving `dist/` untouched. The separate isolation test passes without
building or packing an archive. Full engine/release gates are not claimed.

These tests establish numerical and packaging behavior only. No astronomical
accuracy measurement was made in this milestone.

## M2

Runtime: Node.js 22.22.2, selected through `npm exec --package node@22.22.2`.
Only `events/` was edited. Parent source is read through relative imports;
local bundles go under the gitignored `events/build/` directory. The workbench
pins astronomy-engine to the parent's exact version. Its build tool and
TypeScript dependencies are private to this project.

Passed:

- `npm run typecheck --prefix events`
- `npm test --prefix events`, including adapter delegation on all supported
  bodies, clock forwarding, window validation, shared budget exhaustion,
  cancellation, error propagation, analytic roots and package isolation.
- `git diff --check`
- File-size and documentation character checks on the nonignored `events/`
  files: each is under the task's file cap and documentation has no em dashes.

The first typecheck could not resolve astronomy-engine from parent source.
An explicit declaration path in the local TypeScript configuration fixed it.
The initial local build dependency had an npm audit advisory; it was replaced
by the patched version and installation reported no vulnerabilities.

`npm run package:contents` was attempted and fails because the parent checkout
has no `dist/calc.d.ts`, as in M1. No parent build or archive pack was run.
The npm dry-run file-list isolation assertion passes. Full engine/release gates
are not claimed.

Adapter tests compare with the same parent API and establish delegation only.
No independent astronomical accuracy measurement was made. Independent date
fixtures remain scheduled for M6 and M8. The request budget counts adapter
calls, including calls requesting the parent's speed calculation, rather than
internal ephemeris operations. Cancellation cannot preempt synchronous work.

## M3

Runtime: Node.js 22.22.2, selected through `npm exec --package node@22.22.2`,
with a writable npm cache under `/tmp`. An earlier run on the default Node
runtime also passed, but the milestone was verified again on the required
runtime. Only `events/` files were edited and local bundles remain gitignored.

Passed:

- `npm run typecheck --prefix events`
- `npm test --prefix events`, covering analytic crossings, wraps, direct and
  retrograde sign transitions, multiple boundaries per cell, exact window
  ownership, resolved reversals, fractional-root enclosure, sampled touches,
  shared evaluation budgets, cancellation and parent package isolation.
- `git diff --check`
- Size and documentation character checks on nonignored event files.

The analytic paired-root test demonstrates that a station inside one cell can
hide both passes, then checks that finer cells recover them. Completion is
conditional on the documented monotonicity, continuity and short-arc
assumptions. Station-aware completeness remains future work. Endpoint contacts
at the search end use the incoming direction. The default adapter test is an
integration check, not independent astronomical date evidence; that remains M6.

`npm run package:contents` was attempted with a writable npm cache; it fails
because the parent checkout has no `dist/calc.d.ts`, as in prior milestones.
No parent build or archive pack was run. The npm dry-run isolation test passes.
Full engine/release gates are not claimed.

## M4

Runtime: Node.js 22.22.2, selected through `npm exec --package node@22.22.2`,
with an npm cache under `/tmp`. Only `events/` was edited.

Passed:

- `npm run typecheck --prefix events`
- `npm test --prefix events`, including analytic aspect branches, moving-pair
  relative motion, repeat passes through a resolved reversal, custom policies,
  window ownership, fractional brackets, sampled touches, validation, shared
  budget refusal, cancellation and package file-list isolation.
- `git diff --check`
- File-size and documentation character checks on nonignored event files.

Default-adapter aspect tests establish integration only. Independent JPL
Horizons event dates remain M6. Completion retains the longitude scanner's
conditional sampling assumptions; relative stations can hide paired contacts.
Fixed natal inputs here are synthetic longitudes, with no personal birth data.

`npm run package:contents` was attempted and fails because this checkout lacks
`dist/calc.d.ts`, as in earlier milestones. The parent npm dry-run isolation
assertion passes. No parent build or archive packing was performed, and full
engine/release gates are not claimed.


## M5

Runtime: Node.js 22.22.2, selected through `npm exec --package node@22.22.2`,
with an npm cache under `/tmp`. Only `events/` was edited; bundles are local
and gitignored.

Passed:

- Local TypeScript typecheck and the full event test suite on the stated runtime.
- Analytic station classification, fractional root enclosure, sampled touches,
  plateau rejection, initial and final zero handling, clipped intervals,
  positive-duration sign overlap, wrap partitioning, repeated intervals,
  negative epochs, a mutually consistent analytic longitude/speed example,
  hidden paired stations, shared budget refusal, cancellation and validation.
- Default adapter integration and the parent npm file-list isolation assertion.
- `git diff --check`, file-size and documentation character checks.

The parent `npm run package:contents` check was attempted and fails because
`dist/calc.d.ts` is absent, as in earlier sessions. No parent build or archive
pack was performed. Full engine/release gates are not claimed.

A command initially used repository-relative edit paths from the event folder;
those edits failed without changing files and were rerun from the repository
root. The final typecheck and test suite passed after the intended additions.

Station completion assumes continuous speed with isolated, resolved zeros and
at most one sign-changing zero per scan cell. Sign spans inherit the ingress
scanner's additional monotonic short-arc assumptions, including cells near
stations. A final-window zero is unconfirmed and leaves an interval clipped.
The sign filter uses positive-duration overlap and preserves the full interval.
Analytic tests establish numerical behavior, and adapter tests establish
integration only. Independent JPL Horizons dates remain M6.

## M6

Runtime: Node.js 22.22.2, selected through `npm exec --cache
/tmp/events-npm-cache --package node@22.22.2`. Reference acquisition and offline
reduction use Python's standard library. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Offline Horizons request, digest, convention, coverage and date reproduction.
- Independent TT date comparisons for the declared Sun ingress, synthetic
  Mars square, Mars-Sun opposition and Venus stations in `references/cases.json`.
- Analytic reducer and malformed-response/provenance-tampering tests.
- Parent npm dry-run file-list isolation, `git diff --check`, authored-file size
  and documentation character checks.

Horizons live acquisition was run successfully. Reviewed small responses are
committed in `references/horizons.json`; live regenerated output and test logs
are ignored under `generated/`. The references and their time/frame differences,
acceptance thresholds, interpolation and attribution are in
`references/README.md`. They establish only the declared date comparisons.

The default npm cache was read-only; Node selection succeeded after directing
its cache to `/tmp`. A metadata-edit command initially ran from the wrong
working directory and changed nothing; it was corrected before final checks.
The parent package-content gate remains unavailable without the absent parent
build output recorded in M1. No parent build was run and no full release gates
are claimed. No archive, packed source, package version or git metadata changed.

## M7

Runtime: Node.js 22.22.2, selected with `npm exec --cache
/tmp/events-npm-cache --package node@22.22.2`. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Analytic similar-triangle shadow geometry, exact and fractional minima,
  solar central/partial and lunar total/partial/penumbral classification,
  opposite-phase rejection, strict grazing exclusion, boundary guards,
  duplicate suppression, flat geometry, coarse/fine sampling, budget refusal,
  cancellation, invalid data and parent adapter clock delegation.
- Parent npm dry-run file-list isolation, `git diff --check`, authored-file
  size and documentation character checks.

The parent `npm run package:contents` check was attempted and fails because
`dist/calc.d.ts` is absent, as in earlier sessions. No parent build or archive
pack was run. Full engine/release gates are not claimed.

The first test run found a test budget large enough to finish the analytic
scan; the budget test now forces exhaustion after a contact was found.
The coarse-sampling test originally expected no returned minima, but a coarse
cell can alias several stationary points; it now checks the demonstrated
missed-count limitation against a finer analytic scan. An edit command used
repository-relative paths from the event directory, changed nothing, and was
rerun from the repository root. Final typecheck and tests passed.

Eclipse times are roots of a finite-difference derivative of squared shadow-axis
distance, under an explicit spherical model using parent apparent vectors.
Boundary guards require padding for a requested full search window. Completion
is conditional on continuous geometry and resolved slope zeros per scan cell.
Solar types are central or partial; total/annular/hybrid distinctions, local
visibility, contact times and atmospheric shadow enlargement remain outside
this implementation. NASA's linked glossary supplies the event definition;
no NASA catalog dates were copied in this milestone. Analytic tests establish
numerical behavior and parent comparisons establish delegation only.
Independent NASA catalog fixtures and date validation remain M8.

## M8

Runtime: Node.js 22.22.2, selected with `npm exec --cache
/tmp/events-npm-cache --package node@22.22.2`. Acquisition and offline reference
verification use Python's standard library. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Independent NASA catalog TT greatest-eclipse dates and supported coarse
  classifications over exactly the selection in `references/nasa-cases.json`.
- Offline row digests, source URLs, selection matching and date reproduction;
  independent parser epoch arithmetic, malformed dates, missing and duplicate
  rows, linked HTML extraction and provenance-tampering tests.
- Complete downloaded catalog/key page hashes and selected-row reproduction
  using `nasa.py --verify --source-dir` against the live acquisition.
- Parent npm dry-run file-list isolation, `git diff --check`, authored-file
  size and documentation character checks.

NASA's catalog and key pages were fetched and read. Their data reproduction
permission requires the acknowledgment retained in the fixture and
`references/NASA.md`. The reviewed small fixture contains catalog row excerpts
and parsed source numbers; full pages, candidate output and test logs remain
ignored under `generated/`. The acquisition first encountered legacy non-UTF-8
punctuation in a catalog key; Latin-1 decoding preserves those bytes and leaves
selected ASCII fields unchanged. Acquisition and all checks then passed.

The comparison threshold and model choices were recorded before running the
engine comparisons. These sparse date checks establish neither astronomical
completeness nor physical accuracy outside the selected dates. Solar
classification is checked only at the API's central/partial level, with no
claim to distinguish total, annular or hybrid. The NASA catalog's TD labels
are compared directly on TT without subtracting its Delta T values. Limits,
source locators and reproduction commands are in `references/NASA.md`.

The parent `npm run package:contents` check was attempted and fails because
`dist/calc.d.ts` is absent, as in earlier sessions. No parent build or archive
pack was run. Full engine/release gates are not claimed. No git metadata,
packed source, package version or artifact changed.


## M9

Runtime: Node.js 22.22.2, selected with `npm exec --cache
/tmp/events-npm-cache --package node@22.22.2`. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Analytic last-contact selection across bodies and signed aspect branches,
  contact-free signs, clipped starts, entry/exit ownership, wrap, fractional
  contact enclosures, unresolved tails, strict validation, reverse-ingress
  rejection, shared budget refusal, cancellation and policy snapshots.
- Default-adapter integration, parent npm dry-run file-list isolation,
  `git diff --check`, authored-file size and documentation character checks.

The new policy-mutation test initially expected the first simultaneous contact
in the deterministic ordering. The implementation retains the last contact;
its expectation now follows that documented representative ordering. The final
suite passed. Shared aspect policy validation was extracted locally so the
composite search validates and snapshots its policy before sampling.

A trailing sign without an observed exit is explicitly unresolved. A leading
contact-free segment with a known exit is clipped to the window. Contacts at
entry or exit do not count as interior contacts. Completion inherits the
existing scanners' conditional sampling assumptions and integer root ordering;
no independent void-of-course date accuracy or completeness claim is made.
Existing independent JPL and NASA checks remain passing over their documented
selections.

The parent `npm run package:contents` check was attempted and fails because
`dist/calc.d.ts` is absent, as in earlier sessions. No parent build or archive
pack was run. Full engine/release gates are not claimed. No git metadata,
packed source, package version or artifact changed.


## M11

Runtime: Node.js 22.22.2, using the cached Node binary under the session's
`/tmp/events-npm-cache`. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Programmatic AST and DSL execution equivalence, all event-kind dispatch,
  signed aspect ordering, entered-sign and station-direction filters, explicit
  horizons and clocks, synthetic natal targets, interval clipping, unresolved
  Moon tails, malformed AST rejection and structured parent coverage refusals.
- Budget exhaustion and cancellation after an earlier event discard all output,
  including in next mode; unrelated provider failures propagate.
- Synthetic natal DSL date comparison with the existing hashed independent
  Horizons fixture and its predeclared tolerance, plus the existing underlying
  JPL and NASA date checks over their documented selections.
- Parent npm dry-run file-list isolation, `git diff --check`, authored-file
  size and documentation character checks.

The default shell initially ran the checks on Node 20.19.2; they were repeated
successfully on the required Node 22.22.2. The package-content attempt initially
hit the read-only default npm cache. Repeating it with a writable cache reaches
its existing failure: absent `dist/calc.d.ts`. No parent build or archive pack
was run, and full engine/release gates are not claimed.

Next queries scan their whole explicit horizon before selecting the earliest
filtered event or intersecting interval. Completion retains the lower-level
sampling and boundary assumptions; unresolved void-of-course tails are retained.
Cancellation is cooperative between synchronous evaluations and cannot process
same-event-loop request aborts during the call. HTTP scheduling remains M12.
Programmatic AST ranges follow the parser's midnight date grammar; lower-level
searches retain arbitrary millisecond windows. No new physical accuracy or
completeness span is claimed.


## M12

Runtime: Node.js 22.22.2, using the cached Node binary under
`/tmp/events-npm-cache`. Only `events/` was edited.

Passed:

- Local TypeScript typecheck and the full event test suite on that runtime.
- Loopback HTTP searches, complete and refused envelopes, explicit options,
  malformed JSON and DSL, unknown fields, media types, route and method errors,
  body and evaluation caps, busy admission, upload deadlines, worker deadlines,
  disconnected uploads, oversized worker responses and private worker errors.
- Independent JPL synthetic natal aspect date comparison using the existing
  hashed fixture, its own window and preregistered tolerance. Existing JPL and
  NASA underlying date checks remain passing over their documented selections.
- Parent npm dry-run file-list isolation, diff whitespace checks, authored-file
  size and documentation character checks.

A sequential HTTP test exposed a race between sending a successful response and
worker termination: an immediate subsequent request could see busy admission.
Successful responses now wait for termination and slot release. Typecheck and
all event tests pass after the correction. Worker cancellation discards output;
no partial list is returned. Completion still depends on the search methods'
existing sampling assumptions. No new physical accuracy span is claimed.

The parent package-content check was attempted with a writable npm cache. It
fails because `dist/calc.d.ts` is absent, as in prior sessions. No parent build
or archive pack was run. Full engine/release gates are not claimed. Worker
bundles and transient transport fixtures remain inside gitignored local build
output; validation logs remain in the gitignored local cache. Git metadata,
packed source, package version and artifacts were not changed.


## M13

Passed: local TypeScript typecheck and the full event suite on the runtime below,
including the strengthened clipped-partition case.

Runtime: Node.js 22.22.2, selected from the cached binary under
`/tmp/events-npm-cache` through a command-local PATH. Only `events/` changed.

Validation commands from the repository root:

```sh
npm run typecheck --prefix events
npm test --prefix events
node events/examples.mjs
```

The event suite includes the multi-century Venus search on TT from the start
of 1900 through the end of 2100. `test/long-span.node-test.ts` checks daily unfiltered
and half-day Leo-filtered results, chronological nonoverlap, continuous sign
spans, independently scanned partitions and budget refusal. The partition
edge is inside the selected JPL Venus retrograde interval, so adjoining clipped
fragments must be joined before comparison. Integer-root agreement between
scans is numerical consistency evidence, not independent physical accuracy or
proof of exhaustive completeness. The selected JPL Venus station endpoints
retain their unchanged comparison thresholds.

`test/reference-api.node-test.ts` exercises whole-year DSL search windows around
every existing selected Horizons and NASA reference date. It preserves their
original thresholds and NASA coarse-class expectations. No new reference
numbers or engine-derived expected dates were added. The offline acquisition
and provenance reproduction tests remain part of the event suite.

`examples.mjs` is exercised by the tests, using invented natal longitude,
explicit clocks and event policies. The initial validation found invalid
single-year shorthand in the new tests and examples; these now use explicit
calendar endpoints. The example's broad void-of-course policy also exhausted
its original caller budget; the example now supplies sufficient bounded work.
The documentation removes obsolete future-milestone wording and states the
current physical, sampling, boundary, transport and isolation limits.

The parent npm dry-run file-list assertion passes and excludes `events/`.
`git diff --check`, authored-file size, documentation character and events-only
change checks pass. Logs and example output stay ignored under `generated/`;
local bundles remain ignored under `build/`.

The parent `npm run package:contents` was attempted with a writable cache and
still fails because `dist/calc.d.ts` is absent. No parent build, archive packing,
release gate or full engine CI success is claimed. No git metadata, packed
source, parent package settings or carried archive was changed.

## F1

On Node.js 22.22.2, local typecheck and `npm test` pass after renaming the
Node suites to `.node-test.ts` and updating build and test discovery. Local
builds clear prior output so old `.test.js` bundles cannot remain discoverable.
Documentation links follow the renamed suites; test contents are unchanged.

In a temporary copy of the current worktree with the parent's locked
dependencies installed, root `npx vitest run --reporter=dot` lists no events
suites. A focused root run with the `events` filter reports no test files.
The full root run still fails the archive-binding suite because this host
has `/node_modules` above temporary directories and its supplied npm wrapper
forces a read-only cache. The events tests pass using the bundled npm CLI
directly with a writable cache. Full engine CI success is not claimed.

## Phase 2 P1

Runtime: Node.js 22.23.3 from `/home/box/.local/node22/bin`. Dependencies were
installed from the events lockfile with the npm cache under `events/.cache/`.

Passed:

- `npm run typecheck --prefix events`
- `npm test --prefix events`, including its local build, all phase 1 suites,
  long-span reconciliation, HTTP integration and parent npm file-list isolation.
- Offline paired Horizons reduction, provenance and tampering checks; analytic
  speed-zero splitting, relative turning points, grid and window boundaries,
  fractional brackets, direction filters, cancellation and late budget refusal.
- `node events/scripts/loop-report.mjs --check`, reproducing the committed
  discovery and timing measurements over the exact windows and synthetic
  longitude targets in `references/loop-cases.json`.
- `git diff --check`, authored-file size, documentation character, disk-use
  and events-only change checks.

The test command caps test-file workers to respect the session CPU constraint.
Generated bundles and logs remain ignored. The original longitude-only policy
and its evaluation behavior remain covered by the phase 1 suites; the new
policy is explicit through `stationStepMs` on lower-level searches.

The default engine recovers the independently established paired directions,
but its slow-pass dates fail the original timing threshold. That threshold
was retained. `evidence/station-loops.json` records failed timing verdicts,
with maxima rounded up, separately from successful discovery. Numerical
checks against continuous interpolation of independent hourly rows pass;
they do not establish physical timing accuracy of the parent model. Existing
Horizons and NASA fixtures and their passing date checks are unchanged.

The milestone adds no parent build or archive operation. Its package isolation
check passes without generating `dist/`. Query, HTTP and interval-policy
integration remains P2; full-span completeness and performance remain later
milestones in `PHASE2.md`.

## Phase 2 P2

Runtime: Node.js 22.23.3 from `/home/box/.local/node22/bin`. Dependencies were
reinstalled from the events lockfile with the npm cache under `events/.cache/`.

Passed:

- `npm ci --prefix events --cache "$PWD/events/.cache/npm"`
- `npm run typecheck --prefix events`
- `npm run build --prefix events`
- `npm test --prefix events`, including the phase 1 suites, new station-aware
  composite, query and HTTP checks, independent reference reproduction,
  long-span reconciliation and parent npm file-list isolation.
- After adding a final composite query-dispatch test, typecheck and build
  again, then `node --test --test-concurrency=1 events/build/test/search.node-test.js`.
- `node events/scripts/loop-report.mjs --check`
- `git diff --check`, authored-file size, documentation character, disk-use
  and events-only change checks.

Station-aware options now reach query and HTTP execution, station discovery,
retrograde sign partitioning and void-of-course Moon ingresses and relative
contacts. Analytic tests check hidden station pairs, direct-body relative
turning points, clipping, sign overlap, option snapshots and all-or-nothing
refusal or cancellation. Omitting the option retains the original policy;
eclipse queries reject the inapplicable option before sampling.

The independent paired Horizons rows also exercise query discovery and
interpolated dates. HTTP checks the paired directions over those same source
windows. These discovery checks do not assert default-engine date agreement:
the original timing threshold and discrepancies in `evidence/station-loops.json`
are unchanged. No new physical accuracy or full-span completeness claim is made.

Generated logs and bundles remain ignored. No parent build, archive packing
or release operation was run. Broader references, aggregate completeness and
performance measurements remain the unchecked milestones in `PHASE2.md`.
