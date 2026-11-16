# Breaker findings on the edge-case check (ZOD-97), 2026-11-11

A second session tried to break the result committed at `2f7fbab` (draft PR
93) against ZOD-97's tests P1 to P3, T1 to T5 and S1 to S3. It changed no
product code, no tool and no result of the builder's; this file is the only
addition. Nothing here is an accuracy statement and no public sentence is
approved.

Engine under test: `@zodiacs/engine` 1.1.0-rc.3, the `dist/` built from
`bc0b5a7`, Node v22.23.3, host tz data 2026c. Horizons: API 1.2, asked on
2026-11-11; every response names DE441. IANA: `tzdata2025c.tar.gz` and
`tzcode2025c.tar.gz` fetched again from `data.iana.org`, SHA-256
`4aa79e4e…2f957` and `697ebe66…15740` (the pinned ones), `zic` compiled here.

## Does the builder's pass/fail table survive?

| test | builder | after this review |
| --- | --- | --- |
| P1 | pass, Pluto at the edge | **survives, as a longitude test on the instants run.** Counts are overstated (finding 5) and the whole angle for Pluto is over 30″ (finding 4) |
| P2 | pass | **survives** for the instants the builder ran. Not for UTC input late in the span (finding 1) |
| P3 | pass | **survives**, one query unrecorded (finding 9) |
| T1 | pass | **survives.** 9 of 9 reproduced; a wider run agrees (finding 8). Rests on host data from 1970 on (finding 3) |
| T2 | pass by the flag | **survives by the flag branch.** The named example is flagged. On this host one past date that tzdb 2025c calls nonexistent is accepted with no flag (finding 3) |
| T3 | mixed | **fail** by the issue's rule, as the builder's own cases show. "Mixed" is not one of the issue's outcomes (finding 6) |
| T4 | mixed, "passes to 89.99°" | **fail** at ±90° as reported. **"Passes to 89.99°" is not supported** by what was run (finding 2) |
| T5 | pass for `calc()`; root does not refuse | **does not survive as written.** The pass was earned on TT input only. On UTC input the Moon is 36.23″ from Horizons at one in-span instant (finding 1) |
| S1 | no material deviation | survives as far as rechecked (finding 10) |
| S2 | done | **survives.** Figures re-read from the committed summary; no reliance on the earlier review's numbers |
| S3 | pass | **survives** (finding 11) |

One blocker, five should-fix, the rest notes.

## Blocker

### 1. T5 and P1 were passed on TT only; on UTC the Moon exceeds 30″ late in the span

P1 reads "once a UTC instant is settled". Every instant after 2050 in the
builder's run was given to `calc()` as TT, "so that ΔT moves nothing"
(`tools/horizons-edge.mjs`). No UTC instant after 2021 was compared. The
builder states the limit in `EDGE-CASES.md` (class Y, rule 3) and in
`SWEEP-REVIEW.md` (finding 7), but the T5 row of the table says "pass" with
no such qualifier.

Run here: `natalChart({ utc })` and `calc({ time: iso })` (they agree to
0.01″) against Horizons, geocentric, quantities 30 and 31, `TIME_TYPE='UT'`,
airless, DE441. Longitude difference, arcseconds:

| UTC instant | Horizons TDB−UT, s | engine TT−UT1, s | Sun | Moon | Pluto |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2051-06-15 00:00 | 69.18 | 71.58 | 0.90 | 0.62 | −5.23 |
| 2075-06-15 00:00 | 69.18 | 74.32 | 0.54 | 1.71 | −6.25 |
| 2100-01-01 00:00 | 69.18 | 78.93 | 0.13 | 6.38 | −8.18 |
| 2150-01-01 00:00 | 69.18 | 96.05 | 0.87 | 14.67 | −14.81 |
| 2199-06-15 12:00 | 69.18 | 125.84 | 0.56 | **36.23** | −27.88 |

What this does and does not show:

- By the letter of P1 and P2 the Moon at 2199-06-15T12:00Z is a fail pending
  explanation (over 30″). The explanation is the clock, not the ephemeris:
  the two ΔT values differ by 56.65 s and the Moon moves about 0.55″ per
  second of time. On TT the builder has the Moon within 2.94″.
- Horizons is not a reference for UT in the future. It prints the same
  TDB−UT (69.18 s) at every instant from 2051 to 2199, its last prediction
  held constant. No arbiter exists for the UTC of a date after the IERS
  predictions end, so P1 cannot be tested on UTC there at all. The report
  should say that instead of "pass".
- T5's fail condition is "less accurate than the stated bound without being
  reported". `calc()`'s receipt does report it in part: `deltaT.sigma`
  103.05 s, `segment: "extrapolated"`. In the same result `bounds.position`
  still says 8.3″, `label: "measured"`. `natalChart()` at the same instant
  returns `flags: []`.
- Five instants, three bodies. This is a counter-example, not a survey.

Asked of the builder: add UTC-input cases after 2050 to the tool and results,
and reword the T5 and P1 rows to "pass on TT; not testable on UTC after the
IERS predictions end; the Moon is 36.23″ from Horizons's UT at
2199-06-15T12:00Z, a ΔT difference of 56.65 s; reported by `calc()`'s receipt
and not by `natalChart()`".

Responses kept outside the repository (this session may commit only this
file), SHA-256: Sun `8ff2f66b…29185`, Moon `1bc562bd…28d6c`, Pluto
`08b69a07…0b294`. Query: `COMMAND` 10, 301, 9; `CENTER='500@399'`;
`QUANTITIES='30,31'`; `TLIST` the five instants; `TIME_TYPE='UT'`;
`APPARENT='AIRLESS'`; `ANG_FORMAT='DEG'`; `EXTRA_PREC='YES'`.

## Should-fix

### 2. T4: "passes to 89.99°" rests on one instant and on a test of finiteness

The house judge in `tools/horizons-edge.mjs` runs one instant
(2021-06-21T12:00Z) and passes any system that returns twelve finite numbers
(and the fallback for Placidus and Koch). T4 asks whether a rising sign or
house system that is "undefined or unstable at that latitude" is refused or
flagged. That was not tested below 90°.

Run here: `houses()` (Regiomontanus) every 2 minutes through 2021-06-21 at
15.63° E, with a check written apart from the engine (Meeus's mean sidereal
time, mean obliquity, the altitude and azimuth of the ecliptic point at the
ascendant's longitude; good to about 0.01°):

| latitude | ascendant's altitude, largest | ascendant west of the meridian | ascendant jumps 180° between samples | MC below the horizon |
| --- | ---: | ---: | --- | ---: |
| 60°, 66° | 0.003° | never | none | never |
| 67° | 0.002° | never | twice (22:10, 23:44 UTC) | 47 of 720 |
| 70° | 0.002° | never | twice | 133 of 720 |
| 78.22° | 0.001° | never | twice (03:06, 18:52 UTC) | 247 of 720 |
| 85°, 89°, 89.99° | 0.000° | never | twice | 315, 351, 361 of 720 |
| −78.22° | 0.001° | never | twice | 245 of 720 |

- In the engine's favour: the ascendant is on the horizon and on its eastern
  half at every sample, as its documented rule says.
- Against "passes": at every latitude tried from 67° up, the ascendant flips
  by exactly 180° twice a day (the ecliptic lies in the horizon at those
  moments and no point of it is rising). Nothing is flagged, at the flip or
  near it; `houses()` returned no flag at any of the 6,480 samples. A birth a
  minute either side of a flip gets opposite rising signs as an ordinary
  chart. Whether that is "unstable" in T4's sense is Dias's call. The
  evidence does not support "pass"; the supportable line is "below 90° only
  Placidus and Koch are flagged; the ascendant's two daily 180° flips inside
  the polar circle are unflagged".

### 3. The pinned tzdb is not what answers from 1970 on, and on this host it already disagrees

The builder says so plainly and adds that the modern cases pass "because the
two agree at those instants". They do, for the cases chosen. A wider run
(finding 8) found wall times where the host's data (2026c) and the pinned
2025c differ, some of them in the past:

| zone, wall time | tzdb 2025c compiled here | engine on this host |
| --- | --- | --- |
| Europe/Chisinau 2022-03-27 02:30 | nonexistent (gap) | 2022-03-27T00:30Z, no flag |
| Europe/Chisinau 2022-03-27 03:30 | exists, 2022-03-27T00:30Z | 2022-03-27T01:30Z, `dst-gap` |
| America/Vancouver 2026-11-01 01:30 | repeated (fold), first pass 08:30Z | 08:30Z, no flag |
| America/Edmonton 2027-03-14 02:00 | gap, 09:00Z | 08:00Z, no flag |
| Africa/Casablanca 2027-02-07 02:00 | fold, first pass 01:00Z | 02:00Z, no flag |

791 of 136,905 wall times from 1970 on differ, all in nine zone names
(Africa/Casablanca, Africa/El_Aaiun, America/Edmonton, America/Vancouver,
America/Yellowknife, Canada/Mountain, Canada/Pacific, Europe/Chisinau,
Europe/Tiraspol), years 2022 to 2036.

The issue's reference is "the same tzdb release the engine pins". Against
that reference the engine on this host fails T2 for Chisinau on 2022-03-27
(a time 2025c calls nonexistent is accepted with no flag, and a time 2025c
calls real is moved an hour and flagged). The host's newer data is most
likely the better history; that is not the point. The point is that T1 and
T2 from 1970 on test the host, the answer changes with the machine, and the
result names the host's release only in `zone.tzdbVersion`. The table's T1
and T2 rows should carry that sentence, with these cases, and the builder's
question 5 to Dias now has a concrete example behind it.

### 4. Pluto: the bound holds in longitude only; the whole angle is over 30″ against Horizons

From the builder's own records (`results/horizons-edge.json`, Y-d and Y-e):
longitude −29.68″, latitude −7.77″ at 9.10° of latitude, so the angle between
the two directions is 30.32″. Run here against Horizons daily at noon TT over
the last two years of the span (JD 2523863.0 to 2524593.0, 731 instants,
target 9, `500@399`, quantity 31, TT, DE441; response SHA-256
`97caaa47…65374`):

- longitude: largest 29.684″, on the last day. P1 holds on all 731.
- whole angle: largest 30.324″ on the last day, **over 30″ on each of the
  last 31 days** (from JD 2524563.0, 2199-12-01).

P1 names longitude, so P1 survives. But `HANDOFF.md` tells Dias "the bound
holds on every instant checked, by 0.1″ to 0.8″ depending on the reference",
and the sweep's draft sentence adds that "the whole angle between the two
directions is also within 30″ (29.86″)" against DE440. Against Horizons, with
its deflection and its own frame of date, the whole angle is not within 30″.
Any sentence must say "longitude", and the handoff should say so.

### 5. The counts are overstated

- "12 instants, ten bodies, 120 comparisons": T4-90N and T4-90S are the same
  UTC instant, and geocentric longitudes do not depend on the place.
  `queries.json` lists five UT instants. There are 11 instants and 110
  distinct comparisons (checked: 110 distinct body and Horizons-row pairs
  among the 120 records).
- T4 "longitudes at 78.22° N and both poles meet P1 (30 of 30)": 20 distinct
  comparisons, and none of them exercises the latitude. T4's longitude
  clause is met trivially; that should be said.

### 6. "Mixed" is not an outcome the issue defines

The issue's rule: "A case fails if the engine disagrees with the reference
under the stated rule, or if it is silent about an ambiguity it resolved."
T3 (a Gregorian date in a skipped range accepted, silently when no country
is given), T4 (±90°) and T5 (`positions()` outside the span) each contain
failing cases, which the builder reports honestly in the text. The table
should read **fail** for T3 and T4, and for T5 "fail for the root's
`positions()`", with the passing parts listed under it. Nothing is
understated in the detail; the headline words are softer than the rule.

## Notes

### 7. Horizons setup and DE441: correct, disclosed, and it does not decide a verdict

- All 24 kept responses match their SHA-256 in `queries.json`. Each names
  DE441 for target and centre. Setup read from the raw files: observer
  table, `500@399`, quantity 31 (`ObsEcLon`, `ObsEcLat`), airless, TT rows
  headed `JDTT` and UT rows `JDUT`; Mars to Pluto as barycentres 4 to 9.
- `horizons-edge.mjs compare` rerun here rewrote
  `results/horizons-edge.json` with no difference (`git status` clean);
  `local-time-rule.mjs` and `calendar-switch.mjs` reproduce their committed
  results byte for byte (`cmp`).
- The issue allows "otherwise record the Horizons ephemeris used". It is
  recorded in the README, the handoff, the PR text and every query record.
  The size of the DE440 to DE441 difference was not measured by the builder
  or by me at these instants; the ZOD-65 sweep's own self-check S2 has it at
  0.0216″ at most over 32 instants to 2188. P1 and P2 are not invalidated.
- The true node: not compared, and no 30″ bound is applied to it anywhere in
  the builder's files. `SWEEP-REVIEW.md` keeps it out of the 30″ verdict.
  Nothing to break.

### 8. T1 to T3 on a wider set: the rule holds wherever the data is the same

For every zone name of the default 2025c build (518), every transition from
1850 to 2036 in the default build and in the backzone build, five wall times
each (first and last minute inside the jump, the middle, a minute before, a
minute after): 182,040 wall times. Expected instant and kind from the
compiled TZif files by a parser written here: the earliest instant that
reads as the wall time, "fold" if there are two; if none, the wall time less
the offset before the jump, "gap".

- Before 1970 (pinned data): 45,134 of 45,135 agree in instant and flag
  with the main build or the backzone build. Weaker than it sounds: I
  accepted either build, because the generator chooses per zone and I did
  not re-derive its choice. The one exception is Indian/Kerguelen 1950,
  where backzone's offset is "-00" (unknown).
- From 1970 on (host data): 136,114 of 136,905 agree. The 791 are finding 3.
- No case was found where data and engine agree on a fold or a gap and the
  flag is missing. No silent choice at a repeated hour was found.
- Skipped days on the pinned-data path, which the builder's Samoa and
  Kwajalein cases (both after 1970) do not reach: Asia/Manila 1844-12-31
  12:00 gives 1845-01-01T03:56:08Z with `dst-gap`, `lmt`, cause `date-line`,
  and both neighbours resolve unflagged, as the compiled data says. Also
  Pacific/Kiritimati 1994-12-31 and Pacific/Fakaofo 2011-12-30: flagged, as
  the data says.
- The engine has two answers to a date that never existed:
  `moonSignCandidates("2011-12-30", { timeZone: "Pacific/Apia" })` throws
  "The date did not occur in that time zone."; `resolveLocalToUtc` moves it
  a day and flags it `dst-gap`. Worth knowing for the builder's question 6.
- T2's "pass by flag" reading holds: the issue says "refuses the time or
  clearly flags it". The flag is on the resolution, on the birth and on the
  chart (`chart.flags`, rerun here). A caller who passes only
  `resolveLocalToUtc(...).utc` to `natalChart({ utc })` drops it; that is
  the API's shape, not a silent engine choice, but the report could say it.

### 9. P3: one query has no record

The hand query for Pluto's body centre (target 999) was described but not
kept. Repeated here with the same parameters: Horizons answers `No ephemeris
for target "Pluto" after A.D. 2199-DEC-29 00:00:00.0003 TT`; response
SHA-256 `ab128946…96977`. The builder's quotation is right.

### 10. Sweep review (S1, S2): the figures are the sweep's

Read-only, from `origin/admin/zod-65-engine-phase-1-replace-receipt-error-limits`
at `255b615`: `results/summary.json` and `results/report.md` give Sun 2.38,
Moon 11.92, Venus 22.91, Pluto 29.19, node 32.64 in longitude, and the
"any frame" and "limit now" columns exactly as `SWEEP-REVIEW.md` prints
them. Ten of the eleven apparent position limits are below the sweep's
"any frame" figure; Uranus's (20 against 19.64) is the one that holds. The
earlier review's figures appear only as the comparison S2 asks for. Not
rechecked by me: the run's log and artifact, the byte-for-byte merge, and
runs 43040210028 and 43042023256 (the builder lists the last two as not
compared; they remain so).

### 11. Protected branches and house rules

- `git diff --name-only origin/main...HEAD`: 36 files, all under
  `docs/evidence/edge-cases-20261111/`. `src/calc-bounds.ts`, packed files,
  `artifacts/`, `conformance/`, `.github/`: untouched.
- The ZOD-65 branch head is `255b615`, committed at 14:48 UTC, before the
  builder's commit; PR 91's branch head is `ce4ba82`. Neither carries a
  commit of this job.
- Commit `2f7fbab`: author and committer `Zodiacs Admin <admin@zodiacs.org>`,
  no model name, no dashes in the prose. PR 93 is open and a draft.

### 12. Small things

- `tools/local-time-rule.mjs` still carries the header "written on
  2026-11-11 and NOT RUN". It has run.
- The live methodology page, which the issue lists as a source and the
  builder did not read, says the Moon stays "at the same UT within 20.5
  arcseconds" from 2150 to 2199 and that the two programs' ΔT differ by
  "14.3 to 36.7 seconds" from 2100 to 2199. Today, with this build, I find
  36.23″ at one instant and 56.65 s (finding 1). I did not establish why
  (Horizons's future ΔT may have changed since the page's run, or the page
  describes another build). For Dias; no page was changed.
- The page says nothing of the repeated hour or of skipped times.

## What was not done here

- No era of the sweep was recomputed and no kernel was read.
- The UTC cases of finding 1 are five instants; the polar scan is one day
  and one house system; the tz run takes five wall times per transition.
- The scripts and Horizons responses of this session are kept at
  `/workspace/runs/fable-jobs/job1/breaker-scratch/`, outside the
  repository, because this session was allowed to commit this file only.
  A figure above is evidence in the repository's sense only once its script
  and response are committed; until then treat each as a lead to rerun.
