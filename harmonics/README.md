# Harmonics prototype

This private source project adds harmonic longitude transforms to the engine
checkout. See [PLAN.md](PLAN.md) for the remaining chart adapter, aspect,
spectrum, dial and CLI milestones. Code and documentation here are MIT under
the repository's [LICENSE](../LICENSE). The engine's data attributions remain
in [LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

## Development

From this folder, with Node 22:

```sh
npm ci
npm run check
```

Dependencies and the lockfile belong to this folder. Typechecking emits no
files. Vitest reads the engine's source modules through relative imports,
without rebuilding the engine. The root package's file list excludes this
project. Put bulk generated data in `generated/`, which is locally ignored.

## Pure library

```ts
import { harmonicChart } from "./src/index.js";

const result = harmonicChart([
  { body: "Sun", lon: 10 },
  { body: "Moon", lon: 130 },
  { body: "Mercury", lon: 250 }
], 3);
```

Inputs are synthetic supplied longitudes in degrees. For harmonic N, the
formula is `sourceLon = normalizeLongitude(lon)` followed by
`lon = normalizeLongitude(sourceLon * N)`, using the engine's helper in
`src/signs.ts`. Reducing the source first prevents an overflowing product for
a large finite longitude. Results contain `harmonic`, `maxHarmonic` and
ordered `points`, each with `body`, `sourceLon` and transformed `lon`.
Longitudes lie in `[0, 360)`.

The default permitted harmonics are the integers 1 through 180. Set
`{ maxHarmonic: ceiling }` as the third argument to restrict or extend this
range. Both N and the ceiling must be positive safe integers and N must not
exceed the ceiling. Arithmetic uses JavaScript binary64 multiplication and
the engine's normalization, with their rounding; larger harmonics amplify
source rounding. This API makes no astronomical accuracy claim.

Points must be a nonempty array with finite numeric longitudes and unique,
case-sensitive identifiers. Identifiers follow the engine's configured
aspect label syntax: 1 through 80 UTF-16 code units, no surrounding whitespace,
C0 controls or DEL. Invalid input throws `RangeError`. Supplied objects are
not changed; output objects and arrays are frozen. Only longitude data is
copied, so source speeds, sign labels, latitudes and house annotations do not
appear as if they described the harmonic positions.

This function calls no ephemeris and returns no engine receipt. The planned
casting adapter will retain the original engine receipt separately from
the transformed positions.

## Arithmetic evidence

[test/harmonic-chart.test.ts](test/harmonic-chart.test.ts) derives expected
longitudes from invented points. For the example above, multiplying by 3
gives 30, 390 and 750 degrees; subtracting whole turns leaves 30 degrees for
each. The same test checks every default harmonic with a supplied longitude
of 2 degrees: `2*N` for N below 180 and zero at N=180. Additional cases derive
negative inputs, multi-turn inputs, quarter-degree seam behavior and a
configured ceiling of 720 using exact integer or binary-fraction arithmetic.
These are transform correctness checks, not ephemeris accuracy evidence.
