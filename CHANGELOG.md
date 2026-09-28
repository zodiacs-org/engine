# Engine changelog

## Unreleased

- `@zodiacs/engine/calc`, a new entry point. `calc({ body, time, frame,
  center, zodiac, flags })` returns `{ lon, lat, dist, speeds, cartesian,
  bounds, receipt }`; `houses()`, `events()` and `chart()` give the engine's
  houses, longitude crossings and natal charts in the same vocabulary. Eight
  frames, four centers and three corrections; speeds in every coordinate,
  analytic for geometric positions on fixed axes and central differences
  otherwise; bounds measured against JPL Horizons on 32 instants (sample
  maxima, not limits), the barycentric Sun's derived from the barycentre's
  error; receipts of convention ids; and typed refusals:
  `not-in-this-version` (the sidereal zodiac, light deflection),
  `unsupported-combination`, `out-of-range` and `sample-budget`. calc
  refuses an instant whose UT or TT is outside 1800 to 2200, where it has no
  comparison to take a bound from; the root entry's functions compute such
  instants as before, with the `outside-reference-span` flag. `docs/calc.md`
  maps every Swiss Ephemeris `calc_ut` flag; `docs/evidence/calc-api/` holds
  the comparison.
- The comparison found that astronomy-engine's nutation keeps five terms of
  IAU 2000B, so true-of-date positions and angles carry up to 0.27″ of
  nutation error over 1800 to 2200 (0.087″ in obliquity, 0.08″ a day in
  rates). calc names it (`nutation:iau2000b-five-terms`) and keeps it;
  nothing the engine computes has changed.

Migration: none. With every default `calc` gives the position `positions()`
gives, to the bit after the same earlier calls, and the root entry's build is
byte for byte unchanged.

## 0.1.1-rc.15 — unreleased candidate

rc.15 brings four pieces of work onto rc.14: the time basis and local time
(tzdb 2025c history before 1970, a birthplace's own mean time, Julian dates,
leap seconds and IERS UT1), Hellenistic timing techniques in
`@zodiacs/engine/timing`, the sidereal zodiac and Jyotish techniques in
`@zodiacs/engine/vedic`, and a Placidus fix near the polar limit. Three
builds came before this one, on local branches, and none was pushed or
published: the first, which had two reviews; a first attempt at a re-cut
with their fixes, dropped before review; and the re-cut. A re-check of the
re-cut found living people's birth data in commits of its history that later
commits removed, and asked for corrections to the records. This build is the
re-cut's code with those corrections, from a history rebuilt before the
first push so that no commit carries that birth data: the commits of the
earlier builds are not in this repository, and `artifacts/README.md` lists
their archives. Its `dist/` is byte-identical to the re-cut's
(`rebuilt/dist-digest.log`). The figures below that describe this build were
measured on the re-cut's tree (`recut/`) or on this one (`rebuilt/`), except
the Swiss Ephemeris statistics in the Vedic entry, measured on the first
build, whose ayanamsas are within 7.7e-11″ of this build's. Checks:
`docs/evidence/rc15-20260929/`, whose `recut/` and `rebuilt/` directories
hold the outputs cited here by those names, with each piece's own evidence
beside it.

Breaking changes, in `@zodiacs/engine/geo` unless another entry is named:

- A wall time before 1970-01-02 throws until `prepareLocalTime(date,
  timeZone)` has loaded the zone's history, one of 16 files.
  `resolveLocalToUtc`, `resolveLocalBirth` and `resolveBirth` throw an
  `Error` naming `prepareLocalTime`; `prepareLocalTime` resolves at once for
  a date in 1971 or later and for the fixed zones, and loads the history for
  any earlier date, 1970's included (`rebuilt/corrections-probe.log`).
- Unknown birth-form keys and options throw `RangeError`: an unknown key of
  `resolveLocalBirth`'s or `resolveBirth`'s input, an unknown key or a value
  of the wrong kind in `resolveLocalToUtc`'s options (`longitude`,
  `calendar`, `country`), and an unknown calendar. A misspelled `calender`
  is refused rather than ignored.
- In the root entry, a birth input (to `natalChart` or `saturnReturn`, or in
  place of a chart, as to `transits`) with a key that differs from a field
  only in letter case, such as `timescale`, `Latitude` or `deltat`, throws
  `RangeError`, and so does a `timeScale` other than `"utc"`, `"ut1"` or
  `"tt"`, `null` and `"UTC"` included. rc.14 accepted both, ignoring them as
  unknown keys (`rebuilt/corrections-probe.log`).
- `lmt` means that a local-mean-time clock read the wall time. It used to
  mean an offset with seconds, which flagged legal times such as Madras time
  in Kolkata and missed local mean time in whole minutes, such as Guam's in
  1890.
- `DeltaT.model` has a new value, `"iers-utc/1"`, for a chart from 1972 to
  2027-10-02, and the type `DeltaTSegment` a new one, `"fallback"` (types of
  the root and `@zodiacs/engine/deltat`). Code that handles each value of
  either type needs the new ones. No chart's `deltaT.segment` is
  `"fallback"`: the first cut gave it to charts in 1972 before the UT1
  table's first day, which now come from IERS C04.
- `NATAL_RECEIPT_CONVENTION_SETS` (`@zodiacs/engine/receipt`) has a new set
  at index 0, the time-basis set, so each earlier set is one index later:
  the rc.8 set is at 1, where rc.14 had it at 0. Code that takes a set by
  its index needs the new one.

Other changes to existing results:

- Wall times before 1970 are read on tzdata 2025c with its `backzone` file,
  compiled by zic and shipped in the package, not on the host's `Intl` data:
  the main data files without `backward`, and all of backzone, as the tzdb
  Makefile's `PACKRATDATA=backzone` with an empty `PACKRATLIST`. Before 1970
  that is the Makefile's own build for 584 of the 597 names; for the other
  13, links that backzone points at a zone it adds, the Makefile keeps
  `backward`'s target and the package follows backzone
  (`recut/backzone-divergence.json`, as `docs/time.md` describes). Where the
  package and the host differ, the offset changes: at some instant before
  1970, 122 of the 597 names the package ships give another offset than
  tzdata 2025c's default build, which `Intl` carries on a host with tzdb
  2025c (`recut/backzone-divergence.json`, computed from zic's output; the
  audit's list of 98 zones that the tests carry,
  `src/fixtures/tzdb-divergence-98.json`, compared another build and misses
  28 of them). Stockholm 1947-07-01 12:00, for one, is now +1:00, where a
  default build gives +2:00.
- From 1972 to 2027-10-02 a chart's `utc` is read as UTC: TT = UTC +
  (TAI − UTC) + 32.184 s from the IERS leap-second list, and UT1 = UTC +
  (UT1 − UTC) from IERS, the EOP 20 C04 series in 1972 and `finals2000A.all`
  of 2026-09-24 from 1973-01-02, observed then predicted, which the engine's
  table reproduces within 0.66 ms on each of C04's 367 days and within
  0.79 ms on each of `finals2000A.all`'s 19,997. rc.14 read the instant as UT1
  with the ΔT model. Over 1,801 synthetic charts at four places in that span,
  with Placidus houses, the ascendant and cusps moved by up to 45.0″ from
  rc.14, the midheaven by up to 12.4″, the Moon by up to 0.462″, the other
  bodies by up to 0.0723″ and ΔT by up to 0.0829 s
  (`recut/rc14-comparison.json`). Those are that sample's largest. A review's
  wider sample, 4,525 charts from 1800 to 2200 at random places within 66° of
  the equator in seven house systems, found 101.03″ in the ascendant and
  cusps (1989-04-15T19:05:42.489Z, 65.61° S 40.27° W, Porphyry) and 0.4885″
  in the Moon (1983-07-13T04:38:00.672Z, 65.35° S 65.63° W)
  (`recut/review-sample.json`). Before 1972 and after 2027-10-02 the instant
  is still read as UT1 with the model: over 7,896 charts from 1850 to 2150
  the angles and cusps are unchanged, the Sun, Moon and planets are within
  0.000003″ of rc.14's, and the true nodes within 0.035″, the rounding of
  astronomy-engine's numerical Moon velocity, which now samples on a fixed ΔT
  (`recut/rc14-comparison.json`, `recut/node-velocity.json`). Outside
  1850–2150 the nodes differ by more: by 0.0694″ at 1843-03-06T14:21:09.972Z
  and 0.0681″ at 2156-05-24T16:14:31.804Z in the review's sample.
- The leap-second list is IERS's `leap-seconds.list` updated 2026-07-06
  through Bulletin C 72, which expires 2027-06-28 (sha256
  `db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433`); after
  the expiry the last value, 37 s, is carried and
  `chart.timeScale.leapSeconds.listed` is `false`. The list has no leap
  second after 2017, and the engine matches all 28 changes of Bulletin C 72
  (`recut/leap-seconds.json`). After 2027-10-02 UT1 − UTC is taken as 0
  within ±0.9 s.
- The flag names `dst-gap` and `dst-fold` are kept, deprecated, and now
  mean a gap or fold of any cause; `jump.cause` gives it (`dst`,
  `legal-change` or `date-line`).
- Receipts gain a conventions set, `NATAL_RECEIPT_CONVENTION_SETS[0]`, which
  records the instant's scale (`receipt.timeScale`), its time basis
  (`result.timeScale`) and, for a local resolution, the calendar, tzdb
  version and form, clock, transition and birthplace mean time. Each of
  those is optional, so a local resolution in rc.14's six fields is still
  accepted, and each one given is checked arithmetically. The set is
  accepted only from 0.1.1-rc.15 on, and the rc.8 set only from rc.8 to
  rc.14. Receipts that rc.13 and rc.14 wrote, serialized by their carried
  archives, still parse under the rc.8 set and replay as the UTC requests
  they record, which their engines read as UT1. Recomputed today their
  sidereal time moves by UT1 − UTC, up to 12.2″ from 1972 to 2027-10-02:
  over 16,218 rc.14 receipts on synthetic instants in that span at latitudes
  up to 65°, the midheaven by up to 12.85″ and the ascendant and cusps by up
  to 12.94″ at the equator, 40.55″ at 60° and 129.1″ at 65°, enough to
  change its sign near a sign's edge, and the Moon by up to 0.462″
  (`recut/receipt-replay.json`, `src/replay-time-basis.test.ts`); the rc.14
  fixture's angles by 5.85e-5° (`src/receipt-time-basis.test.ts`); and five
  charts a review chose by up to 1.71e-3° in the angles, 1.80e-3° in the
  cusps and 5.98e-5° in the bodies (`recut/replay.log`). Read on UT1 with
  the recorded ΔT pinned (`timeScale: "ut1"`, `deltaT` from the receipt's
  result), the same receipts reproduce the recorded angles and cusps exactly
  (`docs/time.md`).
- The receipt codec orders a receipt's engine version by SemVer 2.0.0
  precedence against the release that brought what it checks: 0.1.1-rc.15
  for the time-basis set, rc.9 and rc.10 for the house systems they added. A
  receipt of the time-basis set under a version before 0.1.1-rc.15 in that
  order, such as 0.1.1-rc.14.1, 0.1.1-beta, 0.1.1-alpha.7 or 0.1.1-rc, is
  refused; the first cut's regular expressions let those four through. A
  receipt's engine, ephemeris and package versions must be SemVer 2.0.0
  versions, and one that is not, such as 0.1.1-rc.01 or 0.1.1-rc.13+.., is
  refused as `invalid_value`. The rc.8 set is accepted only under the
  versions that wrote it, rc.8 to rc.14, with or without build metadata;
  rc.14 accepted it under each of the six versions above and under 0.1.1-rc.15
  (`recut/versions.log`, `src/receipt-versions.test.ts`,
  `src/semver.test.ts`).
- Placidus no longer falls back to whole signs outside the polar circle
  (finding F-46). Within about 4e-9° of the polar limit, near the sidereal
  times at which a cusp's right ascension reaches 90° or 270°, the 64-step
  iteration could fail to settle to 1e-9° and the chart fell back at
  isolated milliseconds (for example at 66.56186339751429°,
  92.16879370494166° around 2000-03-20T00:00Z). Where the iteration does
  not settle, the cusp is now found by bisection on its bracket, which
  cannot fail there. Wherever the iteration settles, cusps are bit-identical
  to before.

Changes to the time basis and to local time since this candidate's first cut,
after its review, measured against that build on synthetic instants and
places (`recut/time-basis-fixes.json`, `recut/tz-line-ends.json`):

- Inside a leap second (23:59:60 on UTC), a TT instant was read one second
  early on UT1, and a UT1 instant was reported with a UT1 − UTC that did not
  add up. UT1 is now TAI + (UT1 − TAI) and the old TAI − UTC holds through
  the leap second. For TT input at 108 instants inside the 27 leap seconds,
  ΔT falls by 0.36 s to 1 s, the midheaven moves by up to 14.11″ and the
  ascendant and cusps by up to 31.23″ at 59.91° N. On UT1 input at 275
  instants around the 25 leap seconds from 1974, ΔT, the angles and the
  positions do not change; at 98 of them the reported UT1 − UTC does, where
  the first cut's was 1 s away from 32.184 s + (TAI − UTC) − ΔT.
- 1972 took UT1 − UTC as 0 within ±0.9 s. It now comes from IERS EOP 20
  C04, −0.635 s to +0.811 s, continuous with `finals2000A.all` at
  1973-01-02, where the midheaven jumped by 11.83″ in a millisecond (now
  0.01462″, the millisecond's own). Over 283 charts in 1972 at four places,
  on UTC and on TT input the midheaven moves by up to 13.26″ and the
  ascendant and cusps by up to 32.12″, while the Sun, Moon and planets keep
  their positions (within 2e-7″; the true nodes within 0.0184″); on UT1
  input the angles stay and ΔT changes by up to 0.811 s (also at 22 UT1
  instants around 1972's two leap seconds), which moves the Moon by up to
  0.399″, the other planets by up to 0.0526″ and the true nodes by up to
  0.017″.
- A speed whose two samples straddle a leap second or a step of the time
  basis (1972-01-01, 2027-10-02, and the ΔT model's 13.95 ms step at
  1941.0) is now divided by the TT between them. The first cut's speeds
  there were 1.005787 times this rate within 86.4 s of each leap second,
  0.9997422 at 1972-01-01, 1.000845 at 2027-10-02 and 0.9999193 at 1941.0.
- UT1 and TT input whose UTC fell just outside the first cut's UT1 table,
  before 1973-01-02 or after 2027-10-02, is labelled by the table
  (`"observed"` or `"predicted"` and its σ), not `"fallback"` with σ 0.9 s;
  TT input whose UTC falls up to 0.148 s past 2027-10-02 now takes UT1 − UTC
  from the table, which moves its ΔT by 0.148 s.
- The leap-second list is IERS's current one: `timeScale.leapSeconds.listed`
  is `true` from 2026-06-28 to 2027-06-28, where the first cut's expired
  list gave `false`.
- Charts change nowhere else: 20,000 charts from 1850 to 2150 on the three
  scales, 3,995 of them with a pinned ΔT, away from those instants, give the
  first cut's results but for `listed` and the UT1 table's digest, now
  `064d98b4a531053a`.
- 30 changes of standard offset that the shard generator labelled `"dst"`,
  where a zone line ended during daylight saving and the clock went back,
  are `"legal-change"` in `jump.cause` and the receipts'
  `transition.cause` (`recut/tz-line-ends.json`).
- `zoneOffsetAt` answered from `Intl` until another call loaded a zone's
  history, so one question could get two answers; it now throws until
  `prepareLocalTime` has.

New:

- Birth input takes `timeScale`: `"utc"` (default), `"ut1"` or `"tt"`; any
  other value throws `RangeError`, and so does a key that differs from a
  birth field only in letter case, such as `timescale`, which was ignored
  and read a TT instant as UTC (other unknown keys are still ignored).
  Charts report `chart.timeScale` beside `chart.deltaT`, whose `model` is
  `"iers-utc/1"` from 1972 to 2027-10-02. UT1 turns the Earth (sidereal
  time, the angles) and TT moves the planets. See `docs/time.md`.
- `@zodiacs/engine/geo`: `prepareLocalTime`, `resolveLocalBirth` and
  `zoneOffsetAt`, which before 1970 throws, as `resolveLocalToUtc` does,
  until `prepareLocalTime` has loaded the zone's history; a `longitude`
  option that reads a wall time in a zone's local mean time era on the
  birthplace's own mean time (only eras tzdb records as LMT, never a legal
  mean time); `calendar: "julian"`, converted exactly through the Julian Day
  Number, with `julianToGregorian`, `gregorianToJulian`, `country` and
  `calendarNote` from a table of the Gregorian calendar's adoption in 18
  countries, each date cited to public-domain sources (tzdata's `calendars`
  file and Grotefend's tables of 1891 and 1898) and each country named as
  tzdata's `iso3166.tab` names it (`GREGORIAN_ADOPTION`,
  `GREGORIAN_ADOPTION_SOURCES`). Each resolution names the tzdb version and
  data form, the transition behind the offset and its cause. Around each of
  the 65,237 changes of offset from 1850 to 2100 in 597 zones, 2,548,849
  sampled wall minutes in all round-trip (`recut/roundtrip-full.json`), and
  the calendar conversion matches an independent implementation of
  Richards's algorithm on all 2,817,174 days from JDN 0 to Julian 3000-12-31
  (`recut/jdn-richards.json`). NOTICE and LICENSING.md record the tzdb,
  leap-second and IERS data the package now carries, the adoption table's
  sources and the Vedic ayanamsas' star values.
- `@zodiacs/engine/timing`: annual and monthly profections, firdaria,
  zodiacal releasing from the Lots of Fortune and Spirit, and solar arc
  directions. Ages count in solar-return years, each result names its
  conventions, and dated results carry `flags` (`"outside-reference-span"`,
  `"sect-contradicts-altitude"`). A chart given on UT1 or TT is read at its
  UTC instant; a chart's pinned ΔT is not applied to the solar returns or
  the arc. See `docs/timing-hellenistic.md` and
  `docs/evidence/timing-hellenistic-2026-09-28/`.
- `@zodiacs/engine/vedic`: nine ayanamsas and user-defined ones, sidereal
  charts, nakshatras and padas, the sixteen Parashari vargas, KP sub-lords,
  Vimshottari dashas to five levels, and Yogini and Ashtottari mahadashas.
  Epoch ayanamsas are held at J2000.0 in their own precession model and
  carried with IAU 2006, as the Indian Astronomical Ephemeris has done since
  2021. An ayanamsa is read as a chart reads its instant, on the time
  basis, with an optional `timeScale` and pinned ΔT, and records its
  `timeScale`; `siderealChart` uses the chart's own. Against Swiss
  Ephemeris 2.10.03 (pyswisseph, used as an instrument; statistics only),
  at 14,647 instants from 1800 to 2200, the mean ayanamsa is within the
  0.01″ gate for Lahiri (0.0013″), Fagan–Bradley (0.00091″), True Chitra
  (0.0020″), True Revati (0.0044″) and three user-defined epochs. Four
  named ayanamsas miss it: Raman (10.14″) and Yukteswar (806.16″) by
  definition, True Pushya (0.544″) at 12 instants with δ Cnc within 0.2° of
  the Sun, and the Galactic Center (0.101″) on catalogue data. Krishnamurti
  misses it by design (0.0712″): the engine reads its epoch as 1900-01-01
  0h TT, where Swiss Ephemeris uses J1900.0. Those statistics are from the
  comparison run on the first cut (`ayanamsa-swiss.json`); at the same
  instants this build's mean and true ayanamsas are within 7.7e-11″ of the
  first cut's (`recut/ayanamsa-engine.json`). Dasha dates and a sidereal
  longitude's `utc` are UTC instants, for a chart given on UT1 or TT too.
  See `docs/vedic.md` and `docs/evidence/vedic-2026-09-28/`.
- The root entry imports none of `/timing`, `/vedic` or `/geo`, and
  `npm run exports:smoke` fails if its static graph reaches one of their
  modules or a zone history. It reads the graph from the build's own module
  list (esbuild's metafile, `dist/metafile-esm.json`, which is not packed),
  so a module is found whatever its file's name or extension.
- The conformance results (`conformance/RESULTS.md`, adapter 0.2.0, which
  now gives the instant's scale) are 266 pass, 193 fail and 41 unsupported
  of 500 (rc.14: 232, 222, 46). All 34 changes are time vectors: the 20
  backzone-history zone offsets and 9 values of TT − UTC now pass, and the
  5 repeated local times are answered from the reported transition
  (`recut/conformance.log`, `recut/conformance-changes.json`). Against the
  first cut's results no verdict changes; the residuals of TT − UTC at
  1972-06-30T23:59:59Z and 1972-07-01T00:00:00Z move from 0 to 4.2e-9 s and
  7.1e-15 s (tolerance 0.0005 s), because UT1 − UTC in 1972 is no longer
  taken as 0, and the results file is regenerated.

The package gate changes. rc.14 had one cap, 300,000 bytes unpacked, for
everything (rc.14: 282,469). rc.15 has a budget for each entry point's
import graph, the JavaScript a plain import of it loads, and a stated cap for
the whole package; `scripts/verify-package-contents.mjs` gives each with its
reason. No budget or cap changed after the first cut. On this build
(`rebuilt/sizes.json`, `rebuilt/gates.log`; each headroom rounded down):

- the root, `.`: 97,704 bytes, budget 100,000, 2.34 per cent above its size.
  rc.14's was 81,712. The 15,992 bytes more are the time basis every chart
  now needs (the leap-second and UT1 tables, 5,710; `src/time-scale.ts`,
  6,499; its use in the API and the ephemeris, 863 and 675), 655 of Placidus
  bisection, and 1,590 of imports and exports of the chunks that the new
  entry points share with the root. The first cut's root was 95,273; the
  fixes to the time basis added 2,431 of those bytes (the 1972 knots, 410;
  `src/time-scale.ts`, 1,505; the API and the ephemeris, 395 and 74; imports
  and exports, 47);
- `/timing` 114,916 (30,215 beyond the root's graph), budget 120,000;
  `/vedic` 116,779 (32,750 beyond), budget 120,000; `/geo` 34,135 (31,206
  beyond), budget 35,000, and its zone histories, loaded only by
  `prepareLocalTime`, 189,144 bytes in 16 files, budget 200,000 and exactly
  16 files; `/receipt` 66,200 (41,589 beyond), budget 70,000; `/internal`
  58,997, budget 60,000; `/internal/math` 18,165, budget 20,000;
  `/crossings` 9,410, budget 10,000; `/deltat` 4,968, budget 5,500. Each
  budget is above its graph by 1.70 per cent (`/internal`), 2.34 (the root),
  2.53 (`/geo`), 2.75 (`/vedic`), 4.42 (`/timing`), 5.74 (`/receipt`), 6.26
  (`/crossings`), 10.10 (`/internal/math`) and 10.70 (`/deltat`). As first
  cut, `/geo` was 31,672, `/receipt` 62,880, `/internal` 56,961, `/timing`
  112,485 and `/vedic` 114,106;
- the whole package: 668,343 bytes unpacked in 54 files, cap 700,000,
  4.73 per cent above its size. It grew by 385,874 bytes from rc.14's:
  278,975 (72.30 per cent) of JavaScript that only the opt-in entry points
  load, 189,144 of it the zone histories; 49,620 (12.86 per cent) of
  declarations, which no runtime loads; 41,287 (10.70 per cent) of the
  README, this file, the licences and the manifest; and 15,992
  (4.14 per cent) of the root's own graph, which its budget holds. Code that
  imports only the root loads only that graph. A budget is raised only in a
  candidate whose changelog says so.

Known limitation: the ΔT model `zodiacs-deltat/1` steps back 13.95 ms at
1941.0 (1940-12-31T18:00 UT1), where its spline hands over to its knots
(review finding F-47), and rc.15 keeps the step. Removing it would change
the model's values there. A receipt that rc.8 to rc.14 wrote records the
model's ΔT, which the receipt codec recomputes and checks to 1e-9 s, so
valid receipts of those versions would fail validation. The fix needs a new
model name, in a later candidate. Until then a speed whose samples straddle
the step is divided by the TT between them (`docs/time.md`).

Links to the organization's repositories, in the README and in this file's
earlier entries, now use its current name, zodiacs-org; GitHub redirects the
former name, ZodiacsOfficial.

Birth data in the tests, examples and documentation is synthetic, except
worked examples from published sources about people who have died, cited
with page: Saunders's charts of Christopher Reeve, Coretta Scott King and
Princess Diana, Estadella's of Charlie Chaplin, and the native of Valens's
*Anthologies* IV.9. Checks that used living people's charts, or birth dates
taken from the public record, now use invented charts; `CONTRIBUTING.md` and
`AGENTS.md` state the rule. The commits of this candidate add no living
person's birth data, and no real person's but those cited examples: the
history was rebuilt before its first push
(`docs/evidence/rc15-20260929/README.md`, *The published history*). One real
person's birth, taken from the Zodiacs site's demo chart, is in earlier
candidates' tests and evidence, in main's history; rc.15's tree no longer
holds it.

Migration: before resolving a wall time before 1970, `await
prepareLocalTime(date, timeZone)`; remove unknown keys from birth forms and
options; in birth inputs, correct keys that differ from a field only in
letter case, and give `timeScale` only as `"utc"`, `"ut1"` or `"tt"`, or leave
it out; read `lmt` as a local-mean-time clock and `jump.cause` for the kind
of a gap or fold. Expect charts from 1972 to 2027-10-02 to differ from
rc.14's by UT1 − UTC in their angles and by up to half an arcsecond in their
positions, and wall times before 1970 in the zones where backzone differs
from the host's data to resolve to other instants. Pass `timeScale: "ut1"`
or `"tt"` for an instant on one of those scales. Receipts of every earlier
set remain readable; to recompute an rc.8 to rc.14 receipt as its engine did,
pass its recorded instant with `timeScale: "ut1"` and its recorded ΔT as
`deltaT`. Before 1970, `await prepareLocalTime` before `zoneOffsetAt` too.

## 0.1.1-rc.14 — unreleased candidate

- `engines` now reads `"node": "^20.19.0 || >=22.7.0"`; rc.13's `>=18` was
  false. astronomy-engine 2.1.19 ships ES modules in a package without
  `"type": "module"`, and plain Node loads them as ES modules only from 20.19.0
  and 22.7.0. On 18.20.8, 20.18.3, 21.7.3 and 22.6.0, importing this package
  fails with "Named export 'Body' not found". Bundlers are not affected. CI
  installs the packed archive in a clean consumer on Node 20.19.0, 22.7.0, 22
  and 24, and the consumer check refuses an unsupported runtime by name.
- The licence expression is `MIT AND CC-BY-4.0`. The 32 values of Stephenson,
  Morrison & Hohenkerk's Table S15 in the package's ΔT module, shipped since
  rc.8, are CC BY 4.0, as NOTICE says; `package.json` had declared `MIT` alone.
  NOTICE, LICENSING.md and the README say where the values are: in a shared
  chunk under `dist/`, which `dist/deltat.js` re-exports. `npm run
  package:contents` checks that `package.json`, LICENSING.md, NOTICE and the
  README agree, and that the build still puts the values there.
- Instants outside `EPHEMERIS_SPAN`, the years astronomy-engine tabulates (TT
  0001-04-30T12:00 to 3998-09-03T12:00), throw `RangeError` at once from every
  calculation. rc.13 evaluated them, slowly and wrongly: a position at year
  30,000 took more than 20 s and put the Sun 29° off the ecliptic. The speed
  samples must lie inside too, so on the model ΔT clock the instants from
  0001-05-01T00:00Z to 3998-09-02T00:00Z are evaluated. This replaces rc.13's
  check against the ends of JavaScript's Date range.
- Each declination row gains `boundMarginArcsec`, the signed margin
  `(abs(dec) − trueObliquity) × 3600`. The out-of-bounds flag is exactly
  `boundMarginArcsec > 0`, the exempt Sun aside, and agrees with the sky only
  where the margin exceeds the ephemeris's declination error. Against JPL's
  DE440s at 20,000 instants from 1850 to 2150, the largest errors were 2.7″
  for the Sun, 3.4″ for the Moon, 4.6″ for Pluto and 12″ to 22″ for the other
  planets; the README gives each. Within them a flag can be wrong either way:
  at 2022-10-22T08:11:10.756Z the engine puts Mars 1.57″ inside the bound, and
  DE440s 1.05″ beyond it.
- The Sun's exemption is restated as a convention. rc.13's reason was wrong,
  and its entry is corrected below. The real Sun does pass the bound: computed
  with ERFA, at 402 of the 800 solstices from 1800 to 2199, by up to 1.09″
  (DE440s agrees within 0.008″ over 1850–2149). The engine cannot tell: its
  solar declination is off by up to 2.7″ near the present, and its solar
  latitude drifts from −1.1″ on average in the 1800s to +1.1″ in the 2100s, so
  at those solstices its margin has the real sign at only 404 of the 800. Far
  from J2000 the drift reaches tens of arcseconds: −68.3″ at the June solstice
  of year 2, +25.8″ at that of 3902. So `chartDeclinations` never flags the
  chart's own Sun, at any latitude, as rc.13 did not; it is unflagged at all
  7,995 solstices in `EPHEMERIS_SPAN`. `declinationsForBodies` exempts a
  supplied row labelled `Sun` only within `SUN_BOUND_LATITUDE` (0.001°) of the
  ecliptic, and holds it to the strict rule beyond.
- `trueObliquity` is the IAU 2006 mean obliquity plus astronomy-engine's
  five-term truncation of the IAU 2000B nutation in obliquity, not IAU 2000B
  itself, and the documentation now says so. It differed from ERFA's `obl06`
  plus `nut00b` by up to 0.086″ at the 20,000 instants.
- A declination aspect's longitude `separation` is the short way round between
  the supplied longitudes reduced exactly modulo 360, rounded once, whatever
  their size. rc.13 first normalized each longitude into [0, 360), which
  rounds: −1e-20 and 0 were 5.68e-14 apart (now 1e-20), and −0.1 and 0.2 were
  0.30000000000002275 apart (now 0.30000000000000004).
- The body-label rule is stated precisely: 1 to 80 UTF-16 code units,
  unchanged by `String.prototype.trim` (so no U+FEFF or U+3000 at either end),
  and no C0 control character or DEL. C1 controls, U+200B and lone surrogates
  pass. The rule and its message are rc.13's, but rc.13 changed the message
  without saying so: configured aspects used to say "Body labels must be
  nonempty, trimmed strings of at most 80 characters." and the declination
  functions "body identifier must be a nonempty string."; both now say "Body
  labels must be nonempty, trimmed strings of at most 80 characters, without
  control characters." Code that matched the old text must match the new.
- The archive check reads git objects only, never the working tree, and every
  commit reachable from HEAD, with no history simplification. The rc.13 check
  missed a rewrite on a merged side branch and accepted rc.11's first packing
  in any commit; reviews of two earlier local rc.14 builds found more ways
  past it. Now:
  - `artifacts/archives.json` records each archive's digest, size, file count
    and source commit. It is append-only: every committed version of it must
    be a prefix of HEAD's, and each commit's must extend its parents'. Its
    superseded entries are pinned in the script: rc.11's first packing, allowed
    only in 00bdae7, where it was committed.
  - Every recorded version, and `package.json`'s at HEAD, must be a strict
    semantic version, with no `v` prefix and no build metadata, and no two
    carried versions may be equal as npm compares them (`semver.eq`). A second
    archive under `0.1.1-rc.14+evil` or `v0.1.1-rc.14` is refused, and so is a
    HEAD version that differs only in build metadata, which let the check skip
    HEAD's rebuild.
  - In every commit, `artifacts/` must be a real directory holding only
    archives, receipts, the manifest and its README, as regular files: no
    symbolic link, no subdirectory, and no two names, nor another top-level
    entry and `artifacts`, that differ only in case.
  - Every version's receipt is checked, and nothing ever committed under
    `artifacts/` may be missing from HEAD.
  - Each archive's packed `package.json`, README, CHANGELOG and licence files
    must be byte-identical to its source commit's, and the commit that
    introduces it must be that source commit or a child of it.
  - A clean worktree of HEAD must rebuild the current version's archive byte
    for byte, both by default and with `--rebuild-all`, which also rebuilds
    every archive from its source commit; CI runs both. Each rebuild installs
    its commit's locked dependencies afresh with `npm ci` in that worktree and
    takes nothing from the checkout's `node_modules`. A change to a packed file
    under a version already carried fails either way.
  - Merge with merge commits: a squash or rebase merge rewrites the source
    commit, and the check then fails.
- rc.14 includes main's conformance suite (`conformance/`, not packed) and the
  section of LICENSING.md about it, which is packed. Its archive is built from
  that merged source.
- TypeDoc canonical URLs point to
  https://zodiacs.org/developers/engine/reference/, and the footer names both
  licences. Earlier entries refer to the separate earlier package by its
  repository, github.com/zodiacs-org/sdk, instead of its npm name.
- rc.13's exact decisions cost time. In the review's worst case, 256 bodies
  under 64 custom rules (32,045 aspects), `findConfiguredAspects` took 1.72 s,
  where rc.12 took 0.19 s, and 256 declinations all within a 90° orb took
  0.47 s, where rc.12 took 0.07 s (each the fastest of 63 runs on Node 22.22.2
  on a shared four-core machine). An ordinary chart's configured aspects or
  declinations still take under a millisecond.

Migration: plain Node consumers need Node 20.19.0 or a later 20.x, or 22.7.0
or later. Calculations at instants outside `EPHEMERIS_SPAN` throw `RangeError`.
Declination rows gain `boundMarginArcsec`. A row labelled `Sun` given to
`declinationsForBodies` more than 0.001° off the ecliptic can now be out of
bounds; the chart's own Sun in `chartDeclinations` never is. Declination
separations of longitudes outside [0, 360) can change, by less than 1e-13°.
Natal, transit, synastry, progression and receipt results are unchanged apart
from the reported engine version.

## 0.1.1-rc.13 — unreleased candidate

- Configured aspects are exact on binary64 inputs. `findConfiguredAspects`
  takes every longitude, speed, angle, orb and threshold as the exact value of
  its double, forms the signed separation without rounding, folds it into
  (−180°, 180°] by exactly 360°, and decides the orb test, the closest rule,
  the motion and the result order on exact values, with no tolerance. Only the
  reported orb is rounded, once, to nearest with ties to even. The policy's
  conventions gain `arithmetic: "exact-binary64;reported-orb-rounded-half-even"`.
  rc.11's direct subtraction still rounded across 0°: Mars at
  7.6999999999999895 and Saturn at 359.7, which are 8 + 2⁻⁵⁰ apart, are no
  longer a default conjunction at orb 8, and Jupiter at 6.3 and the Sun at 314
  now fall within a 7.3° semisquare orb, at exactly 7.3. The zero-orb square
  between 188.86 and 98.86 stays unmatched, since they are 90 + 2⁻⁴⁶ apart;
  the pre-merge rc.11 build at 00bdae79 matched it only by rounding.
- Declination parallels and contraparallels use the same exact arithmetic on
  the declination doubles: 13.3 and 12.3 match at orb 1, while 8.3 and 7.3, and
  1.1 and 0.1, do not. The reported orb and longitude separation are rounded once.
- A row labelled exactly `Sun` is never out of bounds. Other rows keep the
  strict rule against astronomy-engine's true obliquity of date. (Corrected in
  rc.14. This entry said the Sun defines the bound and so never passes it, and
  that its latitude had put the computed declination beyond it at 400 of the
  800 solstices from 1800 to 2200, by up to 1.35″, as at 2024-06-20T20:51Z. The
  real Sun does pass the bound, at 402 of the 800 solstices from 1800 to 2199,
  by up to 1.09″; the engine's 400 come from astronomy-engine's drifting solar
  latitude and have the real sign at only 404 of the 800. The obliquity is the
  IAU 2006 mean obliquity plus a five-term truncation of the IAU 2000B nutation
  in obliquity, not IAU 2000B itself. rc.14 keeps the exemption as a
  convention: for the chart's own Sun at any latitude, and for a supplied Sun
  row within 0.001° of the ecliptic.)
- One body-label rule for both analyses. The declination functions now reject,
  as configured aspects already did, labels that are empty, longer than 80
  characters, carry surrounding whitespace or contain control characters, with
  the same `RangeError` message.
- Ephemeris failures are `RangeError`s. Speed samples are checked against
  JavaScript's Date range, so `positions` and `progressedBodies` within six
  hours of ±8.64e15 ms no longer throw astronomy-engine's plain string. Any
  other string it throws, such as its light-time solver's refusal at year
  −250,000, reaches the caller as a `RangeError` whose `cause` is the original
  value. The README states the evaluable range.
- Secondary-progression documentation states that the mapping counts UTC
  milliseconds without leap seconds, not ephemeris days; that the speed is a
  central difference over ±0.001 day (±0.25 day for the nodes), numerically
  degrees per tropical year of life; and that the pre-birth mapping is not a
  converse progression. The cited PDF's SHA-256 and pages 84–85 are recorded,
  with the book's own 4.73 s precision budget behind the 5 s comparison and a
  new regression within 50 ms of its unrounded result.
- `homepage` is the repository README, and the TypeDoc footer and links are
  neutral. The packed-consumer check sets `"types": []`, refuses a temporary
  directory with `node_modules` above it, and removes that directory; the
  rc.12 site-adoption check counts its mismatches and cleans up.
- CI, now on Node 20, 22 and 24, runs `npm run archive:binding`: it refuses
  any carried archive that changes or disappears in history, and rebuilds the
  archive for the current version, requiring identical bytes (skipping that
  comparison until the version's archive exists). `artifacts/README.md` lists
  every carried archive. The first rc.11 archive, packed at 00bdae79
  (SHA-256 `13d637db…`, 70,676 bytes), was superseded before merge and never
  released; the rc.11 archive is `d88e0ff8…`. A version string will not again
  name two different byte sequences.

Migration: configured-aspect and declination-parallel results can change at
exact boundaries (membership, motion, order), and reported orbs and separations
can differ from rc.12's by up to about 2⁻⁴⁴°, not only in their last bit
(wording corrected in rc.14). 2⁻⁴⁵° was the largest difference in 200,000
random pairs; Moon 331.026 and Sun 103.38600000000001 under a custom 132.36°
angle had orb 0 in rc.12 and 2⁻⁴⁶° in rc.13. The Sun's `outOfBounds` can
change from true to false. Labels the declination API used to accept can now
throw `RangeError`. Callers near the ends of the Date range should expect
`RangeError` instead of a string. Natal, transit, synastry, progression-mapping
and receipt conventions are unchanged apart from the reported engine version.

## 0.1.1-rc.12 — unreleased candidate

- Export `PROGRESSION_DAYS_PER_YEAR`, `progressedInstant` and
  `progressedBodies` for the site's existing secondary-progression convention:
  one 365.2422-day tropical year of elapsed life maps to one day after birth
  (86,400,000 ms of UTC time, without leap seconds; wording corrected in rc.13).
- Accept the normal resolved `DateInput` forms with strict validation, retain
  signed targets before birth and preserve the original floating-point
  operation order and integer-millisecond Date truncation.
- Return the same twelve position rows as `positions`, including true lunar
  nodes. Speeds remain ephemeris degrees/day at the progressed instant, not
  degrees per lived day. No progressed angles, houses, extra chart points,
  solar-arc convention, aspect policy or receipt extension is added.
- Reuse the existing public JPL fixture for a constructed mapping-and-position
  component check and add a rounded published date-mapping example. These
  checks do not establish predictive validity or new physical accuracy bounds.

Migration: existing calculations and natal receipt conventions are unchanged
apart from the reported engine version. The site remains separately pinned;
this is an unpublished package candidate, not site adoption or npm release.

## 0.1.1-rc.11

- `createAspectPolicy` and `findConfiguredAspects` add explicit, immutable
  longitude-aspect policies: major, minor and custom angles; per-aspect,
  per-body and applying/separating/stationary orb limits; selected bodies;
  and deterministic matching. The result includes its resolved policy.
- The unpublished candidate's review repair uses direct bounded subtraction
  in configured matching and motion, preserving exact custom-angle matches
  at zero orb without widening tolerances. Configured boundary behavior can
  differ at roundoff scale from the historical helper; existing natal,
  transit, synastry and receipt calculations are unchanged. Current repair
  evidence is in `docs/evidence/rc11-20260928/decimal-orb-repair/`.
- `chartDeclinations(natal)` derives right ascension and declination from
  full ecliptic longitude and latitude using true obliquity on the chart's
  pinned or model ΔT clock. It includes parallel/contraparallel aspects,
  explicit orb settings and out-of-bounds flags. Right ascension is in
  degrees and is null at a numerical celestial pole.
- `eclipticToEquatorial`, `declinationsForBodies`, `declinationOf`,
  `declinationOrb` and `findDeclinationAspects` expose the underlying geometry
  with an explicitly supplied obliquity.
- Validation and finite comparison evidence is in
  `docs/evidence/rc11-20260928/`. The ephemeris provider and its corrections
  are unchanged; the programme's physical declination accuracy target is
  not established by the new geometric checks.

Migration: existing natal, synastry, transit and receipt conventions stay
unchanged. New aspect policies do not alter `chart.aspects`. The additional
analyses are not included in the natal receipt. This is a review candidate,
not an npm publication or a completed Phase 2 milestone.

## 0.1.1-rc.10

- A thirteenth house system, `"equal-mc"`: Equal houses from the midheaven,
  30° each with the 10th cusp at the midheaven (Swiss Ephemeris's `D`). It
  depends on neither the ascendant nor the latitude, so it is the same at every
  latitude. `equalMcCusps` computes it. Receipts accept it and check that its
  cusps count 30° from the midheaven; a receipt naming an engine before rc.10
  cannot carry it.
- `chartPoints(natal)` returns the chart's points and its sect.
  - **Mean Node and Mean South Node**: the Moon's mean node from the IERS
    Conventions' fundamental arguments (Simon et al. 1994), with the nutation in
    longitude.
  - **Black Moon Lilith**: the mean lunar apogee. It is the point of the mean
    orbit 180° from the mean perigee, carried to the ecliptic, so it has a
    latitude of up to 5.15°.
  - Both are within 0.7″ of Swiss's `SE_MEAN_NODE` and `SE_MEAN_APOG` every
    3.7 days from 1800 to 2199, and carry a speed.
  - **Vertex and East Point**, from the instant and the place. Given the same
    sidereal time, latitude and obliquity they agree with Swiss's to within
    0.00001″. `vertexOf` and `eastPointOf` compute them.
  - **The lots** of Fortune, Spirit, Eros, Necessity, Courage, Victory and
    Nemesis, after Paulus Alexandrinus, from the chart's ascendant and bodies,
    reversed by night. `sectOf` gives the sect they use.
- `antiscion`, `contraAntiscion` and `midpoint` for any longitudes.
- The osculating Lilith is left out. astronomy-engine's lunar series puts it
  198″ from Swiss's at the median, and up to 683″.

Migration: nothing changes for existing charts, systems or receipts.
`validateBirthSettings` accepts `"equal-mc"`, and its error message lists all
thirteen systems. The conventions set is rc.8's, unchanged.

## 0.1.1-rc.9

- Nine more house systems, for twelve: Koch, Regiomontanus, Campanus,
  Topocentric (Polich–Page), Alcabitius, Equal, Vehlow, Meridian (axial
  rotation) and Morinus, beside whole sign, Placidus and Porphyry. Each
  follows the definition Swiss Ephemeris uses. Given the same sidereal time,
  latitude and obliquity, every one agrees with Swiss's `swe_houses_armc` to
  within 0.0001″ over 20,000 random cases at every latitude and on the
  55°–66.6° ladder; Placidus, which iterates, to 0.0096″.
- Koch, like Placidus, is undefined inside the polar circle and falls back to
  whole sign with the `polar-fallback` flag, where Swiss refuses it. The new
  `POLAR_FALLBACK` names that system, and `POLAR_UNDEFINED_HOUSE_SYSTEMS` the
  two systems that use it; `PLACIDUS_POLAR_FALLBACK` stays. Every other
  system is computed at every latitude where the angles are. Inside the polar
  circle Regiomontanus, Campanus and Topocentric cusps turn with the eastern
  ascendant, so their 10th cusp is the lower meridian there, as in Swiss.
- Each system is exported as a function (`kochCusps`, `regiomontanusCusps`,
  `campanusCusps`, `topocentricCusps`, `alcabitiusCusps`, `equalCusps`,
  `vehlowCusps`, `meridianCusps`, `morinusCusps`) and through `computeHouses`.
  `src/house-systems.test.ts` holds each to its own definition: Regiomontanus
  and Campanus cusps lie on their circles through the horizon's north point,
  Koch and Topocentric cusps are the ascendants they are defined as, and
  Alcabitius, Meridian and Morinus cusps have the right ascensions they are
  defined by.
- Receipts accept the new systems and check each system's shape: Equal and
  Vehlow count 30° from the ascendant, the quadrant systems put the ascendant
  on the 1st cusp and the midheaven on the 10th (the lower meridian only for
  the three turning systems, and only beyond 65° of latitude), Meridian keeps
  the midheaven, and every system's cusps come in opposite pairs. A receipt
  naming an engine before rc.9 cannot carry a new system. The conventions set
  is rc.8's, unchanged.

Migration: nothing changes for whole sign, Placidus or Porphyry.
`validateBirthSettings` accepts the new names, and its error message lists
all twelve.

## 0.1.1-rc.8

- Observed ΔT with a band (Phase 1 step 1.4). The model `zodiacs-deltat/1`
  replaces astronomy-engine's 2004 polynomial: Stephenson, Morrison &
  Hohenkerk's 2016 reconstruction to 1941, USNO and IERS values from 1941,
  Bulletin A's predictions, then a damped extrapolation. Today ΔT falls from
  75.50 s to 69.20 s (IERS: 69.20 s): the Moon moves back 3.4″, and Moon
  events come about 6 s later. At 2100 ΔT is 78.9 ± 42.4 s, where rc.7 gave
  202.7 s. Every chart reports `deltaT`; birth inputs take a `deltaT` pin;
  `@zodiacs/engine/deltat` exports the model with no dependencies.
- Receipts record ΔT (`result.deltaT`, conventions `deltaT`) and name the
  ephemeris (`receipt.engine.ephemeris`, astronomy-engine 2.1.19, now an
  exact dependency pin). The conventions no longer call the planets
  "apparent": they are aberrated but not deflected, and the Moon has
  neither correction. rc.7's conventions are frozen; each set is read only
  from the engine versions that wrote it, and receipts from rc.3 to rc.7
  still parse and replay.
- `REFERENCE_SPAN`: a chart before 1800-01-01T00:00Z or from
  2200-01-01T00:00Z carries the new `outside-reference-span` flag.
- One longitude-crossing solver, the one the site runs. It moves into the
  package as `@zodiacs/engine/crossings`: `findLongitudeCrossingsWith` and
  `searchLongitudeCrossingsWith` take the longitude function as their first
  argument and import no ephemeris. `findLongitudeCrossings` and
  `saturnReturn` run it on the engine's longitudes.
- The window is (from, to]. A root exactly at `from` is no longer returned. A
  sample exactly on the target is returned once, at that sample, including a
  touch and the start of a plateau, which rc.7 dropped.
- A station that falls between two samples just past the target now gives
  both crossings. A natal Saturn 0.002° below its 2019 station gets three
  first-return passes, where rc.7 gave one.
- No sample budget and no `RangeError` for the size of a search. A quarter-day
  Moon scan over 2,600 days returns its 95 crossings, and Saturn from 1900 to
  2100 at 5 days its 13, where rc.7 threw at 10,000 samples.
  `searchLongitudeCrossings` takes an optional `maxSamples` and returns a typed
  `refused` result instead of throwing.

Migration: positions move by ΔT's change (the Moon about 3.4″ today, far
more in the far future), charts gain `deltaT` and may gain
`outside-reference-span`, and receipts from rc.8 carry the new conventions.
A crossing exactly at `from` is left out; include it by starting the window
earlier. Exact touches and grazing station pairs can add crossings to
Saturn-return seasons. Code that relied on the `RangeError` to bound work
should pass `maxSamples` to `searchLongitudeCrossings`.

## 0.1.1-rc.7

- Judge an aspect applying from the sign of its orb's rate of change. The old
  rule moved both bodies 0.02 day ahead, and so read every aspect as separating
  for the last 14.4 minutes before exact. `aspectMotion`, `AspectMotion` and
  `STATIONARY_RELATIVE_SPEED` are exported; `Aspect.applying` stays a boolean.
- Take each speed as the derivative of the reported longitude over ±0.001 day.
  The Moon's step error at perigee falls from 7.55″ a day to 0.0015″ a day. The
  true node keeps ±0.25 day. The Saturn return scan takes natal Saturn's
  direction from the same speed as the chart.
- Build the ascendant and midheaven on the true obliquity of date, the one that
  matches apparent sidereal time. Against ERFA on the 3,128-case grid, the
  ascendant's largest error falls from 506.8″ to 6.36″, and within 45° of the
  equator from 14.6″ to 0.36″. The midheaven's falls from 2.25″ to 0.20″.
- Put the Placidus limit at 90° minus the true obliquity, 66.53° to 66.59° over
  1800–2200, where it was 66°. Between the two, Placidus is now computed
  instead of falling back to whole sign.
- Offer `houseSystem: "porphyry"`. It is defined wherever the ascendant and
  midheaven are, including inside the polar circle. Placidus keeps whole sign
  as its polar fallback, now exported as `PLACIDUS_POLAR_FALLBACK` and returned
  as `fallbackSystem`.
- Receipts record the new speed, aspect and angle conventions. The set that
  rc.3 to rc.6 recorded is kept as `CONVENTIONS_RC3`, and their receipts stay
  readable and replay as before. `NATAL_RECEIPT_CONVENTION_SETS` lists both
  sets. A receipt must match one set exactly, and the old set only with an rc.3
  to rc.6 version. Porphyry is accepted only in the new set.

Migration: planetary longitudes are unchanged. Speeds, the angles, Placidus
cusps between 66° and the polar circle, and the applying flag of aspects close
to exact can change. Recorded receipts are immutable and are not rewritten.

## 0.1.1-rc.6 — unreleased candidate

- Compare the complete civil timestamp, including seconds and milliseconds, when
  matching a local HH:MM input. Historical shifts smaller than one minute now
  receive the correct gap/fold flags; neighboring ordinary times lose false
  ambiguity flags. The selected instants in the retained finite controls agree.
- Normalize only floating-point offset conversion to integer milliseconds.
  Preserve historical offset seconds, actual fractional-minute offsets, earlier
  fold selection and the existing forward-gap policy.
- Retain strict date/time/zone guards and the existing three-point offset
  sampling. This is a precision correction, not a proof of complete transition
  discovery, historical source accuracy or broad astronomical coverage.

Recorded receipts are immutable and are not rewritten. Recomputations can have
corrected time flags under this new version. The receipt schema, core numerical
formulas, the earlier package in github.com/zodiacs-org/sdk, site/starter
pins and account protocols are unchanged. The explicit merge/publication hold
and required review on pull request #5 of that repository remain.

## 0.1.1-rc.5 — unreleased candidate

- Preserve all five typed birth flags while checking derived echoes against the
  actual result. Correct unknown-time/polar echoes now produce canonical flags
  once and round-trip through the unchanged draft receipt schema.
- Reject unknown, malformed and contradictory claims. Snapshot up to 64 raw
  data entries without custom array iteration or scalar coercion; deduplicate
  valid claims. Canonical input records semantics, not the submitted array.
- Validate supplied Chart flag consistency against its input and house/angle
  metadata. Keep canonical object identity; normalize compatible echoes with a
  shallow metadata copy. This does not authenticate astronomical values.
- Capture validated public/civil settings once. Reject invalid civil settings
  and explicit null local time before Intl resolution. Ordinary Saturn inputs
  remain date-only; an explicit raw polar assertion requires one natal
  calculation before the return scan.

Migration: do not use flags to override timeKnown or the requested house system.
Fix contradictory/missing result claims in supplied Charts. Arrays over 64 raw
entries reject. Historical time flags remain assertions; executable same-realm
getters/proxies are not sandboxed. Internal computation, receipt wire format,
site/starter pins and the APIs of the earlier package in
github.com/zodiacs-org/sdk are unchanged. Required review and the explicit
merge/publication hold on pull request #5 of that repository remain.

## 0.1.1-rc.4 — unreleased candidate

- Validate the optional GeoNames client's compact v1 index and requested shard
  before caching fulfillment. Malformed HTTP-200 JSON now rejects with a fixed
  schema error and can be retried by a later explicit call.
- Reject unsafe table indices, coerced/out-of-range coordinates and malformed
  rows before returning partial results. Preserve Unicode names, empty region
  and country labels, geographical endpoints and host-independent timezone
  strings. No automatic retries, eager shard requests or new network endpoint.
- Return metadata array snapshots from `preload()` so caller mutation cannot
  alter validated cache state. Keep valid/in-flight cache sharing and original
  fetch/HTTP/JSON-parser failures.
- These checks do not authenticate place facts or detect structurally valid
  mixed-generation data. The v1 assets lack generation/content identities;
  hosts must serve matching index and shards together.

Site application rc.1 and the separately delivered standalone starter rc.3
remain pinned to their existing artifacts. Numerical calculations are unchanged
apart from the reported engine version. The explicit review/publication hold on
pull request #5 of github.com/zodiacs-org/sdk, the repository of an earlier
package, remains; this entry is not npm publication or production release.

## 0.1.1-rc.3 — unreleased candidate

- Add an optional draft natal receipt/envelope entry point for bounded local
  export/import, requested-versus-actual house preservation and redacted
  diagnostics. This does not change account sync v1 or establish an industry
  standard. Preserve original ISO spelling when captured and replay the recorded
  request without consulting today's timezone database. Imported provenance is
  an unauthenticated claim; recalculation across versions may differ.
- Reject duplicate decoded JSON keys, unknown versions/features, excessive
  input, inconsistent flags/results and unsupported exact-pole angles. Keep
  parser exceptions and arbitrary imported metadata out of diagnostics.
- The site and starter retain rc.1. Package publication, production release and
  required human/external review remain separate gates.

## 0.1.1-rc.2 — unreleased candidate

- Permit a later explicit GeoNames preload/search call to retry after rejected
  network requests, unsuccessful HTTP responses or JSON parsing failures.
- Preserve shared in-flight requests, successful index/shard caches and original
  rejection reasons. No automatic retry loop or per-caller cancellation API.
- This does not validate structurally invalid but parseable JSON responses.
  The site and public starter retain their immutable rc.1 candidate.

This candidate changes the optional geo client only; existing numerical
calculations are unchanged apart from the reported package version. The
review/publication hold on pull request #5 of github.com/zodiacs-org/sdk,
the repository of an earlier package, remains.

## 0.1.1-rc.1 — unreleased candidate

- Correct the polar ascendant in the shared implementation before deriving
  houses. Public consumers and the site receive the same rising axis.
- Require Placidus iteration convergence; allow up to 64 iterations and use
  a tighter stopping criterion, retaining the conservative 66-degree limit.
- Reject invalid calendar dates, ambiguous local date-times, non-date
  coercions, unsupported house systems and nonboolean unknown-time settings.
  Date-only ISO inputs still mean UTC midnight; date-times require an offset.
- Add public contract regressions and a real packed-consumer ESM/types check.
- Bound longitude-crossing work and reject steps that cannot advance time.
- Emit an exact coarse-sample crossing once, with explicit endpoint semantics.
- Preserve proleptic Gregorian years below 100 in local-time conversion;
  format historical years without false daylight-saving gap flags.

Migration: valid resolved inputs retain their shape. Callers previously relying
on `Date` rollover, implicit machine timezone, or silently ignored settings must
resolve/correct those inputs. Do not compare cached chart receipts across
versions without recalculation. The API of the earlier package in
github.com/zodiacs-org/sdk is unchanged.

Release holds remain in pull request #5 of that repository. This entry records
implementation, not publication, deployment, full external review, or
adoption.
