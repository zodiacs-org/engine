# @zodiacs/engine

Pure TypeScript astrology calculations for browsers and Node.js. The package
computes tropical planetary positions, natal charts, transit snapshots,
synastry, secondary progressions, Moon phase, and Saturn-return seasons, and,
in separate entries, Hellenistic timing techniques and sidereal positions and
Jyotish techniques. Its calculations are synchronous; only loading a zone's
history before 1970 (`prepareLocalTime`) and the GeoNames client, both in
`@zodiacs/engine/geo`, are asynchronous. It is ESM-only, has no import-time
side effects, and performs no network request from its core entry point. Its
one runtime side effect is the ΔT it installs in astronomy-engine (see Time
below).

**Release candidate: 0.1.1-rc.15.** Public npm lookups for this package returned
404 on 2026-09-26. The expansion release remains held for review and operator
publication authority. Install the exact candidate tarball supplied with the
review, retaining its SHA-256 receipt:

```sh
pnpm add ./zodiacs-engine-0.1.1-rc.15.tgz
```

The package runs in browsers through a bundler, and in Node.js 20.19.0 or a
later 20.x, or 22.7.0 or later (`"engines": { "node": "^20.19.0 || >=22.7.0" }`).
Its dependency, astronomy-engine 2.1.19, ships ES modules in a package that does
not declare `"type": "module"`. Earlier Node versions load that file as
CommonJS, so a plain Node import of this package fails there with "Named export
'Body' not found"; it did on 18.20.8, 20.18.3, 21.7.3 and 22.6.0. Node 22.7.0
loads it with a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning, which 22.22.2
no longer prints. Bundlers resolve the dependency's `import` condition
themselves and are not affected.

From a source checkout, run `npm ci` and `npm run build`, then
`npm pack --ignore-scripts`. Test the packed file in a clean consumer using
`npm run consumer:smoke -- /absolute/path/to/zodiacs-engine-0.1.1-rc.15.tgz`.
The smoke check
downloads the artifact's public dependencies and TypeScript 5.9.3; its output
records the artifact hash and runtime, and it removes its temporary consumer
directory, which must have no `node_modules` above it (set `TMPDIR` if
needed). A packed candidate is not a published release.

`artifacts/archives.json` records every carried archive: its digest, size, file
count and the commit it was packed from. On the history it is given, CI checks
from git objects alone, never the working tree, that in every commit:
`artifacts/`, where present, is a real directory holding only archives,
receipts, the manifest and its README, as regular files, and no two of its
names, nor another top-level name and `artifacts`, differ only in case; each
archive and receipt holds only its recorded bytes, the one exception, pinned in
the check, being rc.11's first packing in commit `00bdae7`; and the manifest
only ever gains entries. Every recorded version, and `package.json`'s at HEAD,
must be a strict semantic version, with no `v` prefix and no build metadata,
and no two carried versions may be equal as npm compares them. It also checks
that nothing committed under `artifacts/` has been removed; that each archive's
packed `package.json`, README, CHANGELOG and licence files match its source
commit's byte for byte, and that it was committed by that commit or a child of
it; and, once the current version's archive is carried, that a clean worktree
of HEAD rebuilds it byte for byte (`--rebuild-all` also rebuilds every archive
from its source commit). Each rebuild installs that commit's locked
dependencies afresh with `npm ci` and takes nothing from the checkout's
`node_modules`. It cannot detect history rewritten before CI sees it, and it
needs merge commits: a squash or rebase merge drops the source commits it
checks against, and the check then fails.

This candidate reads a chart's instant on a time basis: from 1972 to
2027-10-02 as UTC, with TT from the leap seconds and UT1 from IERS UT1 − UTC,
and otherwise as UT1 with the ΔT model, or on UT1 or TT when `timeScale` says
so (see Time). From 1972 to 2027-10-02 a chart's angles therefore differ from
rc.14's by UT1 − UTC, and its positions by less: in 1,801 synthetic charts the
ascendant by up to 45.0″ and the Moon by up to 0.462″, and in a review's wider
sample by up to 101.03″ and 0.4885″, near 65° S
(`docs/evidence/rc15-20260929/review-sample.json`). Before and after that span
its angles and houses are unchanged. `@zodiacs/engine/geo` reads wall times before 1970 on the
tzdb 2025c history it ships, which `prepareLocalTime` must load first, and can
read a birthplace's own mean time and a Julian date; unknown options and form
keys now throw, and `lmt` means that a local-mean-time clock read the time. Two
entry points are new, `@zodiacs/engine/timing` and `@zodiacs/engine/vedic`, and
the root imports neither. Placidus no longer falls back to whole signs just
below the polar limit. Receipts gain a conventions set that records the time
basis; receipts of the earlier sets, rc.13's and rc.14's included, stay
readable and replay. The package gate is now a budget for each entry point's
import graph and a stated cap for the whole package (CHANGELOG.md). The
ephemeris is still astronomy-engine 2.1.19. See CHANGELOG.md for the release
history and `docs/evidence/rc15-20260929/` for this candidate's checks. Site
adoption is reviewed separately.

## Natal chart in 10 lines

```ts
import { natalChart } from "@zodiacs/engine";

const chart = natalChart({
  utc: "1990-06-15T12:30:00Z",
  latitude: 40.7128,
  longitude: -74.006,
  houseSystem: "whole"
});

console.log(chart.bodies, chart.houses);
```

`utc` must be a resolved instant. If a user enters a local wall time, use the
optional geo entry point so daylight-saving and historical timezone rules are
handled before the chart is computed:

```ts
import { natalChart } from "@zodiacs/engine";
import { resolveBirth } from "@zodiacs/engine/geo";

const birth = resolveBirth({
  date: "1990-06-15",
  time: "08:30",
  timeZone: "America/New_York",
  latitude: 40.7128,
  longitude: -74.006,
  houseSystem: "placidus"
});

const chart = natalChart(birth);
```

For a date before 1970, first `await prepareLocalTime(date, timeZone)`, also
from `@zodiacs/engine/geo`: it loads the zone's history (see Time).

## Compatibility

```ts
import { natalChart, synastry } from "@zodiacs/engine";

const a = natalChart({ utc: "1990-06-15T12:30:00Z" });
const b = natalChart({ utc: "1992-11-03T07:15:00Z" });
const compatibility = synastry(a, b);

console.log(compatibility.top);
console.log(compatibility.elements);
```

## Daily transits

```ts
import { natalChart, transits } from "@zodiacs/engine";

const natal = natalChart({ utc: "1990-06-15T12:30:00Z" });
const today = transits(natal, new Date());

for (const aspect of today.aspects) {
  console.log(aspect.a, aspect.type, aspect.b, aspect.orb);
}
```

## API

- `positions(date)` returns the Sun, Moon, eight planets, and true Moon nodes.
- `natalChart(birth)` adds natal aspects and, when coordinates are present,
  angles and houses in any of thirteen systems (see *House systems*).
- `chartPoints(natal)` returns the mean node, Black Moon Lilith and, with a
  birth time and place, the Vertex, the East Point, the chart's sect and seven
  lots (see *Points*).
- `findConfiguredAspects(bodies, policy)` calculates aspects under an explicit
  policy from `createAspectPolicy`, including minor and custom angles.
- `chartDeclinations(natal)` derives right ascension, declination, parallel
  aspects and out-of-bounds flags on the chart's clock.
- `progressedInstant(birthUtc, target)` maps each elapsed tropical year of
  life to one day after birth.
- `progressedBodies(birthUtc, target)` returns the twelve ordinary position
  rows at that instant (see *Secondary progressions*).
- `transits(natal, date)` returns a sky snapshot and moving-to-natal aspects.
- `synastry(a, b)` returns inter-chart aspects and element/modality balances.
- `moonPhase(date)` returns elongation, illuminated fraction, and phase name.
- `saturnReturn(birth)` returns exact-pass seasons through roughly age 92.
- `findLongitudeCrossings(body, longitude, from, to)` returns the instants a
  body crosses a longitude, and `searchLongitudeCrossings` does the same under
  a sample budget. `@zodiacs/engine/crossings` provides the same solver for a
  longitude function of your own, without the ephemeris.
- `@zodiacs/engine/geo` provides IANA local-time resolution, Julian calendar
  dates and a client for a separately hosted, sharded GeoNames index.
- `@zodiacs/engine/timing` provides profections, firdaria, zodiacal releasing
  and solar arc directions (see `docs/timing-hellenistic.md`).
- `@zodiacs/engine/vedic` provides the sidereal zodiac: ayanamsas, sidereal
  charts, nakshatras, vargas, KP sub-lords and dashas (see `docs/vedic.md`).

### Uniform calculation API

`@zodiacs/engine/calc` offers `calc`, `houses`, `events` and `chart` with one
vocabulary: instants as ISO strings, Dates or `{ jd, scale: "UT" | "TT" }`;
eight frames (the ecliptic or the equator; true or mean of date, J2000.0 or
the ICRS); geocentric, heliocentric, barycentric and topocentric centers; and
apparent, astrometric or geometric positions with distances and speeds.
Results carry bounds and a receipt of convention ids. A measured bound is the
largest difference from JPL Horizons on 32 instants from 1802 to 2188: a
sample maximum, not a limit. An estimated bound names what it rests on. What
this version does not compute comes back as a typed refusal, such as the
sidereal zodiac, or an instant whose UT or TT is outside 1800 to 2200: there
calc has no comparison to take a bound from, while the root entry's functions
still compute such an instant and flag it `outside-reference-span`. With
every default, `calc({ body, time })` is the position `positions()` gives, to
the bit after the same earlier calls: astronomy-engine reuses its last
nutation for any instant within 86 ms of it, a difference under 2 × 10⁻⁷″.
The root entry loads none of it. The reference, with the Swiss Ephemeris flag
mapping and the measured accuracy, is
[docs/calc.md](https://github.com/zodiacs-org/engine/blob/main/docs/calc.md).

Returned longitudes use degrees in `[0, 360)` and positions include sign and degree
annotations. Charts use the tropical ecliptic of date. Planetary positions are
geocentric and corrected for light time and aberration, but not for the Sun's
gravitational deflection; the Moon's series carries neither correction. This
package does not calculate topocentric parallax.

Positions have been compared with an independent ephemeris from 1800-01-01T00:00Z
up to 2200-01-01T00:00Z, exported as `REFERENCE_SPAN`. A chart outside that span
is still computed, and carries the `outside-reference-span` flag. No instant
outside `EPHEMERIS_SPAN`, the years 1 to 3998 that astronomy-engine tabulates,
is computed at all (see *Resolved instant inputs*).

### Secondary progressions

```ts
import {
  progressedInstant, progressedBodies, PROGRESSION_DAYS_PER_YEAR
} from "@zodiacs/engine";

const birthUtc = "1990-06-15T12:30:00Z";
const target = "2026-09-28T00:00:00Z";
console.log(progressedInstant(birthUtc, target));
console.log(progressedBodies(birthUtc, target));
```

The fixed convention is one **365.2422-day tropical year of elapsed life**
for one **86,400,000-millisecond day** after birth. `PROGRESSION_DAYS_PER_YEAR`
exports that constant. Both are counted in UTC milliseconds as JavaScript
`Date` counts them, 86,400,000 to the day with no leap seconds; they are not
ephemeris (TT) days. This uses elapsed instants, not calendar anniversaries,
local-time days or daylight-saving adjustments. Both arguments accept a valid
`Date`, finite epoch-millisecond timestamp, or ISO calendar date/date-time.
Date-only strings mean UTC midnight; date-times require an explicit offset.
Invalid dates and ambiguous local date-times throw `RangeError`. Resolve local
birth times with the optional geo entry first.

Targets before birth are accepted and map backwards with the same signed
formula. That signed extension is not a converse progression, which takes a
target after birth to an instant before it; no converse technique is offered.
Results preserve the site's existing floating-point operation order
and JavaScript `Date` truncation to integer milliseconds. Neither argument is
mutated, and the returned Date and position rows are newly allocated.

`progressedBodies` returns precisely `positions(progressedInstant(...))`:
Sun, Moon, eight planets and the true north/south lunar nodes. **Speed is the
ephemeris longitude rate at the progressed instant, in degrees per day**: a
central difference over ±0.001 day (±86.4 s), and over ±0.25 day for the true
nodes, as in every position row. One progressed day stands for one tropical
year of life, so the same number is the progressed motion in degrees per
365.2422-day year of elapsed life. It is not a rate per lived day. No
progressed angles, houses, extra chart points, solar-arc direction,
progressed aspect policy or natal-receipt extension is implied.

Positions retain the existing ephemeris and its accuracy limits. Reference
coverage applies to the **progressed instant**, not to the target age or date;
call `outsideReferenceSpan(progressedInstant(...))` to check it. These APIs
return an instant or rows, without chart coverage flags. Acceptance of a valid
Date does not establish physical accuracy for that date. Validation includes a
constructed mapping to the existing JPL longitude fixture and a rounded
published date-mapping example; neither establishes predictive validity.
The year convention and published mapping are cited to Juan Estadella,
[*Predictive Astrology*, 3rd ed., pp. 84–85](https://juanestadella.com/Predictive_Astrology_Juan-Estadella_3rd_edition.pdf)
(PDF SHA-256 `bf52656b367ad7d1415a7b021a0a0db3a609bf35c7a40053ff0622e7a3325622`).
The book's own rounding allows up to 4.73 s, hence the 5 s comparison; from the
19.677 h birth time it actually used, the mapping lands within 50 ms of its
unrounded result. See `docs/evidence/rc12-20260928/sources.md`.

### Configurable aspects

```ts
import { createAspectPolicy, findConfiguredAspects } from "@zodiacs/engine";

const policy = createAspectPolicy({
  aspects: [
    { type: "conjunction", orb: 8, luminaryOrb: 10 },
    { type: "quincunx", orb: { applying: 2, separating: 1, stationary: 0.5 } },
    { type: "quintile", orb: 1 }
  ],
  bodyOrbs: { Moon: 5, Pluto: 1 }
});
const analysis = findConfiguredAspects(chart.bodies, policy);
console.log(analysis.policy, analysis.aspects);
```

`createAspectPolicy()` returns an immutable snapshot of the five existing
major-aspect defaults. `CONFIGURED_ASPECT_ANGLES` also names semisextile (30°),
semisquare (45°), quintile (72°), sesquiquadrate (135°), biquintile (144°) and
quincunx (150°). Choose their orbs explicitly; custom identifiers require an
explicit angle. Named angles cannot be redefined.

For each pair, the rule's orb applies, replaced by its `luminaryOrb` when
either body is Sun or Moon. Each selected body's `bodyOrbs` value is an upper
bound: the smallest of the rule allowance and both body caps wins. A number
sets all three motion limits; an object sets each separately. Boundaries are
inclusive. The closest eligible aspect wins, with definition order breaking
ties. Results sort by exact orb, then input-pair order.

`bodies` explicitly selects identifiers; it defaults to Sun, Moon and the
eight planets. Nodes or other points require selection. Labels, here and in
the declination analysis, are exact and case-sensitive strings of 1 to 80
UTF-16 code units (a character outside the Basic Multilingual Plane counts
two). `String.prototype.trim` must leave a label unchanged, which rules out
leading or trailing whitespace, including U+3000 and U+FEFF, and a label may
not contain a C0 control character (U+0000–U+001F) or DEL (U+007F). C1
controls (U+0080–U+009F), zero-width characters such as U+200B, and lone
surrogates are not rejected. Other labels throw `RangeError`.
Positions require finite longitude in `[0,360)` and a finite longitude speed
in degrees/day
on the same time basis. Missing or null speed is rejected, including on
unselected rows. A point whose speed is unknown must not be assigned zero to
make it pass. Equal speeds, or relative speed below the policy threshold,
are stationary; an exact moving aspect is separating. The one-sided motion
at coincident and antipodal longitudes is defined in the returned policy.

Policies and results are deeply frozen. Pass the factory's policy object to
`findConfiguredAspects`; a JSON-deserialized copy must have its input fields
revalidated through the factory. Its schema and conventions describe the
calculation; they are not an authenticated receipt. This analysis does not
replace `chart.aspects`, or configure `synastry` or `transits`.

#### Exact binary arithmetic

Every longitude, speed, angle, orb and threshold is taken as the exact value
of its binary64 double. The signed separation a − b is formed exactly, as an
unrounded sum of doubles, and folded into (−180°, 180°] by exactly 360°. The
orb |separation − angle|, its inclusive comparison with the limit, the choice
of the closest rule, the order of results, and the motion (the signs of the
separation, of the deviation from the angle and of the relative speed, and the
stationary threshold) are all decided on those exact values. There is no
epsilon or widened tolerance. Only the reported `orb` is rounded, once, to the
nearest double with ties to even, so a reported orb never exceeds its
`maximumOrb`. The policy records this as
`conventions.arithmetic: "exact-binary64;reported-orb-rounded-half-even"`.

Binary values are not decimals. At the default 7° square, 97.00000000000001
is not rounded into eligibility. 188.86 − 98.86 is exactly 90 + 2⁻⁴⁶, so a
zero-orb square does not match; 7.6999999999999895 and 359.7 are 8 + 2⁻⁵⁰
apart, just outside the default 8° conjunction. 6.3 and 314 are exactly 45°
plus the double 7.3 apart (6.3 carries 7.3's binary error), so a 7.3°
semisquare orb includes them. Where a decimal boundary matters, use values
that are exact in binary or allow for the difference in the orb.

The historical helper behind `chart.aspects`, `transits`, `synastry` and the
natal receipt keeps its floating-point arithmetic, so its orbs and its
boundary decisions can differ from the configured API's at roundoff scale.

### Declinations and parallels

```ts
import { chartDeclinations, findDeclinationAspects } from "@zodiacs/engine";

const equatorial = chartDeclinations(chart);
console.log(equatorial.utc, equatorial.deltaT, equatorial.trueObliquity);
console.log(equatorial.rows); // lon, lat, ra, dec, outOfBounds, boundMarginArcsec
const tightParallels = findDeclinationAspects(
  chart.bodies, equatorial.trueObliquity, { orb: 0.5, luminaryOrb: 1 }
);
```

`chartDeclinations` accepts a birth input or an existing chart. It rotates
the full ecliptic longitude **and latitude** into the true equator and equinox
of date, using the chart instant and the same pinned or model ΔT. Right
ascension is in **degrees**, not hours, and is `null` where the horizontal
unit-vector magnitude is no greater than `RA_POLE_TOLERANCE`; `raDefined`
then is false. Declination is north-positive in `[-90,90]`.

Out-of-bounds means strictly `abs(dec) > trueObliquity`, without an
uncertainty allowance. Each row also carries `boundMarginArcsec`, the signed
margin `(abs(dec) − trueObliquity) × 3600`: positive beyond the bound, negative
inside it. For every row but the exempt Sun below, `outOfBounds` is exactly
`boundMarginArcsec > 0`. In `chartDeclinations`, `trueObliquity` is
astronomy-engine's true obliquity of date at the chart instant on the chart's
clock: the IAU 2006 mean obliquity plus astronomy-engine's five-term truncation
of the IAU 2000B nutation in obliquity. That is not the full IAU 2000B value:
it differed from ERFA's `obl06` plus `nut00b` by up to 0.086″ at 20,000
instants from 1850 to 2150. The pure functions use the obliquity they are given.

The flag describes the ephemeris's position, and it agrees with the real sky
only where the margin exceeds the ephemeris's error in declination. Against
JPL's DE440s at those 20,000 instants, the largest declination errors were:

| Body | Largest error | Body | Largest error |
| --- | ---: | --- | ---: |
| Sun | 2.7″ | Jupiter | 16.1″ |
| Moon | 3.4″ | Saturn | 21.6″ |
| Mercury | 12.2″ | Uranus | 19.3″ |
| Venus | 14.7″ | Neptune | 15.4″ |
| Mars | 14.5″ | Pluto | 4.6″ |

These are sample maxima, not bounds, and they grow outside `REFERENCE_SPAN`.
Within them the flag can be wrong either way: at 2022-10-22T08:11:10.756Z the
engine puts Mars 1.57″ inside the bound, where DE440s has it 1.05″ beyond.
Treat a flag as settled only when `abs(boundMarginArcsec)` exceeds the body's
figure.

The Sun's exemption is a convention. At a solstice the size of the Sun's
declination differs from the true obliquity by exactly its ecliptic latitude,
which stays within about 1.2″ of zero: computed with ERFA (IAU 2006/2000A), the
real Sun is beyond the bound at 402 of the 800 solstices from 1800 to 2199, by
up to 1.09″. The engine's solar declination is off by more than that, up to
2.7″ in the comparison above, and its solar latitude drifts from −1.1″ on
average in the 1800s to +1.1″ in the 2100s, so its margin at a solstice has the
real sign at only 404 of those 800. Far from J2000 the drift grows to tens of
arcseconds, −68.3″ at the June solstice of year 2 and +25.8″ at that of 3902,
while the real Sun's latitude stays within about 1.2″. So `chartDeclinations`
never flags the chart's own Sun as out of bounds, at any latitude; its margin
is still reported, and says nothing about the real Sun. (It is the Sun of the
chart given, which is not recomputed.) `declinationsForBodies` exempts a
supplied row labelled exactly `Sun` only while its ecliptic latitude is within
`SUN_BOUND_LATITUDE` (0.001°, 3.6″); a `Sun` row with a larger latitude, such
as a synthetic input, and every other row keep the strict rule.

Every supplied body is eligible, including nodes; filter the input for a
smaller set. Parallel/contraparallel matches choose the smaller of
`abs(decA-decB)` and `abs(decA+decB)`, with parallel winning an exact tie.
Orbs are inclusive, defaulting to 1° or 1.5° when Sun or Moon is involved.
As with configured aspects, each declination double is taken as exact: the
choice, the inclusive orb test and the order are decided without rounding, and
only the reported `orb` is rounded, once. The longitude `separation` is the
short way round between the two supplied longitudes, reduced exactly modulo
360 whatever their size, and rounded once: −0.1 and 0.2 are
0.30000000000000004 apart, the exact sum of the doubles 0.1 and 0.2, rounded.
13.3 and 12.3 are exactly 1° apart and match at orb 1; 8.3 and 7.3
(1 + 2⁻⁵⁰ apart), and 1.1 and 0.1 (1 + 3·2⁻⁵⁵), do not. Body labels follow
the configured-aspect rule. `eclipticToEquatorial` and `declinationsForBodies`
expose the same geometry with an explicitly supplied obliquity.

These are derived coordinates of the existing ephemeris, with its existing
corrections and limits. They do not establish the programme's 0.01″ physical
declination target against Swiss Ephemeris. The current natal receipt does
not include this analysis; the result states that scope explicitly.

### House systems

`houseSystem` takes one of thirteen systems. Each is the definition Swiss
Ephemeris uses, and every one agrees with Swiss's `swe_houses_armc` to within
0.0001″ given the same sidereal time, latitude and obliquity (Placidus, which
iterates, to 0.01″).

| `houseSystem` | System | Cusps |
| --- | --- | --- |
| `"whole"` | Whole sign | Each sign is a house, the first the ascendant's. The default. |
| `"placidus"` | Placidus | Semi-arcs of each degree in thirds. |
| `"koch"` | Koch | Ascendants at thirds of the midheaven degree's semi-arc. |
| `"porphyry"` | Porphyry | Each quadrant between the angles in three equal arcs of longitude. |
| `"regiomontanus"` | Regiomontanus | Circles through the horizon's north and south points, every 30° of the equator. |
| `"campanus"` | Campanus | The same circles, every 30° of the prime vertical. |
| `"topocentric"` | Topocentric (Polich–Page) | Regiomontanus's ascensions, with pole heights at a third and two thirds of the latitude's tangent. |
| `"alcabitius"` | Alcabitius | The ascendant's semi-arcs in thirds on the equator, along hour circles. |
| `"equal"` | Equal | 30° each from the ascendant. |
| `"equal-mc"` | Equal from the midheaven | 30° each, the 10th from the midheaven; the same at every latitude. |
| `"vehlow"` | Vehlow | 30° each, with the ascendant in the middle of the first. |
| `"meridian"` | Meridian (axial rotation) | Right ascensions every 30° from the midheaven's; the 1st cusp is the equatorial ascendant. |
| `"morinus"` | Morinus | The equator every 30° from the midheaven's right ascension, carried to the ecliptic through its poles. |

Placidus and Koch are undefined in polar regions, where |latitude| ≥ 90° − ε,
with ε the true obliquity of date (about 66.56° today). There the engine falls
back to whole-sign houses, exported as `POLAR_FALLBACK` (and, as before,
`PLACIDUS_POLAR_FALLBACK`), and adds `polar-fallback` to the chart flags. Swiss
Ephemeris falls back to Porphyry instead. Every other system is defined at
every latitude where the angles are. Inside the polar circle, where the
ascendant is taken on the eastern half of the horizon, Regiomontanus, Campanus
and Topocentric cusps turn with it, so their 10th cusp is then the lower
meridian, as in Swiss Ephemeris. When the birth time is unknown, pass a
conventional UTC instant with `timeKnown: false`; angles and houses remain
absent and the chart carries the `no-time` flag.

### Points

`chartPoints(natal)` takes a birth or a chart and returns `{ sect, points }`.
Each point has a longitude, a latitude, a sign and a degree, like a body.

| Point | Definition |
| --- | --- |
| Mean Node, Mean South Node | The Moon's mean ascending node Ω, and its opposite. |
| Black Moon Lilith | The mean lunar apogee: the point of the mean orbit 180° from the mean perigee, with the orbit's latitude. |
| Vertex | Where the prime vertical meets the ecliptic in the west. |
| East Point | The equatorial ascendant: the ecliptic point at right ascension RAMC + 90°. |
| Lots of Fortune, Spirit, Eros, Necessity, Courage, Victory and Nemesis | Paulus Alexandrinus's seven lots, reversed by night. |

The mean node and Black Moon Lilith come from the Moon's mean elements: the
IERS Conventions' fundamental arguments (Simon et al. 1994), with a mean
inclination of 5.1453964°. The nutation in longitude puts them on the true
equinox of date, like every other longitude here. They are within 0.7″ of Swiss
Ephemeris's `SE_MEAN_NODE` and `SE_MEAN_APOG` from 1800 to 2199. Both carry a
speed in degrees per day.

Every chart gets those three. The Vertex, the East Point, the sect and the
lots need a birth time and place.

- The Vertex and the East Point come from the instant and the place, not from a
  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,
  they agree with its `swe_houses_armc` to within 0.00001″.
- The sect is day when the Sun is between the descendant and the ascendant
  through the midheaven.
- The lots use the chart's own ascendant and bodies. Each is the ascendant plus
  the arc between two points, taken as Paulus gives it by day and reversed by
  night. Ptolemy's Fortune, which does not reverse, is `asc + moon − sun`.

`antiscion`, `contraAntiscion` and `midpoint` work on any two longitudes.
`meanNodeLongitude`, `meanApogee`, `lunarMeanArguments`, `hellenisticLots` and
`sectOf` expose the calculations underneath. The osculating ("true") Lilith is
not offered: from astronomy-engine's lunar series it would be several
arcminutes from Swiss's.

### Input flag compatibility

Public birth inputs accept all six `ChartFlag` values. Supply an array with at
most 64 entries; entries must be known string values in ordinary data slots.
Repeated values collapse in first-occurrence order. Unknown strings, sparse
slots, accessor slots, non-array iterables and simultaneous `dst-gap`/`dst-fold`
claims reject with a `RangeError` that does not include supplied flag values.

`dst-gap`, `dst-fold` and `lmt` remain caller assertions: a UTC instant alone
cannot verify a historical local-time resolution. The geo resolver sets
`dst-gap` or `dst-fold` for a skipped or repeated wall time of any cause (the
names are kept; its `jump.cause` gives the cause) and `lmt` when a local mean
time clock read it. `no-time`,
`polar-fallback` and `outside-reference-span` may be echoed for compatibility,
but must agree with the calculation. Set `timeKnown: false` for unknown time; a flag never overrides that
setting. A fallback assertion requires the actual requested Placidus calculation
to produce whole-sign houses, which it does only inside the polar circle.

`natalChart` stores only distinct time-resolution assertions in `chart.input.flags`
and derives result flags once. This is canonical semantic input, not a lossless
record of the submitted flag array. Correct derived echoes therefore work with
the existing draft receipt creator and replay; the receipt schema is unchanged.

When `transits`, `synastry` or `saturnReturn` receive a precomputed `Chart`, they
check flag consistency with its supplied time/settings and house/angle presence.
Contradictory or missing result claims reject. They do not recompute or verify
the supplied astronomical result. An already canonical Chart retains object
identity; compatible duplicate/derived echoes produce a shallow metadata copy,
preserving numerical arrays and engine version. These checks happen at call
time and do not freeze caller-owned objects.

Ordinary Saturn-return inputs require no extra natal calculation. A raw birth
input that explicitly asserts `polar-fallback` requires one natal calculation to
check that assertion before the return scan. A supplied Chart instead receives
the consistency check above, without natal recomputation. Public birth and
`resolveBirth` settings are validated once and the captured scalar values are
used for calculation/resolution. Explicit null settings or local time are
invalid. These boundaries do not sandbox same-realm getters, proxies or other
caller-supplied executable code. The unsupported `/internal` computation API is
unchanged.

The shared engine selects the eastern horizon intersection before assembling
houses, including in either polar hemisphere. At exact geographic poles no
point physically rises; at ecliptic/horizon coincidence an ascendant is not
unique. Those degenerate configurations are outside the verified angle scope.
Near tangencies the selected axis can change by 180 degrees. Placidus uses a
bounded iteration and, where it does not settle, bisection on each cusp's
bracket, which cannot fail outside the polar circle; it never returns the last
unconverged iterate. Near the polar limit a cusp carries the rounding of asin
near ±1: up to 6.5e-7° one unit in the last place below it.

See [CHANGELOG.md](CHANGELOG.md) for candidate changes. Reference coverage and
known limits are recorded in the site [platform evidence ledger](https://github.com/zodiacs-org/site/blob/75ae549c6bcedba67ccce7d467e1b54af0c83070/docs/platform/EVIDENCE.md).
The date parser's representable range is not a claim of astronomical accuracy
across that range. Reference cases are finite; broader numerical scope review
remains a release gate.

### Longitude crossings

`findLongitudeCrossings(body, longitude, from, to, stepDays = 5)` returns every
instant in the half-open window (from, to] when `body` is exactly at
`longitude`, in time order, each marked `retrograde` when the body was moving
backward through it. A root exactly at `from` belongs to the window that ends
there and is not returned; a root exactly at `to` is. There is no sample
budget, and the call does not throw for the size of a search: its work grows
with (to − from) / step.

`searchLongitudeCrossings(body, longitude, from, to, { stepDays, maxSamples })`
makes the same search under a budget of ephemeris evaluations, root
refinements included. It returns `{ status: "complete", crossings, samples }`,
or `{ status: "refused", reason: "sample-budget", samples, maxSamples,
crossings: [] }`. It refuses before any sampling when the coarse scan alone
needs more than `maxSamples`, and otherwise when a refinement would pass the
budget. It never returns part of a result and never throws for the budget.
Without `maxSamples` there is no limit.

Both run the one solver, exported by `@zodiacs/engine/crossings` as
`findLongitudeCrossingsWith(longitudeAt, body, longitude, from, to, stepDays)`
and `searchLongitudeCrossingsWith(longitudeAt, body, longitude, from, to,
options)`. It takes the longitude function as its first argument and imports
no ephemeris, so that entry point carries none; the root entry point exports
the same two functions.

The solver samples `from`, every `stepDays` after it and `to`, and bisects each
sign change of the offset from the target 24 times, to the step divided by
2^24: 25.7 ms at 5 days, 1.3 ms at a quarter day. A sample exactly on the
target is returned once, at that sample, with the direction of the sample
before it; a sampled plateau on the target is returned where it begins.
Offsets of 90° or more on either side of a step are the far side of the circle,
not a crossing.

A fixed step alone loses both crossings when a station falls between two
samples just past the target: at 5 days, a Saturn station within 0.0103° of
it, or a Jupiter station within 0.0205°. Wherever the sampled motion turns
without the offset changing sign, and the turning sample is within reach of the
local curvature, the solver finds the extremum by golden-section search. It
bisects both crossings when the extremum passes the target, and returns one,
as direct, when it only touches. A turn in the first or last step is found by
a probe one minute inside the window, and no sample falls outside [from, to].
Crossings less than a second apart are returned once. The solver assumes
smooth motion with at most one station in two steps. That holds for the Sun,
the Moon and the planets at the steps the site scans with, from a quarter day
for the Moon to 5 days for Saturn to Pluto, but not for the wobbling true
node. It is tested on synthetic and real stations, not proven complete.

Invalid input throws `RangeError` before any sampling: an invalid `Date`,
`from` after `to`, a non-finite longitude, a step that is not positive or is
shorter than a millisecond, or a `maxSamples` that is not a positive integer or
`Infinity`. A non-finite longitude from the ephemeris throws `RangeError` too.

### Resolved instant inputs

`DateInput` values passed to the calculation APIs accept a valid `Date`, a finite
epoch-millisecond timestamp representable by JavaScript `Date`, or these ISO
string forms:

- `YYYY-MM-DD`, interpreted as midnight UTC using the proleptic Gregorian
  calendar. This convenience does not infer a birthplace's local midnight.
- `YYYY-MM-DDTHH:mm[:ss[.sss]]Z`, or the same date-time with an explicit
  `+HH:mm` or `-HH:mm` offset. Fractional seconds, when supplied, have one to
  three digits. ISO expanded years use a sign and six digits, such as
  `-000001-01-01T00:00:00Z`; years `0000`–`0099` are not shifted to 1900–1999.

Invalid calendar dates, rollovers such as February 30 or `24:00`, leap seconds,
unresolved local date-times, locale-specific strings, excessive fractional
precision, non-finite values, and other input types throw `RangeError` before
calculation. Existing `Date` values cannot reveal whether a caller previously
normalized an invalid date; pass the original string when validation is needed.
`Date` and numeric inputs retain JavaScript's millisecond resolution.

`Z`, `+00:00`, and `-00:00` identify the same UTC instant. Results normalize to
`Date` and do not retain the original offset or local-zone provenance; in
particular, [RFC 3339's `-00:00` convention](https://www.rfc-editor.org/rfc/rfc3339#section-4.3)
indicating an unknown local offset is not
preserved. Resolve daylight-saving gaps/folds and historical local-time rules
before calling these APIs. Accepted date syntax is not an accuracy guarantee
outside the documented reference coverage.

Every valid `Date` is accepted as input, but the ephemeris is evaluated only
inside `EPHEMERIS_SPAN`: Terrestrial Time from 0001-04-30T12:00 to
3998-09-03T12:00, J2000 ± 730,000 days, the years astronomy-engine tabulates.
Its source says of instants beyond them: "The target time is outside the year
range 0000..4000. Calculate it by crawling backward from 0000 or forward from
4000. FIXFIXFIX - This is super slow." rc.13 still evaluated them: a position
at year 30,000 took more than 20 s and put the Sun 29° off the ecliptic. Now
positions, and the charts, transits, synastry, progressions, declinations,
points, crossings and returns built on them, throw `RangeError` at once for
such an instant, with a message that names the span. The check is on
Terrestrial Time, and it covers the speed samples ±0.001 day around the
instant (±0.25 day for the true nodes), so an instant must lie six hours
inside. On the model ΔT clock every instant from 0001-05-01T00:00Z to
3998-09-02T00:00Z qualifies; a pinned `deltaT` moves TT and is checked as
given. astronomy-engine reports any other failure by throwing a string, which
reaches the caller as a `RangeError` whose `cause` is the original value.

Inside the span, results are computed but not verified: accuracy was compared
only within `REFERENCE_SPAN`, and it falls away from it. The Sun's ecliptic
latitude, which in reality stays within about 1.2″ of zero, comes out as
−9.9″ on 1000-06-01, +13.3″ on 3000-06-01 and −57.5″ on 3998-09-02.

Birth settings accept only a `houseSystem` from the thirteen above, a boolean
`timeKnown` and a `timeScale` (see Time). Omitting them defaults to `"whole"`,
`true` and `"utc"`; explicit `null` and other unsupported values throw
`RangeError`, including when coordinates are absent. Latitude and longitude
must be supplied together as finite numbers within `[-90, 90]` and
`[-180, 180]` respectively.

## Time

A chart reads the Earth's rotation (sidereal time, the angles) on UT1 and the
planets on Terrestrial Time (TT). `utc` is on UTC unless `timeScale` says
`"ut1"` or `"tt"`; any other value throws `RangeError`.

- From 1972 to 2027-10-02, TT = UTC + (TAI − UTC) + 32.184 s, with TAI − UTC
  from the IERS leap-second list of 2026-07-06 (it expires 2027-06-28; its
  last value is carried after that), and UT1 = UTC + (UT1 − UTC) from IERS:
  the EOP 20 C04 series in 1972, then `finals2000A.all` of 2026-09-24,
  observed then predicted. ΔT = TT − UT1 is then reported with
  `model: "iers-utc/1"`.
- Before 1972 and after that table the instant is read as UT1, and TT = UT1 +
  ΔT from the engine's model `zodiacs-deltat/1`: Stephenson, Morrison &
  Hohenkerk 2016 (CC BY 4.0) up to 1941, then USNO and IERS observations,
  Bulletin A's predictions and a damped extrapolation, with a 1-σ band. After
  the table UT1 − UTC is taken as 0 within ±0.9 s.
- `deltaT` (seconds) in a birth input pins ΔT; the chart reports
  `model: "pinned"`.

`chart.deltaT` is `{ seconds, sigma, model, table, tableDigest, segment }`, and
`chart.timeScale` says how the instant became UT1 and TT (`{ input, basis,
ut1MinusUtc, leapSeconds }`). `@zodiacs/engine/deltat` exports the model with
no dependencies. astronomy-engine keeps one ΔT for its whole module; every
engine call leaves the model installed, and code that calls astronomy-engine
directly should install it too: `SetDeltaTFunction(deltaT)`.

`@zodiacs/engine/geo` reads wall times before 1970 on the tzdb 2025c history
with backzone, shipped as 16 lazily imported chunks: `prepareLocalTime(date,
timeZone)` loads the one a zone needs, and a wall time before 1970 throws until
it has. From 1970 the host's Intl answers. A `longitude` reads a time in a
zone's local mean time era on the birthplace's own mean time; `calendar:
"julian"` takes an Old Style date, and `country` adds a note from the country's
Gregorian adoption. Each resolution names the tzdb version, the transition
behind the offset and its cause (`dst`, `legal-change` or `date-line`).
[docs/time.md](docs/time.md) describes every field.

## Accuracy and licensing

The ephemeris is powered by the MIT-licensed `astronomy-engine`. Tests compare
modern and historical positions with public JPL Horizons vectors and exercise
astronomical and geometric invariants. See [LICENSING.md](LICENSING.md) for the
full provenance audit and the explicit Swiss Ephemeris exclusion.

The package's licence expression is `MIT AND CC-BY-4.0`: the code is MIT
([LICENSE](LICENSE)), and the 32 values of Stephenson, Morrison & Hohenkerk's
Table S15 in the package's ΔT module (`@zodiacs/engine/deltat`, which the build
places in a shared chunk under `dist/` that `dist/deltat.js` re-exports) are
CC BY 4.0, attributed in [NOTICE](NOTICE).

The npm package contains no place database. It carries tzdb 2025c's zone
histories before 1970, the IERS leap-second list, an IERS UT1 − UTC table, a
table of Gregorian adoption dates from public-domain sources, and 22 catalogue
values for the stars of the Vedic ayanamsas; [NOTICE](NOTICE) records their
sources and the GeoNames attribution, and downstream users should retain it.
[LICENSING.md](LICENSING.md) gives the terms of each.

## Internal site entry points

`@zodiacs/engine/internal` and `@zodiacs/engine/internal/math` are private
compatibility boundaries for Zodiacs.org. They let the site consume the exact
package implementation while keeping its scanner-oriented functions and lazy
bundle boundary intact. They are not covered by semantic-versioning guarantees;
third-party code must use the documented entry points: the root, `/geo`,
`/timing`, `/vedic`, `/receipt`, `/crossings` and `/deltat`.

## GeoNames request recovery

The optional geo client shares in-flight requests and keeps validated
index/shards. A rejected fetch, unsuccessful HTTP response or JSON parsing
failure is returned to current callers with its original rejection reason. A
later explicit preload/search call may retry the failed resource. There is no
automatic retry loop, backoff or per-caller cancellation API. A custom fetch may
bind its own abort signal; the client does not reset that signal.

Parseable JSON must match the compact v1 asset format: index string tables and
`0`/`a`–`z` shard keys, with eight-field city rows containing valid table indices,
integer coordinates in hundredths of a degree (including ±90°/±180°), and
nonnegative integer populations. An invalid index or shard rejects with
`TypeError("Invalid GeoNames index data.")` or
`TypeError("Invalid GeoNames shard data.")` and is evicted for a later explicit
retry. The entire requested shard is checked before returning any results;
other successful caches remain available. Empty region/country labels and
Unicode names are retained. Timezone identifiers are checked as nonempty strings,
without requiring support in the current host's timezone database. Validation
does not authenticate place facts, check that the advertised count equals all
shards, or refresh a previously valid index when a shard changes independently.
In-range indices in a shard from another dataset generation can silently select
the wrong cached country or timezone; this v1 format has no content or generation
identity to detect that mismatch. Serve matching index/shards together.
`preload()` returns metadata snapshots: its arrays do not expose mutable cache
state.

These checks apply to parsed JSON data. A custom fetch implementation is trusted
code, not a sandbox: accessors or iterators it supplies in non-JSON objects may
execute during validation.

## Draft natal receipts and local portability

The optional `@zodiacs/engine/receipt` entry point is a Zodiacs draft for one
natal-chart envelope. It preserves full numerical precision and separates a
requested house system from the actual computed system. It does not calculate
an ephemeris, fetch an imported URL, execute extensions, save a profile or change
account sync v1. A valid envelope is a structurally checked claim, not an
attestation that its positions or provenance are authentic.

```ts
import { natalChart } from "@zodiacs/engine";
import {
  createNatalEnvelope,
  serializeNatalEnvelope,
  parseNatalEnvelope,
  natalReplayInput,
  redactNatalEnvelope
} from "@zodiacs/engine/receipt";

const chart = natalChart({
  utc: "2001-12-21T09:00:00Z",
  latitude: 78.2232,
  longitude: 15.6267,
  houseSystem: "placidus"
});
const encoded = serializeNatalEnvelope(createNatalEnvelope(chart));
const decoded = parseNatalEnvelope(encoded);
if (decoded.ok) {
  // Replay still requests Placidus even though this result used whole-sign.
  const replay = natalChart(natalReplayInput(decoded.envelope));
  console.log(replay.houses?.system);
  console.log(redactNatalEnvelope(decoded.envelope));
}
```

Capture original time-resolution and package/runtime facts while they are
available. Unknown birth time does not establish a noon convention: an explicit
08:30 reference remains 08:30, while unavailable historical context remains
unavailable. Imported package hashes and version strings are untrusted claims.
Pass the original validated ISO string as `sourceInstant` when available;
normalization alone cannot recover its original offset spelling. Captured local
resolution is checked arithmetically, without consulting the current timezone
database or authenticating the historical claim.

Receipts from 0.1.1-rc.8 on name the ephemeris that computed them, as
`receipt.engine.ephemeris` (`{ name: "astronomy-engine", version: "2.1.19" }`,
exported as `EPHEMERIS`); the dependency is pinned to that exact version, and
a current receipt without it is refused. Their conventions say what the
positions are corrected for (`aberrated-geocentric-ecliptic-of-date;no-deflection`)
and that the Moon has neither correction. Receipts from rc.3 to rc.7 are still
read, each under the conventions its engine recorded, and a set is accepted
only from the engine versions that wrote it.

The current set, written from 0.1.1-rc.15 on, also records the instant's scale
(`receipt.timeScale`) and its time basis (`result.timeScale`), and a local
resolution records the calendar, the tzdb version and form, the clock, the
transition behind the offset and any birthplace mean time, each checked
against the offsets and flags. Receipts under the rc.8 set (rc.8 to rc.14),
which read the instant as UT1, stay readable and replay as UTC requests (see
docs/time.md). A receipt's engine, ephemeris and package versions must be
SemVer 2.0.0 versions. The codec accepts an earlier set only under the versions
that wrote it, and compares the engine's version in SemVer order with
0.1.1-rc.15, which brought the current set, and with the releases that brought
each house system: a receipt of the current set that names a version before
0.1.1-rc.15, such as 0.1.1-rc.14.1 or 0.1.1-beta, is refused.

`natalReplayInput` recovers the recorded request. It does not select or install
the original engine. Recalculation with another engine, ephemeris dependency or
runtime may differ; verify trusted artifact identity and runtime provenance
before claiming reproducible results. A matching imported version label alone
is insufficient. Displaying the stored result does not require recalculation.

The redacted diagnostic uses fixed fields; it does not copy birth details,
numerical positions, arbitrary metadata, extensions, raw parser errors or
stable hashes. Redacted does not mean anonymous.

Imports are limited to one chart and 64 KiB of UTF-8 JSON, with bounded depth,
node count and data arrays. Unknown required features or schema versions are
rejected explicitly. Optional data belongs in bounded extensions and is never
executed or rendered by this codec. Keep encrypted account payloads and legacy
positions-only links in their existing formats until an explicit adapter and
safe downgrade policy are reviewed. Do not infer a legacy user's requested
house system from a stored fallback result.
