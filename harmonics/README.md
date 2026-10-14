# Harmonics prototype

This private source project adds harmonic longitude transforms and natal
casting adapters to the engine checkout. See [PLAN.md](PLAN.md) for the remaining
aspect, spectrum, dial and CLI milestones. Code and documentation here are MIT under
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
without rebuilding the engine. This project pins `astronomy-engine` to the
engine's exact dependency version; [test/engine.test.ts](test/engine.test.ts)
checks the installed version and both manifests. The local TypeScript and
Vitest configurations resolve that dependency from this folder, so development
needs no root dependency installation. A different source runner or bundler
must supply equivalent dependency resolution for the relative engine imports.
The root package's file list excludes this
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

This function calls no ephemeris and returns no engine receipt. The casting
adapter retains the original engine receipt separately from the transformed
positions. Import it through its separate `./engine` entry; the pure entry
does not import the casting adapter.

## Engine casting adapter

```ts
import { castChart, castHarmonicChart } from "./src/engine.js";

const birth = {
  utc: "2002-04-06T03:00:00Z",
  latitude: 12,
  longitude: 24
};
const source = castChart(birth);
const result = castHarmonicChart(birth, 3, {
  includeAngles: true,
  includeChartPoints: true,
  receiptContext: { sourceInstant: birth.utc }
});
console.log(result.harmonicChart.points, result.source.envelope.receipt);
```

The birth input above is invented and is exercised in
[test/engine.test.ts](test/engine.test.ts). Both functions accept the engine's
`BirthInput` and call its `natalChart`. The engine validates the resolved
instant, coordinates, time scale, house system, pinned delta T and flags.
Resolve local wall times before calling this adapter.

`castChart` returns `{ points, flags, envelope }`. By default `points` contains
each natal body's `body`, longitude `lon` in degrees and `speed` in degrees/day,
in the engine's order, including the true lunar nodes. `includeAngles` appends
Ascendant, Midheaven, Descendant and Imum Coeli when the chart has angles.
`includeChartPoints` appends the result of the engine's `chartPoints`, called
on the already cast chart. An unavailable angle or timed point is omitted.
These settings default to false and require booleans when supplied.

Body speeds and any known extra-point speeds are copied from the engine.
Angle speeds and extra-point speeds reported as null remain absent; this
adapter never assigns zero to an unknown speed. It does not copy latitude,
sign, house or retrograde annotations onto these longitude rows.

The natal `envelope` comes directly from `createNatalEnvelope`, before any
extra points or harmonic transforms are derived. It preserves the source
bodies, angles, houses, aspects, flags, time basis and engine identity.
`receiptContext`, when supplied, is passed to that creator unchanged and is
validated there. Capture original ISO spelling or time-resolution context
explicitly when needed; the adapter infers neither. Supplemental chart points
and harmonic positions are outside this natal receipt's scope. Its provenance
claims do not authenticate the calculation or establish astrology's predictive
validity.

`castHarmonicChart` returns `{ source, harmonicChart }`, where `source` is the
casting result above. `harmonicChart` has the pure transform's fields and adds
`sourceSpeed` and `speed` only for points whose source speed is known. The
formula is `speed = N * sourceSpeed`, in harmonic degrees/day, as the derivative
of the unwrapped longitude transform. It is not a finite difference across a
wrapped longitude seam. `maxHarmonic` uses the pure API's validation and is
checked before casting. The source envelope keeps its original coordinates
and speeds. Natal aspects in that envelope describe the source chart; harmonic
aspect analysis is a later milestone.

Wrappers, point rows, point arrays and copied flag arrays are frozen. The natal
envelope retains the engine API's ordinary independent snapshot shape and can
be passed to its serializer, parser and replay helper. The tests check that
mutating a supplied Date, coordinates or flag array after casting cannot change
the captured source receipt.

## Arithmetic evidence

[test/harmonic-chart.test.ts](test/harmonic-chart.test.ts) derives expected
longitudes from invented points. For the example above, multiplying by 3
gives 30, 390 and 750 degrees; subtracting whole turns leaves 30 degrees for
each. The same test checks every default harmonic with a supplied longitude
of 2 degrees: `2*N` for N below 180 and zero at N=180. Additional cases derive
negative inputs, multi-turn inputs, quarter-degree seam behavior and a
configured ceiling of 720 using exact integer or binary-fraction arithmetic.
These are transform correctness checks, not ephemeris accuracy evidence.

[test/engine.test.ts](test/engine.test.ts) also checks harmonic casting with
invented source longitudes 10, 130 and 250 degrees and speeds 0.25, -0.5 and
zero degrees/day. At N=3 the longitudes reduce to 30 degrees, and the speeds
become 0.75, -1.5 and zero harmonic degrees/day. The exact multiplication and
whole-turn subtraction are written in the test. Other adapter tests compare
the receipt and point rows with the engine calls they wrap. Those comparisons
check integration and preservation, not astronomical accuracy.
