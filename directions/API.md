# Primary directions API

This is the source API of the private directions workbench. Import the local
TypeScript entry through your TypeScript bundler, not from the engine's npm
package. The examples below show imports relative to `directions/`; the
complete [runnable examples](examples/) use imports relative to their files.
[README.md](README.md) gives setup commands, [CLI.md](CLI.md) describes JSON
transport, and [CONVENTIONS.md](CONVENTIONS.md) explains source choices and
walks through a hand-derived geometry audit.

## Entry points and runnable examples

| Import from a file in `directions/` | Role | Runtime behavior |
| --- | --- | --- |
| `./src/index.js` | `hit`, `scan`, `hitFromNatal`, `scanFromNatal`, their parsers, sphere/arc/timing primitives and types | Pure calculations on explicit data; imports the engine's pure coordinate rotation helper. |
| `./src/natal.js` | `prepareNatal`, `NatalPreparationError` | Opt-in engine chart and equatorial preparation; engine calls manage shared delta-T state. |
| `./src/solar.js` | `prepareSolarEquatorialDay`, `SolarPreparationError` | Opt-in engine solar samples and receipts for the birth-day equatorial key. |

The `.js` specifiers follow the repository's TypeScript ESM convention. They
resolve to `.ts` sources during the local bundle; no compiled library package
or root `dist/` is needed. The example runner builds its selected file under
the ignored `directions/build/examples/` directory, then prints its result as
JSON. From the repository root with the local dependencies installed:

```sh
node directions/scripts/run-example.mjs pure-api
node directions/scripts/run-example.mjs natal-api
node directions/scripts/run-example.mjs compare-techniques
```

[pure-api.ts](examples/pure-api.ts) shows a complete coordinate hit and a
bounded direct/converse scan. Its expected arcs come from the independent
M8 and M9 derivations, checked in [examples.check.ts](checks/examples.check.ts).
[natal-api.ts](examples/natal-api.ts) prepares an invented engine chart, selects
bodies, uses a fixed key, scans explicit motions, then samples a solar key from
the same explicitly chosen TT epoch. It retains the solar provenance beside
the hit and emits a CLI-ready `solarRequest`. The sample's epoch association
remains a caller assertion in the hit audit, even though this example supplies
matching inputs. These natal checks establish integration only.
[COMPARISONS.md](COMPARISONS.md) explains the separate engine progression and
solar-arc example; those methods are not part of primary-hit calculation.

Check `status` before consuming a result. A successful `hit` has `ok`; a
successful `scan` has `complete`, even when its `hits` array is empty. Expected
validation or geometric failures return `refused`. Lower-level primitives and
the opt-in preparation adapters throw their typed `RangeError` subclasses.
Unexpected failures from executable same-realm inputs such as proxies may
still propagate. The examples throw when their selected valid request refuses,
so an example runner failure cannot be mistaken for a successful calculation.

## Explicit conventions

```ts
import { createDirectionConvention } from "./src/index.js";

const convention = createDirectionConvention({
  system: "placidus-semiarc",
  mode: "zodiacal",
  motion: "direct",
  latitude: "zero-both",
  key: "ptolemy"
});
```

`parseDirectionConvention(unknown)` applies the same validation to decoded
JSON. Every base field is required. Unknown fields, unsupported strings and
incompatible mode/latitude pairs throw `RangeError`. The result is a new,
frozen object; the caller's object is unchanged. These functions are pure.
The entry imports the engine's pure coordinate rotation helper, without
loading an ephemeris or computing a natal chart.

| Field | Accepted choices | Meaning |
| --- | --- | --- |
| `system` | `placidus-semiarc` | Temporal-hour geometry; no house-system substitution. |
| `mode` | `zodiacal`, `mundane` | Ecliptic contact points or proportional semi-arc placement, respectively. |
| `motion` | `direct`, `converse` | Ordinary diurnal construction, or the role exchange described in the source register. |
| `converseConstruction` | `placidus-role-swap` | Required for converse, forbidden for direct; exchanges the moving and fixed roles. |
| `latitude` | `zero-both`, `retain-both` | Ecliptic latitude treatment for both significator and promissor. |
| `key` | `ptolemy`, `naibod`, `solar-equatorial-birth-day` | Separate mappings from an equatorial arc to age. |

The contract admits `zodiacal` only with `zero-both` and `mundane`
only with `retain-both`. These are explicit project subsets, not claims that
all authors use those pairings. Additional latitude and converse constructions
need named options and independent evidence before they can be admitted.
`converse` does not silently negate a direct arc. The angle solver refuses
converse under the role-swap construction. The zodiacal body solver also
refuses converse, including projected conjunctions. The mundane body solver
supports both motions with branches relative to the original promissor.

[SOURCES.md](SOURCES.md) states what each traditional source supports and
where it differs. [evidence/README.md](evidence/README.md) sets the numerical
evidence requirements. No solver may infer a house system, latitude policy,
motion, key, aspect branch or polar fallback from missing input.

## Preparing a synthetic natal chart

The opt-in adapter imports the engine's public root exports by relative source
path. The local ephemeris dependency is pinned to the engine's version;
TypeScript paths and the Vitest alias let the engine source resolve it inside
this project. No root dependency installation or engine build is needed.

```ts
import { prepareNatal } from "./src/natal.js";

// Invented instant and coordinates; this is not a person's birth record.
const natal = prepareNatal({
  utc: "2000-01-01T12:00:00Z",
  timeScale: "ut1",
  timeKnown: true,
  latitude: 35,
  longitude: 15,
  houseSystem: "placidus",
  deltaT: 64
});

console.log(natal.geometry, natal.chart.timeScale, natal.equatorial.rows);
```

`prepareNatal` requires every setting shown except `deltaT`, whose omission
uses the engine's time basis. Engine `flags` are also accepted and validated.
No place, time scale, known-time assertion or natal house system is inferred.
String instants must include a clock time and offset; date-only strings are
refused instead of taking the engine's midnight convention. Valid Dates and
epoch-millisecond numbers also represent resolved instants.
The natal house selection is separate from the direction system: the adapter
retains the explicitly requested engine houses; the hit solver must still
receive its own direction convention.

The snapshot is deeply frozen and contains no mutable Dates. `chart` preserves
the engine's positions, houses, angles, aspects, flags and clock metadata.
Its `input.utc` is a normalized ISO label on `chart.timeScale.input`, including
when that scale is TT or UT1; it is not converted to UTC. `equatorial` retains
the full engine latitude, right ascension and declination rows, with true
obliquity from the same chart clock. A later `zero-both` direction policy must
project its own contact points without replacing those source rows.

`geometry` gives latitude, east-positive longitude, true obliquity and RAMC
in degrees. RAMC is recovered by the engine's `eclipticToEquatorial` applied
to its midheaven with zero ecliptic latitude and its true obliquity. The public
root does not expose a separate GAST sampler. This inverse conversion can
round differently from the original sidereal angle; its provenance is explicit
in the result. No cusp or natal longitude is recalculated by this adapter.

Missing known time or place throws `NatalPreparationError` with `missing-time`
or `missing-place`. Invalid fields and engine-rejected inputs use `invalid-input`.
`polar-geometry` refuses engine polar fallback and latitudes at or beyond the
complete-ecliptic boundary, `abs(latitude) >= 90 - trueObliquity`, even when
the requested natal house system does not fall back. This is the project's
current domain restriction, not a claim that every individual direction there
is undefined. Individual bodies with latitude must also pass their own
`semiArcs` domain test. Missing or substituted engine geometry uses
`unavailable-geometry`.

The synthetic examples and integration checks are recorded in
[evidence/M2.md](evidence/M2.md). They verify engine value preservation and the
RAMC conversion, not independent ephemeris or directional-arc accuracy.
The adapter stays outside the pure entry point: `src/index.ts` exports its
types only. The sphere helpers consume coordinates separately, because
engine ephemeris calls manage a shared delta-T provider. Solar arc and secondary
progressions are separate comparisons, never substitutes for primary rotation.

## Sphere coordinates

`hourAngleDegrees(ramcDegrees, rightAscensionDegrees)`,
`semiArcs(latitudeDegrees, declinationDegrees)` and `spherePosition(input)`
are available from the pure `src/index.ts` entry. They import no engine module
and perform no ephemeris calculation. Supply equatorial coordinates in the
same frame as RAMC; the adapter's equatorial rows and geometry provide that
frame. Do not pass a row whose engine right ascension is undefined.

RAMC and right ascension must be finite canonical degrees in `[0, 360)`.
The hour angle is RAMC minus right ascension, folded into `[-180, 180)`,
positive westward. Latitude and declination are north-positive degrees.
No ecliptic latitude treatment is applied by these helpers. A later direction
solver must select its convention and prepare the corresponding coordinates.

`semiArcs` reports the supplied latitude and declination, ascensional
difference, and diurnal and nocturnal semi-arcs, all in degrees. It uses a
geometric horizon without refraction or parallax. `spherePosition` takes
exactly `ramcDegrees`, `rightAscensionDegrees`, `latitudeDegrees` and
`declinationDegrees`; unknown, omitted, inherited and accessor fields are
refused. Its frozen result includes the semi-arcs and hour angle alongside:

- `kind: "quadrant"` with `quadrant` equal to `above-west`, `below-west`,
  `below-east` or `above-east`. `meridianDistanceDegrees` is measured from the
  upper meridian above the horizon and the lower meridian below it.
  `semiArcDegrees` is the corresponding diurnal or nocturnal arc.
  `quadrantFraction` measures progress from the preceding axis in westward
  rotation, which is different from distance from the nearest meridian.
- `kind: "boundary"` with `boundary` equal to `upper-meridian`, `setting`,
  `lower-meridian` or `rising`. Quadrant, fraction, meridian distance and
  selected semi-arc are null, so a boundary is not assigned an open quadrant.

`semiArcPositionDegrees` is a proportional coordinate increasing westward:
upper meridian is 0, setting is 90, lower meridian is 180 and rising is 270.
This coordinate is not a house cusp longitude, aspect or directional arc.
Its definition and numerical examples are in
[M3-derivations.md](evidence/M3-derivations.md), enforced by
[sphere.check.ts](checks/sphere.check.ts).

Axis decisions use exact equality of the computed binary64 hour angle and
semi-arc. There is no tolerance that moves a nearby point onto an axis.
An analytically exact oblique horizon can therefore fall just inside an
adjacent quadrant after trigonometric rounding. Conversely, an interior
point's reported fraction or proportional coordinate can round to an axis;
`kind` and `quadrant` preserve the branch decision. These are floating-point
coordinates, not an exact-predicate geometry system.

`SphereGeometryError` extends `RangeError` and supplies a `code`:
`invalid-input`, `geographic-pole`, `celestial-pole`, `horizon-tangency`,
`circumpolar-above`, `circumpolar-below` or `numerical-degeneracy`.
Tangencies and points that do not cross the horizon have no proportional
semi-arc position here. No fallback house system or clamped semi-arc is
substituted. A point may fail this test even if its natal snapshot passed the
adapter's complete-ecliptic restriction, because bodily latitude can carry
its declination beyond that domain.

The hand-derived checks cover invented sphere coordinates, with no natal date
or ephemeris. They establish agreement only on the fixtures described in
[M3 evidence](evidence/M3.md). These coordinate helpers do not return a
directional contact or age.

## Conjunction arcs to fixed angles

`angleConjunctionArc` is a pure coordinate-level solver. The supplied point
is the moving promissor; the named angle is the fixed significator. Supply
`motion` explicitly. The direct construction, reported as `placidus-direct`,
carries the point westward at fixed declination to the chosen meridian or
geometric horizon. No planetary orbital motion is added.

```ts
import { angleConjunctionArc } from "./src/index.js";

const arc = angleConjunctionArc({
  coordinates: {
    ramcDegrees: 300,
    rightAscensionDegrees: 0,
    latitudeDegrees: 45,
    declinationDegrees: Math.atan(1 / 2) * 180 / Math.PI
  },
  angle: "asc",
  motion: "direct"
});
console.log(arc.arcDegrees, arc.geometry);
```

This invented sphere example and its angular expectation are derived in
[M4-derivations.md](evidence/M4-derivations.md) and checked against
[angle-examples.ts](evidence/angle-examples.ts). It is not a natal record.
For an engine chart, the adapter supplies RAMC and observer latitude, and its
equatorial row supplies a bodily promissor's right ascension and declination.
Those rows retain bodily latitude. A zodiacal contact first needs its separate
ecliptic projection under the selected latitude policy; this primitive does
not perform that projection or accept a mode that it cannot apply.

`angle` must be `mc`, `ic`, `asc` or `dsc`. The targets are respectively the
upper meridian, lower meridian, rising horizon and setting horizon on the
promissor's own declination circle. An angle contact is an axis crossing,
not equality with the natal angle's ecliptic longitude or right ascension.
No house cusp is generated or moved. Aspect rays, body significators and
timing keys are outside this primitive; it returns no age.

The result reports `kind: "conjunction-to-angle"`, the target, motion,
construction and `arcDegrees`. Its frozen `geometry` contains the initial
sphere position and semi-arcs, target boundary and hour angle, unreduced
hour-angle difference, whole turns added, rotation sense and coincidence.
The unreduced difference is rounded audit metadata. Short wrapped arcs are
evaluated from the gaps through the lower meridian, so reducing that rounded
difference again may not reproduce a tiny arc. Long wrapped arcs add a turn
directly to avoid extra rounding at that split. The input is neither mutated
nor frozen.

The selected arc is the first nonnegative westward rotation in `[0, 360)`.
Natal coincidence returns zero, and an already passed target waits for the
next passage. This is a project enumeration rule; it does not impose a
traditional lifetime limit or take the shorter arc. The interval and branch
examples are enforced by [angles.check.ts](checks/angles.check.ts).
Coincidence means equality of computed coordinates without an epsilon.
Trigonometric roundoff near an oblique horizon can change which revolution
is selected. A nearly complete turn that rounds to `360` is refused rather
than misreported as zero. The hand-derived examples do not give a global
numerical error bound near such boundaries.

`motion: "converse"` requires `converseConstruction: "placidus-role-swap"`
and then throws `AngleDirectionError` with code `unsupported-converse-angle` for every
angle, following Placidus's restriction. No broader converse construction is
implemented. `AngleDirectionError` extends `RangeError` with that code,
`invalid-input` for malformed request fields or `numerical-degeneracy` for an
unrepresentable first-turn arc. A direct request rejects any
`converseConstruction` field. All fields must be explicit plain data; unknown
fields and accessors are refused.

`SphereGeometryError` propagates for invalid coordinates and unsupported
sphere geometry. The current solver requires crossing semi-arcs for every
target. Circumpolar meridian contacts can exist geometrically but are outside
this implementation's current subset; no polar fallback is applied. Source
locators, independent fixtures and the tested scope are in
[M4 evidence](evidence/M4.md).

## Zodiacal directions to body significators

`zodiacalBodyArc` projects both supplied points to the ecliptic, forms the
promissor's conjunction or aspect ray, and carries that ray westward at
fixed declination to the significator's temporal-hour position. The returned
arc is an equatorial rotation in degrees. It is not the longitude difference
between the bodies, and no orbital motion or timing conversion is added.

```ts
import { zodiacalBodyArc } from "./src/index.js";

// Invented sphere coordinates, from evidence/M5-derivations.md.
const result = zodiacalBodyArc({
  system: "placidus-semiarc",
  mode: "zodiacal",
  latitude: "zero-both",
  motion: "direct",
  geometry: {
    ramcDegrees: 45,
    latitudeDegrees: Math.atan(Math.sqrt(3) / 2) * 180 / Math.PI,
    trueObliquityDegrees: 30
  },
  significator: { longitudeDegrees: 0, latitudeDegrees: 0 },
  promissor: { longitudeDegrees: 30, latitudeDegrees: 0 },
  contact: { kind: "aspect", aspect: "sextile", branch: "sinister" }
});
console.log(result.arcDegrees, result.geometry);
```

For a natal chart, take longitude and latitude from the engine's body rows,
and RAMC, observer latitude and true obliquity from `prepareNatal().geometry`.
Pass only those explicitly named geometry fields: geographic longitude is
already accounted for in RAMC and is not another solver input. Both points
must belong to that same ecliptic/equinox frame. The solver retains their
supplied latitude as metadata but applies `zero-both` to the calculation.
It invokes the engine's public `eclipticToEquatorial` helper through its pure
source module; it does not sample an ephemeris, move natal cusps, or invent
body longitudes. The offset defining an aspect ray is explicit geometry.

The contact must be `{ kind: "conjunction" }`, an `aspect` with `aspect:
"opposition"`, or an `aspect` selecting `sextile`, `square` or `trine`
with `branch: "dexter" | "sinister"`. Following Lilly's branch definitions,
dexter subtracts the aspect from the promissor's longitude, and sinister
adds it. Opposition has one ray and refuses a branch field. Branches refer
to the promissor's ray, not an aspect projected from the significator.
The magnitudes and worked arithmetic are recorded and tested in
[M5-derivations.md](evidence/M5-derivations.md) and
[zodiacal-examples.ts](evidence/zodiacal-examples.ts).

The result has `kind: "conjunction-to-body" | "aspect-to-body"`, the explicit
conventions, original significator and promissor, selected contact and
`arcDegrees`. Its frozen `geometry` records the ray offset, projected
coordinates, full initial sphere positions, fixed meridian-distance fraction,
moving semi-arc used at contact, target hour angle, turn addition and
coincidence. An axis target has no selected meridian fraction or semi-arc;
those fields are null and the significator's sphere position names the axis.
Original labels and ages belong to the complete hit API below. Inputs are not mutated
or frozen, and no caller-owned object is retained.

The `zero-both` choice defines a restricted project projection using the
Placidus proportional semi-arc equation. It is not a reproduction of every
rule in *Primum Mobile*: changing significator latitude, latitude-based
effectiveness rules, and the Sun's special crepuscular construction are not
applied. All supplied body points use the same explicitly chosen semi-arc
method above and below the horizon. [SOURCES.md](SOURCES.md) identifies these
limits alongside the traditional passages. No additional latitude policy or
aspect set is implemented.

The solver uses the same first nonnegative rotation interval and computed
coincidence rule as the angle primitive. It preserves the fixed quadrant
when transferring meridian distance to the ray's own semi-arc. If an interior
target rounds onto an axis, a ray cannot be represented within canonical
longitude, or an arc rounds to a full turn, it refuses with
`ZodiacalDirectionError.code: "numerical-degeneracy"`. It also refuses
detected projection underflow and distinct equal-semi-arc points whose hour
angles collapse into false coincidence. Trigonometric
rounding can still move a near-contact across the revolution boundary; no
epsilon snaps it to a contact and no global error bound is asserted.

Malformed or omitted choices use `invalid-input`. `motion: "converse"`
requires the named `placidus-role-swap` option and then refuses with
`unsupported-converse-zodiacal`, including projected conjunctions. The solver enables no zodiacal extension of the source's mundane role swap.
The `SphereGeometryError` refusals propagate for poles, tangencies and
circumpolar projected points. No fallback is applied. Engine integration
checks and the independent numerical comparisons are distinguished in
[M5 evidence](evidence/M5.md).

## Mundane directions to body significators

`mundaneBodyArc` takes full bodily right ascension and declination from the
engine's equatorial rows. It retains the effect of each body's ecliptic
latitude already present in those coordinates. The solver performs no
ecliptic projection or ephemeris calculation. Supply the same equator/equinox
frame for both points and RAMC, with explicit `placidus-semiarc`, `mundane`
and `retain-both` choices. Like the other arc primitives, it returns no age.

```ts
import { mundaneBodyArc } from "./src/index.js";

// Invented sphere coordinates, derived in evidence/M6-derivations.md.
const delta = Math.atan(1 / 2) * 180 / Math.PI;
const result = mundaneBodyArc({
  system: "placidus-semiarc",
  mode: "mundane",
  latitude: "retain-both",
  motion: "converse",
  converseConstruction: "placidus-role-swap",
  geometry: { ramcDegrees: 0, latitudeDegrees: 45 },
  significator: { rightAscensionDegrees: 320, declinationDegrees: delta },
  promissor: { rightAscensionDegrees: 30, declinationDegrees: -delta },
  contact: { kind: "aspect", aspect: "square", branch: "eastward" }
});
console.log(result.arcDegrees, result.geometry);
```

For a prepared natal chart, copy `geometry.ramcDegrees` and
`geometry.latitudeDegrees`, and copy each selected equatorial row's `ra`
and `dec` to `rightAscensionDegrees` and `declinationDegrees`. Undefined
right ascension is refused. Obliquity and geographic longitude are not
additional inputs at this layer. The adapter already used both to prepare
the common frame. The coordinate API cannot authenticate that caller-supplied
coordinates came from full bodily rows; the integration test verifies that
data path without claiming independent ephemeris accuracy.

Mundane position `q` increases westward, with upper meridian, setting,
lower meridian and rising at `0`, `90`, `180` and `270`. Each quadrant is
scaled by the body's own semi-arc. The supported aspect magnitudes in this
coordinate are sextile `60`, square `90`, trine `120` and opposition `180`.
These definitions and the hand arithmetic are in
[M6-derivations.md](evidence/M6-derivations.md), enforced by
[mundane-evidence.check.ts](checks/mundane-evidence.check.ts). The normalized
position or aspect magnitude is not itself the equatorial directional arc.

Conjunction requires `{ kind: "conjunction" }`. Opposition requires
`{ kind: "aspect", aspect: "opposition" }` with no branch. Sextile, square
and trine require `branch: "westward" | "eastward"`. These names denote
the direction from the **original promissor to the original significator**
in `q`, in either motion. They are explicit project coordinate labels.
They do not import zodiacal longitude rays or reuse their dexter/sinister
selector. With signed aspect offset `r`, the contact relation is
`q_significator = q_promissor + r` modulo a turn.

In direct motion the promissor moves westward to
`q_significator - r`. In converse the significator moves westward to
`q_promissor + r`; the original promissor remains fixed. Converse requires
`converseConstruction: "placidus-role-swap"`, and direct forbids that
field. Both constructions preserve the original labels. They do not negate
the same arc, and exchanging bodies without adjusting the branch would
select a different contact.

The inverse position uses the moving body's diurnal or nocturnal semi-arc
at the **target** quadrant. A body can start above the horizon and meet an
aspect below it. The frozen result gives both original points, complete
initial sphere positions, moving and fixed roles, the signed aspect and
target offsets, fixed and target proportional positions, target quadrant
or axis, target meridian fraction and semi-arc, target hour angle, turn
addition and coincidence. Axis targets use null for the quadrant, fraction
and selected semi-arc. The input objects are neither retained nor frozen.

Placidus's ordinary mundane construction supplies the proportional method
and role swap. [SOURCES.md](SOURCES.md) identifies the passages. The same
explicit semi-arc model applies to every supplied body. It does not apply
the author's special solar crepuscular treatment, mundane parallels or
minor aspects. Body significators can occupy axes without becoming angular
significators. The fixed-angle solver's converse restriction remains in force.

The first nonnegative westward rotation is selected, including computed
natal coincidence, with the same interval as the other arc solvers.
`MundaneDirectionError` supplies `invalid-input` or `numerical-degeneracy`;
`SphereGeometryError` propagates for undefined semi-arcs of either body.
All fields must be explicit plain data; omitted, unknown, inherited, hidden
and accessor fields are refused. There is no polar fallback or alternate
direction system.

Conjunctions transfer meridian distance directly to avoid an unnecessary
coordinate round trip. Aspect transfer preserves the exact identity when
the semi-arcs are equal quarter circles. The geometry records the operative
`fixedSemiArcPositionDegrees`, which can differ in its last digits from
the general sphere position's reported coordinate.
`targetPositionRoundingDegrees` records the residual from adding the aspect
offset only; it is not an uncertainty or a bound on the target. The solver
refuses detected rounding onto an axis, false coincidence from lost
separations, and arcs that round outside the first-turn interval. No epsilon
snaps a nearby point onto a contact. General trigonometric rounding can
still change the selected revolution near coincidence; this is not an
exact-predicate solver. The tested domain and numerical limits are recorded
in [M6 evidence](evidence/M6.md).

## Timing an arc

`directedAge` converts an already computed primary arc with an explicitly
selected timing key. It requires `arcDegrees`, `key` and `yearUnit`. The
solar key also requires `solar`; fixed keys reject that field. It returns
the original arc, symbolic `directedAgeYears`, `rateDegreesPerYear`, the
selected fixed `daysPerYear`, `elapsedDays`, and an `audit` record. It does
not change the sphere geometry or choose direct or converse motion.

```ts
import { directedAge } from "./src/index.js";

const age = directedAge({
  arcDegrees: 12.5,
  key: "ptolemy",
  yearUnit: "tropical-365.2422-days"
});
console.log(age.directedAgeYears, age.audit);
```

The synthetic timing inputs in this section are derived in
[M7-derivations.md](evidence/M7-derivations.md) and checked by
[timing.check.ts](checks/timing.check.ts). They are arithmetic examples,
not independently computed natal arcs or claims about events.

| Key | Annual equatorial rate | Audit |
| --- | --- | --- |
| `ptolemy` | One degree per symbolic solar year. | Ptolemy source ID and defining rational. |
| `naibod` | `354833/360000` degrees, the published `59 minutes 8.33 seconds`. | Kühr source ID and defining rational at that printed precision. |
| `solar-equatorial-birth-day` | The forward solar RA difference over the selected birth TT day, held fixed for every age. | Lilly source ID, both solar samples, interval and wrap branch. |

[SOURCES.md](SOURCES.md) records the traditional passages and their limits.
Age is arc divided by rate. Fixed rational rates are evaluated as binary64,
and subsequent division and multiplication also round. The reported rate
is the value used in the conversion. The independent rational fixtures
allow arithmetic rounding on their stated examples, not a global accuracy
bound or physical precision for the source's printed rate.

The required year unit is `tropical-365.2422-days` or
`julian-365.25-days`. These are explicit fixed numerical units for the
returned elapsed days, not calendar anniversary rules. Changing the unit
changes `elapsedDays = directedAgeYears * daysPerYear`; it does not change
the key's symbolic age or annual arc. No calendar date, local clock or
leap-second adjustment is computed. The tropical label denotes the stated
fixed approximation, not a sampled astronomical year length.

For synthetic or independently supplied samples:

```ts
const solarAge = directedAge({
  arcDegrees: 12.5,
  key: "solar-equatorial-birth-day",
  yearUnit: "julian-365.25-days",
  solar: {
    timeScale: "tt", frame: "true-equator-equinox-of-date",
    center: "geocentric", correction: "apparent",
    start: { jdTt: 2451545, rightAscensionDegrees: 359.75 },
    end: { jdTt: 2451546, rightAscensionDegrees: 0.25 }
  }
});
console.log(solarAge.directedAgeYears, solarAge.audit);
```

This key implements the method Lilly attributes to Maginus with an explicit
modern sampling policy: one TT day, apparent geocentric solar coordinates
retaining bodily latitude, and the true equator/equinox of each sample's
own date. It does not freeze both RAs into the birth frame. These choices
are project conventions, not requirements quoted from Lilly. Other solar
sampling conventions require a different named option and evidence.

The sample Julian dates must differ by exactly one represented TT day.
RAs must be canonical degrees. The forward increment must be positive and
less than a half-turn; a seam crossing is unwrapped once. There is no
absolute-value or backward-day substitute. This mathematical domain allows
synthetic rates: validation does not authenticate that a pair came from the
Sun. The pure function makes no ephemeris call and checks no ephemeris span.

Use the opt-in engine adapter for actual synthetic-chart solar samples:

```ts
import { prepareSolarEquatorialDay } from "./src/solar.js";

const solar = prepareSolarEquatorialDay({
  time: { jd: 2451545, scale: "tt" },
  dayScale: "tt"
});
const timed = directedAge({
  arcDegrees: 12.5, key: "solar-equatorial-birth-day",
  yearUnit: "tropical-365.2422-days", solar: solar.samples
});
console.log(timed, solar.provenance);
```

The input Julian date requires `scale: "utc" | "ut1" | "tt"` and accepts
an optional explicit `deltaT` pin in seconds. `dayScale: "tt"` is required
regardless of input scale. The adapter uses the public engine `calc` API
to resolve the birth TT Julian date, then samples that represented TT date
and its next TT day. Resampling the start makes the pair use the same
represented Julian-date basis. The output preserves the original resolution
receipt plus each sample's receipt, engine bounds and declination. Keep
`provenance` beside a result when the engine sampling history is needed;
the pure timing audit retains the samples alone. This path inherits the
engine calculation entry's reference-span refusals for every sample.

All results are deeply frozen fresh data. Inputs remain mutable and are
not retained. Unknown, omitted, inherited, hidden and accessor fields are
refused. `TimingError` supplies `invalid-input`, `invalid-solar-interval`,
`invalid-solar-motion` or `numerical-degeneracy`. Arcs must be in the same
first-turn interval as the geometry solvers; negative arcs and full turns
are not normalized. Overflow or positive ages lost to zero are refused.
Zero arcs still require a valid key and valid solar samples when selected.
`SolarPreparationError` supplies `invalid-input`, `engine-refusal` or
`invalid-engine-result`, retaining engine refusals as its cause.

[M7 evidence](evidence/M7.md) separates rational and synthetic-solar timing
checks from engine integration checks. This fixed birth-day key does not
compute a secondary progression or longitude solar arc.

## Complete hits

`hit(input)` is the typed pure API; `parseHit(unknown)` validates decoded
data with the same behavior. Both return `status: "ok"` for a complete
calculation, or `status: "refused"` for an expected input, domain or scope
failure. The primitive functions above keep their throwing interfaces.
Neither complete-hit entry samples an ephemeris, resolves a birth clock or
performs I/O.

```ts
import { hit } from "./src/index.js";

// Invented coordinates from evidence/M8-derivations.md, zodiacal wrap case.
const result = hit({
  convention: {
    system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both",
    motion: "direct", key: "ptolemy"
  },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
  significator: {
    kind: "body", id: "Synthetic S",
    coordinates: { longitudeDegrees: 350, latitudeDegrees: 4 }
  },
  promissor: {
    kind: "body", id: "Synthetic P",
    coordinates: { longitudeDegrees: 10, latitudeDegrees: -7 }
  },
  contact: { kind: "conjunction" },
  yearUnit: "tropical-365.2422-days"
});
if (result.status === "ok") {
  console.log(result.arcDegrees, result.directedAgeYears, result.geometry);
} else {
  console.log(result.stage, result.code, result.message);
}
```

For zodiacal requests, geometry includes RAMC, observer latitude and true
obliquity; named body coordinates include ecliptic longitude and latitude.
Mundane requests instead take RAMC and observer latitude, with body right
ascension and declination. They reject an obliquity field because no
projection is performed. Both require the same frame for the coordinates
and RAMC. Body labels identify the original roles; labels do not select a
different calculation. In particular, `Sun` retains the ordinary semi-arc
subset documented above.

Select an angular significator with `{ kind: "angle", angle: "asc" }`,
using any of the angle identifiers supported by `angleConjunctionArc`.
The promissor remains a named body. Zodiacal angular conjunctions project
its longitude at zero latitude using the engine rotation helper and preserve
both the original point and the projection obliquity. Mundane angular
conjunctions retain the supplied bodily equatorial coordinates. These are
crossings of the selected axis on the promissor's own circle, not contacts
with a fabricated body at the angle's natal longitude.

Contact and branch choices are exactly those of the corresponding body
solver. Angle aspects are refused with `unsupported-angle-aspect`; no
aspect-to-angle hit is currently returned. Converse angular conjunctions
retain `unsupported-converse-angle`, and zodiacal body converse retains
`unsupported-converse-zodiacal`. A body on an axis remains a body contact.
Mundane converse keeps the original labels, with the moving and fixed roles
recorded in the primitive geometry. No branch or motion is inferred.

The key appears once, inside `convention`. Fixed keys forbid `solar`, even
when its value is `undefined`; the solar key requires the sample object
accepted by `directedAge`. Every request requires `yearUnit`. The full key
and sample validation runs even for natal coincidence. Coordinate-level
solar samples are supplied assertions: the API validates their mathematical
interval and forward rate but cannot verify the Sun or their birth epoch.

A successful result contains the original named significator and promissor,
the contact, full convention, `kind`, `arcDegrees`, `directedAgeYears`,
`timing`, and `geometry`. Kind distinguishes conjunction or aspect to a
body from conjunction to an angle. `timing` contains the rate, elapsed-day
interpretation and source or sample audit from `directedAge`.
`geometry.solver` selects `zodiacal-body`, `mundane-body` or `angle`, and
`geometry.calculation` preserves that primitive's full result. No precision
is discarded when assembling the envelope. The angle variant additionally
records its coordinate preparation and projected or retained promissor.

Refusals carry `stage`, `code` and `message` with no partial arc or age.
Stages distinguish request input, convention, sphere, angle, zodiacal,
mundane and timing failures; the mathematical stages retain their existing
primitive error codes. Unknown, omitted, inherited, hidden and accessor
request fields are refused. The same body label cannot identify different
coordinates within a hit. Results are fresh, deeply frozen and JSON
serializable; caller data stays unchanged and unfrozen. Unexpected failures
from executable inputs such as proxies still propagate as exceptions.

## Selecting a hit from a natal snapshot

After the separate `prepareNatal` example above, the pure adapter selects
engine rows by exact body labels:

```ts
import { hitFromNatal } from "./src/index.js";

const natalHit = hitFromNatal(natal, {
  convention: {
    system: "placidus-semiarc", mode: "mundane", latitude: "retain-both",
    motion: "direct", key: "ptolemy"
  },
  significator: { kind: "angle", angle: "mc" },
  promissor: { kind: "body", id: "Mars" },
  contact: { kind: "conjunction" },
  yearUnit: "tropical-365.2422-days"
});
console.log(natalHit);
```

The selection omits geometry and body coordinates. Zodiacal hits read the
chart's ecliptic rows; mundane hits read full equatorial rows after checking
their frame, clock, obliquity and selected ecliptic coordinates against the
snapshot. Missing or ambiguous selected names and undefined bodily right
ascension return natal-stage refusals. The adapter preserves the natal
preparation's complete-ecliptic domain restriction and refuses inconsistent
time, place or house claims. It does not move or calculate a cusp or body.

Successful results add a compact `natal` audit: original clock label,
time-scale and delta-T metadata, engine provenance, geometry, requested
house system, flags, and the selected original ecliptic points or angular
longitude. Only consumed fields are checked and copied; unselected chart
content is not revalidated. A supplied snapshot and its provenance remain
claims, not authenticated engine output or an independent accuracy check.

For solar hits, the snapshot lacks a represented TT Julian date with which
to bind the samples. The natal audit therefore states
`solarEpochAssociation: "caller-supplied-unverified"`; fixed keys record
null. Supply solar samples prepared from the same natal instant and clock
when using `prepareSolarEquatorialDay`, and retain that adapter's provenance
separately. A valid sample interval alone does not establish that association.

[M8 evidence](evidence/M8.md) separates complete hand-derived arc and age
examples from the engine integration checks. The hit envelope inherits the
primitives' numerical limitations and first-turn branch rule. It adds no
calendar date, prediction, orbital progression, solar arc or scan policy.

## Bounded contact scans

`scan(ScanInput)` enumerates a finite list of contacts on one supplied sphere.
`parseScan(unknown)` validates the same request from decoded data. The shared
`convention` has system, mode, latitude policy and key; motions belong only in
the required `motions` array. Geometry, year unit and any solar samples are
shared by the whole scan. Each selection explicitly supplies a significator,
promissor and contact, using the same coordinates and branches as `hit`.

```ts
import { scan } from "./src/index.js";

// Invented sphere coordinates, derived in evidence/M9-derivations.md.
const result = scan({
  convention: {
    system: "placidus-semiarc", mode: "mundane",
    latitude: "retain-both", key: "ptolemy"
  },
  geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
  selections: [{
    significator: {
      kind: "body", id: "S",
      coordinates: { rightAscensionDegrees: 330, declinationDegrees: 0 }
    },
    promissor: {
      kind: "body", id: "P",
      coordinates: { rightAscensionDegrees: 60, declinationDegrees: 0 }
    },
    contact: { kind: "conjunction" }
  }],
  motions: [
    { motion: "direct" },
    { motion: "converse", converseConstruction: "placidus-role-swap" }
  ],
  yearUnit: "tropical-365.2422-days",
  ageRange: { fromYears: 0, toYears: 300, includeFrom: true, includeTo: true },
  maxEvaluations: 2
});
if (result.status === "complete") {
  console.log(result.hits.map(row => row.hit.directedAgeYears)); // [90, 270]
}
```

The arithmetic and ages in this example come from the independent
[scan fixtures](evidence/scan-examples.ts), checked in
[scan.check.ts](checks/scan.check.ts). The scan performs each selection
with each motion, in that order. It does not generate unspecified body pairs,
aspect branches or additional revolutions. A wide age interval does not add
another occurrence of an initial contact. Use prepared engine coordinates
for natal work; the example's constructed coordinates are geometry evidence.

Both arrays must be nonempty. `maxEvaluations` is a required integer from
`1` through `SCAN_MAX_EVALUATIONS` (`10,000`). Each array has that same upper
length limit, and their raw length product must fit the requested budget.
The budget check precedes all hit calls and reads of selection contents.
Duplicates and contacts outside the age interval still consume evaluations.
There is no partial search, time-step parameter, output truncation or
ephemeris sampling. The limit is on single-hit evaluations, not a wall-clock
duration guarantee. The cap and boundary rules are enforced in `scan.check.ts`.

Age endpoints must be ordered, finite and nonnegative. Both inclusion flags
are mandatory. Membership compares the returned binary64 `directedAgeYears`
directly, without a tolerance. Equal endpoints select that exact age only
when both are included; otherwise the interval is empty. All requested hits
are still evaluated for an empty interval. An exactly zero arc can appear
at an included zero age; it is not changed into a full turn. To partition
an age interval without repeating an endpoint, choose disjoint inclusion
flags for the adjoining scans. Membership does not claim a bound on the
underlying sphere or ephemeris error.

Within one scan, a body label must name the same original coordinates in
every selection, even where zero-latitude projection would remove a
difference. After each successful hit, identical canonical requests are
deduplicated before age filtering. Identity includes original labels and
coordinates, contact, branch and motion; the sphere, key, year unit and solar
samples are already common. Field order and negative zero do not distinguish
requests. Equal ages or arcs alone never merge contacts, and converse roles
keep their original labels. No fuzzy coordinate or age matching is used.

A complete result has `status: "complete"`, the copied `ageRange`, `hits`,
`work`, `duplicateCount` and `outsideAgeRangeCount`. Each hit row contains
its first `selectionIndex`, `motionIndex` and the full unchanged `hit`
result. Indices are zero-based. Rows sort by exact directed age, with ties
retaining first occurrence in selection-then-motion order. `work` contains
`requestedEvaluations`, `evaluated` and `maxEvaluations`. On completion,
evaluated work equals returned hits plus duplicates plus unique hits outside
the interval. A complete empty list is a successful enumeration with no
eligible rows.

A refusal has `status: "refused"`, `stage: "scan"`, `code`, `message` and
an empty `hits` array. `invalid-input` describes invalid scan structure,
endpoints, lists or budget. `evaluation-budget` includes work accounting with
no evaluated hits. `hit-refused` includes the underlying hit `cause`, the
failing selection/motion index in `at`, and work evaluated through that
attempt. `inconsistent-body` similarly identifies the first conflicting
selection. Any refusal discards all earlier rows, including when the failing
contact would lie outside the age interval. Unsupported converse angles,
zodiacal converse and angle aspects remain refusals, so select supported
combinations in separate scans when needed.

All results are fresh, deeply frozen and JSON serializable; caller data stays
unchanged and unfrozen. Hidden, inherited, accessor and unknown fields,
sparse arrays and additional array properties are rejected. Over-budget
requests return their budget refusal before validating their contents.
Unexpected exceptions from executable inputs such as proxies propagate.
[M9 evidence](evidence/M9.md) records the independent enumeration and the
separate single-hit parity checks.

`scanFromNatal(snapshot, input)` and `parseNatalScan(snapshot, unknown)` use
the same scan enumerator with `hitFromNatal` as its evaluator. Their
`NatalScanInput` omits geometry and selects body identifiers without
coordinates, like `NatalHitSelection`. Each returned row retains the full
hit's `natal` audit. The shared enumerator applies the same budget before
any hit evaluation and the same endpoint, deduplication, ordering and atomic
refusal rules. A failed natal selection appears in the scan refusal's
`cause`; no partial rows are returned. These functions are pure and use the
supplied snapshot without an ephemeris call.

The CLI prepares that snapshot once for a natal request and then uses these
APIs. [CLI.md](CLI.md) gives the command syntax, complete request files,
strict JSON rules and exit codes. [M10 evidence](evidence/M10.md) separates
its independent coordinate fixtures from natal integration checks.
