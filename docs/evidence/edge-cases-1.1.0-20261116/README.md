# ZOD-97 rerun on 1.1.0, 2026-11-16

The independent edge-case check of ZOD-97, first run on 2026-11-11 against
1.1.0-rc.3 on astronomy-engine (`../edge-cases-20261111/`, pull request 93),
run again on 1.1.0, which computes on the shipped DE440 pack. The case list
and the pass or fail rule were written on the Linear issue before this run,
and are the first run's (`../edge-cases-20261111/EDGE-CASES.md`). The arbiters
are JPL Horizons (DE441) and the IANA time zone database, never the engine's
own output.

Synthetic instants and places only; no person's birth data.

## What was run, on what

- Engine: `main` at `322f855` (the merge of 1.1.0), built with `npm ci && npm
  run build`, Node 22.23.4. Every result records `engineVersion` 1.1.0.
- Horizons: the first run's 34 recorded answers, reused as fixtures; each
  file's SHA-256 is checked before it is read. Horizons was not asked again.
- Time zones: the host's ICU data, tzdb 2026e (the engine reads the host's
  `Intl` for dates after 1970). All 23 civil-time cases give the same UTC and
  the same flags as the first run, which was checked against tzdb 2025c
  compiled with `zic` (23 of 23, `../edge-cases-20261111/results/tz-arbiter.json`).
  Only the recorded tzdb version label changed, so the arbiter step was not
  repeated.
- New: `tools/pole-ascendant.mjs`, the ascendant every minute of a day at 16
  latitudes, for the part of T4 the first run did not test (below 90°). This
  minute scan is new: it was not in the pre-registered case list
  (`../edge-cases-20261111/EDGE-CASES.md`), so its pass mark (no unflagged
  half turn of the ascendant) is this run's own.

## Results

| test | 1.1.0 | first run (rc.3) |
| --- | --- | --- |
| P1, P2 | **pass**: 110 of 110 longitudes within 30″ of Horizons on TT input and at the settled UTC instants; the largest is the Moon, 0.51″, at the end of 2199, and every body is about 0.50″ there; the Sun at 2050 is 0.024″ | pass; Pluto 29.69″, the Sun 0.56″ |
| P1 on UTC after 2050 | reported, not judged: 49 of 50 within 30″; the Moon at 2199-06-15T12:00Z is 31.12″ from Horizons, from the two clocks (Horizons puts TT − UT at 69.18 s, the engine extrapolates 125.84 s). Every such chart now carries `delta-t-extrapolated`, so the engine says so | 36.23″, with no flag |
| T1 the repeated hour | **pass**, 9 of 9 | pass |
| T2 the skipped hour | **pass**, 7 of 7, by the "clearly flags" branch | pass |
| T3 skipped civil days | **fail**, unchanged: a Gregorian date inside a calendar switch's skipped days is accepted. With the country given it is noted (5 cases); with no country there is no signal (2 cases: 1582-10-10 for Rome, 1752-09-08 for London). Samoa 2011-12-30 and Kwajalein pass | fail, the same |
| T4 the poles | **fail**: polar day and night pass (4 of 4); 130 house cases pass; 4 are degenerate and unflagged (Regiomontanus and Topocentric at ±90°). The minute scan: at 67°, 70°, 78.22°, 89.99° and 90°, north and south, the ascendant turns half a circle twice in the day with no flag in a whole-sign chart (10 of 16 latitudes fail); 60°, 66° and 66.5° pass | fail at ±90°; below 90° not tested |
| T5 after 2050 and the span's edge | **fail, narrowed**: `calc()` refuses outside the span (12 of 12). The root's `positions()` at 2200-01-01 and 1799-12-31T23:59Z returns `jpl-de440` positions with no flag, where `natalChart` at the same instant flags `outside-reference-span`; at 2250 it names astronomy-engine and flags `outside-de440-span` | fail: no flag at all |

What moved since the first run: every planet now within about 0.5″ of
Horizons (was up to 29.69″), and the far-future clock difference is flagged.
What did not: the calendar-switch silence (T3), the polar ascendant (T4) and
`positions()` at the span's edge (T5).

Pull request 105 (`polar-angles`) answers the T4 failures. On its branch the
minute scan passes at all 16 latitudes (its own evidence folder,
`docs/evidence/polar-angles-20261116/`). The 4 degenerate cases at ±90° were
checked by rerunning `horizons-edge.mjs` on that branch's build: they carry
the new flag. That rerun is not committed, and the tool's verdict does not
look at that flag, so its pass or fail line is unchanged; read the flag in
the output. T3 and T5 have no fix yet.

The first run's review of the ZOD-65 sweep (S1 to S3, `SWEEP-REVIEW.md`) is
about method and did not change with 1.1.0; it was not repeated.

## Files

- `tools/`: the first run's tools, unchanged but for reading the first run's
  Horizons fixtures from `../edge-cases-20261111/horizons/`, and the new
  `pole-ascendant.mjs`.
- `results/`: one JSON file per tool, written by this run.

## Rerunning

```sh
npm ci && npm run build
E=docs/evidence/edge-cases-1.1.0-20261116
node $E/tools/local-time-rule.mjs $E/results/local-time-rule.json
node $E/tools/calendar-switch.mjs $E/results/calendar-switch.json
node $E/tools/horizons-edge.mjs compare          # offline, from the first run's horizons/
node $E/tools/utc-after-2050.mjs compare         # offline, from the first run's horizons/
node $E/tools/pole-ascendant.mjs $E/results/pole-ascendant.json
```

`ZODIACS_ENGINE_DIST=<dir>` runs `pole-ascendant.mjs` on another build.
Do not run `horizons-edge.mjs fetch` or `utc-after-2050.mjs fetch` from this
folder: `fetch` writes into the first run's `horizons/` folder and would
replace its committed responses.
Nothing was merged, tagged, released or published.
