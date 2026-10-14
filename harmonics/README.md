# Harmonics prototype

This private source project adds harmonic longitude transforms, configured
harmonic aspects, strength spectra, supported aspect patterns, Uranian dial
projections, planetary pictures, midpoint trees, natal casting adapters and an
offline chart, spectrum and dial CLI to the engine checkout. See [PLAN.md](PLAN.md) for the
remaining milestones.
Code and documentation here are MIT under
the repository's [LICENSE](../LICENSE). The engine's data attributions remain
in [LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

Start with the [contract reference](docs/CONTRACTS.md) for entry points, required
inputs, units, result fields, receipt scope and limitations. The sections below
give the formulas and the tests that enforce their synthetic examples:

- [Pure longitude charts](#pure-library) and [casting adapters](#engine-casting-adapter)
- [Configured aspects](#harmonic-aspects), [strength spectra](#harmonic-strength-spectra)
  and [supported patterns](#harmonic-aspect-patterns)
- [Dial geometry](#uranian-dial-projections), [planetary pictures](#planetary-pictures-and-sensitive-points)
  and [midpoint conventions](#midpoint-trees)
- [Chart CLI input and errors](#offline-chart-cli) and [spectrum and dial options](#spectrum-and-dial-cli)
- [Arithmetic evidence](#arithmetic-evidence) and [development checks](#development)

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
The CLI's local runner supplies this resolution and compiles sources in memory.
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

## Harmonic strength spectra

```ts
import { harmonicSpectrum } from "./src/index.js";

const spectrum = harmonicSpectrum([
  { body: "A", lon: 0, speed: 0 },
  { body: "B", lon: 90.25, speed: 0 }
], {
  harmonics: [2, 4, 8],
  policy: { bodies: ["A", "B"], aspects: [{ type: "conjunction", orb: 8 }] }
});
console.log(spectrum.ranking.map(({ harmonic, score }) => ({ harmonic, score })));
```

`harmonicSpectrum(sourcePositions, options)` analyzes original supplied rows
through `findHarmonicAspects`. It accepts the same known-speed positions,
engine policy input, `orbScaling` and `maxHarmonic` settings. Every supplied
row requires finite speed, including unselected rows. Angles or other points
with unknown speed need explicit filtering, as in the harmonic-aspect example.
The function calls no ephemeris and imports none through the pure entry.

With `policy` omitted, the spectrum selects the engine's physical-body
defaults and conjunctions only, with an N=1 orb of 8 degrees or 10 for Sun or
Moon. Default scaling divides these limits by N. These are analysis settings,
not physical error bounds. Custom labels require `policy.bodies`. An explicit
policy, including `{}`, uses the engine's policy defaults for omitted fields,
so `{}` selects all five major aspects. Configured minor and custom angles,
motion limits, luminary replacement, caps and stationary thresholds all follow
the harmonic-aspect API. The engine chooses one eligible aspect per pair by
smallest absolute orb, with definition order resolving ties. Weights do not
change that choice.

`harmonics` selects a nonempty array of unique positive integers within the
ceiling. Results sort this selection in ascending order. When it is omitted,
the selection is 1 through `min(180, maxHarmonic)`. Extending the ceiling allows
explicitly selected larger harmonics; it does not enlarge the automatic scan.
The default scan, smaller ceilings and explicit N=720 case are enforced in
[test/harmonic-spectrum.test.ts](test/harmonic-spectrum.test.ts). No selection
is silently deduplicated or truncated.

`bodyWeights` maps selected case-sensitive labels to nonnegative finite
dimensionless numbers. `aspectWeights` maps configured aspect identifiers to
the same kind of numbers. An omitted weight is 1. Unknown keys, null, holes in
the harmonic selection, invalid weights, and overflowing weight products or
sums throw `RangeError`. A selected label absent from the chart may have a
weight, but it adds no pair to the denominator. Zero weights are supported.

The scoring convention is `weighted-linear-orb-falloff/v1`. For each eligible
pair whose chosen match is aspect t, let `o` be its reported orb and `L` its
effective `maximumOrb`, both in harmonic-circle degrees. Its closeness is
`q = max(0, 1 - o/L)` when `L > 0`, or `q = 1` for an eligible zero-limit
match. If the member weights are `wA` and `wB` and the aspect weight is `wt`,
the contribution is `c = (wA * wB) * wt * q`. Unmatched pairs contribute zero.
An inclusive match exactly on a positive orb boundary stays in the contribution
listing with `q = 0`. A zero-limit match is already required to be exact by
the engine matcher, and receives full weight without dividing by zero.

Let `T` be the sum of contributions. Let `W` be the largest configured aspect
weight, or zero for an empty aspect selection. The common `weightCapacity` is
the sum of `(wA * wB) * W` over every unordered pair of selected labels actually
present in the source, whether matched or unmatched. The score is
`min(1, T/weightCapacity)` when capacity is positive, or zero otherwise. Using
all eligible pairs prevents an isolated match from receiving the same score
as a chart whose whole selection matches. Capacity is a normalization ceiling,
not a claim that all pairs can simultaneously attain the highest weighted
aspect. No harmonic-dependent weight or extra penalty is applied.

All weighting, falloff and accumulation use ordinary binary64 arithmetic and
the engine's rounded reported orbs. The engine still decides eligibility and
rule choice exactly on the transformed binary64 values. This scoring does
not inherit an exact-arithmetic guarantee. Underflow can reduce very small
weights or falloffs to zero; the final quotient is clamped only for summation
roundoff. Source rows and contribution sums use canonical body-label order
(UTF-16 lexical comparison, without locale collation), so input permutations
do not change accumulation order. Rankings sort by descending reported score,
then ascending harmonic for a tie, without an epsilon or displayed rounding.
The default conjunction analysis emphasizes multiples of the same contact,
so a harmonic and its multiples can tie. A score is a documented analysis
choice, not evidence of astronomical accuracy or predictive validity.

The result records the formula id, ceiling, harmonic selection, unscaled
`sourcePolicy`, scaling mode, complete effective weight maps, `possiblePairs`
and `weightCapacity`. `rows` contains each harmonic's `aspectResult`, canonical
pair `contributions`, `totalContribution` and `score`. A contribution preserves
the engine's match record alongside both member weights, the aspect weight,
the member weight product, closeness and weighted contribution. `ranking`
contains the same row objects in rank order. All result objects are frozen
snapshots. Pure spectra contain no natal envelope. When a chart is cast, keep
`{ source, spectrum: harmonicSpectrum(knownSourceRows, settings) }`; the original
source envelope describes the natal chart only. The synthetic cast integration
test in [test/harmonic-spectrum.test.ts](test/harmonic-spectrum.test.ts) checks
that preservation and refuses unknown angle speeds.

For the example above, N=4 maps B to 361 degrees, reduced to 1 degree. The
8-degree orb becomes 2, so closeness and score are `1 - 1/2 = 1/2`. At N=2
the separation is 179.5 degrees, outside the conjunction orb; at N=8 the
separation is 2 degrees, outside the scaled orb of 1. Both score zero. The
ranking is therefore N=4 followed by N=2 and N=8. These values are derived
and enforced over these exact supplied rows in
[test/harmonic-spectrum.test.ts](test/harmonic-spectrum.test.ts), alongside
hand-derived trisection rankings, weighted pair normalization, custom aspect
weights, seam contacts, caps and boundary cases. They establish transform and
scoring correctness, not ephemeris accuracy.

## Uranian dial projections

```ts
import { projectDial, dialDistance } from "./src/index.js";

const dial = projectDial([
  { body: "A", lon: 89.75 },
  { body: "B", lon: 90.25 }
], 90, { contactOrb: 0.5 });
console.log(dial.points, dial.contacts);
console.log(dialDistance(89.75, 90.25, 90));
```

`projectDial(sourcePoints, circle, options)` accepts the same supplied
longitude rows and validation as `harmonicChart`. The exported `DIAL_CIRCLES`
are 90, 45 and 22.5 degrees, also represented by the `DialCircle` type.
Omitting `circle` selects 90. Other circles throw `RangeError`.

Each result point retains its name and full normalized zodiac longitude
`sourceLon` in `[0, 360)`. Its dial coordinate is `lon = sourceLon % circle`,
in `[0, circle)`, and `sector = floor(sourceLon / circle)` records the
zero-based source sector. Negative and multi-turn inputs are normalized by
the engine's `src/signs.ts` helper through the shared harmonic-chart validator.
These are longitude degrees on a folded circle, with no multiplication to
fill a display circle. Speeds, sign labels, latitude and house annotations
are omitted. Unknown speeds are accepted because projection and proximity
require no motion classification.

For projected coordinates a and b, the unsigned shortest distance is
`min(abs(a-b), circle-abs(a-b))`, ranging from zero through half the circle.
The standalone `dialDistance(a, b, circle)` normalizes and projects supplied
full longitudes, then returns this distance. It uses the same circle default
and rejects non-finite or non-numeric longitudes. At half the circle the two
directions tie; the unsigned distance makes no directional choice.

`contactOrb` defaults to 1 degree and must be a finite number from zero
through half the dial circle, inclusive. It stays in longitude degrees on
every circle, with no harmonic scaling or luminary replacement. All supplied
points participate. Each unordered pair whose distance is at most the orb
appears once in `contacts` as `{ a, b, orb }`. A zero allowance includes only
coincident projected coordinates under the arithmetic below. Contact labels
use canonical UTF-16 lexical order, and contacts sort by increasing orb,
then a and b. Point rows retain input order; all derived objects and arrays
are frozen independent snapshots. Invalid or unsupported options reject
with `RangeError`.

The result contains `circle`, `contactOrb`, `arithmetic`, `points` and
`contacts`. Its arithmetic id is `binary64;inclusive;no-epsilon`: normalization,
remainder, subtraction and comparison use ordinary JavaScript binary64
arithmetic, without a widened orb. This differs from the exact comparisons
of the configured harmonic-aspect matcher. Rounding of source normalization
or subtraction can affect contacts near a boundary; projected equality does
not prove an exact relation between the original input doubles. These
contacts report dial proximity only, with no aspect type or motion claim.
The library makes no astronomical or predictive validity claim for them.
Planetary pictures and midpoint trees are described below.

In the synthetic example, A projects to 89.75 degrees and B to 0.25.
Their straight gap is 89.5, so the circular distance is `90 - 89.5 = 0.5`
degrees, included at the stated boundary. These exact binary-fraction values,
every sector and seam of each supported circle, default and zero orbs,
half-circle distances, ordering and rejected inputs are enforced in
[test/dial.test.ts](test/dial.test.ts). Those tests derive their expected
values directly from invented longitudes; they are arithmetic evidence,
not ephemeris accuracy measurements.

Dial analysis casts no chart and creates no engine receipt. Preserve a cast
source explicitly, including unknown-speed angles and supplemental points:

```ts
import { castChart } from "./src/engine.js";
import { projectDial } from "./src/index.js";

const source = castChart({
  utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24
}, { includeAngles: true, includeChartPoints: true });
const result = { source, dial: projectDial(source.points, 22.5) };
```

The synthetic integration check in [test/dial.test.ts](test/dial.test.ts)
verifies that this operation leaves the original serialized natal envelope
unchanged. That envelope describes the engine's source natal chart only;
supplemental points and derived dial contacts remain outside its scope.
[test/pure-entry.test.ts](test/pure-entry.test.ts) checks that the default
library entry, including dial projection, loads no chart API or ephemeris.

## Planetary pictures and sensitive points

```ts
import { findPlanetaryPictures } from "./src/index.js";

const result = findPlanetaryPictures([
  { body: "A", lon: 350 }, { body: "B", lon: 30 },
  { body: "C", lon: 25 }, { body: "D", lon: 355 }
], 90, { contactOrb: 0 });
console.log(result.sensitivePoints, result.pictures);
```

`findPlanetaryPictures(sourcePoints, circle, options)` accepts the same
longitude rows, supported circles and inclusive `contactOrb` as `projectDial`.
The defaults remain a 90-degree circle and an unscaled 1-degree orb. The
result's `dial` contains the original projections and ordinary pair contacts.
No row requires speed, and no motion, latitude or aspect annotation is copied.
Invalid input, unsupported option fields and unsupported repeated-member
settings throw `RangeError`.

For each admissible formula, the sensitive point is
`sourceLon = normalizeLongitude((sourceA + sourceB) - sourceC)`, using the
engine's normalization helper. All three sources are normalized full zodiac
longitudes from `dial.points`, so even very large finite inputs cannot
overflow the addition. Addition precedes subtraction, in canonical label
order. The point also records `lon = sourceLon % circle` and
`sector = floor(sourceLon / circle)`. These are longitude degrees on the
chosen circle. `sensitivePoints` lists all admissible formulas, including
ones without a contacting target, sorted by a, b and c. Different formulas
at the same longitude stay separate.

A planetary picture represents the pair-sum relation `A+B = C+D` modulo
the chosen dial circle. Labels are sorted within each pair using UTF-16
lexical comparison, and the pair with the smaller label tuple becomes
`left`. The other becomes `right`. This canonicalizes exchanging A with B,
C with D, or the two sides, without delimiter-joined expression ids that
could collide with point names. Each picture is tested once: the sensitive
point `left[0]+left[1]-right[0]` must be within `contactOrb` of the original
target row `right[1]`, using `dialDistance`. It is a sum relation on this
dial, not a test comparing midpoint coordinates. The midpoint trees below
use the engine's midpoint helper separately.

`repeatedMembers` defaults to `"distinct"`: all four picture labels differ,
and sensitive-point a, b and c differ. Setting it to `"doubled"` permits
repetition within either pair, including `A+A = C+D`, `A+B = C+C` and
`A+A = C+C`. The two sides must still share no label, and sensitive-point
c must differ from both a and b. Cancellation formulas such as `A+B-A`
and pictures such as `A+B = A+D` are excluded under both settings; their
reduced pair contacts already appear in `dial.contacts`. A nonempty input
with too few eligible labels returns empty listings rather than throwing.
Both policies are exercised in
[test/planetary-pictures.test.ts](test/planetary-pictures.test.ts).

Each matched picture contains `left` and `right` label tuples, its
`sensitivePoint`, the projected source `target`, and its unsigned dial
`orb`. Pictures sort by increasing orb, then left and right tuples.
The result also records `repeatedMembers` and the arithmetic id
`binary64;inclusive;no-epsilon`. All objects and arrays are frozen
snapshots; picture point and target references share the corresponding
frozen listing rows. Source dial rows retain input order. Sensitive points
and pictures are independent of input order, including their accumulation
and rounding order. Enumeration covers all admissible point pairs and
pair combinations without truncation; filter the supplied selection when
output volume matters.

Arithmetic uses ordinary binary64 sums, subtraction, normalization and
dial distances, with no widened boundary allowance. Rounding can change
eligibility near the orb boundary, and different algebraic orientations
can round differently. Only the canonical orientation above determines
eligibility and the reported orb; matching an alternative orientation is
not an additional route into the result. A zero orb means equality under
that arithmetic, not an exact sum relation between the original doubles.
The library makes no astronomical or predictive validity claim for these
derived contacts.

For the example above, `A+B-C = 350+30-25 = 355`, exactly equal to D.
The sensitive point lies in the final 90-degree sector at dial longitude
85. Exchanging the two positive terms or selecting another target does
not add another picture: the canonical listing is `[A,B] = [C,D]`.
The other distinct pair partitions differ by 10 and 650 degrees, neither
an exact turn of any supported dial, so the zero-orb example returns
only that relation. These expectations and every sensitive-point formula
for these invented rows are derived and enforced in
[test/planetary-pictures.test.ts](test/planetary-pictures.test.ts).
The same tests cover seam and half-circle boundaries, all supported circles,
doubled members, ordering, structured labels, normalization and snapshots.
They establish arithmetic correctness and integration, not ephemeris accuracy.

This pure API casts no chart and creates no receipt. For cast input, retain
the source explicitly as
`{ source, pictures: findPlanetaryPictures(source.points, circle, options) }`.
The synthetic cast integration test in
[test/planetary-pictures.test.ts](test/planetary-pictures.test.ts) includes
unknown-speed angles and supplemental points and verifies that the serialized
natal envelope is unchanged. That envelope describes the source natal chart
only; sensitive points and planetary pictures are outside its scope.
[test/pure-entry.test.ts](test/pure-entry.test.ts) checks that this operation
through the default entry loads no chart API or ephemeris.

## Midpoint trees

```ts
import { midpointTrees } from "./src/index.js";

const result = midpointTrees([
  { body: "A", lon: 350 }, { body: "B", lon: 30 }, { body: "C", lon: 10 }
], 90, { contactOrb: 0 });
console.log(result.midpoints, result.trees);
```

`midpointTrees(sourcePoints, circle, options)` accepts the same supplied
longitude rows, supported circles and inclusive `contactOrb` as `projectDial`.
The default circle is 90 degrees and the default allowance is 1 longitude
degree, without scaling. Invalid inputs or unsupported options throw
`RangeError`. Unknown speeds are accepted. The function casts no chart and
imports no ephemeris through the pure entry.

Every unordered pair of distinct labels is evaluated once in UTF-16 lexical
label order. The function calls `midpoint` from the engine's `src/points.ts`
with the full normalized zodiac longitudes, before dial projection. The
engine chooses the point halfway along the shorter arc. Each pair records
`members`, `antipodal` and `axes`. The endpoint named `near` is the helper's
result; `opposite` is its longitude plus 180 degrees, normalized by the
engine's `src/signs.ts`. Each endpoint retains `kind`, full `sourceLon`,
dial `lon` and source `sector`, with the same units as ordinary dial rows.
Pair labels remain structured tuples, so names containing punctuation cannot
collide through joined expression identifiers.

When the engine's normalized forward arc equals 180 degrees, `antipodal` is
true. The helper resolves that tie 90 degrees past its first argument. The
canonical label order fixes that argument independently of input order.
Both endpoints remain available: at an opposition neither is uniquely nearer.
The tie flag describes the engine's binary64 arc calculation, without an
epsilon or a claim about exact original input separation.

The result's `dial` preserves the source projections and ordinary pair
contacts. Its `midpoints` lists every pair, including pairs without a
contacting center, sorted by member tuple. Its `trees` lists every source
point as a `center`, sorted by label, including empty trees. Each tree's
`contacts` contains midpoint pairs within the allowance of that center on
the chosen dial. The two midpoint members and center must have distinct
labels; self pairs and pairs containing the center are excluded. Distinct
labels at coincident longitudes remain distinct formulas. Doubled members
are not an option for these trees.

Each tree contact refers to its frozen `midpoint` listing row, has an
`axes` array of eligible endpoints as `{ axis, orb }`, and reports the
smallest matched endpoint distance as `orb`. Endpoints retain near then
opposite order. Contacts sort by increasing orb and then by member tuple.
Centers refer to the original frozen dial rows, which retain input order
within `dial.points`. All derived arrays and objects are frozen snapshots.
No speed, latitude, aspect type or motion classification is assigned.

Mathematically, the two endpoints fold to the same coordinate on every
supported dial because each circle divides their separation. They share one
tree contact row, with both eligible endpoints listed rather than duplicate
rows. Ordinary binary64 normalization can make their projected coordinates
differ at roundoff scale. Each endpoint is therefore tested separately with
`dialDistance`, and only eligible endpoints appear in that contact. The
arithmetic id is `binary64;inclusive;no-epsilon`, matching the dial API.
A zero orb is equality under this arithmetic, not a statement about exact
input doubles. The explicit endpoint-rounding case in
[test/midpoint-trees.test.ts](test/midpoint-trees.test.ts) derives the difference
from binary64 spacing and checks eligibility of each endpoint independently.

In the invented example, A to B crosses zero by 40 degrees; halving that
arc gives `350 + 20 = 370`, or 10 degrees. Its opposite is 190 degrees.
Both project to 10 degrees on the 90-degree dial and contact C with zero
orb, producing one tree row. The other pair midpoints are 0 degrees for
A/C and 20 for B/C. These values and the absence of other zero-orb contacts
over these exact rows are enforced in
[test/midpoint-trees.test.ts](test/midpoint-trees.test.ts). The same test file
covers all supported dials, antipodal ties, seam and inclusive boundaries,
deduplication, ordering, distinct coincident formulas, snapshots and helper
delegation. These tests establish arithmetic and integration, not ephemeris
accuracy or predictive validity. A midpoint must be taken before folding:
on the 90-degree dial, source points at 0 and 90 both project to zero but
have a full-zodiac midpoint at 45, as a separate test there enforces. The
pair-sum relations of planetary pictures are a separate analysis.

Enumeration includes all distinct pairs and all eligible center contacts
without truncation. Filter the supplied point selection when output volume
matters. The pure result creates no receipt. For chart input retain
`{ source, midpoints: midpointTrees(source.points, circle, options) }` alongside
the result of `castChart`. The synthetic cast integration test in
[test/midpoint-trees.test.ts](test/midpoint-trees.test.ts) includes unknown-speed
angles and supplemental points and verifies that the source natal envelope
is unchanged. Its receipt describes that original natal calculation;
midpoints and tree contacts remain outside its scope.
[test/pure-entry.test.ts](test/pure-entry.test.ts) exercises midpoint trees
while rejecting chart API and ephemeris imports.

## Harmonic aspect patterns

```ts
import { findHarmonicPatterns } from "./src/harmonic-patterns.js";

const result = findHarmonicPatterns([
  { body: "Mercury", lon: 0 },
  { body: "Venus", lon: 60 },
  { body: "Mars", lon: 120 }
], 2);
console.log(result.analysis.patterns, result.containment.roots);
```

`findHarmonicPatterns(sourcePositions, N, options)` transforms original
longitudes with `harmonicChart`, derives edge records with the engine's
historical `matchAspect`, and passes them to `aspectPatterns` in
`src/techniques/aspect-patterns.ts`. It also calls that module's
`patternContainment`. No replacement graph detector is implemented here.
The source positions need only `body` and `lon`; speeds are unused and may
remain absent. Longitude validation and `maxHarmonic` follow `harmonicChart`.

Import this API through the private project's separate `./patterns` entry,
or the source path shown above. The engine pattern module statically imports
its chart API and ephemeris, so the patterns entry loads those dependencies.
The operation itself casts no chart and evaluates no ephemeris. The default
`./src/index.js` entry keeps its ephemeris-free graph, checked by
[test/pure-entry.test.ts](test/pure-entry.test.ts).

The supported figures are grand trine, T-square, grand cross and kite among
Sun through Pluto. Every required edge must be present. The harmonic-chart
rows retain all supplied points in input order; `analysis.points` contains
only selected physical bodies, in engine order. Nodes, angles and custom
points cannot form these figures. The default selection ignores them.
Selecting one in `options.policy.bodies` throws `RangeError`. An empty body
selection or input containing only supplemental points returns an empty
analysis; an empty aspect selection supplies no edges. Fewer eligible members
or conjunction clusters produce no complete figures.

Pattern orbs are fixed degrees on the harmonic circle. `orbScaling` defaults
to `"fixed"`; other values throw `RangeError`, including the harmonic-aspect
API's `"inverse-harmonic"` mode. The engine detector rechecks each edge using
these historical major-aspect limits:

| Aspect | Angle, degrees | Ordinary orb, degrees | Sun or Moon replacement, degrees |
| --- | ---: | ---: | ---: |
| conjunction | 0 | 8 | 10 |
| sextile | 60 | 4 | 5 |
| square | 90 | 7 | 8 |
| trine | 120 | 7 | 8 |
| opposition | 180 | 8 | 10 |

[test/harmonic-patterns.test.ts](test/harmonic-patterns.test.ts) checks this
table on supplied pairs at each ordinary and luminary boundary at N=2,
including strict exclusion just beyond it. These are the engine's analysis
allowances, not measured astronomical error bounds. For fixed allowance L,
the corresponding source deviation from an exact harmonic contact is L/N,
subject to transform rounding. Pattern matching uses the historical engine
matcher with its ordinary binary64 arithmetic, as recorded by
`policy.arithmetic`. It can disagree at rounding boundaries with the exact
binary64 configured matcher used by `findHarmonicAspects`. Their edge lists
are separate analyses and are not interchangeable inputs to this wrapper.

`options.policy` accepts engine `AspectPolicyInput` syntax, revalidated by
`createAspectPolicy`. Supported policies select subsets of physical bodies
or major-aspect rules while retaining the table's angle, uniform orb and
luminary replacement for every selected rule. For example, a square-only
selection is `{ aspects: [{ type: "square", orb: 7, luminaryOrb: 8 }] }`.
Custom and minor angles, changed orbs, omitted luminary replacements on
explicit rules, nonempty body caps, and changed stationary thresholds throw
`RangeError` before graph detection. Unknown wrapper fields also throw.
The detector cannot apply those settings; the wrapper does not silently
discard them. Speeds and motion classifications are outside pattern analysis.

Results contain `harmonicChart`, the descriptive fixed `policy`,
`orbScaling`, the matched `aspects`, the engine's `analysis`, and its
`containment`. All are frozen independent snapshots. `analysis.patterns`
preserves the engine's ids, member ordering, edge limits and source ids,
oppositions and figure roles. `containment.roots` holds figures inside no
larger figure; `containment.included[id]` lists each figure's contained
patterns. Multiple patterns can share members and edges.

For a chart calculation, retain the source envelope explicitly:

```ts
import { castChart } from "./src/engine.js";
import { findHarmonicPatterns } from "./src/harmonic-patterns.js";

const source = castChart({
  utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24
}, { includeAngles: true, includeChartPoints: true });
const result = { source, harmonicPatterns: findHarmonicPatterns(source.points, 3) };
```

This invented input is exercised in
[test/harmonic-patterns.test.ts](test/harmonic-patterns.test.ts). Pattern
analysis accepts supplemental rows without fabricating speeds. The natal
envelope is unchanged and describes only the original engine calculation,
not the harmonic transform or patterns. The pure pattern operation returns
no receipt and makes no claim about predictive validity.

## Arithmetic evidence

[test/harmonic-chart.test.ts](test/harmonic-chart.test.ts) derives expected
longitudes from invented points. For the pure library's longitude example,
multiplying by 3 gives 30, 390 and 750 degrees; subtracting whole turns leaves
30 degrees for each. The same test checks every default harmonic with a supplied longitude
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

[test/harmonic-patterns.test.ts](test/harmonic-patterns.test.ts) derives every
pattern fixture from invented source longitudes. In the pattern example,
N=2 maps 0, 60 and 120 to 0, 120 and 240 degrees, making all shortest pair
separations 120 degrees. N=4 maps 0, 22.5, 45 and 67.5 to 0, 90, 180 and 270
degrees, forming a grand cross with its contained T-squares. Adding a point
at 90 source degrees to the triangle example places it at 180 harmonic
degrees, completing the kite. Boundary tests perturb source longitude by
2^-20 degrees at N=2, changing the harmonic orb by 2^-19 degrees; the
fractions are exact in binary64. Tests also check rule and body subsets,
empty selections, missing edges, unsupported policies, rotation and seam
invariance, engine delegation, receipt preservation and frozen snapshots.
These checks cover transform arithmetic and supported engine graph behavior,
not ephemeris accuracy.

## Offline chart CLI

From `harmonics/`, after `npm ci`, run:

```sh
node bin/harmonics.mjs chart --input fixtures/chart-points.json --harmonic 3
node bin/harmonics.mjs chart --input fixtures/chart-birth.json --harmonic 3 \
  --include-angles --include-chart-points
node bin/harmonics.mjs chart --input - --harmonic 3 < fixtures/chart-points.json
node bin/harmonics.mjs chart --help
```

The private project's bin name is `harmonics`; the equivalent npm script is
`npm run --silent harmonics -- chart --input fixtures/chart-points.json`.
Use the silent form when piping JSON. The runner uses the locally pinned
esbuild to compile relative TypeScript sources in memory, including the
engine's pinned ephemeris when casting is requested. It downloads nothing at
command time and writes no bundle or engine build output. Dependencies must
have been installed locally, including development dependencies. This is a
source-checkout tool; it is excluded from the engine's npm package.

`--input FILE|-` is required. Paths are local, relative to the calling working
directory; `-` reads stdin. Input is a single UTF-8 JSON object containing
exactly one of these fields:

- `points`: a nonempty array of objects with `body` and `lon`, with optional
  finite `speed` in source degrees/day. Labels and longitudes use the pure
  library's validation. The chart command passes these rows through the pure
  longitude transform and omits supplied speeds from its output.
- `birth`: an engine birth request containing `utc` and optional `latitude`,
  `longitude`, `houseSystem`, `timeKnown`, `timeScale`, `deltaT` and `flags`.
  `utc` is an engine-supported ISO instant or an epoch-millisecond number.
  Date-only strings retain the engine's UTC-midnight convention. Resolve local
  wall times before invoking the CLI; it accepts no time zone or place lookup.
  The engine's date, settings, flag consistency and ephemeris-span checks apply.

Unknown fields, incorrect case, explicit null settings, duplicate field names
(including escaped spellings), non-finite numbers and invalid UTF-8 reject.
A UTF-8 byte-order mark also rejects. Inputs may contain at most 65,536 bytes,
including whitespace, and nesting depth may not exceed 16. The byte and depth
limits, their boundaries and duplicate-key checks are enforced in
[test/cli-input.test.ts](test/cli-input.test.ts) over invented JSON documents.
The size check is also applied while reading a file or stdin.

`--harmonic N` defaults to 1 and `--max-harmonic N` defaults to 180, with the
same ceiling contract as the library. Options take separate arguments;
positive integers require plain decimal notation without a sign, leading
zeros or whitespace. Unknown options, positional extras, repeated options,
missing values and a harmonic above the ceiling reject before input is read.
`--include-angles` and `--include-chart-points` append the adapter's available
points and require birth input. They reject on supplied points rather than
silently doing nothing. Standalone `--help` or `chart --help` prints usage
without reading an input. Defaults and parsing boundaries are enforced by
[test/cli-input.test.ts](test/cli-input.test.ts).

Successful chart execution prints a single JSON result followed by a newline
on stdout and returns exit status 0. Results contain
`schema: "zodiacs-harmonics-cli/v1"`, `command: "chart"`, `sourceMode` and
`harmonicChart`. A points result has `sourceMode: "points"` and no receipt.
A birth result has `sourceMode: "birth"` and the adapter's unchanged `source`
with points, flags and natal envelope. Known cast speeds are transformed by
the adapter; unknown speeds remain absent. The natal receipt describes only
the original cast chart, including its original natal aspects. It does not
attest the harmonic coordinates or supplemental chart points.

For a string birth instant the CLI captures its original spelling as the
receipt's `sourceInstant`; a numeric instant leaves that field unavailable.
Runtime provenance records the actual Node version as an engine-defined
claim. No archive hash, local-time resolution or authenticated provenance is
inferred. The original request, requested versus actual house system, time
basis and source flags retain the engine's receipt semantics.

Errors return exit status 1, leave stdout empty, and print
`{"error":{"code":"...","message":"..."}}` on stderr. Codes distinguish
`invalid-arguments`, `invalid-input`, `input-read` and `execution-failed`.
JSON syntax and file-read failures do not echo input contents or stack traces.
Computation finishes before any result is written.

Both committed [point](fixtures/chart-points.json) and
[birth](fixtures/chart-birth.json) fixtures are invented. The point example
uses longitudes 10, 130 and 250 degrees: multiplying by 3 gives 30, 390 and
750, whose circle reductions are all 30 degrees. The exact derivation and
file/stdin output agreement are enforced in
[test/cli.test.ts](test/cli.test.ts). That file also runs the executable with
network transports blocked by [test/no-network.mjs](test/no-network.mjs),
checks replayable natal receipts, unknown-time and polar-fallback semantics,
and verifies error channels. Cast comparisons establish engine delegation and
receipt preservation, not independent ephemeris accuracy. The separate
[test/cli-pure.test.ts](test/cli-pure.test.ts) rejects chart API and ephemeris
imports when executing supplied-point input, including spectra and complete dial
analysis.


## Spectrum and dial CLI

The same executable accepts both analysis commands with the chart command's
file/stdin input, strict JSON validation, shared birth-point flags and error
channels:

```sh
node bin/harmonics.mjs spectrum --input fixtures/chart-points.json --harmonics 1,2,3
node bin/harmonics.mjs spectrum --input fixtures/chart-birth.json --harmonics 1,3 \
  --include-angles --bodies '["Sun","Moon","Mercury"]'
node bin/harmonics.mjs dial --input fixtures/dial-points.json --circle 22.5 --contact-orb 0
node bin/harmonics.mjs spectrum --help
node bin/harmonics.mjs dial --help
```

`--bodies JSON` is an optional nonempty array of unique source labels for
spectrum and dial. Every requested label must exist. It filters the analysis
rows in source order and leaves the complete cast `source` and natal envelope
unchanged. It does not change the spectrum policy's own body selection, which
still defaults to the engine's physical bodies. Custom labels need selection
in `--policy` as well. Every retained spectrum row must have a finite source
speed, even when the policy does not select it. Angles and some supplemental
points have unknown speeds: explicitly filter them with `--bodies` rather
than treating them as stationary. Dial analysis accepts absent speeds.

The spectrum options map directly to `harmonicSpectrum`:

| Option | Meaning |
| --- | --- |
| `--harmonics N,N,...` | Unique positive decimal integers; order is normalized by the library. No ranges, spaces or empty entries. |
| `--max-harmonic N` | Same configurable ceiling as the chart command. Omitting `--harmonics` retains the library's default selection. |
| `--orb-scaling MODE` | `inverse-harmonic` by default, or `fixed`. |
| `--policy JSON` | Engine `AspectPolicyInput` object: aspect rules, body selection, per-body orb caps and stationary threshold. Omission uses the spectrum's conjunction-only policy; an explicit empty object selects the engine's major-aspect defaults. |
| `--body-weights JSON` | Nonnegative finite weights keyed by policy body labels. |
| `--aspect-weights JSON` | Nonnegative finite weights keyed by policy aspect types. |

For example, to select custom labels with an explicit conjunction allowance:

```sh
node bin/harmonics.mjs spectrum --input - --harmonics 4 --orb-scaling fixed \
  --policy '{"bodies":["A","B"],"aspects":[{"type":"conjunction","orb":2}]}' \
  --body-weights '{"A":2,"B":3}' --aspect-weights '{"conjunction":4}'
```

Inline JSON options use the input decoder's byte, depth and duplicate-key
rules. Policy validation delegates to the engine factory, including custom
angles and motion-specific limits. Weights use the library's selected-label
validation. Orb limits are source allowances at the first harmonic, measured
in degrees; scaling and the full scoring formula are documented above.

A spectrum result has `schema`, `command: "spectrum"`, `sourceMode` and
`spectrum`, the complete library result with policy, effective settings,
contributions, rows and ranking. With the invented chart-point fixture,
harmonics 1 and 2 have no conjunctions, while harmonic 3 aligns every point at
30 degrees. The three exact unit pair contributions divided by three possible
pairs give score 1; the earlier harmonics score 0. In the custom-label example,
input A at 0 degrees and B at 0.25 degrees, both with speed 0, gives a
harmonic-4 separation of 1 degree. Fixed orb 2 gives closeness 0.5 and weighted
contribution `2*3*4*0.5 = 12`, divided by capacity 24 for score 0.5. Inverse
scaling gives orb allowance 0.5 and no match. These exact arithmetic examples
are enforced over precisely these synthetic inputs in
[test/cli-analysis.test.ts](test/cli-analysis.test.ts).

The dial command accepts `--circle` (90 by default, or 45 or 22.5),
`--contact-orb` (1 degree by default, inclusive from zero to half the circle),
and `--repeated-members` (`distinct` by default, or `doubled`). Degree flags
require nonnegative plain decimal notation without signs, leading zeros,
exponents or whitespace. Repeated-member settings affect planetary pictures;
midpoint pairs always have distinct labels.

A dial result has `schema`, `command: "dial"`, `sourceMode`,
`planetaryPictures` and `midpointTrees`, the complete library results. Each
contains its `dial` projection and contacts. Sensitive-point formulas,
canonical pictures, full source longitudes, both midpoint endpoints and center
trees remain available. The synthetic [dial fixture](fixtures/dial-points.json)
has A at 0, B at 20, C at 10 and D at 100 degrees. C and D coincide on each
supported dial. `A+B-C = 10` contacts D exactly; the midpoint of A and B is
10, with its opposite at 190, so both endpoints contact C and D. The test
above derives these values by arithmetic and checks the executable on every
supported circle, including formula deduplication, seam allowances and
explicit doubled-member selection.

Both commands add the unchanged `source` only for birth input. The natal
receipt covers the original engine chart; it does not cover spectrum scores,
dial coordinates, pictures, trees or supplemental points. A birth is cast
once per command. Point input initializes neither chart casting nor the
ephemeris. [test/cli-analysis.test.ts](test/cli-analysis.test.ts) enforces
single casting, receipt identity, source preservation after filtering,
deterministic file/stdin output, parsing boundaries and error channels, with
network transports blocked during executable tests. These are integration
and arithmetic checks, not evidence of ephemeris accuracy or predictive value.
