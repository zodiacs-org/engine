# Sign changes of Neptune and Pluto: the engine against JPL Horizons

This job's one measurement, made on 2026-11-11 to re-check two figures that
ZOD-63 and the master plan quote from a review whose data was not found
("Neptune up to 9.4 h, Pluto up to 29 h off on the default path"). It is a
check by one reader. A second reader has since reproduced parts of it
(`../BREAKER.md`, N2); that reader's scripts are not committed.

## What was run

1. `tools/engine_ingresses.mjs` on the build of `origin/main` at `bc0b5a7`
   (`npm ci`, `npm run build`, Node v22.23.3; `@zodiacs/engine` 1.1.0-rc.3
   with astronomy-engine 2.1.19, the default path). For Neptune and Pluto
   it calls `searchLongitudeCrossings(body, k × 30, ...)` for the twelve sign
   boundaries from 1800-01-03 to 2199-12-29 with a step of one day, and
   writes each crossing with its TT Julian date from
   `@zodiacs/engine/time`'s `timeBasis`. Output: `results/engine.json`
   (103 crossings for Neptune, 73 for Pluto).
2. `tools/horizons_check.py`. For each of those crossings it asks NASA JPL
   Horizons (`https://ssd.jpl.nasa.gov/api/horizons.api`, DE441) for an
   OBSERVER table, geocentric (`500@399`), `QUANTITIES='31'` (apparent
   ecliptic longitude and latitude of date), target 8 or 9 (the system
   barycentres, as this repository's other comparisons take them),
   `TIME_TYPE='TT'`, from three days before the engine's instant to three
   days after, every ten minutes. It finds where Horizons's longitude
   crosses the same boundary in the same direction, by linear interpolation
   between the two rows either side, and takes the nearest. Output:
   `results/horizons.json`, with each request's address, the SHA-256 of the
   response, and the two bracketing rows.
3. `tools/summarise.py` writes `results/summary.md`.

Both sides are compared in TT, so neither side's ΔT enters.

## Result

From `results/summary.md`, NASA minus engine, in hours:

| body | sign changes | matched | median size | 95th percentile | largest | within 1 minute |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Neptune | 103 | 103 | 2.46 | 6.08 | 9.51 (1848-10-16) | 1 |
| Pluto | 73 | 73 | 1.77 | 8.70 | 31.54 (2185-03-31) | 0 |

Largest by century: Neptune 9.51, 8.06, 4.42 and 5.80 hours in the 1800s,
1900s, 2000s and 2100s; Pluto 5.96, 2.29, 9.63 and 31.54.

Neptune into Aries: the engine gives 2026-01-26T14:31:41.082Z and Horizons
is 3.0617 hours later, which is 17:35:23 UTC. That is the instant the site's
own Horizons table holds (`2026-01-26T17:35:23Z`).

Every crossing the engine finds has a Horizons crossing of the same
boundary, in the same direction, within three days.

## What it does and does not show

- ZOD-63's figures are of the right size. This check finds 9.51 hours for
  Neptune against the 9.4 quoted, and 31.54 hours for Pluto against the 29
  quoted. The quoted review's method and span are unknown, so the
  differences are not explained.
- Pluto's two largest are a pair, +31.54 hours on 2185-03-31 and −31.37
  hours on 2185-04-23, either side of a station close to a sign boundary.
  Where a planet turns near a boundary, a small difference in longitude is a
  large difference in time.
- The site's table gives smaller maxima (8 hours 8 minutes for Neptune, 9
  hours 37 minutes for Pluto) because it covers 1899 to 2100 for these
  planets. On those years this check agrees: 8.06 hours and 9.63 hours.

Limits:

- It starts from the engine's crossings. A sign change that Horizons has and
  the engine lacks, more than three days from any engine crossing, would not
  be seen. None of the 176 needed a wider search.
- Linear interpolation over ten minutes. Both planets move by less than
  about 1″ in ten minutes and nearly evenly, so the interpolation error is
  small beside the differences found, except within hours of a station. It
  was not measured.
- Horizons's ecliptic of date for this quantity is its own (the conformance
  suite's `arbiters/l1/README.md` describes it as IAU 1976/1980 with
  measured offsets of milliarcseconds from IAU 2006/2000A), and its apparent
  place has the Sun's light deflection, which the engine's does not. Both
  are milliarcseconds, which for Pluto can still be minutes of time.
- One build, one day's Horizons. The responses are not kept, only their
  SHA-256 digests. The digests are a record and not a check: every Horizons
  response begins with a line that carries the time it was made, so the
  same request never returns the same bytes and no digest here can be
  compared with a new response. What can be checked is the two bracketing
  rows kept with each record. The second reader asked for seven of them
  again and they agreed (`../BREAKER.md`, N2).
- JPL's fair-use policy for this API asks automated clients for "a valid,
  application-specific User-Agent request header that includes correct
  product name, version, and contact information", and for one request at a
  time. The script made one request at a time. It sent Python's default
  User-Agent with no product name and no contact. That was this session's
  own caution about sending the project's details to outside services; it
  was not an instruction in the job's brief. The outcome is 176 requests
  that did not meet the policy, and the second reader's 12 did not meet it
  either. Until a rerun is made under the project's name and contact, which
  is the owner's call, the figures stand on requests the policy does not
  cover.
