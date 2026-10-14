# Primary directions workbench

This private source project is being built alongside `@zodiacs/engine`.
It is not part of the engine's npm package. Code and authored documentation
here follow the repository's [MIT license](../LICENSE); using the engine
retains the engine's own [data and attribution terms](../LICENSING.md).

The current implementation validates explicit convention choices, prepares
engine natal snapshots, computes pure sphere coordinates and semi-arcs, and
finds direct conjunction arcs to fixed angles from prepared coordinates,
and computes direct zodiacal conjunctions and aspects to body significators.
Mundane body directions, timing conversions and the
`directions hit` and `directions scan` commands are still planned in
[PLAN.md](PLAN.md). An accepted
convention is not a computed hit or a claim that a particular contact exists.

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
| `key` | `ptolemy`, `naibod`, `solar-equatorial-birth-day` | Separate planned mappings from an equatorial arc to age. |

The initial contract admits `zodiacal` only with `zero-both` and `mundane`
only with `retain-both`. These are explicit project subsets, not claims that
all authors use those pairings. Additional latitude and converse constructions
need named options and independent evidence before they can be admitted.
`converse` does not silently negate a direct arc. The angle solver refuses
converse under the role-swap construction. The zodiacal body solver also
refuses converse, including projected conjunctions. Mundane contacts still
need validation in their solver and the future hit API.

[SOURCES.md](SOURCES.md) states what each traditional source supports and
where it differs. [evidence/README.md](evidence/README.md) sets the numerical
evidence requirements. No solver may infer a house system, latitude policy,
motion, key, aspect branch or polar fallback from missing input.

Use a Node 22 runtime. From the repository root, install and run only the
project's tools:

```sh
npm ci --prefix directions --cache directions/.cache/npm --ignore-scripts
npm --prefix directions run typecheck
npm --prefix directions test
npm --prefix directions run check:isolation
```

The local dependency lock pins the tools. Tests have the suffix `.check.ts`
and an explicit Vitest config, so root Vitest's default discovery does not
collect them. Typechecking emits nothing. Caches, generated reports and any
future local build output stay in ignored directories inside this project.

The isolation check uses npm's dry-run file list with lifecycle scripts
disabled. It also checks project file sizes and documentation punctuation.
It does not replace the engine's full package gate, which needs an existing
engine build. Do not build or modify root `dist/` during this work.

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
retains the explicitly requested engine houses; the future solver must still
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
and then returns the typed `unsupported-converse-angle` refusal for every
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
Original labels and ages belong to the later hit API. Inputs are not mutated
or frozen, and no caller-owned object is retained.

The `zero-both` choice defines a restricted project projection using the
Placidus proportional semi-arc equation. It is not a reproduction of every
rule in *Primum Mobile*: changing significator latitude, latitude-based
effectiveness rules, and the Sun's special crepuscular construction are not
applied. All supplied body points use the same explicitly chosen semi-arc
method above and below the horizon. [SOURCES.md](SOURCES.md) identifies these
limits alongside the traditional passages. No additional latitude policy or
aspect set is enabled by this milestone.

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
`unsupported-converse-zodiacal`, including projected conjunctions. This
milestone enables no zodiacal extension of the source's mundane role swap.
The `SphereGeometryError` refusals propagate for poles, tangencies and
circumpolar projected points. No fallback is applied. Engine integration
checks and the independent numerical comparisons are distinguished in
[M5 evidence](evidence/M5.md).
