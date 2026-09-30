# The sky gates rerun on 0.1.1-rc.16's build

The sky entry's preregistered gates, S1 to S4 and the package gates of
`../PREREGISTRATION.md`, run again with `../tools/`, unchanged but for
`published-compare.mjs`'s new argument (below), on the integrated 0.1.1-rc.16
candidate after the engine took the full IAU 2000B nutation: the build of
`704cadc`, whose sky code the later commits of rc.16 do not change, with
Node.js v22.22.2. The branch's results stay in `../results/`. The Chinese
gates C1 to C4 are not run: rc.16 holds that entry back (`../README.md`).

On this build the sky entry turns the apparent place to the true equator of
date with the engine's precession and IAU 2000B nutation (`src/equator.ts`)
and places the observer with the engine's apparent sidereal time, where the
branch used astronomy-engine's `Rotation_EQJ_EQD` and a sidereal time on its
five-term `e_tilt`. `docs/evidence/rc16-20260930/results/entries-plumbing.json`
measures what that moved at its 2,873 events: instants by up to 25 ms (the
Moon), altitudes by up to 0.0606″ and azimuths by up to 2.45″, where a
transit passes near the zenith, and the planetary hours' boundaries by up to
8 ms.

| Gate | Branch | This run | Result |
| --- | --- | --- | --- |
| S1, rise, set and transit against skyfield with DE440s, 5 s | 189,491 events, median 0.131 s, largest 11.619 s, 192 over (the rises and sets of Uranus in 1950 at 65° N and S); centre without refraction 37,226 events, largest 2.187 s | 189,491 events, median 0.131 s, largest 11.603 s, the same 192 over; centre without refraction 37,226 events, largest 2.182 s; none missing or extra | fail, as on the branch |
| S2, Swiss Ephemeris `rise_trans`, 5 s | 188,982 events, median 0.155 s, largest 11.625 s, 192 over (the same Uranus events), 3 at an edge; centre 37,224 events, largest 2.171 s | 188,982 events, median 0.155 s, largest 11.609 s, the same 192 over, 3 at an edge; centre 37,224 events, largest 2.171 s | fail, as on the branch |
| S3, USNO's rise, set and transit, 30 s | 467 events, median 13.833 s, largest 30.148 s, 2 over, 3 listed by one side only | 467 events, median 13.832 s, largest 30.149 s, the same 2 over (the Moon's rise at 34.60° S on 1950-03-20, −30.058 s; the Sun's set there on 2024-06-21, −30.149 s), the same 3 listed by one side only | fail, as on the branch |
| S4, consistency with the rise and set function, 1 ms | 9,504 dates, 9,495 complete, 227,880 hours, 0 failures | the same counts, 0 failures | pass |
| S4, the worked examples | `src/sky/hours.test.ts` | the same tests, in the suite, pass | pass |
| Package gates: the six commands; the root's graph does not grow (rc.15: 95,273 bytes); each new entry has a budget with its reason | pass: the root 95,273 bytes; `./sky` 83,254 of 92,000 (`../README.md`) | the six commands pass (`docs/evidence/rc16-20260930/gates.log`); the root's graph is 103,537 bytes; `./sky` is 92,109 bytes, under 97,000, a budget raised from 92,000 after the measurement, for the nutation | **fail**: the root's graph grew |

S1 and S2 fail at the same 192 events as on the branch, the rises and sets of
Uranus in 1950 at 65° N and 65° S, where astronomy-engine's Uranus is 15″ to
18″ of altitude from DE440s at a grazing crossing; the nutation changed their
largest difference by 0.016 s. Every other body's largest difference changed
by at most 0.02 s (Mercury, 1.873 to 1.855 s against skyfield), and the
transits stay within 1.15 s. The counts, the medians and the 95th
percentiles are the branch's to the millisecond or within a few
milliseconds; `docs/sky.md` gives the table of this run.

## Files and runs

- `s1-skyfield.json`, `s2-swiss.json`, `published.json` and
  `hours-consistency.json`: this run's results, in the branch's formats.
  Swiss Ephemeris (pyswisseph 2.10.03 with `sepl_18.se1` and `semo_18.se1`)
  was an instrument: statistics and verdicts only.
- `engine.log`, `s1s2.log` and `s3s4.log`: the runs' output.
  `../tools/sky-engine.mjs` wrote the engine's events, 57,024 searches, to a
  file outside the repository (SHA-256 in `engine.log`), which S1 and S2
  read; skyfield 1.55, jplephem 2.24, numpy 2.4.6 and pyerfa 2.0.1.5 read JPL
  DE440s (`de440s.bsp`, SHA-256 `c1c7feea…`, the branch's).
- USNO's API (v4.0.1) was fetched again on 2026-09-30, the same 80 site-days.
  `published-compare.mjs` now takes the fetch date as an argument, so that
  `published.json` names the day of the download it compares, where the
  branch's tool wrote a fixed date, 2026-09-29, its own download's; the
  comparison is unchanged.
