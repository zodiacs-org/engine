# Edge-case list (ZOD-97)

Written before any check was run, from the engine's source at `bc0b5a7`
(`origin/main`, 1.1.0-rc.3 carried). It states, for each class, the rule the
engine has today and the cases that test it. Expected values come from an
arbiter (the IANA tzdb 2025c vectors committed under `conformance/vectors/`,
JPL Horizons, a published definition), never from the engine's output.

Nothing in this file is a result. `README.md` has the results.

**About the ids, added after the issue was read.** This list was written
before ZOD-97 could be opened, and its class ids are its own. The tools and
`README.md` report against the issue's tests. The mapping:

| ZOD-97 | classes of this list |
| --- | --- |
| T1, the repeated hour | T1 |
| T2, the spring-forward gap | T2 |
| T3, skipped civil days (Samoa, and a calendar switch) | T3 and T4 |
| T4, the poles | T5 (the tools' ids `T4-...` are the issue's) |
| T5, years after 2050 and outside the span | Y |

Cases added when the tools ran, not in the tables below: Y-k (2075-06-15
00:00 TT), Y-l and Y-m (the span's ends by UTC), T3-j to T3-n (Rome 1582 and
London 1752, in `tools/calendar-switch.mjs`). Cases of this list that were
not run: T5-c (the exact latitude of the switch), T5-d (sidereal time at a
polar site), T5-e (topocentric places). The lines below that say an offset
was "not re-read" or "not re-fetched" are superseded: `tools/tz-arbiter.py`
computed every expected instant of T1 to T3 from tzdata 2025c itself.

## Two facts that shape every time-zone case

1. **The pinned tzdb answers only before 1970.** `src/geo/timezone.ts`
   (`zoneClock`) reads the shipped tzdb 2025c history (`src/tzdb/`) for
   instants before 1970-01-01T00:00Z and the host's `Intl` for every later
   instant. A wall time from 1970 on is therefore resolved with whatever tz
   release the host's ICU carries, and the receipt says so
   (`zone.source: "intl"`, `tzdbVersion` the host's, `dataForm: "host"`). The
   committed conformance run shows this for the 2011 and 2021 cases
   (`conformance/results/zodiacs-engine.json`, `L3-TZ-0029` and `L3-TZ-0035`:
   `"zone": "intl"`). Every case below from 1970 on is a check of the host's
   data against tzdb 2025c as much as of the engine. On a host whose tz release
   differs from 2025c for the date in question the expected values below can
   fail without the engine being wrong about its own rule.
2. **Wall times are whole minutes.** `resolveLocalToUtc` takes `HH:MM` only.

## T1. The repeated hour (a fold)

**Rule under test (current engine, not the ZOD-66 option):** a wall time that
occurs twice resolves to the **earlier** of its two instants, and the result
carries the flag `dst-fold` (`readClock` in `src/geo/timezone.ts`: "a repeated
one takes the earlier instant"; `localResolution.policy.fold` is `"earlier"`).
The earlier instant is the one with the larger offset east: `utc = wall −
max(offsets)`. `jump.kind` is `"fold"` and `jump.cause` is `"dst"`,
`"legal-change"` or `"date-line"`. There is no way to ask for the later pass;
ZOD-66 would add one and is out of scope here.

The flag name says "dst" for a fold of any cause; `jump.cause` carries the
cause.

| id | zone | wall time | arbiter | expected instant (earlier pass) | expected flags |
| --- | --- | --- | --- | --- | --- |
| T1-a | America/New_York | 2021-11-07 01:30 | `L3-TZ-0029`: offsets −14400, −18000 | 2021-11-07T05:30Z | `dst-fold` |
| T1-b | Australia/Sydney | 2020-04-05 02:30 | `L3-TZ-0030`: 39600, 36000 | 2020-04-04T15:30Z | `dst-fold` |
| T1-c | Australia/Lord_Howe | 2021-04-04 01:45 | `L3-TZ-0031`: 39600, 37800 (a half-hour fold) | 2021-04-03T14:45Z | `dst-fold` |
| T1-d | Europe/London | 1941-08-10 02:30 | `L3-TZ-0033` (pinned tzdb, before 1970) | wall − larger offset of the vector | `dst-fold` |
| T1-e | America/Sitka | 1867-10-19 00:00 | `L3-TZ-0036` (a date-line fold of a whole day, in the local mean time era) | wall − larger offset of the vector | `dst-fold`, `lmt` |
| T1-f | America/New_York | 2021-11-07 01:00 | first repeated minute; US rule `Nov Sun>=1 2:00`, same offsets as T1-a | 2021-11-07T05:00Z | `dst-fold` |
| T1-g | America/New_York | 2021-11-07 01:59 | last repeated minute | 2021-11-07T05:59Z | `dst-fold` |
| T1-h | America/New_York | 2021-11-07 00:59 | the minute before the repeated hour | 2021-11-07T04:59Z | none |
| T1-i | America/New_York | 2021-11-07 02:00 | the minute after it | 2021-11-07T07:00Z | none |

Consequence to state plainly wherever this is documented: a birth in the
second pass of the hour (T1-a at 01:30 EST, 06:30Z) is computed one hour early
unless the caller passes the UTC instant. The flag is the only signal.

`src/techniques/returns.ts` refuses a chart flagged `dst-fold` or `dst-gap`
for returns; that is a second rule hanging on the flag and is not tested here.

## T2. The skipped hour (a gap)

**Rule under test:** a wall time that never occurred is moved **forward** by
the size of the jump, and the result carries `dst-gap`. In terms of the
arbiter's data: `utc = wall − (offset in force just before the jump)`, which
reads on the new clock as the wall time plus the jump
(`policy.gap: "shift-forward"`, `gapShiftMinutes` = the jump).

| id | zone | wall time | arbiter | offset before, after (s) | expected instant | expected flags |
| --- | --- | --- | --- | --- | --- | --- |
| T2-a | America/New_York | 2021-03-14 02:30 | `L3-TZ-0028` (nonexistent; note: 02:00 EST becomes 03:00 EDT) | −18000, −14400 | 2021-03-14T07:30Z (03:30 EDT) | `dst-gap` |
| T2-b | Europe/London | 1941-05-04 02:30 | `L3-TZ-0032` (note: BST to BDST) | 3600, 7200 | 1941-05-04T01:30Z | `dst-gap` |
| T2-c | America/Caracas | 2016-05-01 02:40 | `L3-TZ-0034` (note: −04:30 to −04:00, a legal change, a half-hour gap) | −16200, −14400 | 2016-05-01T07:10Z | `dst-gap` |
| T2-d | America/New_York | 2021-03-14 02:00 | first skipped minute | as T2-a | 2021-03-14T07:00Z | `dst-gap` |
| T2-e | America/New_York | 2021-03-14 02:59 | last skipped minute | as T2-a | 2021-03-14T07:59Z | `dst-gap` |
| T2-f | America/New_York | 2021-03-14 01:59 | the minute before the gap | | 2021-03-14T06:59Z | none |
| T2-g | America/New_York | 2021-03-14 03:00 | the minute after it | | 2021-03-14T07:00Z | none |

T2-d and T2-g resolve to the same instant by this rule: 02:00 (skipped) and
03:00 (real) are both 07:00Z. That is the rule, not a defect, and only the
flag tells them apart.

The offsets before and after are in the vectors' notes in words, not as
numbers in `expected`. The numbers above are tzdb's (`northamerica`, `europe`,
`southamerica`), written from the rules as the notes describe them; they were
not re-read from the 2025c tarball in this session.

## T3. A skipped civil day (the date line)

**Rule under test:** the same gap rule, when the jump is a day. The whole
civil date does not exist; a time on it moves forward 24 hours onto the next
date, with `dst-gap`, `jump.cause: "date-line"` (any jump of 12 hours or more
is called that) and `gapShiftMinutes: 1440`.

Samoa: tzdb `australasia`, `Zone Pacific/Apia`: −11:00 with rule WS (summer
time in force, so −10:00 on the clock) until `2011 Dec 29 24:00`, then +13:00
(+14:00 on the clock). The jump is at 2011-12-30T10:00Z, from −36000 s to
+50400 s. (Quoted from the tzdb source as I know it; not re-fetched in this
session. `L3-TZ-0035` commits only "nonexistent".)

| id | zone | wall time | expected instant | reads on the new clock as | expected |
| --- | --- | --- | --- | --- | --- |
| T3-a | Pacific/Apia | 2011-12-30 12:00 | 2011-12-30T22:00Z | 2011-12-31 12:00 +14:00 | `dst-gap`, cause `date-line`, shift 1440 min (`L3-TZ-0035`: nonexistent) |
| T3-b | Pacific/Apia | 2011-12-30 00:00 | 2011-12-30T10:00Z | 2011-12-31 00:00 | `dst-gap` (first skipped minute) |
| T3-c | Pacific/Apia | 2011-12-30 23:59 | 2011-12-31T09:59Z | 2011-12-31 23:59 | `dst-gap` (last skipped minute) |
| T3-d | Pacific/Apia | 2011-12-29 23:59 | 2011-12-30T09:59Z | | none |
| T3-e | Pacific/Apia | 2011-12-31 00:00 | 2011-12-30T10:00Z | | none |
| T3-f | Pacific/Kwajalein | 1993-08-21 12:00 | wall − offset before (−12:00): 1993-08-22T00:00Z | 1993-08-22 12:00 +12:00 | `dst-gap`, cause `date-line` |

A point worth a human decision, not a defect by the current rule: a birth
"on 30 December 2011 in Apia" is a date that did not exist, and the engine
computes a chart for 31 December with a flag named `dst-gap`. A caller that
shows no flags shows a chart for a different civil date than the one typed.

The fold of a whole day (a date lived twice) is T1-e (Sitka 1867) and
`Pacific/Apia` 1892-07-04, which `src/geo/flags.test.ts` already holds.

## T4. A calendar switch (Julian to Gregorian)

**Rule under test:** `resolveLocalToUtc` reads `date` in the calendar the
caller names (`calendar: "gregorian"` by default, or `"julian"`), converts a
Julian date to the proleptic Gregorian one by Julian day number, and never
refuses a date for falling in a country's changeover. With `country`, it
returns a `calendarNote` (`src/geo/calendar.ts`, from
`src/fixtures/gregorian-adoption.json`). So the ten days 1582-10-05 to
1582-10-14 are accepted as Gregorian dates (proleptic), and the note is the
only signal.

Arbiter: calendar arithmetic (the Julian day number), as the committed
`calendar.to-jdn` and `calendar.from-jdn` vectors use.

| id | input | expected |
| --- | --- | --- |
| T4-a | Julian 1582-10-04 | JDN 2299160; Gregorian 1582-10-14 |
| T4-b | Gregorian 1582-10-15 | JDN 2299161, the day after T4-a |
| T4-c | Gregorian 1582-10-10, country IT | accepted; a `calendarNote` saying the date was not in use there |
| T4-d | Julian 1752-09-02 and Gregorian 1752-09-14, country GB | consecutive JDNs (2361221, 2361222) |
| T4-e | Julian 1700-02-29 | valid in the Julian calendar (JDN 2342042); Gregorian 1700-03-11. Gregorian 1700-02-29 is refused |

Existing coverage: `src/geo/calendar.test.ts` walks every day from 1500 to
2199 with two independent counters, and `L3-JDN-*`, `L3-CAL-*` (35 vectors,
arbiter `calendar-arithmetic`). T4 adds nothing those do not already check
except T4-c's wording; it is listed for completeness and reuses them.

## T5. Polar latitudes

**Rules under test:**

1. Placidus and Koch are undefined where |latitude| ≥ 90° − ε (ε the true
   obliquity of the instant, about 23.44°, so from about 66.56°). There the
   engine returns whole-sign cusps, `system: "whole"`, and the flag
   `polar-fallback` (`src/houses.ts`, `POLAR_FALLBACK`). Every other system is
   computed at every latitude short of the pole.
2. The angles never fall back. Inside the polar circle the ascendant is taken
   on the eastern half of the horizon.
3. Latitude ±90 exactly is accepted by validation (`−90 ≤ latitude ≤ 90`);
   what the angles are there is not defined by anything I found in the docs.
4. `@zodiacs/engine/sky` rise and set: where a body does not cross the horizon
   in the window, the result has no rise and no set and carries `never-rises`
   or `never-sets`.

| id | case | arbiter | expected |
| --- | --- | --- | --- |
| T5-a | Placidus at 66.00° N | definition (90° − ε > 66.5°) | Placidus cusps, no flag |
| T5-b | Placidus and Koch at 67.00° N, 78.22° N, 89.99° N, and the same south | definition | whole-sign cusps, `polar-fallback` |
| T5-c | Placidus within 0.01° either side of 90° − ε at one instant | ε from IAU 2006 plus nutation (ERFA, or Horizons's obliquity) | the switch falls at 90° − ε and nowhere else |
| T5-d | MC and ascendant at 78.22° N, 15.63° E (Longyearbyen) | Horizons observer table, local apparent sidereal time (quantity 7) at the site, with the obliquity: tan MC = tan θ / cos ε; the ascendant from the standard formula on the eastern horizon | within the arbiter's precision (Horizons prints sidereal time to about 0.0001 s with `EXTRA_PREC`) |
| T5-e | Topocentric Moon and Sun at the same site | Horizons vectors, `CENTER='coord@399'`, `SITE_COORD='15.63,78.22,0'`, `VEC_CORR='NONE'` | direction difference reported; the Moon's parallax is about a degree, so a site error shows |
| T5-f | Sun rise and set at the same site on 2021-06-21 and 2021-12-21 | Horizons observer table (rise, transit, set markers) or USNO | `never-sets` in June, `never-rises` in December |
| T5-g | Latitude +90 and −90 exactly, every house system | none: a definition question | recorded, not judged; needs a decision on whether to refuse |

Existing coverage: `conformance/vectors/L2-houses-angles.json` has cusps and
angles at 64°, 66°, 70°, 72°, 75°, 78° and 80° (21 inputs at |lat| ≥ 66°),
with its own arbiter (`conformance/arbiters/l2/`). `src/placidus-limit.test.ts`
and `src/houses-regression.test.ts` are regression tests. Nothing committed
checks T5-d to T5-f against Horizons.

## Y. Years after 2050, and the edge of the span

**Rules under test:**

1. `calc()`, `houses()` and the other functions of `@zodiacs/engine/calc`
   compute an instant only if **both its UT1 and its TT** lie in
   `CALC_SPAN` = `REFERENCE_SPAN`: from 1800-01-01T00:00 up to, not
   including, 2200-01-01T00:00. Outside it they return
   `{ status: "refused", reason: "out-of-range" }`.
2. `positions()` and `natalChart()` (the root) compute outside that span, with
   the flag `outside-reference-span`, and throw `RangeError` only outside
   `EPHEMERIS_SPAN` (TT days from J2000.0 within ±730,000: 0001-04-30 to
   3998-09-03).
3. After the last IERS value the engine's ΔT is a model. A position asked
   for by UTC after 2050 carries the model's error; a position asked for by
   TT does not. Any comparison at a TT instant (the ZOD-65 sweep, the cases
   below) measures the ephemeris and the frame, **not** what a user who types
   a civil date in 2150 gets. The Moon moves about 0.55″ per second of time,
   so the ΔT term is the larger one for the Moon well before 2200. It needs
   its own statement (the receipt's time bands), and no figure measured on TT
   should be worded as covering it.

Instants are TT Julian dates. Bodies: the Sun, the Moon, Mercury, Venus, and
Mars to Pluto as system barycentres (Horizons 4 to 9), as every committed
comparison takes them. Arbiter: Horizons vectors, geocentric (`500@399`),
ICRF, `VEC_CORR='NONE'`, `TIME_TYPE='TT'`, against `calc()` with
`frame: "equatorial-icrs"`, `correction: "geometric"`, which needs no frame
model on the arbiter's side. Horizons names its ephemeris in each response;
the committed responses of 2026-09-28 say DE441 for these bodies, and the
Horizons API has no parameter I know of that selects DE440, so "DE440 when
Horizons allows it" is expected to mean DE441 here. DE440 itself is what
the ZOD-65 sweep reads from the kernel.

| id | JD (TT) | date (TT) | expected |
| --- | --- | --- | --- |
| Y-a | 2469807.5 | 2050-01-01 00:00 | computed; difference from Horizons reported |
| Y-b | 2488069.5 | 2100-01-01 00:00 | computed |
| Y-c | 2506331.5 | 2150-01-01 00:00 | computed |
| Y-d | 2524593.0 | 2199-12-31 12:00, the sweep's last instant | computed |
| Y-e | 2524593.49 | 2199-12-31 23:45:36, just inside | computed |
| Y-f | 2524593.5 | 2200-01-01 00:00, the span's end, excluded | `refused`, `out-of-range` |
| Y-g | 2524594.0 | 2200-01-01 12:00 | `refused`, `out-of-range` |
| Y-h | 2378496.5 | 1800-01-01 00:00 TT: TT is inside, UT1 is some seconds before the start | `refused`, `out-of-range` (the ZOD-65 plan relies on this) |
| Y-i | root `positions()` at 2200-01-01T00:00Z and 2250-01-01T00:00Z | | computed, flag `outside-reference-span`; Horizons difference reported, no limit applies |
| Y-j | UTC 2199-12-31T23:59:00Z through `calc()` | UT1 inside, TT = UT1 + ΔT past the end | `refused`: the last minutes of 2199 by the civil clock are refused though the date is inside the documented span |

Y-j is a documentation question: the span is described by dates, and a UTC
instant in the last ΔT seconds of it is refused. Worth one sentence in
`docs/calc.md` at the next candidate, if it is not there already.

Existing coverage after 2050, both against Horizons DE441:

- `docs/evidence/calc-api/horizons/`: the 32 preregistered instants,
  `2378496.5 + 146097 × frac(0.5 + k × 0.6180339887…)`; 11 of them fall after
  2050-01-01 by that formula, worked by hand (k = 2, 4, 7, 10, 12, 15, 20, 23,
  25, 28, 31; k = 18 falls in late 2049), the last on 2188-11-08 (the stop
  time in the committed responses' headers). None is within eleven years of
  the span's end.
- `conformance/vectors/L1-positions.json`: 24 instants from 1851 to 2148, six
  of them after 2050 (JD 2471790, 2477779, 2483778, 2489788, 2497242,
  2505964), apparent places.

So Y-a to Y-c are close to what is committed; Y-d to Y-j (the last decade,
the boundary, and beyond) are not covered by any committed Horizons response.
