# Panchang prototype

This private source-checkout project will provide astronomical and calendar
facts for sunrise-to-sunrise days. Implementation follows [PLAN.md](PLAN.md).
It currently exposes the luminary snapshot adapter; day/range calculations
and the CLI are planned milestones.

Use Node 22.7.0 or later. From this directory:

```sh
npm ci
npm run check
```

Dependencies install within panchang/. The test runner, typechecker and
source runner map the engine's pinned astronomy dependency to that local
installation. The typechecker resolves declarations and the source runner
resolves JavaScript through separate tsconfig files. No
engine build is required. Nothing here is part of the engine npm package.
Code and documentation are MIT under the repository's [LICENSE](../LICENSE).
The engine retains its own licences and attributions in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

```ts
import { luminarySnapshot } from "./src/index.js";

const result = luminarySnapshot("2020-01-01T00:00:00Z", { ayanamsa: "lahiri" });
if (result.status === "ok") {
  console.log(result.utc, result.nakshatra.name, result.nakshatra.pada);
  console.log(result.sun.tropical.receipt, result.moon.sidereal.receipt);
}
```

Run TypeScript scripts from this directory with `npm run source -- path.ts`.
`npm run check` also exercises the source runtime outside the test runner.

`luminarySnapshot` accepts the engine calc instant forms: a resolved ISO
string, Date, ISO object or Julian date with an explicit scale. Date-only
strings mean midnight UTC, not local sunrise. The adapter delegates input
parsing, clock handling and reference-span refusal to calc. Invalid input
throws RangeError; an engine refusal returns `status: "refused"` with the
original refusal and no partial snapshot.
The output `utc` is normalized; receipt requests retain the engine's record
of the supplied ISO spelling and time scale.

A successful snapshot contains geocentric tropical and sidereal Sun/Moon
positions in degrees, full calc receipts and bounds, the chosen ayanamsa's
value at that instant, and the engine's Moon nakshatra/pada. Lahiri is the
default; `PANCHANG_AYANAMSAS` lists selectable engine definitions. The
engine performs sidereal conversion. The adapter does not calculate speeds.

The adapter is synchronous and performs no network or filesystem I/O.
It shares the engine's astronomy dependency state and runtime assumptions.
Receipts report computation conventions; they do not certify accuracy.
See [SOURCES.md](SOURCES.md) for the independent smoke reference and its
limited coverage. No transition-time or complete panchang accuracy claim
has been established yet.
