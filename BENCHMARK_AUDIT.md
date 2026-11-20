# Benchmark audit: hostile cases, measured tolerances, known limits

Written 20 November 2026 on the branch `sprint/hn-torture-test`, for the
source at `2.0.0-rc.3` (commit `3962adc` plus this branch's test files; no
file under `src/` is changed). It is the record of one adversarial check,
`tests/adversarial-astronomy.spec.ts`, written to break the package's public
claims: what was thrown at the engine, what it was compared with, what was
measured, and where it stops.

Every measured tolerance and count in the tables and sections below was
measured by that file on this build, is committed in
`tests/fixtures/adversarial-astronomy.measured.json`, and is held by the test:
a run whose figures differ from the committed ones by more than a part in
10,000 (or by more than a millionth where the value is smaller than 0.01)
fails, and so does a run that measures a figure the committed file lacks.
Measured figures are rounded up, never down. Nothing here is taken from
another build, and nothing was compared with Swiss Ephemeris.

Three kinds of figure here are not measurements, and each is marked where it
appears:

- the test's own limits (it fails above 0.1″ for positions, above 1″ for
  angles and cusps, above 36″ for the low-accuracy Sun and above 0.3° for the
  coarse Moon series);
- figures worked out by arithmetic from a measured one (marked "by
  arithmetic" or "derived");
- what was observed on 20 November 2026 and is held by no test in this
  repository: run times, tool versions and the notes on other builds. The three
  run records, each with its `process.versions`, are in
  `docs/evidence/adversarial-astronomy-20261120/`.

## Reproduce it

```sh
npm ci
npm test -- tests/adversarial-astronomy.spec.ts
```

250 tests, no network. Run records (observed, not held by a test): on Node
22.23.3 (ICU 78.3, tzdata 2026c), Node 22.23.4 and Node 24.22.1 (both ICU
78.3, tzdata 2026e), 250 passed, 0 failed, 0 skipped on each, in 13.4 s,
13.0 s and 13.7 s (`run-node-22.23.3.txt`, `run-node-22.23.4.txt` and
`run-node-24.22.1.txt` in `docs/evidence/adversarial-astronomy-20261120/`).

```sh
# Rewrite the measured file after a deliberate change:
ADVERSARIAL_WRITE=1 npm test -- tests/adversarial-astronomy.spec.ts
# Rewrite the case list (needs a host tz database of release 2026f built with backzone):
python3 -I tests/fixtures/build-adversarial-cases.py
```

The whole suite (`npm test`) is CI's to report, and no total is quoted here.
On this machine `scripts/verify-archive-binding.test.mjs` cannot run, because
a `/node_modules` directory lies above every temporary directory; that check
does not read this branch's files.

## What the references are

No expected value comes from the engine's own output.

| Subject | Reference | Span |
| --- | --- | --- |
| Positions | `conformance/vectors/L1-positions.json`: JPL Horizons (DE441), apparent geocentric, carried into the IAU 2006/2000A true ecliptic of date; Mars to Pluto as system barycentres | 240 vectors, 10 bodies at 24 instants, 1851 to 2148 |
| Angles and cusps | `conformance/vectors/L2-houses-angles.json`: ERFA sidereal time and obliquity with separately implemented house constructions | 60 angle vectors and 80 cusp vectors, 1803 to 2194, latitudes 66° S to 66° N with cusps, and 70°, 75°, 80° N, 72°, 78° S where Placidus and Koch do not exist |
| One ingress | NAIF `de440.bsp`, reduced independently (`docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json`) | the Sun at 240° on 2026-11-22 |
| Time zones | The IANA tz database, release 2026f, as zic compiled it with backzone, read with CPython `zoneinfo`; each of the 71 expected offsets was also typed by hand from the zone's history, and the generator stops where the two differ | 1844 to 2024 |
| Time zones, second witness | The host's `Intl` at run time, for readings whose instant falls before 1970, where the engine reads its own shipped history and not `Intl` | 40 of the 48 such readings |
| Coarse cross-checks | Series written out in the test file from Meeus, *Astronomical Algorithms*, 2nd ed.: the low-accuracy Sun (stated accuracy 0.01°), the 24 largest terms of the Moon's longitude, the IAU 2006 mean obliquity with four nutation terms, sidereal time and the ascendant and midheaven formulas, Julian Day Numbers | 1850 to 2099 |
| Invariants | every number finite and in range; the Sun's longitude increasing; whole-sign cusps at 0° of each sign from the ascendant's; opposite cusps 180° apart; the sign of a body equal to its longitude's | every chart computed |

## The 230 cases

All synthetic, listed in `tests/fixtures/adversarial-astronomy.cases.json`.

| Category | Cases | What they are |
| --- | --- | --- |
| `timezone` | 71 | US War Time 1942 to 1945, British Double Summer Time 1941 to 1947 and British Standard Time, Amsterdam Time and the +00:20 zone of 1937 to 1940, India's wartime +06:30 and its older mean times, Samoa 1892 and 2011, Kiritimati 1994, Manila 1844, Alaska 1867, and odd jumps (Monrovia, Kathmandu, Caracas, Pyongyang, Lord Howe, Troll, Almaty on a leap day). 39 ordinary wall times, 17 that did not exist, 15 that happened twice |
| `polar` | 28 | 14 latitudes from 66.5° to both poles, each in Placidus and in whole sign |
| `polar-boundary` | 3 | the latitude where the Placidus fallback begins, in 1850, 2000 and 2099 |
| `ingress` | 28 | the Sun into each of the twelve signs in 2026, and the equinoxes and solstices of 1850, 1900, 2000 and 2099 |
| `leap-day` | 12 | 29 February 1900, 2000, 2100, 1904, 2096, as an instant and as a local date, and 29 February 1900 of the Julian calendar |
| `unknown-time` | 13 | no birth time on 9 days the Moon changes sign, 2 it does not, and 2 the Sun changes sign |
| `extreme-year` | 13 | 1850, 1900, 2099, both ends of the DE440 pack, 1700 and year 2 |
| `malformed` | 62 | 56 inputs that must be refused and 6 unusual ones that must compute sanely |

Result on this build: all 230 behave as the references and the documentation
say. The check found no defect in the engine.

## Measured tolerances

### Positions against JPL Horizons (DE441), 240 vectors, 1851 to 2148

On `2.0.0-rc.3`, the test selected each ephemeris in turn. The table shows
the largest absolute difference in arcseconds for each body across its 24
sampled instants. The measurements are recorded in
`tests/fixtures/adversarial-astronomy.measured.json`.

| Body | Default source (shipped DE440 pack): longitude | latitude | astronomy-engine: longitude | latitude |
| --- | --- | --- | --- | --- |
| Sun | 0.0036 | 0.0002 | 1.31 | 1.64 |
| Moon | 0.0127 | 0.0011 | 3.75 | 1.72 |
| Mercury | 0.0037 | 0.0003 | 7.98 | 6.15 |
| Venus | 0.0038 | 0.0003 | 12.60 | 5.21 |
| Mars | 0.0034 | 0.0003 | 4.44 | 5.28 |
| Jupiter | 0.0038 | 0.0002 | 7.83 | 6.64 |
| Saturn | 0.0035 | 0.0002 | 10.22 | 19.03 |
| Uranus | 0.0038 | 0.0002 | 12.05 | 16.42 |
| Neptune | 0.0035 | 0.0002 | 18.78 | 9.72 |
| Pluto | 0.0037 | 0.0002 | 14.27 | 3.52 |

On the default source all 240 vectors are within 1″, the largest difference
0.0127″ (the Moon). The test fails above 0.1″. On astronomy-engine 48 of the
240 are within 1″, the largest difference 19.03″ (Saturn's latitude); that
column is reported, not held to a limit.

### Angles and house cusps against L2, latitudes to 66°, 1803 to 2194

| Quantity | Vectors | Largest difference, arcseconds |
| --- | --- | --- |
| Ascendant | 60 | 0.0190 |
| Midheaven | 60 | 0.0082 |
| Cusps, all thirteen systems | 70 | 0.0712 |

Per system, the largest cusp difference in arcseconds: whole sign 0, Morinus
0.0061, Placidus 0.0062, Alcabitius 0.0063, equal from the midheaven 0.0066,
Porphyry 0.0067, Vehlow 0.0067, equal 0.0068, meridian 0.0070, Koch 0.0090,
Regiomontanus 0.0121, topocentric 0.0413, Campanus 0.0712. The test fails
above 1″. At the 10 polar vectors where the reference says Placidus and Koch
cusps do not exist, the engine returns whole-sign houses under the name
`whole`, with `polar-fallback`, at all 10.

### Polar latitudes

- The Placidus and Koch fallback begins at latitude 66.5433° for 1850-06-21,
  66.5620° for 2000-06-21 and 66.5714° for 2099-12-21 (bisected to 50 steps,
  printed to 0.0001°). That is 90° less the true obliquity of date as the
  formula in the test gives it, to within 0.039″, the same in the south, and
  the `polar-angles` flag begins at the same latitude.
- Ascendant and midheaven inside the circle, 11 latitudes from 66.6° to
  89.9999° N and S at 6 instants (66 comparisons), against the textbook
  formulas: within 0.36″ and 0.53″. The formula's own nutation series is good
  to about half an arcsecond, so this is a check of convention and quadrant,
  not of the last digit.
- A sweep of 26,208 charts (13 house systems, 21 latitudes from 0° to 90° in
  both hemispheres, 48 instants) returned no NaN and no value outside
  [0°, 360°). 2,304 of them fell back, all Placidus or Koch.

### The Sun's ingresses, 28 cases from 1850 to 2099

These measurements are from `2.0.0-rc.3` and are recorded in
`tests/fixtures/adversarial-astronomy.measured.json`. The ephemeris comparison
uses the same ingress search with each source selected in turn.

| Measurement | Value |
| --- | --- |
| The search's residual (the Sun's longitude at the returned instant, less the target) | at most 0.0011″ (by arithmetic, the Sun covers that in under 0.03 s) |
| Against `de440.bsp`, the one stored reference (2026-11-22T07:23:20.563Z) | 0.010 s |
| Against Meeus's low-accuracy Sun at the returned instants | at most 22.5″ (the test's limit is that formula's stated 0.01°, 36″) |
| The same search on astronomy-engine, less the default source | at most 42.8 s |

At each of the 28 instants the Sun's sign differs one second before and one
second after, and a chart for the minute before and one for the minute after
carry different Sun signs. Hourly over each 12-day window the Sun's longitude
only increased. Dividing the Sun's largest longitude difference of 0.0036″
in the 1851 to 2148 Horizons sample on `2.0.0-rc.3` by the Sun's slowest
motion gives a time equivalent of at most 0.1 s by arithmetic.

### Time zones, 71 wall times

All 71 resolve to the tz database's instant to the second, with the status
(ordinary, did not exist, happened twice) it gives; a skipped time carries
`dst-gap`, a repeated one `dst-fold` and gives the later reading on request.
The engine read 48 of the 71 on its own shipped history: those whose instant
falls before 1970. For 40 of those 48 the host's `Intl` gives the same
offset. The other 8 are Europe/Amsterdam from 1936 to 1940, which the test
reports and does not hold: on 7 of them Node's ICU, which reads Amsterdam as
Brussels, differs (3600 s where the tz database has 4772 s on 1937-06-15, 0 s
where it has 1172 s on 1936-12-01). That is why the engine ships its own
history for those years.

### Unknown birth time, 13 dates

Every chart has `no-time`, `angles` null and `houses` null, with coordinates
and Placidus supplied. `moonSignCandidates` gives two signs and `sign: null`
on the 9 days the Moon changes sign and one sign on the 2 it does not; the
24-term series agrees at both ends of each day, the engine's Moon within
0.033° of it. On the 2 days the Sun changes sign, the crossing lies inside the
local date.

### Extreme years and malformed input

1850, 1900 and 2099 compute on the pack; the Sun is within 15.3″ of the
low-accuracy formula (the test's limit is 36″) and the Moon within 0.0195° of
the coarse series (the test's limit is 0.3°). 2099
carries `delta-t-extrapolated`. Of the 62 malformed cases, 55 throw a
`RangeError` whose message names the problem, 1 throws another `Error` (see
the limits), and 6 are accepted by design and compute sanely.

## Exact boundaries

Each is a case in the fixture.

| Boundary | Inside | Outside |
| --- | --- | --- |
| The DE440 pack | 1790-01-03 and 2209-12-30 compute on `jpl-de440` | 1790-01-01 and 2210-01-02 compute on astronomy-engine, named, with `outside-de440-span` |
| The ephemeris | year 2 computes on astronomy-engine, flagged | 0001-01-01 and 3999-01-01 throw a `RangeError` that names the span |
| Latitude | ±90 accepted | ±90.0001 refused |
| Longitude | ±180 accepted | ±180.0001 refused |
| Placidus and Koch | below 90° less the true obliquity (66.5620° on 2000-06-21) | at and above it: whole-sign houses, `polar-fallback` |
| Leap days | 2000-02-29, 1904-02-29, 2096-02-29, and 1900-02-29 with `calendar: "julian"` | 1900-02-29, 2100-02-29, 1899-02-29, any 30 February |
| A birth instant | ISO 8601 with `Z` or an offset, a `Date`, or epoch milliseconds | no offset, a date with no time (unless `timeKnown: false`), second 60, a 25 hour offset |
| A wall time | `HH:MM`, in an IANA zone | seconds, 24:00, `UTC+5`, an empty zone |
| A wall time before 1970 | after `await prepareLocalTime(date, timeZone)` | without it: `ZoneHistoryNotLoadedError`, never a guess |

## Known limits, stated plainly

1. **Polar accuracy has no stored reference.** The repository's angle and
   cusp vectors stop at 66° of latitude. Inside the polar circles this audit
   has the textbook formula for the ascendant and midheaven (good to about
   0.5″) and, for the cusps of the eleven systems that stay defined there,
   only "finite and in range". Their accuracy there is not measured here.
2. **One ingress has a reference.** The other 27 are held by the search's own
   residual, by invariants and by a formula good to 36″ (by arithmetic, about
   15 minutes of time).
3. **The ascendant inside a polar circle is a convention.** The engine takes
   the point east of the meridian, which jumps by 180° twice a sidereal day;
   the continuous textbook branch is the other common choice. The chart says
   so with `polar-angles`. At exactly ±90° several Regiomontanus cusps
   coincide; that is flagged the same way and nothing more.
4. **`natalChart` alone does not say the Moon's sign is uncertain.** With
   `timeKnown: false` it returns the Moon at the instant given, with
   `no-time`. Whether the Moon (or the Sun) changes sign that day comes from
   `moonSignCandidates`, `moonSignsBetween` or `birthWindow`; a caller that
   skips them can print a Moon sign the birth time would change.
5. **Unknown fields are ignored, apart from the listed near-miss names.**
   `natalChart({ utc: "…Z", timeZone: "America/New_York" })` reads the instant
   as UTC and ignores `timeZone` (pinned by a test here). `utc` must already
   be the resolved instant; `resolveBirth` from `@zodiacs/engine/geo` is what
   reads a wall time.
6. **An unknown body name is refused with the wrong error class.** On the
   default source `searchLongitudeCrossings("Vulcan", …)` throws the DE440
   reader's `De440Error`, not a `RangeError` (case BAD-56). Nothing is
   computed; a caller that catches only `RangeError` will not catch it.
   Fixing it changes `dist/`, so it waits for the next candidate.
7. **From 1970 the zone rules are the host's.** The engine reads `Intl` there
   and flags a host whose data differs from its pinned release at a probe
   (`host-zone-data-differs`). This audit ran on tzdata 2026c and 2026e (the
   run records above); it does not show behaviour on an old one.
8. **After 2027-10-02 there is no measured UT1.** A chart there carries
   `delta-t-extrapolated` (both 2099 cases do). How far the angles of such a
   chart can be off is not measured here.
9. **Ephemeris comparisons cover sampled dates.** On `2.0.0-rc.3`, the
   astronomy-engine position differences above are from the 1851 to 2148
   sample, and the solar ingress differences are from the 1850 to 2099
   cases. The measurements are in
   `tests/fixtures/adversarial-astronomy.measured.json`. The boundary cases
   above identify astronomy-engine as the fallback at the tested dates
   outside the pack's span.
10. **Hosted build.** Observed on 2026-11-20, npm's `latest` was `1.1.0` and
    the hosted MCP server's receipt at zodiacs.org named `@zodiacs/engine`
    `1.1.0-rc.2` with astronomy-engine `2.1.19`. The position and ingress
    measurements above are for the audited `2.0.0-rc.3` source. The site
    repository's `tests/adversarial-astronomy-mcp.spec.ts` runs hostile cases
    against the hosted server.
