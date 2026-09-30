# Time basis and local time: evidence

Base: `4eee700` (the 0.1.1-rc.13 candidate with its carried archive), branch
`feature-time`. The version is not bumped and `CHANGELOG.md` is not edited:
the integrator does both. User documentation is [`docs/time.md`](../../time.md).

**Integration into 0.1.1-rc.15 (2026-09-29).** The branch's code commit and
this evidence were cherry-picked onto rc.14. The commit "Minify whitespace in
the published build" (353b71b) was dropped by decision and is not in rc.15:
the published JavaScript is not minified. The branch and its commits,
353b71b included, are local and were never pushed; this repository's history
carries the branch's work in rc.15's one integration commit
([`../rc15-20260929/`](../rc15-20260929/README.md), *The published
history*). rc.15 gates the package by a budget for each entry point's import
graph and a stated total cap instead of the 300,000-byte cap below, and
`BEFORE_TIME_BASIS` names 0.1.1-rc.15, which releases the conventions set.
Everything below was measured on this branch; the sizes of rc.15 and these
checks repeated at the integrated head (the round-trip scans, the Julian Day
Number check, the generators and the leap seconds) are in
[`../rc15-20260929/`](../rc15-20260929/README.md).

Every case in these checks is synthetic or already published: towns at the
city index's coordinates, historical clock changes, and the audit's probes.
No Swiss Ephemeris code, data or output is used or committed.

## What changed

- **Step 1.1, the birthplace's own mean time.** `resolveLocalToUtc(date,
  time, timeZone, { longitude })` reads a wall time in the zone's local mean
  time era on `longitude × 240` s, on the side of the date line the zone kept
  then, and says so (`localMeanTime`, `flags: ["lmt"]`, receipt
  `clock: "local-mean-time"`). Only eras tzdb records as LMT qualify, never a
  legal mean time, and a gap at the end of the era keeps its mean-time
  record: the site's open findings F-39 and F-38 are not carried over.
- **Step 1.12, pinned tzdb history.** tzdata 2025c with backzone, compiled by
  zic, ships as 16 per-name-hash shards (`dist/tzdb-2025c-NN-*.js`) that only
  the geo entry loads, lazily, through `prepareLocalTime`. Results name the
  tzdb version and data form. The host's `Intl` answers from 1970 and serves as
  the cross-check before it (`intlOffsetMinutes`). Generator:
  `scripts/build-tz-shards.mjs` (the site's approach; the archive's SHA-256 is
  pinned and checked).
- **Step 1.13, Julian dates.** `calendar: "julian" | "gregorian"`, converted
  exactly through the Julian Day Number (`src/civil-calendar.ts`), with a
  per-country adoption note (`country`, `calendarNote`, 42 countries). Unknown
  calendar values, options and input keys throw `RangeError`.
- **M3a, leap seconds.** TAI − UTC from the `leap-seconds.list` in tzdata
  2025c (its own SHA-1 verified; expiry 2026-06-28 recorded and reported),
  so TT = UTC + (TAI − UTC) + 32.184 s exactly from 1972.
- **M3b, UT1 − UTC.** From IERS finals2000A.all of 2026-09-24, observed and
  predicted, as UT1 − TAI every third day (table digest `7c5fae131ba66b54`,
  within 0.79 ms of every daily IERS value), fed to sidereal time: UT1 drives
  the angles, TT the positions. Outside the table UT1 − UTC is 0 ± 0.9 s; the
  ΔT model stays before 1972 and after the table. `timeScale: "utc" | "ut1" |
  "tt"` on birth input, default UTC, unknown values refused.
- **M3d, receipts.** A new conventions set records `receipt.timeScale` and
  `result.timeScale` (ΔT with σ and model, UT1 − UTC with source and band,
  leap seconds), and the local resolution's calendar, tzdb version, data form,
  clock, applied transition and birthplace mean time, all checked
  arithmetically. rc.8-set receipts (rc.8 to rc.13) and older ones stay
  readable; each set is accepted only from the engine versions that wrote it.
- **M3e, flags from the transition record.** LMT, legal change, DST and date
  line come from the tzdb record; every gap or fold carries `jump.cause`. The
  flag names `dst-gap`/`dst-fold` are kept, deprecated, and now mean a gap or
  fold of any cause.

## Results

Host: Node 22.22.2 (ICU 78.2, tz 2025c) on Linux, 2026-09-28, unless stated.

| Check | Result | Evidence |
| --- | --- | --- |
| Full unit suite | 2,889 passed in 40 files (rc.13: 2,652 in 32) | full-tests.log |
| The same suite on Node 20.19.0 (tz 2025a) and 24.21.0 (tz 2026c) | 2,888 passed and 1 skipped on each: the comparison with the host's tzdb runs only on a 2025c host | other-nodes.log |
| Typecheck, build, exports smoke, package contents, pack dry run | Pass. 47 files, 465,029 bytes unpacked: 276,525 without the shards (cap 300,000), 188,504 in 16 shards (budget 200,000); 131.3 kB packed. The core entry's static graph reaches no shard and no dynamic import; the geo entry imports its 16 shards dynamically | checks.log, sizes.json |
| Generators in `--check` mode, from the pinned tzdata archive (also downloaded afresh from IANA) and IERS file | src/tzdb/ and src/time-scale-data.ts reproduce exactly | generators.log |
| Round trip, unit-suite scope: every offset change 1850–2037 on a 14-day step, minute before/at/after each edge and the midpoint | 597 zones, 39,829 changes, 278,799 wall minutes, 0 failures | roundtrip-default.json |
| Round trip, full scope: every change 1850–2100 on a daily step, ±1, 2, 30, 60 and 120 min at both edges and every 10 min within 2 h | 597 zones, 65,237 changes, 2,548,849 wall minutes, 0 failures (703 s) | roundtrip-full.json |
| Julian↔Gregorian against an independent Python implementation of Richards (Explanatory Supplement, 3rd ed., 2013, §15.11), every day from JDN 0 (−4712-01-01 Julian) to Julian 3000-12-31 | 2,817,174 days in both calendars, 1,096,114 string round trips: 0 mismatches | jdn-richards.json, `scripts/verify-jdn.py` |

The full round trip is `node scripts/roundtrip-scan.mjs --full`, on the built
package. The engine audit's scan tested 1.68 million minutes; this scope tests
more around every change and reaches 2100.

### Acceptance cases (unit suite)

| Case | Result | Test |
| --- | --- | --- |
| Buffalo 1870-06-15 12:00, 78.88° W | 17:15:31Z (−5:15:31), `lmt`; New York's own LMT −4:56:02 recorded | src/geo/birthplace.test.ts |
| Brest 1880 / Omaha 1880 / Porto 1880 | 12:17:58Z / 18:23:46Z / 12:34:26Z | same |
| New York 1870 and Chicago 1880 at their own meridians | identical to the zone | same |
| Paris 1880 at 2.35° E | +0:09:24 (tzdb +0:09:21) | same |
| Brest 1900, Galway 1885, Porto 1890 under national mean time; Amsterdam 1900, Kolkata 1900, Monrovia 1960 | unchanged by the longitude, no `lmt` (F-39) | same |
| Bergen 1894 (Oslo kept LMT to 1895; Intl follows Berlin) | 11:38:43Z (+0:21:17); zone +0:43, Intl +1:00 | same |
| Gap: Buffalo 1883-11-18 11:50 | 17:05:31Z, gap caused by legal change, shift 15:31, mean time kept (F-38) | same |
| Fold: Hartford 1883-11-18 12:05 | 16:55:46Z, earlier of two, `dst-fold` + `lmt`, legal change | same |
| The 98-zone divergence list; Stockholm 1947-07-01 12:00 | shipped history +60 (host +120); 179 of 185 segments as the reference, 6 known differences (Tijuana ×3, Coral_Harbour ×3), 8 `-00` spans left to Intl | src/geo/zone-history.test.ts |
| Petrograd 1917-10-25 12:00 Old Style, Europe/Moscow | 1917-11-07, 08:28:41Z; Sun 224° (13° from the date typed as Gregorian) | src/geo/calendar.test.ts |
| The six time-5 probes | Guam 1890: `lmt` (whole minutes). Kolkata 1900 and Monrovia 1960: legal, no flag (offsets with seconds). New York 1883-11-18 12:02: fold, legal change, `lmt`. Apia 2011-12-30 and Kwajalein 1993-08-21: gap across the date line | src/geo/flags.test.ts |
| Causes | New York 2024 and London 1941 (double summer time): dst. Moscow 2011 and 2014, Monrovia 1972 (a change on a second): legal change. Apia 1892: date line | same |
| Leap-second boundaries 1972-07-01, 1999-01-01, 2017-01-01 | TAI − UTC steps exactly; TT advances 2 s over the labelled second 23:59:59 → 00:00:00; UT1 and ΔT continuous | src/time-scale.test.ts |
| UT1 − UTC against every daily row of finals2000A.all 2026-09-24 (sha256 `cc80680e…aa8e18`) | 19,997 rows within 0.79 ms, source and σ consistent | same |
| rc.13 receipt (serialized by the carried rc.13 archive) | parses under the rc.8 set, replays as UTC; today's basis moves its angles by 0.2″ | src/receipt-time-basis.test.ts |

## Data identity

| Input | Identity |
| --- | --- |
| tzdata2025c.tar.gz | sha256 `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957` |
| leap-seconds.list (in it) | sha256 `f060924e3a76ee4e464f6664035b7beae834155dd93a81c50e922f94dfdb1d20`, updated 2025-07-07, expires 2026-06-28 |
| IERS finals2000A.all, Last-Modified 2026-09-24T17:37:44Z | sha256 `cc80680ec05c91b65e7d02c6068fe0d44dd0998dc880551975092d2d14aa8e18` |
| src/fixtures/iers-finals2000A-ut1-20260924.csv.gz | sha256 `b741c4e051866897a60c54f870ef08f329b7f177655f46baa7c92a0a5badb6e1` |
| src/fixtures/receipt-rc13.json | sha256 `841f6fac68f0f4744e52c537fda490a1d01369aff37f661791e514c0c34ae32e`, from archive `12db9dce…29d3b840` |
| src/fixtures/tzdb-divergence-98.json | sha256 `d3258be9118494fba3cff97dea1a954f13f7c084249494674f5eaed7b816ee3e` |

Shards: 597 names (16 carry the default build's history, 518 have an LMT
era), 9,605 transitions before 1970 (8,312 daylight saving, 1,262 legal, 31
date line). Asia/Hanoi is left out: the default build, and so `Intl`, lacks
it.

## Package size

Unpacked bytes (`sizes.json`):

| | rc.13 | This branch | Same source, unminified |
| --- | ---: | ---: | ---: |
| Package without the shards | 261,645 | 276,525 | 305,665 |
| JavaScript | 125,747 | 130,927 | 160,087 |
| Declarations | 65,175 | 72,644 | 72,644 |
| README, CHANGELOG, licences, manifest | 70,723 | 72,954 | 72,934 |
| Zone-history shards, 16 files, geo only, lazy | – | 188,504 (8,689 to 16,682 each) | 189,144 |
| Core entry's static graph | 80,251 | 74,475 | 91,561 |
| Geo entry's static graph | 14,714 | 26,400 | 31,672 |

Built as before, the package outside the shards would be 305,665 bytes,
over the 300,000-byte cap, which is not raised for code. The build therefore
drops whitespace from the emitted JavaScript (commit "Minify whitespace in the
published build", esbuild's `minifyWhitespace`; names and syntax unchanged),
which also leaves the core entry smaller than rc.13's even with the UT1 and
leap-second tables in it. The cost is single-line `dist/*.js` and the loss of
esbuild's `/* @__PURE__ */` annotations; the commit stands alone. The shards
have their own budget, stated with its reason in
`scripts/verify-package-contents.mjs`: 200,000 bytes and exactly 16 files.
The integrator's changelog entry has about 23,400 bytes of room under the
cap.

## Commands

```sh
npm ci
npm test
npm run typecheck && npm run build && npm run exports:smoke
npm run package:contents && npm run pack:dry-run
TZDATA_TARBALL=/path/tzdata2025c.tar.gz node scripts/build-tz-shards.mjs --check
TZDATA_TARBALL=/path/tzdata2025c.tar.gz IERS_FINALS=/path/finals2000A.all node scripts/build-time-scales.mjs --check
node scripts/roundtrip-scan.mjs --out roundtrip-default.json
node scripts/roundtrip-scan.mjs --full --out roundtrip-full.json
python3 scripts/verify-jdn.py --json jdn-richards.json
```

## What is not established

- `npm run archive:binding` fails on this branch by design: the source
  differs from the carried rc.13 archive and the version is unchanged. It
  passes once the integrator bumps the version and carries the new archive.
- `BEFORE_TIME_BASIS` in `src/receipt.ts` treats every version before rc.13 as
  older than the new set; the integrator should raise it to the version that
  releases it, so that a genuine rc.13 archive cannot claim the set.
- The host-dependent comparisons (the 98-zone list) run only where the host's
  tzdb is 2025c. On other hosts the shipped history still answers before 1970
  and every other test runs.
- Leap seconds after 2026-06-28 and UT1 − UTC after 2027-10-02 are not known;
  the results say which values are carried, predicted or a fallback band.
- From 1970 the offsets are the host's but the causes are tzdb 2025c's: a
  change only a newer host knows is reported as daylight saving.
- astronomy-engine reuses the nutation of any time within 86 ms of the last
  one it computed, so a replay may differ from the first calculation in about
  the twelfth decimal of a degree, depending on what was computed in between.
