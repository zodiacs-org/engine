# Heliacal visibility workbench

This private project builds a planetary visibility library on the engine in
the parent checkout. It is outside the engine's npm package. The checklist
in [PLAN.md](PLAN.md) records the implementation order.

The library currently supplies strict inputs, apparent positions,
Sun/body geometry, phase classification, geometric disk illumination and
rise/set/transit events with position receipts. Visibility models, crescent
predictions and the CLI are planned, not available.

## Development

Use Node as specified in this project's `package.json`, then, from the
repository root:

```sh
npm --prefix heliacal ci --ignore-scripts
npm --prefix heliacal run typecheck
npm --prefix heliacal test
npm --prefix heliacal run check:package
```

Dependencies and the lockfile belong to this folder. Vitest's alias and
TypeScript's path mapping let the parent engine source use the same pinned
astronomy dependency without installing or building anything at the root.
There is no emitted build or installed command yet. Consumers currently need
a TypeScript-aware loader or bundler with the same dependency mapping; a
plain Node import of the source is not a supported invocation.

The package check requires npm and GNU tar. It verifies that the current
working-tree pack list excludes this folder, then runs the repository's
`package:contents` check in a temporary copy using the carried archive's
build output. It writes no root `dist/` and creates no archive. This is a
packaging check, not a rebuild or an archive-binding check.

## Foundation API

```ts
import { enginePosition, horizonEvents } from "./src/index.js";

const site = { latitude: 38.89, longitude: -77.03 };
const position = enginePosition("Venus", "2024-06-21T12:00:00Z", {
  observer: site,
  frame: "equatorial-true-of-date"
});
const horizon = horizonEvents(
  "Moon", site, "2024-06-21", "2024-06-22", { maxSamples: 10000 }
);
```

The example site and dates are observing inputs, not personal birth data.
`VISIBILITY_BODIES` names the Moon, Mercury, Venus, Mars, Jupiter and Saturn.
The low-level adapters also accept the Sun for the observing geometry.
`visibilityBody`, `observationBody`, `observer`, `instant` and `dateRange`
validate inputs. Invalid inputs throw `RangeError` before a search.

Instants use the engine's resolved-date parser. Date-only inputs mean UTC
midnight; date-times need an explicit offset. The engine's UTC input basis
determines UT1 and TT. These adapters do not accept pinned delta T or a
different input time scale. Date inputs are copied. Ranges include the start
and exclude the end, and must be nonempty. Coordinates are geodetic degrees,
longitude positive east; observer height is in metres.

`enginePosition` returns the engine's calculation result unchanged, including
its bounds and receipt or its typed refusal. Positions are apparent,
tropical, in degrees and astronomical units, with Cartesian coordinates and
without speeds. The default is geocentric ecliptic of date; an observer
selects topocentric positions. In the equatorial frame, `lon` is right
ascension in degrees and `lat` is declination. See the parent's
[calculation guide](../docs/calc.md) for the engine's coverage and corrections.

`horizonEvents` delegates to `src/sky/riseset.ts` and preserves its event
times, geometric centre altitudes, north-through-east azimuths, conventions,
flags and sample counts. Its optional limb, refraction and sample budget
have the engine's meanings. Budget refusal returns no events. Additional
position calls are outside the solver's sample budget.

Each returned event adds `position`, an equatorial topocentric calculation
at that event. Its receipt records that position calculation only; the
result says `receiptScope: "event-positions"`. The sky solver has no native
receipt. A position can be refused outside the calculation entry's coverage
even when sky supplies the event; that refusal remains explicit. The common
`engine` field identifies the solver's engine and ephemeris even when no
events are returned.

Sky uses WGS84 for the observer; the calculation entry uses IERS 2003.
The same numeric site coordinates are passed to each API without a datum
conversion. Their apparent topocentric corrections also differ: sky
subtracts the observer at reception from the geocentric apparent vector;
calc uses a retarded body and observer in its apparent direction. Consequently
a position attached to an event is not a reproduction of sky's horizontal
reduction. Its receipt names the calculation conventions. Height moves the
observer, but the sky solver applies no horizon dip. See the
parent's [sky guide](../docs/sky.md). No visibility conclusion is implied by
the existence of a horizon event.

## Geometry API

```ts
import { sunBodyGeometry } from "./src/index.js";

const geometry = sunBodyGeometry("Moon", "2020-01-01T00:00:00Z", {
  latitude: 45, longitude: 10, height: 0
});
if (geometry.status === "ok") {
  console.log(geometry.topocentric.target.horizontal);
  console.log(geometry.topocentric.elongationDeg);
  console.log(geometry.geocentric.target.ecliptic.receipt);
}
```

`sunBodyGeometry(body, at, observer)` accepts a visibility target and returns
Sun and target geometry from both the geocentre and the observing site.
Each pair contains `sun`, `target` and `elongationDeg`. Each body contains
the original engine `equatorial` and `ecliptic` positions, with bounds and
receipts, plus its `horizontal` projection. Elongation is the smallest angle
between the Sun and target directions, including latitude, rather than a
difference of longitudes. It is not the illumination phase angle at the body.

Angles are degrees and engine distances are astronomical units. The
`at` field is a normalized ISO instant. `localApparentSiderealTimeDeg`
uses the engine's Greenwich apparent sidereal time and east-positive
longitude. The `units` and `conventions` fields state the output conventions;
`receiptScope: "positions"` identifies what the engine receipts record.
The horizontal projection and separation are derived here and have no
additional engine receipt or propagated accuracy bound. A refused position
returns the engine's typed refusal without partial geometry.

Horizontal `altitudeDeg` measures the airless centre above the geodetic
tangent plane. `azimuthDeg` runs from north through east. `hourAngleDeg`
is west-positive in `[-180, 180)`, with the lower meridian represented by
`-180`. Azimuth is `null` at either geographic pole and for a vertical
direction within floating-point roundoff; hour angle is `null` at either
celestial pole. Altitude remains defined there. The synthetic identities
in [test/geometry.test.ts](test/geometry.test.ts) enforce these conventions.

The geocentric horizontal fields project geocentric directions onto the
site's local axes without parallax. They are useful for criteria that
specifically request geocentric altitude. Use `topocentric` for the observer's
directions. Both use calc's apparent positions and IERS 2003 observer
convention. The engine's geocentric Moon is its lunar series at the instant,
without light time or aberration; its topocentric Moon uses the engine's
retarded correction. No atmospheric refraction, limb offset, terrain or
horizon dip is added by this geometry API.

The pure helpers `angularSeparation(a, b)` and
`equatorialToHorizontal(rightAscensionDeg, declinationDeg, latitudeDeg,
localApparentSiderealTimeDeg)` expose the direction calculations.
Separation takes `{ longitudeDeg, latitudeDeg }` directions in the same
frame and at the same origin. Longitudes, right ascension and sidereal
angle must be in `[0, 360)`; latitudes and declination must be in
`[-90, 90]`. The helpers reject invalid input and do not add parallax.

## Phase API

```ts
import { phase } from "./src/index.js";

const result = phase("Venus", "2020-01-01T00:00:00Z", {
  latitude: 45, longitude: 10, height: 0
});
if (result.status === "ok") {
  console.log(result.geocentric.classification);
  console.log(result.topocentric.elongationDeg);
  console.log(result.topocentric.illumination.illuminatedFraction);
}
```

`phase(body, at, observer)` returns geocentric and topocentric results for
each visibility target. `signedSynodicAngleDeg` is apparent tropical target
longitude minus Sun longitude in `(-180, 180]`. Positive angles are labeled
`evening-star`, negative angles `morning-star`. Exactly zero is
`conjunction`; opposite longitudes are represented by positive `180` and
labeled `opposition`. These labels use computed longitude equality without
an epsilon. [The phase tests](test/phase.test.ts) enforce the wrap and
boundary conventions, including USNO's primary lunar phase definitions.

The geocentric label is the conventional longitude phase. The topocentric
label applies the same rule to the observer's apparent longitudes and can
differ near a boundary. Neither label establishes visibility, darkness,
which horizon crossings occur, or whether a body is observable only in the
morning or evening. Outer planets near opposition can be seen during both.
A longitude conjunction need not be an angular coincidence, and this API
does not distinguish inferior from superior conjunction or find their times.

`elongationDeg` is the apparent angular separation including latitude.
`illumination` instead uses a simultaneous geometric Sun/observer/target
triangle: `phaseAngleDeg` is the angle at the body, and
`illuminatedFraction` is the lit fraction of its projected spherical disk,
from zero to one. It also returns `geometricElongationDeg`,
`sunTargetDistanceAu` and the original geometric `positions.sun` and
`positions.target`, each with its engine receipt. The source of the disk
formula and geometric phase definition is cited in
[SOURCES.md](SOURCES.md#phase-geometry).

Illumination omits light travel time, aberration, eclipses, rings, surface
relief and atmospheric effects. It measures illuminated area, not apparent
brightness or the chance of a sighting. Do not substitute the apparent
elongation for the geometric triangle's elongation. The original apparent
positions and horizontal coordinates remain available under `geometry`.
`units`, `conventions` and `receiptScope: "positions"` describe the result;
derived phases have no propagated accuracy bound or additional engine
receipt. A refused source position returns the intact engine refusal without
partial results. Input validation and time basis are the same as the geometry API.

`synodicPhase(targetLongitudeDeg, sunLongitudeDeg)` is the pure longitude
helper, with both inputs in `[0, 360)` in the same frame and origin.
`illuminationGeometry(elongationDeg, sunDistanceAu, targetDistanceAu)` is the
pure triangle helper, taking an angle in `[0, 180]` and positive distances
in astronomical units. It rejects coincident Sun/target positions and a
derived distance that cannot be represented as positive finite au. The
helpers' domains and geometric identities are checked in
[test/phase.test.ts](test/phase.test.ts).

## Checks and sources

The foundation tests check inputs, body scope, engine delegation, receipt
preservation, refusals, polar conditions and interval boundaries. These are
integration checks, not independent accuracy measurements.

The USNO comparison in [test/engine.test.ts](test/engine.test.ts) uses the
parent's committed [USNO fixture](../src/sky/fixtures/usno-rstt.json), for the
Sun and Moon on 2024-06-21 at the example site. Its tolerance is one minute,
set before execution to accommodate the rounded table and differing solar
radius conventions. This checks only those listed events against the table,
not real-world sighting accuracy. It does not validate a visibility model.

The geometry tests compare directions, distances and Sun/Moon separation
with [recorded JPL Horizons examples](test/fixtures/geometry-reference.json)
at the instant and site in the geometry example above. The fixture records
the requests, reference conventions and tolerances fixed before execution.
[test/geometry-reference.test.ts](test/geometry-reference.test.ts) enforces
those gates and the ERFA horizontal-transform example. The other visible
planets' geocentric longitudes are checked at that same instant against the
parent's [existing Horizons reference](../src/fixtures/horizons-2020.ts),
with gates fixed in [test/geometry.test.ts](test/geometry.test.ts).
[The fixture notes](test/fixtures/README.md) explain the convention
differences and attribution. These coordinate examples do not validate
predicted visibility or establish accuracy across a date range.

The phase comparison in [test/phase-reference.test.ts](test/phase-reference.test.ts)
uses [Horizons numerical examples](test/fixtures/phase-reference.json) for
the Moon and visible planets at the instant in the phase example, and the
Moon at that example site. Its predeclared gates cover the stated difference
between simultaneous geometric illumination and Horizons' retarded geometry.
The fixture and [notes](test/fixtures/README.md#phase-references) record
the exact requests, source quantities, attribution and comparison scope.
The pure triangle tests independently check the implemented geometry;
receipt parity and site-dependence tests are integration checks.

[SOURCES.md](SOURCES.md) records the geometry references and primary-source
roadmap for later milestones. Code and original documentation here follow
the repository's MIT licence. The engine's data retain the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). The existing USNO
fixture's provenance is documented there. No papers, historical observation
databases or third-party implementations are copied into this folder.
The ERFA test constants retain their BSD notice in the fixture notes.

Generated tables, dependency installs, caches and research downloads stay
in ignored folders; small future fixtures need their own source and terms.
