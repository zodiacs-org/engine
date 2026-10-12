# Event search workbench

An isolated, private TypeScript project for event searches built on the parent
`@zodiacs/engine`. It is excluded from the engine's npm package. Progress and
remaining features are tracked in [PLAN.md](PLAN.md).

The current implementation exposes a bracketed scalar root refiner and shared
search contracts. Astronomical searches, the DSL and the HTTP API are planned;
they are not yet implemented. The engine adapter will consume the parent source
through relative imports without changing its source or build output.

From the repository root, on Node.js 22:

```sh
npm ci --prefix events
npm run typecheck --prefix events
npm test --prefix events
```

Local compiler output is under `events/build/`; downloads, caches and bulk
experiments belong in the gitignored `.cache/` or `generated/` folders.

## Root refinement

```ts
import { refineRoot } from "./src/index.js";

const result = refineRoot(t => t - 17, 0, 100);
if (result.status === "converged") {
  console.log(result.atMs, result.bracket, result.value);
}
```

Endpoints are integer epoch milliseconds representable by JavaScript `Date`.
The bracket includes both ends and must contain a sampled zero or a sign
change of a continuous function. Bisection returns an evaluated endpoint and
its residual, together with an enclosing bracket. `toleranceMs` controls the
bracket width, not the residual or physical accuracy. Defaults and numerical
behavior are enforced in [root.test.ts](test/root.test.ts) using analytic
linear and polynomial functions, across positive and negative epoch values.

`maxEvaluations` includes endpoint evaluations and refinements. Exhaustion
returns `status: "refused"` with the remaining bracket and no root estimate.
Invalid arguments, nonfinite callback values and brackets without a sign change
throw. Exceptions from a callback propagate to the caller.

This routine refines one supplied bracket. It does not discover roots, detect
all stationary touches, establish continuity or prove a search complete. The
caller must unwrap angular residuals before bracketing; a jump across the far
side of a circle is not a root. A narrow bracket cannot establish physical
accuracy of an ephemeris or reconcile different time scales.

## Search conventions and references

Search contracts declare a clock (`utc`, `ut1` or `tt`) and use windows open at
the start and closed at the end. This window ownership is separate from the
root refiner's inclusive bracket. Completed results may have no events;
budget or cancellation refusals contain no partial event list.

Astronomical tests will use independently acquired JPL Horizons results and
published NASA eclipse catalogs. Reference fixtures must name their source,
frame, clock, retrieval method and redistribution terms. Analytic numerical
tests are not astronomical accuracy evidence. Natal examples and tests use
synthetic data. No Swiss Ephemeris material or expectations are used.

Code and documentation here use the repository's MIT license. The parent
engine has its own data attribution obligations recorded in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).
