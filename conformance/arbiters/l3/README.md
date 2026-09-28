# L3 arbiters: time and calendars

`build.py` writes `vectors/L3-time-calendars.json`: 110 vectors in six kinds,
decided by five arbiters. None of them is an astrology engine and none is
Swiss Ephemeris; the zone arbiter reads only TZif files it compiles itself.
The format is the one in `../../SPEC.md`.

| kind | vectors | ids | arbiter | tolerance |
| --- | ---: | --- | --- | --- |
| `time.zone-offset` | 45 | `L3-TZ-0001`…`0045` | `tzdb-2025c-backzone` | exact |
| `time.local-mean-time` | 5 | `L3-LMT-0001`…`0005` | `lmt-definition` | 0.001 s |
| `time.tt-minus-utc` | 10 | `L3-TTU-0001`…`0010` | `iers-leap-seconds-2025c` | 0.0005 s |
| `time.delta-t` | 15 | `L3-DT-0001`…`0015` | `iers-ut1-finals2000a` | 0.1 s |
| `calendar.to-jdn` | 25 | `L3-JDN-0001`…`0025` | `calendar-arithmetic` | exact |
| `calendar.from-jdn` | 10 | `L3-CAL-0001`…`0010` | `calendar-arithmetic` | exact |

## Files

| file | sha256 | what it is |
| --- | --- | --- |
| `arbiters/l3/build.py` | — | the generator; the case design is fixed in it, rule by rule |
| `arbiters/l3/check_swiss.py` | — | after-the-fact Swiss Ephemeris statistics (never values) |
| `sources/l3/tzdata.json` | `f6b6fd03b9efd1c38afb716d37195a4e3777057fb74922119b74218d94795d69` | the tz release record: tarball URLs, sizes and SHA-256, the signature check, the SHA-256 of every file in both tarballs and what the build uses it for, the build recipe, and the digest of the compiled tree |
| `sources/l3/leap-seconds.list` | `f060924e3a76ee4e464f6664035b7beae834155dd93a81c50e922f94dfdb1d20` | tzdata 2025c's copy, unchanged |
| `sources/l3/iers-finals2000A-ut1.csv` | `c698117a9c11524196e51a71493776e3287223b9ee75582548392dec8d45f669` | the committed IERS extract (`docs/platform/evidence/engine-beyond-swiss/corpora/`), unchanged |
| `sources/l3/tzdb-divergence-98.json` | `d3258be9118494fba3cff97dea1a954f13f7c084249494674f5eaed7b816ee3e` | the committed divergence list (same corpora directory), unchanged; `build.py` draws 20 zone cases from it by rule, so it is copied here to keep the build self-contained |
| `vectors/L3-time-calendars.json` | `434365354095524646f68423634f0b07a05333c702fc02227fd7fd1bccb0e4c8` | the output |

Neither tz tarball nor any compiled TZif file is committed. The vector file
names the tarballs as `url` inputs with their SHA-256; `build.py` refuses a
tarball, or any file in it, whose digest differs from `tzdata.json`.

## Regenerating

```bash
python3 conformance/arbiters/l3/build.py            # downloads both tarballs from IANA
python3 conformance/arbiters/l3/build.py --tzdata tzdata2025c.tar.gz --tzcode tzcode2025c.tar.gz
python3 conformance/arbiters/l3/build.py --tzdata DIR --zic ZIC --zdump ZDUMP   # prebuilt 2025c tools
python3 conformance/arbiters/l3/build.py --check     # rebuild, compare with the committed file
```

Options: `--full-tz-check` also compares the three zone readers on every
compiled file; `--skip-dense-check` skips the ten-thousand-year calendar walk
(about a minute); `--work DIR` keeps the build tree. The build log goes to
standard error.

Requirements: Python ≥ 3.9 (`zoneinfo`; tested with 3.11.15), a POSIX awk to
run tzdb's own `ziguard.awk` and `zishrink.awk` (tested with mawk 1.3.4
20240123), and zic and zdump from tzcode 2025c: built here from the tzcode
tarball with `make zic zdump` (needs make and a C compiler; tested with GNU
Make 4.3 and GCC 13.3), or passed with `--zic`/`--zdump`. Other zic versions
are refused unless `--any-zic` is given. `check_swiss.py` needs pyswisseph.

## The arbiters

### `tzdb-2025c-backzone` (time.zone-offset)

The IANA time zone database, release 2025c (2025-12-10): `tzdata2025c.tar.gz`
(sha256 `4aa79e4e…f957`) and `tzcode2025c.tar.gz` (sha256 `697ebe66…5740`),
both from `https://data.iana.org/time-zones/releases/`. Both OpenPGP
signatures were checked on 2026-09-28: good signatures by Paul Eggert, key
`7E37 92A9 D8AC F7D6 33BC 1588 ED97 E90E 62AA 7E34`.

`utc_offset_s` is local time minus UTC in seconds, positive east of
Greenwich; `utc_offsets_s` holds both offsets of an ambiguous local time, the
earlier instant's first.

Why backzone: a birth chart needs the local time in force where and when the
birth happened, often before 1970. tzdb's default build does not keep that
history for the zones backzone covers: it makes each of them a link to
another zone whose clocks have agreed with it since 1970, so the zone answers
with the other zone's history. Africa/Banjul at 1880-12-31T12:00:00, for
example, gets Abidjan's local mean time (−968 s) instead of its own
(−3996 s). The maintainers' caveat applies: the tzdata 2025c Makefile offers
backzone as "out-of-scope and often-wrong data", and its `theory.html` says
the file "is less reliable and does not necessarily follow database
guidelines". `build.py` checks both quotes verbatim against the verified
release files, and checks the Banjul example against the build.

Build: the two tarballs are laid out as one tree (their nine shared files are
identical), `make zic zdump` builds the tools, and the data go through tzdb's
own recipe for `make PACKRATDATA=backzone PACKRATLIST=zone.tab tzdata.zi`:
`ziguard.awk` in main form over africa, antarctica, asia, australasia,
europe, northamerica, southamerica, etcetera, factory, backward and backzone,
then `zishrink.awk`, then `zic -d DIR tzdata.zi` with zic's defaults (slim
TZif, no leap seconds). The `main.zi` and `tzdata.zi` this produces are
byte-identical to the ones `make` produced in the same tree, and `main.zi`
compiled on its own gives the same 598 TZif files byte for byte.

Readers: for each vector, three readers of the compiled file look for every
UT instant *t* with *t* + offset(*t*) = the local time:

1. `zdump -V -c 1600,2040` (tzcode's `localtime.c`), whose transitions are
   parsed from its output (`zdump -i` for a zone with none in the window);
2. an independent TZif v2+ parser in `build.py`, with its own evaluator for
   the POSIX TZ string in the file's footer;
3. CPython's `zoneinfo.ZoneInfo.from_file` on the same bytes (no search path,
   so no fallback to host or PyPI data), trying both folds and keeping those
   that round-trip.

They must agree on the verdict and on the abbreviation. One instant gives
`ok` with its offset, two give `ambiguous` with the earlier instant's offset
first, none gives `nonexistent`.

Local mean time and seconds: in tzdb 2025c no Zone or Rule line carries
fractional seconds. LMT and the other mean-time offsets are stated to the
whole second; the 33 more precise values the source knows (for example New
York's −4:56:01.6, Lisbon's −0:36:44.68) appear only in `#STDOFF` comment
lines, and each data line gives its comment's value rounded to the nearest
second, ties to even (`build.py` checks all 33). `ziguard.awk` would put the
fractions into the data only in vanguard form with `VANGUARD_SUBSECONDS` set.
zic itself rounds any fraction it is given the same way: zic(8) says so, and a
probe compiled with this zic stores 0:29:45.5 as 1786 s and 0:29:44.5 as
1784 s. The expected value is always the offset stored in the compiled TZif
file.

Case design (fixed in `build.py`; nothing after 2037):

- **20 cases from the divergence list**, the 98 zones where the audit found
  tzdb-with-backzone and ICU's default build disagreeing. In the list's
  order: keep zones this build compiles from a Zone line; take each one's
  longest sample segment ending by 1970-01-01; the local time is 12:00:00 on
  the segment's middle day; drop it if the compiled data call that time
  `-00`; take every fourth zone left, starting with the first. Of the 98
  zones, 6 are links in this build, 11 have no sample segment, 4 fall in a
  `-00` span, and 77 remain. These 20 vectors carry `"tags":
  ["backzone-history"]`: they test which build an engine uses. Each note
  gives the answer of tzdb's default build (no backzone); all 20 differ from
  it.
- **7 ordinary cases after 1970**: northern and southern summer time,
  São Paulo's summer time before 2019, +05:30, +05:45, +13:45, and Paris in
  2035 (after the file's last explicit transition, so from its TZ string).
- **9 skipped or repeated times**: New York spring forward and fall back
  (2021), Sydney fall back (2020), Lord Howe's half-hour fall back (2021),
  London's double summer time starting and ending (1941), Caracas's
  −04:30 → −04:00 change (2016), Apia's skipped 30 December 2011, and
  Sitka's repeated day of 1867 when Alaska moved across the date line.
- **6 local-mean-time cases** before the first standard-time transition:
  New York 1870 (−17762 s), Lisbon 1880 (−2205 s), Paris 1880 (561 s),
  Tokyo 1880 (33539 s), Sydney 1880 (36292 s), São Paulo 1900 (−11188 s).
- **3 others**: Dublin 1916, summer time on Dublin Mean Time (+2079 s);
  Kiritimati, +14:00; Casablanca's predicted Ramadan offset of January 2030
  (+00), from explicit transitions rather than the TZ string.

Casablanca 2030 (`L3-TZ-0045`) is 2025c's answer, and its note says later
releases differ. I checked the current release on 2026-09-28: tzdb 2026d
(2026-09-11; `tzdata2026d.tar.gz` sha256 `0cb2aa8e…7767`, `tzcode2026d.tar.gz`
sha256 `2f5c9f7f…1791`, signatures good) puts Morocco on permanent +00 from
2026-09-20 02:00. Built the same way and read by the same three readers, it
gives +00 at 2030-01-20T12:00:00 too, for that reason rather than Ramadan,
but +00 where 2025c gives +01 on most other 2030 dates (2030-03-01, for
example).

Uncertainty: none in the computation. The data are tzdb's reconstruction:
pre-1970 offsets, backzone's most of all, are estimates, and the 2030 and
2035 cases are predictions (2026d has already replaced the 2030 one). A
vector tests agreement with this build of tzdb 2025c, not with history.

### `lmt-definition` (time.local-mean-time)

Local mean time runs ahead of UT by lon/15 hours: 240 s per degree east. The
five longitudes (−0.125, 2.3125, −77.0625, 139.75, 179.9375) are multiples of
1/16° (5 × 0.0125°), so both the decimal input and lon × 240 are exact
binary numbers and the expected offsets are exact integers. The 0.001 s
tolerance only absorbs an implementation's floating-point rounding.

### `iers-leap-seconds-2025c` (time.tt-minus-utc)

`leap-seconds.list` from tzdata 2025c, the IERS Earth Orientation Centre's
file (Paris Observatory), updated through IERS Bulletin C: last update
2025-07-07 (NTP 3960835200), expires 2026-06-28 (NTP 3991593600). Its `#h`
line, SHA-1 `49db2447 571e5e1b 2f002a53 9c8da8e4 39b8e49e`, is verified the
way NTP's `leapsec_validate` does it: SHA-1 over the digits of the `#$` and
`#@` lines and of the data lines, in file order. TT − UTC = 32.184 s +
(TAI − UTC), since TT = TAI + 32.184 s exactly.

Each line's epoch is 00:00:00 UTC of the day it names (MJD = X/86400 + 15020,
"epoch in clear"), and its DTAI is "the quantity to add to UTC to get the
time in TAI" until the next line's epoch. **The leap second itself**:
23:59:60 is the 86,401st second of the day it ends, so it comes before the
next line's epoch and keeps the old value. At 2016-12-31T23:59:60Z,
TAI − UTC = 36 s and TT − UTC = 68.184 s; that puts TAI at
2017-01-01T00:00:36, one second after 23:59:59 + 36 s, as it must be, and the
new value 37 s applies from 2017-01-01T00:00:00. The definition is not
ambiguous once the epoch is read as the start of a UTC day (the NTP
timestamps alone could not name 23:59:60), so the case is kept
(`L3-TTU-0008`). A 23:59:60 input is accepted only on a day the table ends
with a leap second, and every input lies between the first line (1972) and
the expiry.

### `iers-ut1-finals2000a` (time.delta-t)

UT1 − UTC from the committed extract of the IERS `finals.all` (IAU 2000) file
fetched 2026-09-22 (sha256 `c672540e…58a1`, 3,767,520 bytes; see the corpora
README for its provenance). The 15 dates are 1 January and 1 July
alternately, every 3.5 years from 1974-01-01 to 2023-01-01; all 15 rows are
flagged `I` (observed), and four of the dates are first days after a leap
second. The rows are at 0h UTC, so the input is the UT1 reading at that
instant, `jd_ut1 = 2400000.5 + MJD + (UT1 − UTC)/86400`, and nothing is
interpolated; the extra input key `utc` names the row's instant. Expected
ΔT = TT − UT1 = 32.184 s + (TAI − UTC) − (UT1 − UTC).

Uncertainty: the IERS formal error on these rows is at most 0.71 ms (1977);
the values are published to 0.1 µs. Tolerance 0.1 s: a ΔT error of 0.1 s
moves the Moon by about 0.05″ (its mean motion is about 0.55″ per second of
time), which keeps ΔT's share of the L1 positional tolerance (1″) near 5%.

### `calendar-arithmetic` (calendar.to-jdn, calendar.from-jdn)

Exact integer arithmetic, both calendars proleptic, astronomical years.
`jdn` is the integer Julian Day Number of the civil day, the Julian date at
its noon: the day that begins at JD n − 0.5 has JDN n.

- Richards, E. G. (2013), "Calendars", in Urban & Seidelmann (eds.),
  *Explanatory Supplement to the Astronomical Almanac*, 3rd ed., §15.11,
  Algorithms 3 and 4 with the Julian and Gregorian parameters. Every vector
  is computed with it.
- A second published algorithm must agree on every vector: Fliegel & Van
  Flandern (1968), *Communications of the ACM* 11(10), 657, for the Gregorian
  calendar (Fortran truncating division); Meeus, *Astronomical Algorithms*,
  2nd ed. (1998), ch. 7, for the Julian calendar (INT as truncation, as
  published).
- Gregorian vectors must also match Meeus's Gregorian formulas with INT read
  as floor (see the finding below).

The 25 to-jdn cases cover JDN 0 in both calendars, negative years, year 0,
Julian and Gregorian 29 February (including years −4712, −4000, −1000, 0,
1700, 1900, 2000 and 4000), the 1582-10-04/15 switch in both calendars, the
British 1752 switch, J2000, and 9999-12-31. The 10 from-jdn cases return
JDN 0 in both calendars, the last day of year 0, the Gregorian leap day of
year 0, both sides of 1582, a Julian and a Gregorian leap day, J2000 in the
Julian calendar, and 9999-12-31.

## Check results (2026-09-28)

**Determinism.** Two runs, one downloading both tarballs from IANA and one
from local copies, wrote the same bytes, sha256
`434365354095524646f68423634f0b07a05333c702fc02227fd7fd1bccb0e4c8`;
`--check` reports the file up to date.

**Format.** `build.py` validates its output against SPEC.md before writing
(file and arbiter keys, input digests, ids in sequence, required input and
expected keys per kind, tolerance forms, civil-time and UTC formats, nothing
after 2037, every arbiter used). `node conformance/harness/validate.mjs
--expect-total 500` from the worktree root reports L3 with 110 vectors and
five arbiters and no problems; the suite conforms at 500 vectors.

**Time zones.**

- Every digest in `tzdata.json` matched (32 tzdata files, 41 tzcode files);
  the tools report `zic (tzcode) 2025c` and `zdump (tzcode) 2025c`.
- The compiled tree has 598 TZif files, digest
  `98ba2bd3eb549fced32814888318d478c96eb65d5fa5b482ee1d89ebb298bcc5` (over
  sorted "path sha256" lines, as recorded in `tzdata.json`).
- The three readers agree on all 45 vectors, verdicts and abbreviations:
  36 `ok`, 5 `ambiguous`, 4 `nonexistent`.
- `--full-tz-check`: the three readers also agree on every one of the 598
  files at 83,540 instants, every breakpoint that zdump or the parser
  reports between 1600 and 2040 and the second before each.
- Cross-check with other implementations: the same build with Ubuntu's
  glibc 2.39 `zic` and `zdump` (`--any-zic`) writes different TZif bytes
  (tree digest `8e921172…ca05`) and reads them with glibc's own TZif code,
  yet `--check` finds the vector file byte-identical, and `--full-tz-check`
  passes there too (83,876 instants).

**Leap seconds.** The SHA-1 line verifies; 28 lines, each step +1 s.

**ΔT.** 15 observed rows; the largest formal error is 0.0007116 s.

**Calendars.** All three algorithms agree on all 35 vectors. The dense walk
covered every day from −5000-01-01 to 5000-12-31, stepping with each
calendar's own month lengths:

| | Julian | Gregorian |
| --- | ---: | ---: |
| days | 3,652,866 | 3,652,790 |
| days with JDN ≥ 0 | 3,547,674 | 3,547,638 |
| Richards: round-trip, step or anchor failures | 0 | 0 |
| second algorithm, JDN ≥ 0 (Meeus / Fliegel & Van Flandern) | 0 | 0 |
| second algorithm, JDN < 0 (no vector there) | 103,791 | 63,983 |
| Meeus Gregorian, INT as floor, whole range | — | 0 |
| Meeus Gregorian, INT as truncation, JDN ≥ 0 | — | 13,141 |

The anchors are JDN 0 = Julian −4712-01-01 and Gregorian −4713-11-24,
2299160/2299161 for 1582-10-04 (Julian) and 1582-10-15 (Gregorian), and
2451545 = Gregorian 2000-01-01. No vector lies at JDN < 0.

**Swiss Ephemeris, as an instrument** (`check_swiss.py`, pyswisseph 2.10.03;
statistics only, no value came from it):

- `swe_julday`/`swe_revjul` agree with 25 of 25 to-jdn and 10 of 10 from-jdn
  vectors, and with Richards on every day of the dense range in both
  calendars, 7,305,656 days, including those before JDN 0.
- `swe_utc_to_jd` puts all 10 tt-minus-utc vectors within tolerance (largest
  difference 25 µs, the resolution of a double-precision Julian date), and
  agrees within 0.5 ms at 39,831 instants: 00:00:00 and 23:59:59 of every
  day from 1972-01-01 to 2026-06-27 and 23:59:60 of all 27 leap-second days.
  It too gives the old TAI − UTC during 23:59:60.

## Findings worth knowing

1. **A link-chain quirk in the 2025c Makefile's backzone build.**
   `ziguard.awk` shortens link chains with a table that a backzone Zone line
   does not clear. `backward` makes America/Curacao a link to
   America/Puerto_Rico; backzone then defines Zone America/Curacao and
   `Link America/Curacao America/Kralendijk`; the shortening rewrites the
   latter to `Link America/Puerto_Rico America/Kralendijk #= America/Curacao`.
   So `make PACKRATDATA=backzone PACKRATLIST=zone.tab` gives Kralendijk
   Puerto Rico's history, not backzone's Curaçao history. Fifteen link names
   end up like this: Africa/Asmera, Africa/Timbuktu, America/Coral_Harbour,
   America/Kralendijk, America/Lower_Princes, America/Marigot,
   America/St_Barthelemy, America/Virgin, Antarctica/South_Pole, Iceland,
   Arctic/Longyearbyen, Atlantic/Jan_Mayen, Pacific/Truk, Pacific/Yap and
   Pacific/Ponape. Six of them are on the divergence list; rule 1 leaves them
   out, since their answer would test a build-script quirk rather than
   backzone data. No NEWS entry up to release 2026d mentions it.
2. **`-00` spans.** Four zones' middle points (Kerguelen 1900, Syowa 1898,
   McMurdo 1898, Dumont d'Urville 1920) fall where tzdb says local time is
   unspecified (`-00`, offset 0). They are left out: there is no civil
   offset to test, and SPEC.md has no status for it.
3. **Meeus's Gregorian formulas need floor division before 400 AD.** Read
   with INT as truncation, the Gregorian branch of Meeus ch. 7 gets 13,141
   proleptic dates with JDN ≥ 0 wrong, all between years −4700 and 300,
   where A/4 or α/4 is negative. Meeus's own method never takes that branch
   before 1582-10-15, so the book is not wrong; an implementation that
   extends it to the proleptic calendar with truncating division is. Read
   with floor, it agrees everywhere, even before JDN 0. Fliegel & Van
   Flandern, and Meeus's Julian formulas, used with the truncating division
   they are published with, disagree with Richards before JDN 0 (Meeus says
   his method is not valid for negative Julian Day numbers); no vector lies
   there.
4. **The divergence list compared ICU with Debian's 2025b build**, so a
   segment can reflect a 2025b → 2025c change rather than backzone
   (America/Tijuana in 1953 and 1961–1975 is one; it was not among the 20
   taken). The expected values are always what this 2025c build says.
5. **zdump needs an absolute path.** tzcode's `localtime.c` reads a TZ value
   that does not start with `/` as a zone name under its compiled-in TZDIR,
   so `zdump` given a relative file path silently answers for something
   else. An ad-hoc run of mine did exactly that and the three-reader check
   stopped it; `build.py` now resolves every path it hands to zdump.
