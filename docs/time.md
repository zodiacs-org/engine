# Time

How `@zodiacs/engine` turns a birth time into the two times a chart needs, and
how `@zodiacs/engine/geo` turns a local wall time into that birth time. The
evidence for everything stated here is in
[`docs/evidence/time-2026-09-28/`](evidence/time-2026-09-28/README.md), and for
what the review of rc.15 changed, in
[`docs/evidence/rc15-20260929/`](evidence/rc15-20260929/README.md).

## Two times per chart

The Earth's rotation, and so sidereal time, the angles and the houses, runs on
**UT1**. The planets' motion, and so every position, runs on **Terrestrial
Time (TT)**. Their difference is ΔT = TT − UT1, about 69 s in 2026.

A birth input's `utc` is an instant on the scale its `timeScale` names:

| `timeScale` | The instant is | Typical source |
| --- | --- | --- |
| `"utc"` (default) | Coordinated Universal Time | a clock, or `@zodiacs/engine/geo` |
| `"ut1"` | UT1 | an astronomical reduction |
| `"tt"` | TT | an ephemeris or an event table in TT |

Any other value, including `null`, throws `RangeError`. A `ChartInput` carries
`timeScale` only when it is not UTC.

### From an instant to UT1 and TT

| Instant (on UTC) | TT | UT1 | `timeScale.basis` | `deltaT.model` |
| --- | --- | --- | --- | --- |
| before 1972-01-01 | UT1 + ΔT(model) | the instant read as UT1 | `"delta-t"` | `"zodiacs-deltat/1"` |
| 1972-01-01 to 2027-10-02 | UTC + (TAI − UTC) + 32.184 s | UTC + (UT1 − UTC) | `"iers"` | `"iers-utc/1"` |
| after 2027-10-02 | UT1 + ΔT(model) | the instant read as UT1, UT1 − UTC taken as 0 ± 0.9 s | `"delta-t"` | `"zodiacs-deltat/1"` |
| any, with `deltaT` pinned | UT1 + the pin | as above | `"pinned"` | `"pinned"` |

- **TAI − UTC** comes from the IERS leap-second list, `leap-seconds.list` as
  IERS serves it (retrieved 2026-09-29, sha256
  `db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433`, updated
  2026-07-06 through Bulletin C 72, **expires 2027-06-28**), checked against
  its own SHA-1 line. rc.15's first cut shipped tzdata 2025c's copy, which
  expired on 2026-06-28; the two hold the same leap seconds. After the expiry the
  last value, 37 s, is carried, and the result says so
  (`leapSeconds.listed: false`): the list says nothing about later dates.
- **UT1 − UTC** comes from IERS. For 1972 (1972-01-01 to 1973-01-01) it is the
  EOP 20 C04 series (`eopc04.1962-now`, retrieved 2026-09-29, Last-Modified
  2026-09-28, sha256
  `e16cfbba34574b8bad3cf81e2e56a84c2b4bbfd3c822cf9ebdd860bf97d711dc`),
  because `finals2000A.all` begins on 1973-01-02; from then it is
  `finals2000A.all` of 2026-09-24 (sha256
  `cc80680ec05c91b65e7d02c6068fe0d44dd0998dc880551975092d2d14aa8e18`, Bulletin
  A), observed through 2026-09-24 and predicted to 2027-10-02. The engine
  stores UT1 − TAI, which runs smoothly through leap seconds, in whole
  milliseconds on 1972-01-01 and then every third day on the grid of the
  `finals2000A.all` rows, so that the join on 1973-01-02 is a knot (table
  digest `064d98b4a531053a`), and interpolates linearly, which is continuous
  across the join. That reproduces each of the 367 C04 days within 0.66 ms and
  each of the 19,997 `finals2000A.all` days within 0.79 ms. From 1972-01-01
  to 1973-01-01 UT1 − UTC runs from −0.635 s to +0.811 s by C04's daily
  values; rc.15's first cut took it as 0 ± 0.9 s there. The rows the table is
  built from are committed with its generator (`scripts/time-scale-sources/`).
- **The ΔT model** `zodiacs-deltat/1` (`src/deltat.ts`,
  `@zodiacs/engine/deltat`, since 0.1.1-rc.8) is the reconstruction of
  Stephenson, Morrison & Hohenkerk 2016 up to 1941, observed USNO and IERS
  values after that, then Bulletin A's predictions and a damped
  extrapolation. Its 1-σ band is 0.03 s where observed and grows with the
  years since the last observation (about 12 s by 2050, 42 s by 2100); before
  1620 it is an estimate rather than a calibrated band. It is within 0.031 s
  of IERS on twelve dated values from 1962 to 2026 and within 0.084 s on every
  IERS day since 1962. It is used where UTC as a leap-second scale is not
  defined (before 1972) and after the UT1 table.
- **A pin**, `deltaT` in seconds, fixes ΔT = TT − UT1. UT1 still comes from
  the instant (for UTC from 1972, with UT1 − UTC from the table).

For `"tt"` input the steps run backwards: TT → TAI = TT − 32.184 s → UT1 =
TAI + (UT1 − TAI); UTC is TAI − (TAI − UTC) with the TAI − UTC in force at
that TAI. Before 1972 and after the table, UT1 solves TT = UT1 + ΔT(UT1). For
`"ut1"` input, TAI is found from UT1 − TAI, then UTC, and TT follows. Inside a
leap second, 23:59:60 on UTC, the old TAI − UTC and UT1 − UTC are still in
force; JavaScript has no timestamp for that reading, and the engine uses the
one JavaScript gives it, the next day's 00:00:00 (the UTC instant that
`@zodiacs/engine/timing` scans from). rc.15's first cut read UT1 one second
early inside a leap second on TT input (ΔT 69.593 s instead of 68.593 s at the
end of 2016), and reported a UT1 − UTC that did not add up on UT1 input.

UT1 input is on the IERS basis when its own date is from 1972-01-01 to
2027-10-02, and TT input when its UTC reckoned with the ΔT model is. The table
then answers, and `ut1MinusUtc` is its value, band and source, also where the
instant's UTC falls a fraction of a second past the table's last day (up to
0.148 s; the last interval is carried on). rc.15's first cut labelled such
instants near the table's ends `"fallback"` with σ 0.9 s, and on TT input took
UT1 − UTC as 0 there.

Every sample of a calculation, including the ±0.001-day samples behind each
speed, is taken on the same scale and pin. A speed is the change of longitude
between its samples divided by the time between them: 0.002 day (the true
node's, 0.5 day) on the input's scale, or their TT interval where a leap second
or a step of the time basis lies between them: at 1972-01-01, at the table's
last day, where UT1 − UTC moves between the table and its fallback, and where
the ΔT model hands over from its spline to its knots at 1941.0, where it steps
13.95 ms. rc.15's first cut divided by 0.002 day there too: its speeds were
1.005787 times this rate within 86.4 s of a leap second, 0.9997422 times it at
1972-01-01, 1.000845 times at the table's last day and 0.9999193 times at
1941.0 (`docs/evidence/rc15-20260929/time-basis-fixes.json`).

### What a chart reports

`chart.deltaT` is `{ seconds, sigma, model, table, tableDigest, segment }`:

- `model` `"iers-utc/1"`: `seconds` = 32.184 + (TAI − UTC) − (UT1 − UTC);
  `sigma` the IERS formal error of UT1 − UTC (in 1972 C04's largest, 1.9 ms;
  after it the largest observed one of the year, or the prediction's) plus the
  table's own 0.79 ms; `table` is the `finals2000A.all` file's date,
  `tableDigest` the UT1 table's, and `segment` `"observed"` or `"predicted"`.
- `model` `"zodiacs-deltat/1"`: the model's value and band, `table`
  `DELTA_T_TABLE.version`, and its segment (`"long-term"`, `"reconstructed"`,
  `"observed"`, `"predicted"`, `"extrapolated"`).
- `model` `"pinned"`: the pin; `sigma`, `table` and `tableDigest` are null.

`chart.timeScale` is `{ input, basis, ut1MinusUtc, leapSeconds }`:
`ut1MinusUtc` is `{ seconds, sigma, source }` with `source` `"observed"`,
`"predicted"` or, for UTC or TT input after the table, `"fallback"`
(0 ± 0.9 s), and is null before 1972, for UT1 input after the table and with a
pin on UT1 or TT input; `leapSeconds` is `{ taiMinusUtc, listed }` where TT
came from the leap seconds, and null otherwise. Where both are given,
32.184 s + `taiMinusUtc` − `ut1MinusUtc.seconds` is `deltaT.seconds`, inside a
leap second too.

astronomy-engine keeps one ΔT function for its whole module. The engine
installs a constant ΔT for each sample and restores its model,
`deltaT` from `@zodiacs/engine/deltat`, when every call returns. Code that calls
astronomy-engine directly should install that model too
(`SetDeltaTFunction(deltaT)`). The nutation is the engine's own
(`src/nutation.ts`), computed for each TT, so no calculation depends on what
was computed before it. astronomy-engine's own nutation, which the engine no
longer calls, reuses the one it computed last for any time within 1e-6 day
(86 ms), so code that calls astronomy-engine directly can see two calculations
at almost the same TT differ in the twelfth decimal of a degree.

## Local wall times: `@zodiacs/engine/geo`

```ts
import { prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "@zodiacs/engine/geo";

await prepareLocalTime("1883-11-18", "America/New_York");
const resolved = resolveLocalToUtc("1883-11-18", "12:02", "America/New_York", { longitude: -74.006 });
```

`resolveLocalToUtc(date, time, timeZone, options?)` reads `time` (HH:MM) on
`date` (YYYY-MM-DD) in the IANA zone `timeZone`. A wall time the clock showed
twice (a fold) takes the earlier instant; one it skipped (a gap) moves forward
by the jump.

- **Before 1970** the zone's history is the one this package ships: tzdata
  2025c compiled with its `backzone` file (`TZDB`: version, archive sha256,
  form `"main+backzone"`), in 16 files that only the geo entry loads, lazily,
  one per call of `prepareLocalTime(date, timeZone)`. "With its backzone file"
  means the main data files without `backward`, and all of `backzone`, as the
  tzdb Makefile's `PACKRATDATA=backzone` with `PACKRATLIST` empty, not the
  `PACKRATLIST=zone.tab` form that Debian builds; each name is backzone's zone
  of that name, else the main data's, else a link, backzone's before
  `backward`'s. Before 1970 that is the Makefile's own build of that form for
  584 of the 597 names; for the other 13, links that backzone points at a zone
  it adds (Iceland at Atlantic/Reykjavik, America/Virgin at America/St_Thomas,
  and 11 more), the Makefile's `ziguard.awk` keeps `backward`'s target, and the
  package follows backzone (`docs/evidence/rc15-20260929/backzone-divergence.json`).
  A wall time before 1970-01-02 in a zone whose history is not loaded throws;
  `prepareLocalTime` resolves at once for a date in 1971 or later and for the
  fixed zones (`UTC`, `Etc/GMT+5` and the like), loads the history for any
  earlier date, 1970's included, and a failed load rejects and is tried again
  next time.
- **From 1970**, and in the fixed zones, the host's `Intl` answers, as it
  always has. Sixteen names whose backzone history would disagree with the
  default build after 1970 carry the default build's history instead
  (`zone.dataForm` `"main"`), so the hand-over at 1970 cannot jump:
  America/Argentina/ComodRivadavia, America/Ensenada, America/Nipigon,
  America/Rainy_River, America/Rosario, Asia/Chongqing, Asia/Chungking,
  Asia/Harbin, Asia/Kashgar, Atlantic/Jan_Mayen, EET, Europe/Tiraspol,
  Europe/Uzhgorod, Europe/Zaporozhye, Pacific/Enderbury and WET. Spans the
  history marks as having no local time (`-00`, the Antarctic stations before
  they were staffed) are read from `Intl`.
- `Intl` is also the cross-check: where the shipped history answered,
  `intlOffsetMinutes` is the host's offset at the same instant. Compared at
  every instant before 1970-01-01T00:00Z with tzdata 2025c's default build,
  which is what `Intl` carries on a host with tzdb 2025c and what rc.14 read,
  122 of the 597 names the package ships give another offset at some instant
  (all of them after 1850), for example Stockholm 1947-07-01 12:00, +1:00 in
  the shipped history and +2:00 in the default build. The two builds differ
  for 136 names; 15 of those ship the default build's history (above), and
  America/Pangnirtung differs where the default build has no local time
  (`-00`) and backzone has one. `docs/evidence/rc15-20260929/backzone-divergence.mjs`
  computes the lists from zic's output. The audit's list of 98 zones
  (`src/fixtures/tzdb-divergence-98.json`), which the tests and the
  conformance suite use, compared Debian's 2025b build (backzone restricted to
  zone.tab) with ICU: 28 of the 122 names are not on it, among them CET,
  EST5EDT, PST8PDT, America/Montreal, Europe/Belfast and Iceland, and 4 of its
  98 do not change (America/Tijuana, Antarctica/DumontDUrville,
  Antarctica/McMurdo and Antarctica/Syowa).

### Options

`options` is `{ longitude?, calendar?, country? }`. Any other key, or a value
of the wrong kind, throws `RangeError`, as does any unknown key of
`resolveLocalBirth`'s and `resolveBirth`'s input (so a misspelled `calender`
is refused rather than ignored).

- `longitude` (degrees east, −180 to 180): the birthplace's own mean time. See
  below.
- `calendar`: `"gregorian"` (default) or `"julian"`. A Julian (Old Style) date
  is converted exactly, through the Julian Day Number, to the proleptic
  Gregorian date the resolution uses; the time and zone carry over unchanged.
  Petrograd's 1917-10-25 12:00 Old Style, read in Europe/Moscow, is
  1917-11-07 12:00 in the Gregorian calendar, 08:28:41 UTC. Julian dates
  before Gregorian year 0000 throw.
- `country` (an ISO 3166-1 alpha-2 code, or the country's name in tzdata's
  `iso3166.tab`): adds `calendarNote`, from the country's row of
  `GREGORIAN_ADOPTION`: `"old-style"` when a date given as Gregorian falls
  before the row's first New Style day (it was probably written Old Style),
  and `"new-style"` when a Julian date falls on or after it. The note never
  changes the resolution. A country the table does not date gets no note.

`julianToGregorian` and `gregorianToJulian` convert YYYY-MM-DD strings for
years 0000–9999; `gregorianAdoption(country)` returns a row of the table.

**The adoption table** has 18 rows, from three public-domain sources that
`GREGORIAN_ADOPTION_SOURCES` names:

- `tzdb`: the `calendars` file of tzdata 2025c, whose list quotes
  H. Grotefend, *Taschenbuch der Zeitrechnung des deutschen Mittelalters und
  der Neuzeit*, edited by O. Grotefend (Hannover: Hahnsche Buchhandlung,
  1941), pp. 26–28;
- `grotefend-1891`: H. Grotefend, *Zeitrechnung des deutschen Mittelalters
  und der Neuzeit*, vol. 1, *Glossar und Tafeln* (Hannover: Hahn, 1891),
  pp. 133–134, s.v. "Neuer Stil";
- `grotefend-1898`: H. Grotefend, *Taschenbuch der Zeitrechnung des deutschen
  Mittelalters und der Neuzeit* (Hannover and Leipzig: Hahn, 1898), pp. 23–24.

A row is `{ code, country, region, firstGregorian, lastJulian, sources, note
}`. `country` is the name tzdata's `iso3166.tab` gives, which for three rows
differs from a GeoNames index's: `Czech Republic`, `Britain (UK)` and
`Netherlands`, where GeoNames has `Czechia`, `United Kingdom` and `The
Netherlands`. Pass the code where you have one. Many countries changed region
by region, so a row dates one region, `region`, as the sources name it (null
where they date the whole country): the region of the present capital where
the sources date it. `note` gives the other regions the sources date, by their
first New Style days, and where the sources disagree; a date in a note is
tzdb's unless another source is named. Where the sources disagree on the
row's own region, the row follows tzdb, the latest edition; for Hungary all
three give the legal change of 1587. Countries the sources do not date, which
includes every country that changed after 1753 except Russia, have no row.
`src/fixtures/gregorian-adoption.json` quotes the sources for every row and
note, and the tests check the table against it.

### Local mean time at the birthplace

Before a zone's clocks were set to a standard, tzdb records its **local mean
time** (LMT): the mean solar time of the one city the zone is named after.
A birth elsewhere in the zone kept its own mean time. With `longitude`, a wall
time inside the zone's LMT era is read on the birthplace's mean time,
`longitude × 240` seconds east of UTC (rounded to the second), placed on the
side of the date line the zone kept then. From the end of the era the zone's
legal clock applies.

- Only eras tzdb itself records as `LMT` qualify, a zone's first lines while
  they say LMT. A **legal** mean time is a standard like any other and is
  never replaced: Dublin Mean Time, Amsterdam Mean Time before 1937, Madras
  and Howrah time in Kolkata, Monrovia Mean Time and the like.
- A longitude more than three hours of time (45°) from the zone's own mean
  time is taken as a birthplace outside that zone's history and ignored.
- Where the host's default build records the end of the era later than
  backzone does, the birthplace moves straight to the later standard.
- `localMeanTime` is `{ longitude, zoneOffsetMinutes }` when the birthplace's
  mean time read the wall time, with the zone's own offset for comparison.
  It is also set when the wall time falls in the **gap** at the end of the
  era: the clock the reading came from was the birthplace's mean time, which
  the gap shift is measured from.

Buffalo, 1870-06-15 12:00 in America/New_York at 78.88° W, is 17:15:31 UTC
(−5:15:31), where New York's own LMT would give 16:56:02. Brest, Omaha, Porto,
Paris, Galway and Bergen are in the tests with their values.

### The result

| Field | Meaning |
| --- | --- |
| `utc` | the instant |
| `offsetMinutes` | minutes east at that instant; may be fractional |
| `flags` | `"dst-gap"` or `"dst-fold"` for a gap or fold of any cause, and `"lmt"` when a local mean time clock read the wall time |
| `date`, `writtenDate`, `calendar` | the Gregorian date resolved, and the date as written in its calendar |
| `jump` | `{ kind: "gap" \| "fold", cause }`, or null |
| `transition` | `{ at, offsetBeforeMinutes, offsetAfterMinutes, cause }`: the jump's, or the last change before the instant where the shipped history answered; null from 1970 without a jump |
| `localMeanTime` | see above |
| `zone` | `{ source: "tzdb" \| "intl", tzdbVersion, dataForm: "main+backzone" \| "main" \| "host", abbreviation, dst }`; `tzdbVersion` is the host's (Node reports it) when `Intl` answered |
| `intlOffsetMinutes` | the host's offset, where the shipped history answered |
| `calendarNote` | see Options |
| `localResolution` | the record for a receipt (below) |

A transition's `cause` comes from the tzdb record: `"date-line"` when the
offset moves by 12 hours or more; `"legal-change"` when the zone line's
standard offset changes (or only its abbreviation, or the birthplace's mean
time ends); `"dst"` when only daylight saving changes, double summer time
included. Before 1970 the causes are in the shipped history; from 1970 the
package carries the default build's non-daylight-saving changes
(`LATER_CAUSES`) and every other change is daylight saving. A zone line whose
end (UNTIL) is on the wall clock ends at the first instant its own clock reads
that time, as zic places it. rc.15's first cut placed 30 such ends an hour or
two late, where the line ended during daylight saving and the clock went
back, and labelled those changes of standard offset `"dst"`, in `jump.cause`
and in the receipts' `transition.cause`: Kyiv 1990-07-01, Cancún 1998,
Iqaluit 1999, Juneau and Sitka 1983, Tehran 1977, Tbilisi 2004, Paris and
Monaco 1945, Santiago 1946, eleven changes in ten Argentine zones, and nine
more
(`docs/evidence/rc15-20260929/tz-line-ends.json`, which checks each of the
1,125 such ends where the standard offset changes against the transitions
zic 2025c writes).

The six probes of the audit's time-5 finding resolve as follows (tests in
`src/geo/flags.test.ts`):

| Wall time | Flags | Jump | Clock |
| --- | --- | --- | --- |
| Guam 1890-06-01 12:00 (+9:39 LMT, whole minutes) | `lmt` | – | local mean time |
| Kolkata 1900-06-01 12:00 (+5:21:10 Madras time) | – | – | legal |
| Monrovia 1960-06-01 12:00 (−0:44:30 MMT) | – | – | legal |
| New York 1883-11-18 12:02 (end of LMT) | `dst-fold`, `lmt` | fold, legal-change | local mean time |
| Apia 2011-12-30 12:00 (the skipped day) | `dst-gap` | gap, date-line | legal |
| Kwajalein 1993-08-21 12:00 (the skipped day) | `dst-gap` | gap, date-line | legal |

### Changes and deprecations

- A wall time before 1970-01-02 needs `await prepareLocalTime(date, timeZone)`
  first; without it `resolveLocalToUtc`, `resolveLocalBirth` and
  `resolveBirth` throw an `Error` naming `prepareLocalTime`.
- `lmt` now means that a local mean time clock read the wall time. It used to
  mean an offset with seconds, which flagged legal times such as Madras time
  and missed LMT in whole minutes such as Guam's.
- **Deprecated:** the names `dst-gap` and `dst-fold`. They are kept, and now
  mean a gap or fold of any cause; read `jump.cause` for the cause. Renaming
  them would take a new receipt conventions set.
- New: `LocalTimeOptions`, `prepareLocalTime`, `resolveLocalBirth` (the core
  input with its resolution and the receipt's `reference`), `zoneOffsetAt`
  (the zone's own offset, minutes; before 1970 it throws, as
  `resolveLocalToUtc` does, until `prepareLocalTime` has loaded the zone's
  history, so one question always has one answer: rc.15's first cut answered
  from `Intl` until some other call loaded the history), `TZDB`, `calendarNote`,
  `gregorianAdoption`, `GREGORIAN_ADOPTION`, `GREGORIAN_ADOPTION_SOURCES`,
  `julianToGregorian`, `gregorianToJulian`, and the types `CalendarName`,
  `CalendarNote`, `GregorianAdoption`, `GregorianAdoptionSource`,
  `LocalBirthResolution`, `TransitionCause`, `ZoneTransition`.

## Receipts

The current conventions set, `NATAL_RECEIPT_CONVENTION_SETS[0]`, first
written by 0.1.1-rc.16, is rc.15's time-basis set with the nutation named:

- `nutation: "iau2000b;equation-of-equinoxes-with-two-complementary-terms"`,
  the engine's IAU 2000B series, all 77 luni-solar terms and the two fixed
  planetary offsets, with the two largest complementary terms in the
  equation of the equinoxes (the README's *Nutation*);
- `moonPosition: "astronomy-engine-geo-moon;no-light-time;no-aberration"`:
  the Moon is astronomy-engine's geocentric series (`GeoMoon`) turned to the
  ecliptic of date by the engine's precession and nutation, where rc.15's
  set named astronomy-engine's `EclipticGeoMoon`.

rc.15's time-basis set, `NATAL_RECEIPT_CONVENTION_SETS[1]`, which rc.15 wrote
with astronomy-engine's five-term nutation and did not name it, added to the
rc.8 set:

- `deltaT: "tt-minus-ut1;value-in-result"` (the instant is no longer read as
  UT1);
- `timeScale: "tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise;in-result"`;
- `localTime: "tzdb-shards-before-1970;host-intl-from-1970;flags-from-transition-record"`.

A receipt under either carries `receipt.timeScale` (the scale of
`receipt.instant`) and `result.timeScale`, and the codec checks that they agree
with `result.deltaT`; where the ΔT names this engine's IERS or model table, it
recomputes the basis at the instant and requires the same values. Another
release's table is a claim, checked for shape. A local resolution under the
set (`localResolution` from the resolver) also carries `calendar`,
`writtenDate`, `tzdbVersion`, `dataForm`, `clock` (`"local-mean-time"` or
`"legal"`), `transition` and `localMeanTime`, each checked against the
offsets and flags without consulting any timezone database: the Julian date
must convert to the resolved date, a gap's transition must account for the
shift, a date-line cause needs a change of 12 hours or more, and a birthplace
mean time must equal `longitude × 240` seconds at the instant (or just before
a gap out of it). A local resolution requires `receipt.timeScale` `"utc"`.

Receipts under rc.15's set, under the rc.8 set (0.1.1-rc.8 to rc.14), which
read the instant as UT1, and under the older sets stay readable, each
accepted only from the engine versions that wrote it: the current set only
from 0.1.1-rc.16 on, in SemVer 2.0.0 order (so not under 0.1.1-rc.15.1 or
0.1.1-beta), rc.15's set only under 0.1.1-rc.15, the rc.8 set only from rc.8
to rc.14. `natalReplayInput` replays the recorded request,
`timeScale` and pinned ΔT included. A receipt promises its request, not its
values, and an rc.8-set receipt's request is a UTC instant that its engine
read as UT1 (`deltaT: "tt-minus-ut1;ut1-read-as-utc;value-in-result"`). This
engine reads a UTC instant from 1972 to 2027-10-02 as UTC, so a replay moves
the sidereal time by (UT1 − UTC) × 15.04″ per second of it, up to 12.2″ (the
table's largest |UT1 − UTC| is 0.8106 s, on 1973-01-01), and the positions by
the change from the ΔT model to IERS ΔT.

Every receipt written before the engine took the full IAU 2000B nutation,
rc.15's included, was computed with astronomy-engine's five-term nutation, so
a replay also moves every longitude by the change in Δψ, which reaches 0.2701″
sampled every 10 minutes from 1800 to 2200
(`docs/evidence/nutation-2026-09-29/results/nutation-change.json`), and the
angles and cusps by the change in the sidereal time and the true obliquity
(see *Nutation* in the README). Over 16,218 receipts that the
carried rc.14 archive wrote for synthetic instants from 1972-01-01 to
2027-10-02 at latitudes from 0° to 65°, a replay on this engine moved the
midheaven by up to 12.81″; the ascendant and cusps by up to 12.9″ at the
equator, 20.15″ at 45°, 40.69″ at 60° and 129.9″ at 65°, and more toward the
polar circle; the Moon by up to 0.5981″, the other planets by up to 0.2717″
and the true nodes by up to 0.2545″
(`docs/evidence/nutation-2026-09-29/results/receipt-replay.json`; before the
nutation changed, rc.15 moved them by up to 12.85″, 12.94″, 20.07″, 40.55″,
129.1″, 0.462″, 0.0723″ and 0.0174″,
`docs/evidence/rc15-20260929/receipt-replay.json`). An ascendant that close to
a sign's edge changes sign: an rc.14 receipt of 1973-01-05T06:56:44Z at
59.33° N 18.07° E records Sagittarius 29.99765° and replays to Capricorn
(`src/replay-time-basis.test.ts`). Before 1972 and after 2027-10-02, where
both engines read the instant as UT1 on the model, only the nutation moves
them: over 7,896 synthetic charts from 1850 to 2150 at four places up to
60.17° N, every longitude by up to 0.2635″, the ascendant and cusps by up to
0.8003″ and the midheaven by up to 0.2576″
(`docs/evidence/nutation-2026-09-29/results/rc14-comparison.json`).

To reproduce such a receipt as closely as this engine can, read the recorded
instant on UT1 with the recorded ΔT pinned:

```ts
const envelope = parsed.envelope; // an rc.8-set receipt, from parseNatalEnvelope
const chart = natalChart({
  ...natalReplayInput(envelope),
  timeScale: "ut1",
  deltaT: envelope.result.deltaT!.seconds
});
```

Up to rc.15 that gave, on those 16,218 receipts, the recorded angles and cusps
exactly, the Moon exactly, the other planets within 0.0000022″ and the true
nodes within 0.0095″, the speeds differing in the last digits (up to
0.000017 °/day for the nodes, 0.00000055 °/day for the Moon), because rc.14
installed its ΔT model for each speed sample and a pin is one constant
(`docs/evidence/rc15-20260929/receipt-replay.json`). This engine's nutation
differs from the one those receipts were computed with, so it gives them
within the change in Δψ: every longitude within 0.2554″, the angles and cusps
within 3.022″ and the speeds within 0.0000276 °/day
(`docs/evidence/nutation-2026-09-29/results/receipt-replay.json`). The 1973
receipt's recorded angles and cusps are exactly astronomy-engine's five-term
sidereal time and obliquity at that clock, and its longitudes differ from this
engine's by the change in Δψ alone (`src/replay-time-basis.test.ts`). The chart
then reports the pinned basis, not rc.14's model.

## Regenerating the data

```sh
# src/tzdb/: the zone histories and LATER_CAUSES (needs zic)
node scripts/build-tz-shards.mjs            # downloads tzdata2025c.tar.gz into .cache/ once
TZDATA_TARBALL=/path/tzdata2025c.tar.gz node scripts/build-tz-shards.mjs
node scripts/build-tz-shards.mjs --check

# src/time-scale-data.ts, from the inputs committed in scripts/time-scale-sources/
node scripts/build-time-scales.mjs [--check]
# the same, also checking the committed rows against the whole IERS files
IERS_FINALS=/path/finals2000A.all IERS_C04=/path/eopc04.1962-now node scripts/build-time-scales.mjs [--check]
```

Both generators refuse inputs whose SHA-256 differs from the pinned one
(tzdata2025c.tar.gz:
`4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957`). The
time-scale generator's inputs are committed because IERS replaces
`finals2000A.all` and `eopc04.1962-now` every day: the leap-second list as
IERS serves it, the header and the 367 rows of `eopc04.1962-now` it takes, and
MJD, flag, UT1 − UTC and formal error of each of the 19,997 rows of
`finals2000A.all` of 2026-09-24 that give UT1 − UTC (the whole file is
3.8 MB); the script records each whole file's name, date and SHA-256, and
pins the digest of each committed file (of the `finals2000A.all` rows, their
uncompressed text). `npm test` runs its check
(`scripts/build-time-scales.test.mjs`). Moving to another tzdb release or IERS
file is a data change: a new file name, digest and receipt conventions where
the values change.

## Limits

- The leap-second list expires 2027-06-28 and the UT1 table ends 2027-10-02;
  predictions widen `sigma` toward the end (26.2 ms on the last day). After the
  table, UT1 − UTC is 0 ± 0.9 s and TT comes from the model.
- Known limitation: the ΔT model `zodiacs-deltat/1` steps back 13.95 ms at
  1941.0 (1940-12-31T18:00 UT1), where its spline hands over to its knots
  (review finding F-47), and this candidate keeps the step. Removing it would
  change the model's values there. A receipt that rc.8 to rc.14 wrote records
  the model's ΔT, and the receipt codec recomputes it and refuses a difference
  over 1e-9 s, so valid receipts of those versions would fail validation. The
  fix needs a new model name, in a later candidate. Until then a speed whose
  samples straddle the step divides by their TT interval (above).
- The shipped history is tzdb's best reconstruction; before about 1970 many
  records are uncertain, and tzdb's own comments say so.
- From 1970 the offsets are the host's, whatever its tzdb release, but the
  causes are tzdb 2025c's: a change that only a newer host knows is resolved
  with the host's offsets and reported as `"dst"`.
- The adoption table gives one date per present-day country, for the region
  its row names; the note gives the other regions the sources date, and some
  regions (Moravia, Zeeland, Drenthe) they do not date at all. It dates only
  the 18 countries its public-domain sources cover.
