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
