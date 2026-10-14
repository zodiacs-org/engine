# Harmonics prototype

This private source project adds harmonic longitude transforms, configured
harmonic aspects and natal casting adapters to the engine checkout. See
[PLAN.md](PLAN.md) for the remaining pattern, spectrum, dial and CLI milestones.
Code and documentation here are MIT under
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
and speeds. Natal aspects in that envelope describe the source chart. The
separate harmonic aspect analysis below describes transformed coordinates.

Wrappers, point rows, point arrays and copied flag arrays are frozen. The natal
envelope retains the engine API's ordinary independent snapshot shape and can
be passed to its serializer, parser and replay helper. The tests check that
mutating a supplied Date, coordinates or flag array after casting cannot change
the captured source receipt.

## Harmonic aspects

```ts
import { findHarmonicAspects } from "./src/index.js";

const result = findHarmonicAspects([
  { body: "A", lon: 0, speed: 0 },
  { body: "B", lon: 90.5, speed: 0 }
], 4, {
  policy: {
    bodies: ["A", "B"],
    aspects: [{ type: "conjunction", orb: 8 }]
  },
  orbScaling: "inverse-harmonic"
});
console.log(result.analysis.aspects);
```

`findHarmonicAspects(sourcePositions, N, options)` takes original longitudes,
not already transformed harmonic rows. Each row requires a finite `speed` in
source degrees/day on a common time basis. It uses `harmonicChart` for the
longitude transform and multiplies speed by N. Every supplied row must have a
known speed, even if its label is outside the policy selection. The function
throws `RangeError` for missing, null or non-finite speeds and for overflow of
a transformed speed or stationary-speed threshold. Equal known speeds can be
stationary; unknown speed cannot be represented as stationary.

`options.policy` is an engine `AspectPolicyInput`, revalidated and frozen by
`src/configured-aspects.ts`'s `createAspectPolicy`. Its orb values are N=1
allowances in degrees. With `orbScaling: "inverse-harmonic"` (the default),
each rule orb, luminary replacement and body cap is divided by N before
matching. With `"fixed"`, those limits are kept constant. The effective
allowances and returned `orb` and `maximumOrb` are degrees on the harmonic
circle. Thus a conjunction allowance L permits a source deviation of L/N
from its exact harmonic contact in fixed mode, or L/(N*N) in inverse mode,
subject to floating-point rounding. This is an explicit analysis convention,
not a claim that either orb choice is universally prescribed.

Angles stay fixed on the harmonic circle. Named angles, custom angles,
motion-specific orbs, luminary replacement, both members' caps, the closest
eligible aspect per pair, definition-order ties and result sorting all use
the engine policy and matcher unchanged. Its default selection includes the
physical bodies; custom labels, nodes and other points require explicit
`policy.bodies`. Empty aspect or body selections produce no matches. The
stationary-speed threshold is in source degrees/day and is multiplied by N
in both modes to preserve the source cutoff after speed transformation.

The result contains `harmonicChart` with transformed longitudes and speeds,
`sourcePolicy` with the resolved unscaled settings, `orbScaling`, `orbScale`
(the reciprocal of the orb divisor), and `analysis`, the engine's
`ConfiguredAspectResult`. The effective policy is `analysis.policy`. Limits
are calculated by direct division, which can differ in the last bit from
multiplication by `orbScale`. Division, speed multiplication and longitude
normalization use binary64 arithmetic. Very small positive limits may round
to zero. The engine makes exact binary64 decisions on the resulting
coordinates and effective policy, with inclusive boundaries and no added
epsilon; it rounds only the reported orb. That exact matching does not
remove rounding already introduced by the harmonic transform.

`maxHarmonic` has the same contract as `harmonicChart`. All returned analysis
objects are frozen snapshots. The engine's position and policy size limits
also apply. The pure entry imports no ephemeris and creates no natal receipt.
For a cast chart, keep the source envelope alongside the derived result:

```ts
import { castChart } from "./src/engine.js";
import { findHarmonicAspects } from "./src/index.js";
import type { HarmonicAspectPosition } from "./src/index.js";

const source = castChart({
  utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24
}, { includeAngles: true });
const known = source.points.filter(
  (point): point is HarmonicAspectPosition => point.speed !== undefined
);
const result = { source, harmonicAspects: findHarmonicAspects(known, 3) };
```

Filtering is an explicit choice in this example: angles and any supplemental
points with unknown speed are omitted. The preserved envelope describes the
original natal chart, including its natal aspects, and does not attest the
harmonic analysis. This synthetic integration example is exercised in
[test/harmonic-aspects.test.ts](test/harmonic-aspects.test.ts).

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

[test/harmonic-aspects.test.ts](test/harmonic-aspects.test.ts) derives the
aspect examples on supplied synthetic rows. In the conjunction example,
N=4 transforms 90.5 degrees to 362 degrees, or 2 degrees after subtracting
one turn; the 8-degree allowance becomes 2 degrees, including the boundary.
Adding or subtracting 2^-30 source degrees changes the harmonic orb by
2^-28 degrees, testing strict exclusion and inclusion on either side.
For the scaling comparison, N=3 transforms 120.75 degrees to 2.25 degrees;
an N=1 allowance of 6 degrees becomes 2 in inverse mode, excluding the pair,
and stays 6 in fixed mode, including it. Seam, custom-angle, luminary-cap,
motion and tie tests state their separate derivations in comments. These
checks establish arithmetic and engine delegation, not ephemeris accuracy
or predictive validity.
