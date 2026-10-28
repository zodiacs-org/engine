# Test set tolerances

`charts.json` (kept outside this repository) holds 64 synthetic charts (no real person) with expected values from Swiss Ephemeris 2.10.03 (pyswisseph, `.se1` files) and civil time from Python `zoneinfo` over the system tzdb 2026c. The generator, `build_testset.py`, is kept outside the repository with the expected values. A chart passes when every check below passes. The checker calls the zodiacs.org MCP server, never the engine directly, because the bot only sees the server.

Swiss Ephemeris output stays outside this repository (`AGENTS.md` forbids Swiss per-case values here). Only the chart inputs (`charts.inputs.json`) and this file are committed.

## Cases

| Tag | Charts | What it tests |
| --- | ---: | --- |
| `midnight` | 8 | 00:00, 00:30, 23:30 and 23:59 local, including cases where the UTC date differs from the local date |
| `dst-gap` | 7 | Local times that do not exist (New York, London, Sydney, Sao Paulo at midnight, Lord Howe 30 minute shift, Berlin 1980, Apia's skipped day in 2011) |
| `dst-fold` | 6 | Local times that happen twice, including Sao Paulo's fold at midnight and Lord Howe's 30 minute fold |
| `dst-edge` | 2 | The last minute before and the first minute after a gap |
| `high-latitude` | 9 | 54.8 to 78.2 degrees; 5 inside the polar circle, where Placidus is undefined |
| `pre1970` | 15 | War time and double summer time (London 1943 and 1947, Kolkata, Sydney, Johannesburg, Hong Kong), Chicago on Eastern time in 1936, Moscow 1919, local mean time in New York 1880 and Berlin 1890 |
| `unknown-time` | 2 | No birth time: no houses or angles; Moon given as a range over the local day (U2: the Moon changes sign that day) |
| `transit` | 10 | Exact transits from 2026-11-01 for 90 days |

Tags overlap, so the counts add to more than 64.

## Checks and tolerances

All angles in arcseconds (") of ecliptic longitude.

| Check | Tolerance | Why |
| --- | --- | --- |
| Civil time `status` (`resolved`, `gap`, `fold`, `time-unknown`) | exact | A gap or fold goes back to the person; the bot must never pick one silently. |
| UTC instant(s) | within 1 second | Both sides read the same tzdb rules. A difference is a time zone error, not rounding. |
| Positions, Sun to Pluto | within 30" | `TRIAGE.md`: largest engine error measured is 20.63" (Venus, PR #41, 15,360 charts); 30" leaves 1.45 times that. Mars to Pluto rest on 24 conformance vectors each (largest 18.77", Neptune). |
| True lunar node | within 60", provisional | Not measured against Swiss yet. Set from the first run and recorded with its evidence. |
| Sign of each body and of the ascendant | exact, unless the expected longitude is within the tolerance of a sign boundary | Near a boundary either sign passes, and the bot must say the point is on the cusp. |
| Retrograde flags | exact, unless a station is within 1 day | |
| Ascendant, MC, Placidus cusps, with the instant sent as UT1 | within 1" | All 150 conformance house checks pass with at most 0.071". Swiss is used for houses only before 2050 (it fails after 2050); every chart here is before 2027. |
| The same, with the instant sent as UTC | 30" plus 0.9 s times the point's rate (`ascRate` is given in " per second of time for the ascendant) | The generator passes UTC to Swiss as UT1. Since 1972, UT1 minus UTC stays under 0.9 s. |
| Placidus at a polar birthplace | must be reported undefined | Never silently replaced by another system. |
| Fold cases | both ascendants reported (`later` holds the second) | Shows when the repeated hour changes the ascendant sign (F1, F5). |
| Unknown time | houses and angles null; Moon range matches within 30" at each end; `moonSignDepends` matches | Unknown time is never filled with noon. |
| Transit exact time, Sun to Saturn | within 2 hours, and shown as a calendar day in the person's zone | Largest shift from position error is 112 minutes (Jupiter, `TRIAGE.md`). |
| Transit exact time, Uranus, Neptune, Pluto (`c1`) | day given as plus or minus 1 day, with the in-orb date range | Launch condition C1: shifts up to about 16 hours away from a station. |
| Transit near a station (`speed` below 0.01 degrees a day) | date range only, no single day | The exact time is poorly defined for any ephemeris at a station. |
| Stations in the window (`skyStations`) | within 1 day | |

## What this set does not check

- Agreement with JPL Horizons. The brief asks for both Swiss and JPL; a Horizons run for the 10 transit charts' positions is still to do.
- Chiron (not in the MCP body list) and aspects other than conjunction, square and opposition in the transit window.
- The bot's wording. That is `RUBRIC.md`.

## Running it

1. Regenerate the expected values outside the repository: `<python with pyswisseph> -I build_testset.py <ephe dir> charts.json`.
2. For each chart, call the MCP tools with `input`, compare with `expect` using the table above, and write one line per failed check with the residual.
3. Record the server's engine, ephemeris and tz versions with the results.
