# Validating the isolated project

From `relocation/`, use the runtime recorded in
[the fixture guide](../test/fixtures/README.md), then run:

```sh
npm ci --ignore-scripts --cache .cache/npm
npm run verify
```

`verify` runs the typecheck, isolated CLI/example/fixture builds, the Vitest
suite, fixture byte regeneration checks, and `project:check`. The latter
checks non-generated project file sizes, documentation punctuation and local
links, the documented cap table against built constants, and the public
library's import graph. It checks the carried archive against its SHA receipt
and the locked engine dependency against that archive's integrity. Finally it
uses the root package's npm dry-run report to confirm exclusion of `relocation/`.
The dry run ignores scripts, creates no archive and writes its npm cache inside
the ignored project cache. The library graph check permits only local library
modules and the engine's public root, calculation and receipt entries.

The synthetic tutorial is compiled alongside the project's sources and tested
through its real runner in `test/workflow.vitest.ts`. Its engine receipts are
replayed, and a stored chart-grid envelope goes through a CLI path crossing
and back into chart relocation. `test/cli.vitest.ts` checks both file and stdin
execution for every committed request example. `test/golden.vitest.ts` checks
the golden geometry and provenance corpus described in the fixture guide.
These checks establish project behavior and regressions, not independent
astronomical accuracy.

The M12 session passed a clean offline dependency install and `npm run verify`
on the fixture runtime. It also attempted root `npm run package:contents`,
which failed because the checkout has no `dist/calc.d.ts`. The project npm
exclusion check passed independently. Exclusion does not establish built
engine contents, import-graph size budgets or archive reproducibility.

The engine CI workflows remain the authority for engine checks. This session
did not build the root engine, create a packed archive, or run an archive
rebuild. Those actions are outside the task's isolation and no-packing rules.
Engine gates requiring the root build, and archive history/rebuild checks,
remain for the repository's CI. No engine source, packed metadata, immutable
artifact, root build output or git metadata was changed.

For local example output, run `npm run examples:build`, then
`node scripts/run-example.mjs` and redirect stdout into ignored `generated/`.
Keep test output, temporary consumers and runtime downloads inside `.cache/`.
Do not regenerate golden files to accept an unexplained change; inspect their
geometry, receipts and numerical differences first.
