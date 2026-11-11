# Edge-case check of the engine (ZOD-97), 2026-11-11

An independent check of the cases most likely to be wrong: the repeated hour
when clocks go back, times and dates that never existed (the spring-forward
hour, Samoa's 2011-12-30, the days a calendar switch skipped), polar
latitudes, and years after 2050 up to and just past the edge of the span
`calc()` computes. With it, a read-only review of the ZOD-65 dense DE440
sweep (`SWEEP-REVIEW.md`).

This is evidence for a review. **It is not an accuracy statement and it
approves no public sentence.** Every figure below is a difference found at
the instants listed, on one build, against the reference named.

## What was checked, on what

- **Engine**: `@zodiacs/engine` 1.1.0-rc.3 built by `npm run build` from
  `bc0b5a7` (`origin/main`), Node v22.23.3, host tz data 2026c
  (`process.versions.tz`).
- **Sky reference**: JPL Horizons, API 1.2, 24 queries sent on 2026-11-11
  between 14:57 and 15:00 UTC, every response kept verbatim in `horizons/`
  with its SHA-256 in `horizons/queries.json`. **Every response names DE441.**
  The Horizons API has no parameter that selects DE440, so ZOD-97's "DE440
  where Horizons allows it" comes out as DE441 here. DE440 itself is what the
  ZOD-65 sweep reads.
- **Civil-time reference**: the IANA time zone database 2025c, the release
  the engine pins (`src/tzdb/tzdb-2025c*.ts`). `tzdata2025c.tar.gz` (SHA-256
  `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957`) and
  `tzcode2025c.tar.gz` (SHA-256
  `697ebe6625444aef5080f58e49d03424bbb52e08bf483d3ddb5acf10cbd15740`) were
  fetched from `https://data.iana.org/time-zones/releases/`; both digests are
  the ones `conformance/sources/l3/tzdata.json` records. `zic` was compiled
  from that tzcode and the main data files compiled with it. Neither tarball
  nor any compiled file is committed.

## Results against ZOD-97's tests

| test | verdict | in one line |
| --- | --- | --- |
| P1 | **pass**, one body at the edge | 120 of 120 longitudes within 30″ of Horizons; Pluto 29.69″ at the end of 2199 |
| P2 | **pass** | no body over 30″, the Sun at most 0.56″, nothing near 60″ |
| P3 | **pass** | 24 queries recorded with parameters, ephemeris and digest; fixtures listed below |
| T1 | **pass** | the earlier pass and `dst-fold`, in four zones, 9 cases |
| T2 | **pass** by the "clearly flags" branch | `dst-gap`, never refused; a UTC is produced, moved forward by the jump |
| T3 | **mixed: Samoa passes, the calendar switch fails** | a Gregorian date inside a skipped range is accepted; no flag, and with no country no signal at all |
| T4 | **mixed: passes to 89.99°, fails at exactly ±90°** | at the poles every system but Placidus and Koch is emitted unflagged; two return collapsed cusps |
| T5 | **pass for `calc()`; the root entry does not refuse** | in-span longitudes within the limit; `calc()` refuses outside; `natalChart()` computes with a flag, `positions()` with none |
| S1 to S3 | see `SWEEP-REVIEW.md` | method followed; results exist and reproduce; nothing of ZOD-65 was modified |

### P1 and P2: apparent ecliptic longitude against Horizons

`tools/horizons-edge.mjs`, results in `results/horizons-edge.json`. Reference:
Horizons observer table, geocentric (`500@399`), quantity 31 (apparent
ecliptic longitude and latitude of date), airless, DE441. Engine: `calc()`
with its defaults (apparent, true ecliptic of date) on TT for the six instants
after 2050, and the root's `natalChart()` on UTC for six settled UTC instants
(Horizons asked in UT). Mars to Pluto are system barycentres (Horizons 4 to
9), as every committed comparison takes them. 12 instants, ten bodies, 120
comparisons. Limit: 30″, and 10″ for the Sun.

Largest longitude difference found per body, arcseconds, not rounded in the
engine's favour (rounded up to 0.01″):

| body | largest | at |
| --- | ---: | --- |
| Sun | 0.56 | 2050-01-01 00:00 TT |
| Moon | 2.94 | 2199-12-31 12:00 TT |
| Mercury | 6.21 | 2021-06-21 12:00 UTC |
| Venus | 7.51 | 2150-01-01 00:00 TT |
| Mars | 3.13 | 2199-12-31 23:45:36 TT |
| Jupiter | 4.36 | 2021-06-21 12:00 UTC |
| Saturn | 4.67 | 2100-01-01 00:00 TT |
| Uranus | 8.28 | 2150-01-01 00:00 TT |
| Neptune | 16.23 | 2011-12-30 22:00 UTC |
| Pluto | **29.69** | 2199-12-31 23:45:36 TT |

All 120 are inside the limit. Three things a reader must know:

1. **Pluto is 0.31″ inside 30″ at the end of the span** (29.684″ at
   2199-12-31 12:00 TT, 29.688″ at 23:45:36 TT), and it grows with the date:
   4.6″ in 2050, 6.3″ in 2075, 8.2″ in 2100, 14.8″ in 2150. P1 passes on
   these instants. It would not pass a day past the span.
2. **This reference is not the sweep's.** Horizons's apparent place includes
   the Sun's light deflection and is on Horizons's own equinox of date (IAU
   1976/1980, as `conformance/arbiters/l1/README.md` describes); the engine's
   has no deflection and uses IAU 2006/2000B. Neither difference was removed.
   The ZOD-65 sweep, on DE440 with an IAU 2006/2000A frame, has Pluto at
   29.19″ at 2199-12-31 12:00 TT, where this check has 29.68″. Half an
   arcsecond of reference choice decides whether Pluto's margin is 0.8″ or
   0.3″.
3. Horizons has no Pluto body-centre ephemeris at these two instants ("No
   ephemeris for target "Pluto" after A.D. 2199-DEC-29", asked for target
   999 on 2026-11-11), so the barycentre is the only Pluto reference there.

The true node is not in P1 and was not compared here. Neptune's difference is
14″ to 16″ at every present-day instant checked.

### T1: the repeated hour

`tools/local-time-rule.mjs` (engine) and `tools/tz-arbiter.py` (IANA),
results in `results/local-time-rule.json` and `results/tz-arbiter.json`. The
arbiter scans every second of UTC within 26 hours of the wall time in the
compiled tzdb 2025c zone and lists the instants that read as that wall time.
Rule under test (current engine; the ZOD-66 later-pass option is not
implemented here): the earlier instant, with `dst-fold`.

| case | IANA: two readings | engine | flags |
| --- | --- | --- | --- |
| America/New_York 2021-11-07 01:30 | 05:30Z (−4 h), 06:30Z (−5 h) | 2021-11-07T05:30Z | `dst-fold` |
| America/New_York 2021-11-07 01:00 and 01:59 | fold | 05:00Z, 05:59Z | `dst-fold` |
| America/New_York 2021-11-07 00:59 and 02:00 | one reading each | 04:59Z, 07:00Z | none |
| Australia/Sydney 2020-04-05 02:30 | fold | 2020-04-04T15:30Z | `dst-fold` |
| Australia/Lord_Howe 2021-04-04 01:45 (half-hour fold) | fold | 2021-04-03T14:45Z | `dst-fold` |
| Europe/London 1941-08-10 02:30 | fold | 1941-08-10T00:30Z | `dst-fold` |
| America/Sitka 1867-10-19 00:00 (a day lived twice) | fold | 1867-10-18T09:01:13Z | `dst-fold`, `lmt` |

9 of 9 pass. The chart computed from the resolved birth carries the flag too
(`results/calendar-switch.json`, `T1-a/chart`). The longitudes at
2021-11-07T05:30Z are within P1 (`T1-a` in `results/horizons-edge.json`).

### T2: the skipped hour

Same tools. The engine does not refuse. It flags the time `dst-gap`
(`jump.kind: "gap"`) and resolves it to the wall time less the offset in
force just before the jump, which is what the arbiter computes from tzdb.

| case | IANA | engine | flags |
| --- | --- | --- | --- |
| America/New_York 2021-03-14 02:30 | no reading; offset before −5 h | 2021-03-14T07:30Z | `dst-gap` |
| America/New_York 2021-03-14 02:00 and 02:59 | no reading | 07:00Z, 07:59Z | `dst-gap` |
| America/New_York 2021-03-14 01:59 and 03:00 | one reading each | 06:59Z, 07:00Z | none |
| Europe/London 1941-05-04 02:30 | no reading | 1941-05-04T01:30Z | `dst-gap` |
| America/Caracas 2016-05-01 02:40 (half-hour gap) | no reading | 2016-05-01T07:10Z | `dst-gap` |

7 of 7 pass under "clearly flags it as nonexistent". Note for the reviewer:
the test also says "does not silently invent a UTC". A UTC is produced, with
the flag; 02:00 (skipped) and 03:00 (real) both give 07:00Z and only the flag
tells them apart.

### T3: skipped civil days

**Samoa: pass.** Pacific/Apia 2011-12-30 has no reading in tzdb at 00:00,
12:00 or 23:59; the engine flags each `dst-gap` with cause `date-line` and
moves it forward 1440 minutes (12:00 gives 2011-12-30T22:00Z, which reads
2011-12-31 12:00 at +14:00). The neighbours are right: 2011-12-29 23:59 is
2011-12-30T09:59Z and 2011-12-31 00:00 is 2011-12-30T10:00Z, no flag.
Pacific/Kwajalein 1993-08-21 behaves the same. 6 of 6 pass. The chart
carries the flag. Whether a chart for the 31st under a flag named `dst-gap`
is the wanted answer to a date that did not exist is a product decision.

**Calendar switch: fail in part.** `tools/calendar-switch.mjs`, results in
`results/calendar-switch.json`; arbiter: Julian day arithmetic written in the
tool and tzdb's local mean time for the zone.

| case | verdict | what the engine does |
| --- | --- | --- |
| Rome, Julian 1582-10-04 and Gregorian 1582-10-15 (valid, consecutive) | pass | consecutive days, 11:10:04Z each for local noon, as the arithmetic gives |
| London, Julian 1752-09-02 and Gregorian 1752-09-14 (valid, consecutive) | pass | consecutive days, 12:01:15Z each |
| Rome, Gregorian 1582-10-05, -10, -14 (never existed), `country: "IT"` | **noted, not flagged** | accepted as a proleptic Gregorian date; `calendarNote.kind: "old-style"`; nothing in `flags` |
| Rome, Gregorian 1582-10-10, no country | **silent** | accepted; no note, no flag |
| London, 1752-09-08 as Julian or Gregorian, `country: "GB"` | **noted, not flagged** | accepted; note `new-style` or `old-style` |
| London, Gregorian 1752-09-08, no country | **silent** | accepted; no note, no flag |

By ZOD-97's rule ("fail: it accepts a date that never existed as a normal
civil date") the silent cases fail. The noted cases depend on reading the
note as a flag: it says which calendar was in use in that country on that
day, it does not say the written date never existed there, and it is on the
resolution, not on the chart (`chartFlags` holds only `lmt` and
`outside-reference-span`). The engine's design is that a date is valid in the
calendar the caller names; the test asks for more than that.

### T4: the poles

Longitudes: `natalChart()` at 78.22° N, 90° N and 90° S give the same
geocentric longitudes as anywhere, all within P1 (30 comparisons).

Polar day and night, against Horizons's elevation of the Sun every 30
minutes of the UTC day (quantity 4, at the site), 4 of 4 pass:

| site, day | Horizons: elevation, lowest to highest | engine (`skyEventsOn`) |
| --- | --- | --- |
| 78.22° N, 2021-06-21 | 11.65° to 35.22° | `never-sets` |
| 78.22° N, 2021-12-21 | −35.22° to −11.66° | `never-rises` |
| 90° N, 2021-06-21 | 23.43° to 23.44° | `never-sets` |
| 90° S, 2021-06-21 | −23.44° to −23.44° | `never-rises` |

Houses, 13 systems at ten latitudes (130 cases, no arbiter: the rule is the
engine's own definition plus "nothing undefined is emitted as ordinary"):

- Placidus and Koch: computed at ±66°, and at ±67°, ±78.22°, ±89.99° and ±90°
  returned as whole-sign cusps with `polar-fallback` on the chart. Pass.
- Every other system: twelve finite cusps at every latitude, no flag.
- **At exactly ±90°, fail.** The ascendant is 0° or 180° at every instant
  tried, the same at both poles (the horizon is the celestial equator there,
  so nothing rises), and it is returned as an ordinary ascendant with no
  flag, for every system. Regiomontanus and Topocentric return collapsed
  cusps there: 180, 180, 180, the IC, 0 five times, the MC, 180, 180 (four
  distinct values among twelve). At 89.99° the Regiomontanus cusps are already within
  0.05° of each other. Nothing is refused or flagged except Placidus and
  Koch.

### T5: after 2050 and the edge of the span

- In span: the six TT instants from 2050 to 2199-12-31 23:45:36 pass P1 for
  all ten bodies (60 comparisons), with Pluto at the edge as above.
- Out of span, `calc()`: refused with `out-of-range` at 2200-01-01 00:00 TT,
  2200-01-01 12:00 TT, 1800-01-01 00:00 TT, 2200-01-01T00:00Z,
  1799-12-31T23:59Z, and also at 2199-12-31T23:59Z, whose UTC is inside the
  span and whose TT is past its end. 12 of 12 pass.
- Out of span, the root entry: **not refused.** `natalChart()` at
  2200-01-01T00:00Z, 2250-01-01T00:00Z and 1799-12-31T23:59Z computes and
  sets `outside-reference-span`. `positions()` computes the same instants and
  returns a bare list of positions with nowhere to carry a flag. By the
  letter of T5 ("fail: out-of-span instants are computed silently")
  `positions()` fails; `natalChart()` is flagged but not refused. This is
  documented behaviour (`src/reference-span.ts`), so it is a decision about
  the rule, not a regression.

## A fact about the tz data that every civil-time result rests on

From 1970 on the engine resolves wall times with the host's `Intl`, not with
the tzdb 2025c it ships (`zoneClock` in `src/geo/timezone.ts`; the results
show `zoneSource: "intl"`, `tzdbVersion: "2026c"` for the 2011 to 2021
cases). The cases above therefore show that this host's 2026c data agrees
with tzdb 2025c at those instants. On another host the same call can give
another answer. Only the 1867, 1941, 1582 and 1752 cases exercise the pinned
data.

## Record of Horizons queries and reused fixtures (P3)

`horizons/queries.json` holds, for each of the 24 queries: the target, the
center (and site), the quantities, the time scale, the instants, the
ephemeris the response names, every parameter, the URL, the time asked, the
byte count and the SHA-256 of the response. The responses are
`horizons/*.txt`, verbatim.

| files | target | center | quantities | time scale | instants |
| --- | --- | --- | --- | --- | --- |
| `ecl-TT-<id>.txt`, ten | 10, 301, 199, 299, 4 to 9 | `500@399` | 31 | TT | JD 2469807.5, 2479103.5, 2488069.5, 2506331.5, 2524593.0, 2524593.49 |
| `ecl-UT-<id>.txt`, ten | the same | `500@399` | 31 | UT | 2011-12-30T22:00Z, 2021-03-14T07:30Z, 2021-06-21T12:00Z, 2021-11-07T05:30Z, 2021-12-21T12:00Z |
| `sun-elevation-*.txt`, four | 10 | `coord@399`, geodetic 15.63° E 78.22° N; 0° 90° N; 0° 90° S | 4 | UT | each UTC day at 30-minute steps |

One further query was made by hand and not kept as a file: target 999
(Pluto's body centre), geocentric, quantity 31, TT, JD 2524593.0 and
2524593.49. Horizons answered with the "No ephemeris for target" line quoted
above and no table.

Committed fixtures reused:

| fixture | arbiter | used for |
| --- | --- | --- |
| `conformance/vectors/L3-time-calendars.json`, `L3-TZ-0028` to `L3-TZ-0036` | IANA tzdb 2025c with backzone, zic 2025c | the nine vector cases of T1 to T3, read by `tools/local-time-rule.mjs` |
| `conformance/sources/l3/tzdata.json` | the release record | the pinned SHA-256 that `tools/tz-arbiter.py` checks the tarball against |

## Files

| file | what it is |
| --- | --- |
| `EDGE-CASES.md` | the case list and the rule for each class, written before anything ran; an addendum maps its ids to the issue's |
| `SWEEP-REVIEW.md` | the ZOD-65 sweep: plan against what ran, the results, findings |
| `tools/local-time-rule.mjs` | T1 to T3 through the engine; no network |
| `tools/tz-arbiter.py` | the IANA side of T1 to T3; needs a zoneinfo directory compiled from tzdata 2025c |
| `tools/calendar-switch.mjs` | T3's calendar cases and the flags a chart carries; no network |
| `tools/horizons-edge.mjs` | P1, P2, T4, T5; `fetch` asks Horizons, `compare` is offline |
| `horizons/` | 24 responses and `queries.json` |
| `results/` | what each tool wrote |

The tools are plain scripts under `docs/`, outside Vitest's pattern; nothing
in CI runs them and nothing in CI reaches the network because of them.

## Rerunning

```sh
npm ci && npm run build
E=docs/evidence/edge-cases-20261111
node $E/tools/local-time-rule.mjs $E/results/local-time-rule.json
node $E/tools/calendar-switch.mjs $E/results/calendar-switch.json
node $E/tools/horizons-edge.mjs compare          # offline, from horizons/
# The IANA arbiter: fetch both 2025c tarballs, check their SHA-256, then
#   printf '...' > version.h; printf '...' > tzdir.h   (what tzcode's Makefile generates)
#   cc -o zic zic.c
#   ./zic -d ZI africa antarctica asia australasia europe northamerica southamerica etcetera backward
python3 $E/tools/tz-arbiter.py ZI tzdata2025c.tar.gz $E/results/local-time-rule.json $E/results/tz-arbiter.json
```

`horizons-edge.mjs fetch` asks Horizons again and overwrites `horizons/`;
Horizons's answers for future dates can change when it changes ephemeris.
