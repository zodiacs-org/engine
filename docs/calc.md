# `@zodiacs/engine/calc`

One calculation API over the engine's positions, houses, longitude crossings
and charts. It is a separate entry point, so the root entry
(`@zodiacs/engine`) loads none of it: the root entry's build is byte for byte
the same with or without it.

```ts
import { calc, houses, events, chart } from "@zodiacs/engine/calc";

const mars = calc({
  body: "Mars",
  time: { jd: 2461306.5, scale: "TT" },
  frame: "equatorial-true-of-date",
  center: "geocentric",
  flags: { correction: "apparent", cartesian: true }
});
if (mars.status === "ok") {
  console.log(mars.lon, mars.lat, mars.dist, mars.speeds, mars.bounds, mars.receipt);
} else {
  console.log(mars.reason, mars.detail); // a typed refusal
}
```

With every default, `calc({ body, time })` is the position `positions()` and
`natalChart()` give, to the bit: the same longitude, latitude and speed.

## The four functions

| function | takes | gives |
| --- | --- | --- |
| `calc` | `{ body, time, frame?, center?, zodiac?, flags? }` | `{ lon, lat, dist, speeds, cartesian, bounds, receipt }` |
| `houses` | `{ time, place, system?, zodiac? }` | angles, Vertex, East Point, ARMC, obliquity and the cusps, with `bounds` and a receipt, as `natalChart()` computes them |
| `events` | `{ kind: "longitude-crossing", body, longitude, from, to, zodiac?, stepDays?, maxSamples? }` | every instant in (from, to] the body sits on the longitude, from the engine's crossing search |
| `chart` | `{ time, place?, houseSystem?, timeKnown?, timeFlags?, zodiac? }` | the chart `natalChart()` gives, with a receipt |

Each returns `status: "ok"` or a typed refusal (below). Malformed input (an
unknown body, frame or field, an invalid date, a latitude out of range) throws
`RangeError`, as everywhere in the engine.

## The input vocabulary

- **`time`**: an ISO 8601 string or a `Date`, read as UT, or
  `{ jd, scale: "UT" | "TT" }`, a Julian date in a named time scale, or
  `{ iso }`. Any of the object forms takes `deltaT`, a fixed ΔT = TT − UT1 in
  seconds, in place of the engine's model (`zodiacs-deltat/1`). UT is read as
  UT1, as everywhere in the engine: UTC is taken as UT1 and UT1 − UTC, under
  0.9 s, is not applied. A TT Julian date is converted with the model (or the
  pin) and recorded in the receipt with the UT the engine used. A Julian date
  near 2.46 million holds time to about 4 × 10⁻¹⁰ of a day (40 µs).
- **`place`** and the topocentric observer: `{ latitude, longitude }`,
  geodetic, east longitude positive, degrees; the observer also takes
  `height` in metres above astronomy-engine's ellipsoid (IERS 2003,
  a = 6378.1366 km, 1/f = 298.25642), 0 by default.
- **`frame`**: one of eight, below. Default `"ecliptic-true-of-date"`.
- **`center`**: `"geocentric"` (default), `"heliocentric"`, `"barycentric"`,
  or `{ topocentric: { latitude, longitude, height? } }`.
- **`zodiac`**: `"tropical"` (default) or `{ sidereal: ayanamsa }` with one of
  `lahiri`, `fagan-bradley`, `krishnamurti`, `raman`, `yukteswar`,
  `true-chitra`, `true-revati`, `true-pushya` or `galactic-center`. The
  sidereal zodiac is not in this version: every function refuses it with
  `not-in-this-version`. The ayanamsas are being built on another branch, with
  the Vedic techniques, and these names are theirs.
- **`flags`**: `correction` (`"apparent"`, `"astrometric"` or `"geometric"`,
  default apparent), `speeds` (default true), `cartesian` (default false),
  `units` (`"degrees"` or `"radians"`, default degrees) and `deflection`
  (default false; true is refused).

**Bodies**: the Sun, the Moon, Mercury to Pluto, the Earth (heliocentric and
barycentric only), the true lunar nodes (`"North Node"`, `"South Node"`), the
mean ones (`"Mean Node"`, `"Mean South Node"`) and `"Black Moon Lilith"`, the
mean lunar apogee. The planets are astronomy-engine's: truncated VSOP87 for
Mercury to Neptune, and its own integration for Pluto. Mars to Pluto were
compared with Horizons's system barycentres (NAIF 4 to 9), as the conformance
suite compares them. Its L1 build finds Horizons's body centres of Mars,
Jupiter, Saturn and Pluto at most 0.084″ from those barycentres, as their
satellites explain, and those of Uranus and Neptune, from their satellite
solutions, up to 0.67″ and 0.11″ away (`conformance/arbiters/l1/README.md`);
all of it is inside the ephemeris's own error.

## Frames

A position is found as a vector on astronomy-engine's EQJ axes (the mean
equator and equinox of J2000.0 that its precession starts from), and turned
into the frame asked for:

| `frame` | plane and equinox | how |
| --- | --- | --- |
| `ecliptic-true-of-date` | ecliptic of date, true equinox | astronomy-engine's `Rotation_EQJ_ECT`: IAU 2006 precession, astronomy-engine's nutation (the five largest terms of IAU 2000B; see below), true obliquity |
| `ecliptic-mean-of-date` | ecliptic of date, mean equinox | the same precession without the nutation; IAU 2006 mean obliquity |
| `ecliptic-j2000` | mean ecliptic and equinox of J2000.0 | EQJ turned by the IAU 2006 obliquity of J2000.0, 84381.406″ |
| `ecliptic-icrs` | ecliptic on ICRS axes | the ICRS turned by 84381.406″ about its x axis |
| `equatorial-true-of-date` | true equator and equinox of date (apparent right ascension and declination) | astronomy-engine's `Rotation_EQJ_EQD` |
| `equatorial-mean-of-date` | mean equator and equinox of date | the same, less its own nutation |
| `equatorial-j2000` | mean equator and equinox of J2000.0 | EQJ itself |
| `equatorial-icrs` | ICRS | EQJ less the IAU 2000 frame bias (dψ = −0.041775″, dε = −0.0068192″, dα₀ = −0.0146″, composed as ERFA's `eraBp00`) |

In an equatorial frame `lon` is right ascension, in degrees (or radians), not
hours, and `lat` is declination. The ICRS and J2000.0 frames differ by the
frame bias, at most 0.023″. Where astronomy-engine's EQJ sits between the two
is not settled below that level; its planetary series is referred to the FK5
by a fixed rotation. Horizons's `ECLIPTIC` reference plane uses the IAU 1976
obliquity, 84381.448″, so it is tilted 0.042″ from `ecliptic-icrs`.

The nutation is astronomy-engine's, which keeps the five largest luni-solar
terms of IAU 2000B (McCarthy and Luzum 2003) and its fixed offsets, of the
series' 77. Over the comparison's 32 instants it differs from the full
IAU 2000B by up to 0.20″ in longitude and 0.067″ in obliquity (0.068″ and
0.018″ median), while the full IAU 2000B differs from IAU 2006/2000A by
0.002″. Every true-of-date position and angle
the engine gives carries that difference; the mean-of-date, J2000.0 and ICRS
frames do not. calc keeps astronomy-engine's nutation so that its default
frame stays `positions()` to the bit, and names it
`nutation:iau2000b-five-terms`.

## Centers and corrections

| `correction` | what it is |
| --- | --- |
| `apparent` | light time and aberration: the observer is backdated with the target, as astronomy-engine's `GeoVector` does, which adds the observer's aberration to first order, annual and for a topocentric observer diurnal too. No gravitational deflection. |
| `astrometric` | light time only: the target when its light left, from where the observer is when it arrives, on barycentric positions. |
| `geometric` | where the target is at the instant, from where the observer is at the instant. |

- **Geocentric**: the Moon's apparent position keeps the engine's convention,
  its series at the instant without light time or aberration, so that `calc`
  agrees with `positions()` and `natalChart()`. A fully apparent Moon differs
  from it by the light time of the Moon's own motion, about 0.7″. Its
  astrometric position does carry light time.
- **Heliocentric** and **barycentric**: every body but the Sun heliocentric;
  the barycentre is astronomy-engine's, from the Sun and the four giant
  planets, each weighted m / (m + M☉). It is up to 1.1 × 10⁻⁵ au (1,650 km)
  from Horizons's barycentre, as the same formula is when evaluated on
  Horizons's own positions. That is small against every body's distance but
  the Sun's: the Sun is only 0.0006 to 0.0093 au from the barycentre in the
  comparison, where its barycentric direction was off by up to 519″, and it
  can be off by a degree or more when the Sun passes closer. The barycentre
  does not move, so a barycentric apparent position is its astrometric one.
- **Topocentric**: the observer's position and velocity from astronomy-engine
  (its Greenwich apparent sidereal time on the engine's ΔT; no polar motion).
  Light time is solved from the observer.
- **Distances**: `dist` is in au: the light path for apparent and astrometric
  positions (the length of the light-time-corrected vector), the geometric
  distance for geometric ones. The geocentric apparent Moon, being the series
  at the instant, has its geometric distance; the light path is up to 10⁻⁴ of
  it (38 km) longer or shorter, as the Moon moves with the Earth around the
  Sun during the 1.3 s of light time. The nodes and Lilith have none: `dist`
  is null and a cartesian position is refused.
- **Nodes and Lilith** are geocentric points of the Moon's orbit; the three
  corrections give the same position (`correction:not-applicable` in the
  receipt), and other centers are refused.

## Speeds

`speeds` holds the rate of `lon`, `lat` and `dist` per day, and with
`cartesian` the rates of x, y and z. Every rate is per day of 86,400 s; they
are differenced in UT, which runs slower than TT by under one part in 10⁷.

- **Analytic** for geometric positions on fixed axes (the J2000.0 and ICRS
  frames) of every body but the Moon: astronomy-engine's velocities from its
  differentiated VSOP87 series (Pluto: from its integrator), turned into the
  frame. Pluto's integrator velocity differs from the derivative of its
  position by about 0.0005″ a day.
- **Central difference** everywhere else: the value at t + h minus the value
  at t − h, over 2h, with the engine's steps, h = 0.001 day, and h = 0.25 day
  for the true node, whose short-period motion would otherwise dominate. For an
  ISO or `Date` instant the two instants are built as `positions()` builds
  them, so the longitude speed is its speed to the bit.

The differencing error is h²/6 times the third derivative. Estimated on the
engine alone by Richardson's rule, |D(2h) − D(h)| / 3, it is at most
1.3 × 10⁻⁴″ a day for geocentric positions (the Moon) and 0.094″ a day for
the topocentric Moon, whose parallax turns with the Earth once a day.
`bounds.speed` names the method and the step, and gives the largest rate
difference measured against Horizons, which includes the differencing error.
The true node's speed was not compared, so its `value` is null.

## Bounds

Every position carries `bounds.position` (the angle between the reported
direction and the arbiter's, arcseconds), `bounds.distance` (relative) and
`bounds.speed` (arcseconds a day), each labelled `measured` or `estimated`;
none is proven. The measured values are the largest differences from NASA JPL
Horizons (DE441) over a preregistered corpus of 32 instants from 1802 to 2188,
by center, correction and body, in every frame, rounded up to two
significant figures: `docs/evidence/calc-api/`. They are the largest seen on
those instants, not limits: another instant can exceed them. The barycentric
Sun's 520″ is the clearest case (see Centers above); for it the error in au,
1.1 × 10⁻⁵, is the meaningful figure. A topocentric body that was
not compared takes its geocentric bound, labelled `estimated`. `houses()`
carries the conformance suite's measured L2 bounds, 0.29″ for the angles and
0.49″ for the cusps; `events()` gives the bisection bracket, the step divided
by 2²⁴, as an estimate, to which the ephemeris's own error divided by the
body's speed adds.

## Refusals

A refusal is `{ status: "refused", reason, detail }`, the `status` and
`reason` words of the engine's crossing search:

| `reason` | when | extra fields |
| --- | --- | --- |
| `not-in-this-version` | the sidereal zodiac; gravitational deflection | |
| `unsupported-combination` | the Sun heliocentric; the Earth geocentric or topocentric; a node or Lilith with a center other than geocentric, or with `cartesian`; crossings of a body `positions()` does not give; a pinned ΔT for a crossing search | |
| `out-of-range` | an instant outside `CALC_SPAN`, 1800-01-01T00:00Z up to 2200-01-01T00:00Z, where the positions have been compared with an independent ephemeris | `span` |
| `sample-budget` | a crossing search that needs more evaluations than `maxSamples` | `samples`, `maxSamples` |

The checks run in that order. `positions()` and `natalChart()` still compute
outside the span, with the `outside-reference-span` flag.

## Receipts

`receipt` is `{ schema, request, instants, conventions, engine }`:

- `request`: the request as read, every default filled in, as JSON. Passing it
  back to the same function repeats the calculation.
- `instants`: each instant used, `{ utc, jdUt, jdTt, deltaT }`, with the ΔT
  value, its band and its source.
- `conventions`: ids from the vocabulary below.
- `engine`: the package version and the ephemeris.

### Convention ids

| id | meaning |
| --- | --- |
| `zodiac:tropical` | longitudes from the equinox of the frame |
| `frame:<frame>` | one of the eight frames above |
| `center:geocentric`, `center:heliocentric`, `center:barycentric`, `center:topocentric` | the origin |
| `correction:apparent`, `correction:astrometric`, `correction:geometric` | as above; `correction:not-applicable` for the nodes and Lilith |
| `light-time:newtonian` | astronomy-engine's light-time solution, iterated until successive light times agree to 10⁻⁹ day |
| `aberration:backdated-observer` | first-order aberration from backdating the observer with the target |
| `deflection:none` | no gravitational light deflection |
| `moon:series-at-instant` | the engine's Moon: astronomy-engine's lunar series at the instant, without light time or aberration |
| `precession:iau2006` | Capitaine et al. (2003) angles ψA, ωA, χA as astronomy-engine applies them to EQJ, without a frame bias |
| `nutation:iau2000b-five-terms` | astronomy-engine's nutation: the five largest luni-solar terms of IAU 2000B (McCarthy and Luzum 2003) and its fixed offsets; up to 0.20″ from the full series (see Frames) |
| `obliquity:iau2006` | the IAU 2006 mean obliquity (84381.406″ at J2000.0), with the five-term nutation in obliquity for a true-of-date frame |
| `frame-bias:iau2000` | the IAU 2000 frame bias of the ICRS (IERS Conventions 2010, eq. 5.21) |
| `barycentre:sun-and-giant-planets` | astronomy-engine's solar-system barycentre |
| `observer:iers2003-ellipsoid;no-polar-motion` | the topocentric observer as above |
| `node:true-osculating`, `node:mean`, `lilith:mean` | the Moon's osculating node from its state vector; its mean node (IERS 2003 Ω plus the nutation in longitude); its mean apogee |
| `speed:analytic`, `speed:central-difference-0.001d`, `speed:central-difference-0.25d` | how the speeds were found |
| `ephemeris:astronomy-engine@2.1.19` | the ephemeris: truncated VSOP87 for the planets, a lunar series after Brown's theory (Montenbruck and Pfleger), an integrated Pluto |
| `deltat:zodiacs-deltat/1`, `deltat:pinned` | the engine's ΔT model, or the caller's value |
| `time:ut1-read-as-utc` | UT read as UT1 |
| `house:<system>`, `polar-fallback:whole` | the house system asked for, and whole sign where Placidus or Koch is undefined |
| `angles:gast-and-true-obliquity`, `sidereal-time:gast-iau2006-era` | the angles from astronomy-engine's apparent sidereal time (Earth rotation angle, IAU 2006 polynomial, the equation of the equinoxes from the five-term nutation) and the true obliquity |
| `aspects:major`, `search:scan-and-bisect` | the chart's major aspects; the crossing search |

## Swiss Ephemeris `calc_ut` flags

Swiss Ephemeris is the reference implementation most astrology software uses.
This table maps each `swe_calc_ut` flag to its counterpart here. The engine
uses no Swiss Ephemeris code, data or output.

| flag | meaning in Swiss Ephemeris | here | status |
| --- | --- | --- | --- |
| `SEFLG_SPEED` | compute speeds | `flags.speeds` | supported, on by default |
| `SEFLG_HELCTR` | heliocentric | `center: "heliocentric"` | supported |
| `SEFLG_BARYCTR` | barycentric | `center: "barycentric"` | supported, on astronomy-engine's barycentre |
| `SEFLG_TOPOCTR` (with `swe_set_topo`) | topocentric | `center: { topocentric: { latitude, longitude, height } }` | supported |
| `SEFLG_TRUEPOS` | geometric position | `flags.correction: "geometric"` | supported |
| `SEFLG_NOABERR` | no aberration | `flags.correction: "astrometric"` | supported; there is never deflection here |
| `SEFLG_NOGDEFL` | no gravitational deflection | always so; `flags.deflection: true` | supported as the only behaviour; deflection is refused (`not-in-this-version`) |
| `SEFLG_ASTROMETRIC` | `NOABERR` and `NOGDEFL` | `flags.correction: "astrometric"` | supported |
| `SEFLG_NONUT` | mean equinox of date | `frame: "ecliptic-mean-of-date"` or `"equatorial-mean-of-date"` | supported |
| `SEFLG_J2000` | J2000.0 | `frame: "ecliptic-j2000"` or `"equatorial-j2000"` | supported |
| `SEFLG_ICRS` | ICRS, no frame bias | `frame: "ecliptic-icrs"` or `"equatorial-icrs"` | supported |
| `SEFLG_EQUATORIAL` | right ascension and declination | `frame: "equatorial-…"` | supported |
| `SEFLG_XYZ` | cartesian coordinates | `flags.cartesian: true` (given beside `lon`, `lat`, `dist`) | supported |
| `SEFLG_RADIANS` | radians | `flags.units: "radians"` | supported |
| `SEFLG_SIDEREAL` (with `swe_set_sid_mode`) | sidereal zodiac | `zodiac: { sidereal: ayanamsa }` | typed in, refused: `not-in-this-version`; planned with the Vedic techniques |
| `SEFLG_TROPICAL` | tropical zodiac | `zodiac: "tropical"` | supported, the default |
| `SEFLG_SWIEPH`, `SEFLG_JPLEPH`, `SEFLG_MOSEPH` | which ephemeris | none: one ephemeris, named in every receipt | not offered; a DE440 backend on the hosted API is planned |
| `SEFLG_SPEED3` | speeds from three positions | none | not offered; speeds are analytic or central differences |
| `SEFLG_DPSIDEPS_1980`, `SEFLG_JPLHOR`, `SEFLG_JPLHOR_APPROX` | IAU 1980 nutation corrections, Horizons's frame | none | not offered; the nutation is astronomy-engine's five-term IAU 2000B |
| `SEFLG_CENTER_BODY` | a planet's centre, not its system barycentre | none | not offered; Mars to Pluto were compared with system barycentres (see Bodies) |

`swe_calc_ut` takes a UT Julian date and `swe_calc` a TT one; here both are
`{ jd, scale }`. `swe_set_delta_t_userdef` is the `deltaT` pin. Its bodies
map to `CalcBody` as `SE_SUN` to `SE_PLUTO` by name, `SE_EARTH` to `"Earth"`,
`SE_TRUE_NODE` to `"North Node"`, `SE_MEAN_NODE` to `"Mean Node"` and
`SE_MEAN_APOG` to `"Black Moon Lilith"`. `SE_OSCU_APOG` is left out: this
lunar series puts it arcminutes from where it is. Chiron, Ceres, Pallas, Juno
and Vesta are planned for the hosted API. The flags Swiss Ephemeris returns,
which say what it actually computed, correspond to the receipt's conventions,
and its error returns to the typed refusals.

## Measured against JPL Horizons and ERFA

`docs/evidence/calc-api/` holds the preregistration, the Horizons requests and
responses with their SHA-256, the scripts, and the results (`RESULTS.md`).
The angle between the engine's direction and Horizons's, over 32 instants from
1802 to 2188, in arcseconds, median / 95th percentile / maximum, the bodies
pooled:

| center, correction | ICRS equator | true ecliptic of date | largest relative distance difference |
| --- | --- | --- | ---: |
| geocentric, apparent (10 bodies) | 3.00 / 15.5 / 24.6 | 2.99 / 15.5 / 24.5 | 1.3 × 10⁻⁴ |
| geocentric, astrometric or geometric | 2.88 / 15.5 / 24.6 | 2.86 / 15.5 / 24.4 | 6.7 × 10⁻⁵ |
| heliocentric (10 bodies) | 2.95 / 16.4 / 24.3 | 3.01 / 16.4 / 24.2 | 8.6 × 10⁻⁵ |
| barycentric, the Sun | 87 / 340 / 519 | 87 / 340 / 519 | 4.1 × 10⁻³ |
| barycentric, the other 10 bodies | largest 24.3 | largest 24.2 | 7.7 × 10⁻⁵ |
| topocentric, apparent (Sun, Moon, Mars; two sites) | 1.29 / 5.60 / 7.70 | 1.32 / 5.67 / 7.64 | 5.7 × 10⁻⁵ |

To the last digit shown, `equatorial-true-of-date` gives the figures of the
true ecliptic of date, and the mean-of-date, J2000.0 and ICRS frames those of
the ICRS equator. The differences are the ephemeris's own: largest for the
outer planets (Pluto 24.6″, Neptune 20.1″, Uranus 19.5″, Saturn 17.6″
geocentric at worst), 2.9″ for the Sun and 8.3″ for the Moon. Geocentric
angular rates differ from Horizons's by 0.03 to 0.04″ a day median and 2.1″ a
day at worst (Mercury).

The frame transforms were checked against ERFA 2.0.1 on the engine's own
output. Those without the nutation agree to better than a microarcsecond:
spherical against cartesian, the frame bias, the IAU 2006 precession, and the
equator against the ecliptic in the mean-of-date, J2000.0 and ICRS frames.
The four checks through the nutation fail their preregistered 5 mas
tolerance, by up to 0.20″: that is astronomy-engine's five-term nutation,
described under Frames. The mean node and Lilith agree with their definitions
evaluated on ERFA's fundamental arguments to 10⁻⁹″ in the mean-of-date frames
and 5 × 10⁻⁷″ on the J2000.0 and ICRS axes (0.2″ in the true-of-date frames:
the nutation again); the true node is 6.6″ median and 16″ at worst from the
node of the osculating orbit of Horizons's Moon.
