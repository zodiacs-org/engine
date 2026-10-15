# Minor bodies implementation plan

Work stays in `minorbodies/`. Each session completes the next unchecked
milestone, runs its checks, ticks it, and appends a line to `CHANGES.txt`.
The harness manages git. Generated downloads, coefficients, builds and full
reports stay in ignored directories. Small original source fixtures and
human-written evidence notes stay with their capture scripts and provenance.

- [x] M1 Establish the isolated TypeScript package, body catalogue, acceptance policy, DESIGN.md and SOURCES.md. Verify the existing engine integration boundaries with synthetic tests. No position accuracy claim yet.
- [x] M2 Implement a serialized, cached JPL Horizons client and strict response parser with request manifests, source digests, target/center/frame/time checks, fixture capture and offline parser tests.
- [x] M3 Implement deterministic Chebyshev fitting, evaluation and derivatives, shard format and integrity checks. Test against independently evaluated analytic functions, including segment edges and malformed data.
- [x] M4 Generate a Chiron pilot dataset and implement the geocentric evaluator, time conversion, ecliptic reduction, speed, retrograde state and result receipts. Compare it with held-out Horizons samples before extending the span.
- [x] M5 Generate and validate the required Chiron, Ceres, Pallas, Juno and Vesta datasets over the target range. Freeze request manifests and digest receipts; measure shard sizes and boundary continuity. Keep generated bulk data ignored.
- [ ] M6 Add the body adapter: delegate ordinary bodies to engine calc, expose minor-body calculation with explicit conventions and refusals, and provide generic crossings callbacks and configured-aspect rows. Verify actual results and mixed-body use.
- [ ] M7 Implement station searches through the engine crossings solver, with sample budgets, boundary handling and receipts. Check direct-to-retrograde and retrograde-to-direct events against independent Horizons samples.
- [ ] M8 Build retrograde windows from stations and endpoint states, carrying clipped-window and refusal information. Test adjacent windows, incomplete searches and supported-range edges.
- [ ] M9 Add sign ingress search through the engine crossings solver with directions, sign labels, receipts and shared budgets. Check wraparound, repeated ingresses and station-adjacent cases independently.
- [ ] M10 Add a local CLI for positions, stations, retrograde windows and ingresses, with JSON output, explicit time conventions and useful failures. Test commands against the library and invalid input.
- [ ] M11 Run the preregistered full-span held-out accuracy suite with explicit arcsecond limits, speed and distance checks, event brackets and seam checks. Commit the generator and evidence notes linked to enforcing tests; document actual coverage and failures.
- [ ] M12 Finish reproducible offline setup, data regeneration instructions, dependency/licence notices, examples and package isolation checks. Review every supported-range and accuracy statement against committed evidence. Add Pholus or Eris only through the same data and validation gates if practical.

The target range and error limits are acceptance criteria, not measured
capabilities. No milestone is complete if its stated checks fail. Changes
to acceptance criteria must retain the old criteria and explain why.

M1 verification: TypeScript checking, Vitest and `scripts/check-scope.mjs`
passed on Node 22.22.2. Tests are synthetic integration and catalogue
checks, not position validation. The root `npm run package:contents` was
also attempted but fails because the initial checkout has no `dist/`
(`dist/calc.d.ts` is missing). No root build was run. The separate root
pack dry-run, with scripts disabled, confirms `minorbodies/` is excluded.

M2 verification: `npm run check` and `npm run fixtures:replay` passed on
Node 22.22.2. The request/parser and client tests cover the original Horizons
fixtures, corrupt inputs, cache integrity, serialization, retry defaults,
timeouts and file-size limits. The fixture script verifies source digests
and exact offline replay. Scope checks confirm package exclusion and the
documentation/file rules. These are ingestion checks, not position accuracy
evidence. The root `npm run package:contents` still fails because the
initial checkout has no `dist/calc.d.ts`; no root build was run. Changes
are confined to `minorbodies/`. M3 is the next unchecked milestone.

M3 verification: `npm run check` passed on Node 22.22.2, covering TypeScript,
analytic numerical tests, intake regressions, frozen source verification and
package exclusion. A native Node import of `src/index.ts` also evaluated a
synthetic linear fit successfully. Tests check rounded epochs, analytic rates,
conditioning refusals, deterministic encoding, immutable snapshots, malformed
data, external digest pins, half-open lookup and position/velocity joins.
Independent review found an accessor-validation issue; the fix is covered by
regression tests. These are numerical and integrity checks, not astronomical
accuracy evidence. The root `npm run package:contents`, with its npm cache
under this folder, still fails on absent `dist/calc.d.ts`; no root build was
run. Only `minorbodies/` changed. M4 is the next unchecked milestone.

M4 verification: `npm run check` passed on Node 22.22.2, including
TypeScript, Vitest, the independent Python reference tests, source verification
and package exclusion. The Chiron pilot over calendar year 2000 TT passed
all unchanged acceptance gates against held-out original Horizons samples
with an independent ERFA reduction and converged reference-speed differences.
`npm run pilot:build`, `npm run pilot:validate` and native offline loading
also passed. Source captures, generator hashes, recipes and evidence notes
are retained; coefficients and full reports remain ignored. Review tightened
generator identity checks and clarified receipt/coverage documentation.
The original recipe's intake failure is retained beside its revised epoch
precision, without changing any fit or accuracy budget after validation.
The root package contents check still fails on absent `dist/calc.d.ts`;
no root build or packed-file change was made. Only `minorbodies/` changed.
M5 is the next unchecked milestone.

M5 verification: `npm run check`, `npm run full:check`, `npm run full:build`
and `npm run full:test` passed on Node 22.22.2. All required bodies cover
the registered target interval; frozen source manifests, coefficient receipts,
sizes, every segment join and offline loading were checked. The full suite
compared the registered held-out Horizons samples through independent ERFA
and passed every unchanged acceptance limit. The original short-difference
reference failed radial-speed convergence; that failure and its implementation
are retained. A separately registered wider reference corpus with intact
stencil batching passed, without changing coefficients or budgets. The rejected
Chiron reference replay reproduced its original numerical failures, and native
offline loading also passed. Bulk data remain ignored. The root package contents
check still fails on absent `dist/calc.d.ts`; no root build or packed-file change
was made. Only `minorbodies/` changed. M6 is the next unchecked milestone.
