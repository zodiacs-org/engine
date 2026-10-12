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
