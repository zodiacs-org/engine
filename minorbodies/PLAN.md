# Minor bodies implementation plan

Work stays in `minorbodies/`. Each session completes the next unchecked
milestone, runs its checks, ticks it, and appends a line to `CHANGES.txt`.
The harness manages git. Generated downloads, coefficients, builds and full
reports stay in ignored directories. Small original source fixtures and
human-written evidence notes stay with their capture scripts and provenance.

- [x] M1 Establish the isolated TypeScript package, body catalogue, acceptance policy, DESIGN.md and SOURCES.md. Verify the existing engine integration boundaries with synthetic tests. No position accuracy claim yet.
- [ ] M2 Implement a serialized, cached JPL Horizons client and strict response parser with request manifests, source digests, target/center/frame/time checks, fixture capture and offline parser tests.
- [ ] M3 Implement deterministic Chebyshev fitting, evaluation and derivatives, shard format and integrity checks. Test against independently evaluated analytic functions, including segment edges and malformed data.
- [ ] M4 Generate a Chiron pilot dataset and implement the geocentric evaluator, time conversion, ecliptic reduction, speed, retrograde state and result receipts. Compare it with held-out Horizons samples before extending the span.
- [ ] M5 Generate and validate the required Chiron, Ceres, Pallas, Juno and Vesta datasets over the target range. Freeze request manifests and digest receipts; measure shard sizes and boundary continuity. Keep generated bulk data ignored.
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
