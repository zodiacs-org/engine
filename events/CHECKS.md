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
