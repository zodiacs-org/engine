# Event search workbench

An isolated, private TypeScript project for event searches built on the parent
`@zodiacs/engine`. It is excluded from the engine's npm package. Progress and
remaining features are tracked in [PLAN.md](PLAN.md).

The current implementation exposes a bracketed scalar root refiner, shared
search contracts, an evaluation context and a longitude adapter. Astronomical
searches, the DSL and the HTTP API are planned; they are not yet implemented.
The adapter consumes the parent source through relative imports. The local
build bundles those imports under `events/build/`.

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

## Engine adapter and bounded work

```ts
import { EngineAdapter, EvaluationContext } from "./src/index.js";

const context = new EvaluationContext({
  startMs: Date.parse("2000-01-01T00:00:00Z"),
  endMs: Date.parse("2000-01-02T00:00:00Z"),
  clock: "utc"
}, { maxEvaluations: 100 });
const engine = new EngineAdapter(context);
const result = context.search(() => [engine.sample("Mars", context.window.endMs)]);
```

These are synthetic reference instants, not birth data. This example evaluates
one position; it does not search for an event. Tests in
[engine.test.ts](test/engine.test.ts) cover the clock labels and delegation for
all supported bodies at the synthetic reference instant in that file.

Coordinates are apparent geocentric tropical longitude in the true ecliptic
and equinox of date, in degrees. The Moon inherits the parent engine's lunar
series convention. Supported bodies are the Sun, Moon and planets listed by
`EVENT_BODIES`; nodes and other calculated points are excluded for now. Optional
longitude speed is the parent's finite difference in degrees per day. It is
not an analytic instantaneous derivative. The returned `instant` retains the
parent's UTC label, UT1 and TT Julian dates, time basis and Delta T provenance.

The clock is mandatory. Epoch milliseconds are numeric labels on that clock;
a TT or UT1 label is not a UTC timestamp despite using the same epoch origin.
UTC labels go to the parent as a Date; TT and UT1 labels go as Julian dates.
Floating point Julian date conversion can lose submillisecond resolution. A
root's millisecond enclosure describes its input coordinates, not physical
accuracy. The parent may approximate civil time by UT1 outside its observed
time data and refuse samples outside its calculation span. `EngineRefused`
retains the parent's refusal rather than reporting a completed empty search.

Window validation rejects invalid clocks, noninteger or unrepresentable
instants, nonpositive durations and unexpected fields. The context snapshots
the window. Sampling includes both endpoints so scanning can establish its
initial residual; `context.owns()` assigns events to the open-start,
closed-end search window. Samples outside the window reject before charging.
Speed samples internal to the parent may extend past that window.

A budget unit is one adapter `calc` request for one body at one instant,
including a request that fails. Requests with speed include the parent's
internal difference samples in that unit. This is an API request budget, not
a count of internal ephemeris operations or a wall-clock deadline. Calls are
not cached. Scanning and refinement must share one context; the root refiner's
own callback budget is a separate limit. Invalid adapter arguments do not
consume budget. Cancellation is checked before and after each request and
when completing a search, but cannot interrupt a synchronous engine call.

`context.search()` converts budget exhaustion or cancellation into a refusal
with an empty event list. Other errors propagate. Completed empty searches and
refusals are distinct. [context.test.ts](test/context.test.ts) enforces these
control-flow and window rules with analytic callbacks. Adapter delegation tests
use the same parent API and establish integration behavior only; they are not
independent astronomical accuracy evidence.

The workbench pins the same ephemeris version as the parent. Installation and
compilation use only local dependencies and output. Source reads from `../src/`
do not add this project to the parent package or change its import graph.
