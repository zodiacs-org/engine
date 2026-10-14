# Primary directions workbench

This private source project is being built alongside `@zodiacs/engine`.
It is not part of the engine's npm package. Code and authored documentation
here follow the repository's [MIT license](../LICENSE); using the engine
retains the engine's own [data and attribution terms](../LICENSING.md).

The current implementation validates explicit convention choices, prepares
engine natal snapshots and computes pure sphere coordinates and semi-arcs.
Directional arcs, timing conversions and the
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
frozen object; the caller's object is unchanged. These functions are pure
and import no ephemeris or engine module.

| Field | Accepted choices | Meaning |
| --- | --- | --- |
| `system` | `placidus-semiarc` | Planned temporal-hour geometry; no house-system substitution. |
| `mode` | `zodiacal`, `mundane` | Ecliptic contact points or proportional semi-arc placement, respectively. |
| `motion` | `direct`, `converse` | Ordinary diurnal construction, or the role exchange described in the source register. |
| `converseConstruction` | `placidus-role-swap` | Required for converse, forbidden for direct; exchanges the moving and fixed roles. |
| `latitude` | `zero-both`, `retain-both` | Ecliptic latitude treatment for both significator and promissor. |
| `key` | `ptolemy`, `naibod`, `solar-equatorial-birth-day` | Separate planned mappings from an equatorial arc to age. |

The initial contract admits `zodiacal` only with `zero-both` and `mundane`
only with `retain-both`. These are explicit project subsets, not claims that
all authors use those pairings. Additional latitude and converse constructions
need named options and independent evidence before they can be admitted.
`converse` does not silently negate a direct arc. Historical restrictions on
the available contacts still need validation in the future hit API.

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
[M3 evidence](evidence/M3.md). Directional contacts and ages remain pending.
