# Conformance triage for the natal chart and 90-day transit bot

Step 1 of BRIEF.md. Engine branch `r44/conformance-0.2.0` at `bb5b4ec` (PR #76, stacked on #75, engine 1.1.0-rc.1), conformance suite 0.2.0. Run on 2026-10-26. The per-case list is `triage.csv` beside this file.

## Summary

The suite has 500 checks. I ran it and got the same verdicts as the committed results: 267 pass, 192 fail, 41 unsupported, 0 errors. None of the 233 non-passing cases is a real error. One group puts a condition on launch.

| What happened | Cases | What it means | Class | Blocks launch? |
| --- | ---: | --- | --- | --- |
| Planet positions off by more than 1 arcsecond, but at most 19 arcseconds | 153 | The position is right for astrology. The suite asks for 1 arcsecond, which is reference-ephemeris precision. A chart shows positions to 1 arcminute (60 arcseconds). | TOLERANCE | No |
| The same kind of position error, for Uranus, Neptune or Pluto | 39 | The position is still right. But because the planet moves slowly, a 2 to 19 arcsecond error moves the exact time of a transit by more than an hour: up to 16 hours at normal speed, and several days near a station. | TOLERANCE | Conditional (C1, below) |
| Calendar to and from Julian Day Number | 35 | The engine has no public function for this. The bot takes ordinary dates, so it never needs one. | SCOPE | No |
| Local mean time from a longitude alone | 5 | No public function. The engine does apply a birthplace's local mean time when the time zone database says the place was on local mean time. | SCOPE | No |
| A leap second (`2016-12-31T23:59:60Z`) | 1 | A JavaScript date cannot hold second 60. A birth time can't be given to the leap second in practice. | SCOPE | No |
| **Total not passing** | **233** | | | **0 hard blockers, 39 conditional** |

All 150 house and angle checks pass. So do all 45 time zone checks: 20 histories from before 1970, 4 times skipped by daylight saving, 5 repeated times. The 10 polar cases where Placidus or Koch is undefined also pass.

**Launch condition C1.** For Uranus, Neptune and Pluto, the bot must not give a single exact day as fact. It should either give the exact day as plus or minus 1 day and show the in-orb date range, or wait for the precise ephemeris backend the engine says is planned. The Sun through Saturn can be given to the day:
- the Sun through Mars shift by at most 15.1 minutes;
- Jupiter and Saturn shift by at most 112 minutes (Jupiter on 1986-11-13, moving 0.018 degrees a day), and by at most 54.3 minutes in every other case.

## Root causes

### R1. The ephemeris series (192 failures, all of L1): TOLERANCE

- **What fails.** Every failure is an L1 check of apparent geocentric ecliptic longitude and latitude (true of date). Each is compared with JPL Horizons DE441 under IAU 2006 at a tolerance of 1 arcsecond. Vector dates run from 1851 to 2149 (TT).
- **Why.** The engine takes its planet positions from astronomy-engine 2.1.19's series, which is shorter than the JPL numerical integration. The engine's own notes in `conformance/RESULTS.md` say so and plan a precise backend. The errors look like series truncation rather than a bug:
  - they are spread across all eras, with a median of 2.5 to 3.5 arcseconds in each 75-year band from 1850 to 2150;
  - they are largest for the outer planets;
  - no flag, error or outlier is present.
- **The vectors are right.** Swiss Ephemeris 2.10.03 run on the same 240 vectors passes all of them: longitude at most 0.005 arcseconds from DE441, latitude at most 0.002 (`conformance/results/pyswisseph.json`). So the residual is the engine's, not the arbiter's.
- **Why it is TOLERANCE, not REAL ERROR.** The largest difference is 18.8 arcseconds (Neptune longitude) and 19.0 arcseconds (Saturn latitude). That is about a third of an arcminute: below what a chart displays and far below any aspect orb. The suite's 1 arcsecond is the right bar for a reference engine. It is stricter than this bot needs.

Failures by body (`triage.csv`; time shift = |longitude error| divided by the engine's daily motion at that date):

| Body | Failed of 24 | Max longitude error (") | Max latitude error (") | Median time shift (min) | Max time shift (min) | Shift over 1 hour |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Sun | 9 | 1.31 | 1.63 | 0.3 | 0.5 | 0 |
| Moon | 11 | 3.74 | 1.72 | 0.1 | 0.1 | 0 |
| Mercury | 22 | 7.97 | 6.15 | 0.7 | 15.1 | 0 |
| Venus | 20 | 12.60 | 5.21 | 0.9 | 13.8 | 0 |
| Mars | 19 | 4.44 | 5.27 | 1.4 | 14.9 | 0 |
| Jupiter | 22 | 7.82 | 6.63 | 7.7 | 112.0 | 1 |
| Saturn | 23 | 10.22 | 19.03 | 13.5 | 81.6 | 1 |
| Uranus | 22 | 12.04 | 16.42 | 49.3 | 487.3 | 8 |
| Neptune | 24 | 18.77 | 9.71 | 148.6 | 14,580.7 | 21 |
| Pluto | 20 | 14.27 | 3.52 | 77.2 | 3,603.1 | 10 |

The two largest shifts are at stations: Neptune on 2125-02-11 at about 10 days, and Pluto on the same date at about 2.5 days. At a station the exact time is poorly defined for any ephemeris. Away from stations, Neptune's largest shifts are 12 to 16 hours (1969, 1977 and 2012 cases). A 16-hour shift can move the reported calendar day. That is why the 39 Uranus, Neptune and Pluto cases with more than 1 hour of shift carry C1. The Jupiter and Saturn cases over 1 hour (one each) stay within the 2-hour tolerance proposed below.

The time shift is an estimate from one body's error. A transit to a natal point also carries the natal planet's error, which can add to it or cancel it.

### R2. No Julian Day Number function (35 unsupported, L3 `calendar.to-jdn` and `calendar.from-jdn`): SCOPE

The engine converts between the Julian and Gregorian calendars internally, but it exports no JDN function, so the adapter cannot answer. The bot works with civil dates, so it does not need one. These cases are a gap in the API, not a wrong answer.

### R3. No local mean time from a longitude alone (5 unsupported, L3 `time.local-mean-time`): SCOPE

The engine applies a birthplace's local mean time inside a zone's local mean time era from its shipped tzdb 2025c history. It has no public function that takes only a longitude. Living users are rarely born in a local-mean-time era. When one is, the bot should say that the time basis is local mean time, because that changes the chart.

### R4. Leap second instant (1 unsupported, `L3-TTU-0008`): SCOPE

`2016-12-31T23:59:60Z` cannot be held in a JavaScript `Date`. The other 9 TT minus UTC checks pass to within 2.03e-8 s. If a user ever enters second 60, the bot should say so and not silently change it.

## The Swiss Ephemeris cross-check as an independent check

I found two independent Swiss Ephemeris sources. No other open branch in the engine repo has Swiss work. The only Swiss commits on any remote branch are #41's.

1. **Conformance suite, `pyswisseph` adapter** (Swiss Ephemeris 2.10.03, `.se1` files, verdicts and statistics only). It confirms the L1 vectors (240 of 240 pass). It is also a warning for step 3: Swiss fails 47 of 150 house and angle checks, all dated after 2050. Its sidereal time model changes after 2050 and puts angles and cusps up to 15.7 arcseconds off. So Swiss is not a valid arbiter for houses after 2050. Swiss also has no time zone database: 45 zone checks plus 5 local mean time checks are unsupported in Swiss.
2. **PR #41, `crosscheck/` (Codex, draft, CI green)**:
   - **Sample.** 15,360 synthetic charts drawn from 1800 to 2200 TT, compared with JPL DE440 and with Swiss Ephemeris, for the Sun, Moon, Mercury and Venus only. Mars to Pluto were not compared: the kernel it used has only their barycentres, not their exact centres.
   - **Largest engine minus JPL differences.** Sun 2.38 lon and 3.13 lat; Moon 10.43 lon and 2.42 lat; Mercury 14.11 lon and 13.40 lat; Venus 20.63 lon and 15.69 lat (all in arcseconds).
   - **Swiss versus JPL.** At most 0.79 arcseconds in longitude and 1.21 in latitude, so the engine minus Swiss figures match engine minus JPL.
   - **How it compares with the suite.** These sample maxima are larger than the conformance suite's for the Moon (10.4 against 3.7) and Venus (20.6 against 12.6), because they come from far more charts. The bot's position tolerance should rest on #41's figures, not the suite's 24 vectors per body.
   - **Gaps.** #41 has no figures for Mars to Pluto. Those rest on the conformance suite's 24 vectors per body alone.

## Proposed tolerances for the bot test set (step 3)

- **Positions.** Within 30 arcseconds of JPL (and of Swiss Ephemeris for houses before 2050). This leaves 1.45 times the largest measured error (20.63 arcseconds, Venus, #41) and is still half an arcminute.
- **Exact transit times.** Within 2 hours for the Sun through Saturn (largest measured shift 112 minutes), shown as the calendar day in the user's zone. Plus or minus 1 day for Uranus, Neptune and Pluto (largest shift away from a station: 951.8 minutes, Neptune in 1977). Near a station, a date range rather than one day.
- **Houses and angles.** Within 1 arcsecond: all 150 checks pass with a maximum of 0.071 arcseconds.

## What the suite does not test (input for step 3)

The suite checks positions, houses and angles, time zones and time scales at single instants. It does not check things the bot will rely on, so the test set has to cover them:

- the search for exact transit times, stations and retrograde periods;
- aspect detection and orbs;
- the lunar nodes and Chiron (L1 covers the Sun through Pluto only);
- the MCP server's own output. After 1970 the engine reads time zones from the host's `Intl` data, so the server's runtime tz version matters.

## How this was run

- **Commands.** `npm ci`, `npm run build`, then `node conformance/harness/validate.mjs --expect-total 500` (passes), then `run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out ../run/zodiacs-engine.local.json`, and `--check conformance/results/zodiacs-engine.json`, which says every verdict matches.
- **Node version.** Node 22.23.3 on Linux x86-64. CI pins 22.22.2, which matters only for time zones after 1970; every verdict matched anyway.
- **CSV.** `triage.csv` was written by `run/tools/triage.mjs` (outside the engine checkout). It has one row per non-passing case: id, level, kind, input, verdict, class, blocks_launch, residuals in arcseconds, the engine's daily motion, the estimated exact-time shift in minutes, and the root cause (R1 to R4).
- **No changes to the engine repo.** Nothing was committed or pushed. The engine checkout is on a detached HEAD at `bb5b4ec`, with `node_modules/` and `dist/` added (both ignored).
