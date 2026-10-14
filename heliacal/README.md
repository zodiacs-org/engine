# Heliacal visibility workbench

This private project builds a planetary visibility library on the engine in
the parent checkout. It is outside the engine's npm package. The checklist
in [PLAN.md](PLAN.md) records the implementation order.

The library currently supplies strict inputs, apparent positions,
Sun/body geometry, phase classification, geometric disk illumination,
an arcus visionis criterion, a configurable visibility screen,
rise/set/transit events, bounded observing windows and bracketed horizon-arcus
transitions with position receipts. Crescent predictions and the CLI are
planned, not available.

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

## Observing windows

```ts
import { observingWindows } from "./src/index.js";

const result = observingWindows("Moon", {
  latitude: 13, longitude: -42, height: 120
}, "2001-02-03", "2001-02-06");
if (result.status === "complete") {
  for (const window of result.windows) {
    console.log(window.period, window.from, window.to);
    console.log(window.start.causes, window.end.causes);
    console.log(window.solarHalf.start.position);
  }
}
```

These synthetic observing inputs are exercised in
[test/windows.test.ts](test/windows.test.ts). `observingWindows` accepts the
Moon or a visible planet and returns geometric candidate intervals within
the requested range. The Sun must be below its airless centre horizon and
the target above its own. Solar upper transit to the next lower transit is
labelled `evening`; lower transit to the next upper transit is `morning`.
These are this library's meridian-half conventions, including in polar night.
They do not select a morning-star or evening-star longitude phase, define a
twilight depression, or predict a sighting. Apply a visibility model separately.

All crossings and transits come from the engine's sky solver with
`limb: "centre"` and `refraction: "none"`. These conventions match the
airless horizon used by the arcus criterion; no limb or refraction option is
accepted here. The solver's horizon is the geodetic tangent plane without
terrain or horizon dip. Its reduction differs from calc's, as described in
the foundation API above. A sky window is therefore not a proven enclosure
of all instants that a calc-based altitude screen might accept near a crossing.

Intervals include their start and exclude their end. A rise begins the
above-horizon state and a set begins the below-horizon state at the solver's
reported instant; an isolated zero-duration contact produces no interval.
Every window has `start` and `end` boundaries. Their `causes` distinguish a
range clip from a Sun or target crossing or solar transit; coincident causes
are all kept. Their `events` retain the original solver events with attached
position results. `solarHalf` retains the enclosing solar transit pair even
when a range clip or horizon crossing shortens the window. The top-level
`from` and `to`, and each window's boundaries, are normalized ISO instants.

`horizons.sun` and `horizons.target` retain the full supporting searches,
including their engine identities, flags, sample counts and event position
receipts. `support` identifies their interval, which extends two days on each
side of the request. This padding is bounded; the code never keeps expanding
it to find a missing event. The result says `receiptScope: "event-positions"`:
the engine receipts describe positions, not the window partition or a
visibility model. Dates inside source events remain engine `Date` objects;
do not mutate them when retaining the result for later use.

An absent horizon crossing is handled using the engine's scoped
`never-rises` or `never-sets` flag, or the direction of the available crossing.
Polar daylight produces an empty completed result. In polar night, solar
transits still divide eligible intervals into morning and evening without
inventing sunrise or sunset. `diagnostics` reports missing rise/set events
and above/below states within the support search only. Such a diagnostic
does not claim that a body never rises or sets outside that interval. Exact
geographic poles are refused because this solar-half convention is undefined
there.

The operational limits are exported as `OBSERVING_WINDOW_LIMITS`: a request
may span at most 366 elapsed days, with two days of support on either side,
and the default combined budget is 200,000 sky search samples. The optional
`maxSamples` must be a finite positive safe integer. Both searches share that
budget, including padding and refinement. Position calls that attach receipts
are separate from the sky sample count. The constants and refusal boundaries
are enforced by [test/windows.test.ts](test/windows.test.ts); they are
work limits, not measured accuracy or runtime guarantees.

A `refused` result has no windows. Its `reason` distinguishes a range or
sample budget, a support interval outside engine reference coverage, a
geographic pole, or a refused event position. The coverage guard includes the
nominal extra hour the engine scans on either side of a sky request; crossing
refinement can probe beyond those scan endpoints. No shorter support range
is silently substituted. Already completed supporting searches remain in
`horizons` for diagnosis; searches not attempted are `null`.
`positionRefusal` retains an engine refusal when present.

An `unresolved` result also has no windows: its `event-sequence` reason and
`detail` identify absent solar anchors or inconsistent crossing states. A
`complete` result means the supplied engine events were partitioned over the
entire requested interval, including a resolved empty result. It inherits
the engine's sampled crossing-search limitations and is not a mathematical
proof of every physical crossing. The independently constructed schedules in
[test/window-partition.test.ts](test/window-partition.test.ts) check interval
coverage and clipping. The engine integration and
[failure-path tests](test/windows-failure.test.ts) check
delegation and provenance, not sighting accuracy.

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

## Visibility criteria

`horizonArcusVisionis(sunAltitudeDeg, requiredSolarDepressionDeg)` implements
the horizon criterion defined by Schoch: compare solar depression with an
explicit threshold at the target's airless centre horizon crossing. The
caller supplies the Sun's airless centre altitude at that crossing. This
pure helper does not find or verify the crossing. It returns the depression,
threshold, signed margin and inclusive `passesCriterion`, under the model
identifier `horizon-arcus-visionis/1`. Its reported body altitude is zero by
definition. The `heliacalEvents` search uses centre limbs and no refraction;
the engine's default horizon conventions are different.

Schoch's thresholds depend on the appearance and observing conditions. This
API supplies no automatic thresholds or lunar calibration. The distinction
between first and last appearances is checked with selected published
criterion values in [the reference tests](test/visibility-reference.test.ts).
These are arithmetic checks, not reproductions of historical sighting dates.

For a screen at an arbitrary instant, choose the separate custom extension:

```ts
import { arcusVisibility } from "./src/index.js";

const result = arcusVisibility("Venus", "2001-02-03T04:05:06.007Z", {
  latitude: 13, longitude: -42, height: 120
}, {
  model: "arcus-visionis-altitude/1",
  minimumSolarDepressionDeg: 6,
  minimumBodyAltitudeDeg: 5,
  photometry: null
});
if (result.status === "ok") {
  console.log(result.criterion.passesCriterion);
  console.log(result.criterion.margins, result.criterion.failedCriteria);
  console.log(result.geometry.topocentric.target.equatorial.receipt);
}
```

The observing inputs and thresholds above are synthetic examples, exercised
in [test/visibility.test.ts](test/visibility.test.ts); they are not recommended
Venus settings. The custom screen requires both minimum airless body altitude
and minimum solar depression to pass. It neither measures the horizon arcus
at an arbitrary instant nor substitutes the body-Sun altitude difference for
it. This combination is our configurable extension, not Schoch's calibrated
model or Schaefer's limiting-magnitude model.

All model fields are required. `photometry: null` explicitly disables the
magnitude gate. For a planet, a photometry object instead requires:

| Field | Meaning |
| --- | --- |
| `magnitudeOutsideAtmosphere` | Total visual magnitude before terrestrial attenuation, supplied for this instant by the caller. |
| `extinctionMagPerAirmass` | Nonnegative scalar visual extinction coefficient, in magnitudes per air mass. |
| `limitingMagnitude` | Faintest attenuated visual magnitude accepted in the target's direction, supplied by the caller. |
| `refractionDeg` | Upward correction from airless to apparent body altitude, used only by the photometric calculation. |

The air mass `X` uses Rozenberg's approximation at the apparent altitude.
The screen computes attenuation `k*X`, magnitude at the observer
`magnitudeOutsideAtmosphere + k*X`, and magnitude margin
`limitingMagnitude - magnitudeAtObserver`. This is attenuation from above
the atmosphere, not a correction relative to the zenith. The engine supplies
no magnitude here. The explicit refraction correction does not change either
geometric altitude gate. A correction of zero asserts that refraction is
being neglected for this screen; it is not an atmospheric estimate.

`evaluateArcusVisibility({ body, sunAltitudeDeg, bodyAltitudeDeg }, parameters)`
evaluates the same rule without computing positions. Both input altitudes
are airless topocentric centres. `rozenbergAirmass(apparentAltitudeDeg)`
exposes the apparent-altitude formula separately. Altitudes are in degrees;
input airless altitudes range from -90 to 90, while thresholds, refraction
corrections and the air-mass formula's apparent altitude range from 0 to 90.
These domains are enforced by [test/visibility.test.ts](test/visibility.test.ts).
The formula is retained as published, including its approximate zenith
normalization.

Results keep a frozen copy of the parameters and sample, separate signed
margins, and all failed gates. Equality passes without an epsilon.
Photometry reports `disabled`, `evaluated` or `unavailable`; a corrected
altitude outside the air-mass formula's domain is unavailable, with a null
magnitude margin and a failed `photometry-unavailable` gate. Invalid inputs
and unrepresentable arithmetic throw `RangeError`. The engine-backed function
returns an intact engine refusal when positions are unavailable; otherwise
it retains all source geometry and position receipts. Its `receiptScope`
is `positions`: the screen has no engine receipt or propagated error bound.

The scalar extinction calculation is only a rough screen near the horizon.
It does not model separate atmospheric layers, twilight sky brightness,
weather, terrain, visual adaptation or sighting probability. Adding extinction
to an empirical arcus threshold can count atmospheric effects twice. Select
parameters for the intended use; there are no fitted defaults. A pass means
only that the supplied thresholds passed. The Moon accepts geometric
screening only and rejects a photometry object: integrated point-source
magnitude does not establish crescent visibility.

## Heliacal transition searches

```ts
import { heliacalEvents } from "./src/index.js";

const result = heliacalEvents("Venus", {
  latitude: 13, longitude: -42, height: 120
}, "2024-06-01", "2024-06-10", {
  model: "horizon-arcus-visionis/1",
  thresholds: { "first-morning": 5, "last-evening": 5 }
});
if (result.status === "complete") {
  for (const event of result.events) {
    console.log(event.appearance, event.at, event.bracket.from, event.bracket.to);
    console.log(event.bracket.after.geometry.topocentric.sun.equatorial.receipt);
  }
}
```

The synthetic inputs above are exercised in
[test/heliacal.test.ts](test/heliacal.test.ts). They are not recommended
Venus thresholds. Every selected appearance needs an explicit solar-depression
threshold in degrees. There are no body or weather defaults, and the
thresholds are copied and frozen before engine evaluation. Supply at least
one applicable key in `thresholds`:

| Body | Available appearance keys |
| --- | --- |
| Mercury, Venus | `first-morning`, `last-evening`, `first-evening`, `last-morning` |
| Mars, Jupiter, Saturn | `first-morning`, `last-evening` |
| Moon | `first-evening`, `last-morning`, as a geometric arcus extension only |

The planetary names follow Schoch's definitions, cited in
[SOURCES.md](SOURCES.md#heliacal-transitions). The algorithm searches
threshold crossings between opportunities; it does not identify conjunctions
or certify that a change was caused by conjunction. The Moon's result carries
`interpretation: "lunar-geometric-arcus-only"` and a
`lunar-geometric-extension` diagnostic. It is not a first/last crescent
prediction. Yallop and Odeh criteria remain separate planned work.

This search accepts the horizon model only. The custom instantaneous
`arcus-visionis-altitude/1` screen remains available through `arcusVisibility`.
It cannot be supplied to this search. No extinction, magnitude, refraction
or body-altitude screen is silently added to an empirical arcus threshold.
The horizon's reference altitude is the airless body centre at zero;
observer height is still passed explicitly to the engine. Actual calc body
altitude is retained in the returned geometry and is not forced to zero.

The engine supplies every supporting Sun and target rise, set and transit.
Morning opportunities use target rises in the solar lower-to-upper-transit
half; evening opportunities use target sets in the upper-to-lower half.
Both include daylight crossings, which can fail the criterion. Searching
only dark observing windows would lose these failure states.
The meridian-half ownership is half-open and follows `observingWindows`,
including during polar night. Solar depression comes from calc's airless
topocentric Sun at the sky solver's target crossing. Sky and calc use the
different observer and apparent-position reductions described above; this
combination is explicit in the conventions, not a claim of identical horizons.

An appearance requires opposite criterion states at target crossings in
consecutive solar halves of the same period. A first appearance goes from
failure to pass; a last appearance goes from pass to failure. Equality passes.
Each appearance uses its own threshold, including when first and last are
requested together. More than one appearance in a period shares the geometry
evaluation. Missing or multiple target crossings, and crossings outside the
request, produce unavailable opportunities and break the sequence. A target
crossing in the wrong solar half is not reassigned to a neighbouring half.
This also prevents a morning/evening handoff near opposition from inventing a
heliacal appearance.

Each event has a normalized ISO `at`: the passing horizon reference epoch,
which is the later crossing for a first and the earlier crossing for a last.
This is not an observing time. `bracket.before` and `bracket.after` preserve
both opportunities, their criterion margins, full Sun/body geometry, source
horizon events and solar transit anchors. `bracket.from` and `bracket.to`
give those crossings' ISO instants. The bracket describes successive
opportunities, not a continuous threshold root or an uncertainty interval.
No interpolation or millisecond visibility precision is claimed.

Both bracket crossings must lie in `[from,to)`. A lone passing opportunity
at either range edge creates no event. Splitting a long request requires
overlap that includes both adjacent opportunities to retain a transition
across the split; source crossings, rather than a fixed civil-day count,
determine that overlap. Events are sorted by their reference epoch.

`opportunities` retains every intersecting solar half for a requested period,
including unavailable ones. Its `from` and `to` are the full solar-half
anchors, which can extend beyond the request; only evaluated crossings must
be inside the request. `diagnostics` explains gaps. `observing` retains the
bounded supporting window search, its polar diagnostics, horizon events,
engine identity, receipts and sky sample usage. Source event instants are
engine `Date` objects; treat them as read-only. The receipts attest only to
the position calculations, not the search or model prediction.

The range, support padding and `maxSamples` limits are those of
`observingWindows`. A separate `maxGeometrySamples` bounds calls to
`sunBodyGeometry`; its default is 800, exported in `HELIACAL_SEARCH_LIMITS`
and checked in [test/heliacal.test.ts](test/heliacal.test.ts). Each such call
computes the full geometry, not a single position. The exact needed count is
checked before these calls, so a `geometry-budget` refusal evaluates none.
Geometry calls attaching receipts in the supporting horizon search retain
the separate accounting described under observing windows.

Invalid models, options, thresholds and inapplicable appearances throw
`RangeError`. Support failures propagate as `refused` or `unresolved`;
geometry failures retain the intact engine `positionRefusal`. These results
return no partial events or opportunities. A completed result means that
all selected horizon opportunities were processed under these conventions,
with gaps explicitly recorded. It inherits the sampled engine horizon
solver's limits; it does not establish uninterrupted visibility coverage or
predict weather and sightings.

[test/heliacal-reference.test.ts](test/heliacal-reference.test.ts) applies
the existing published Schoch thresholds to independently constructed
crossing schedules and solar altitudes. These are criterion worked examples,
not reproductions of historical observing dates. The
[sequence tests](test/appearance-sequence.test.ts) check independent interval
arithmetic, [failure tests](test/heliacal-failure.test.ts) check refusal and
receipt preservation, and the engine integration tests check wiring only.

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

The visibility [reference fixture](test/fixtures/visibility-reference.json)
records selected Schoch criterion values and Schaefer's rounded Rozenberg
air-mass examples, with gates fixed before comparison. It also records an
exact constructed extinction calculation. The
[reference tests](test/visibility-reference.test.ts) check those criteria;
the [other visibility tests](test/visibility.test.ts) check boundary handling,
explicit photometry, validation and engine delegation. None measures sighting
prediction accuracy across a date range. [Fixture notes](test/fixtures/README.md#visibility-criteria)
record attribution and scope.

[SOURCES.md](SOURCES.md) records the geometry references and primary-source
roadmap for later milestones. Code and original documentation here follow
the repository's MIT licence. The engine's data retain the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). The existing USNO
fixture's provenance is documented there. No papers, historical observation
databases or third-party implementations are copied into this folder.
The ERFA test constants retain their BSD notice in the fixture notes.

Generated tables, dependency installs, caches and research downloads stay
in ignored folders; small future fixtures need their own source and terms.
