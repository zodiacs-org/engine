# The time bands in 1.1.0-rc.2: the formal run

The formal run of `PREREGISTRATION.md` in this folder, P1.M3c (per-body,
angle, cusp and event bands from σ(ΔT) and σ(UT1 − UTC)), with every dated
amendment at its end applied (the owner's answers of 2026-11-03; review 1's
disclosure, the angles' rate on TT with its ±600 s step, C4a's distance
floor, the corrected table end in `tools/bands.py`, the mean points' speed
basis in C6's rule (iv); SR's finding that C8 is void; review 2's
disclosure, the polar-limit one-sided rule, C6's stricter tool, C3's
control (b) and C1's dump), and with the committed tools in
`tools/`. `tools/checks.sh` is the procedure: it ran once, in formal mode,
alone, after one build. Nothing was rerun, and no tool, rule or tolerance was
changed. C1, C2, C3, C4 (C4a to C4d), C5, C6, C7 and the named tests pass,
and every one of their controls failed as required. **C1b failed**: 19
problems, all at two of T3's seams, with both its controls failing, so it is
a failure and not a void check. C8 is void as run in SR and was not run
here; C9 is not due. Nothing was committed.

- **Commit** 237b2265fcc53ae51abcb4f8e895e64c66321f5e (branch
  `rc2/main-first`), the reviewed tree whose packed bytes are the source
  commit's; HEAD was the same at the start and at the end
  (`results/00-start.log`, `results/99-end.log`).
- **Machine** darwin-arm64 (macOS 27.0.1). **Node** v22.22.2 (npm 10.9.7)
  for the build, the dumps, C4, C6, C7 and the named tests' controls.
  **Python** 3.9.6, the system `/usr/bin/python3` with `-I`, for C1, C1b,
  C2, C3 and C5 (each of their outputs records `"python": "3.9.6"`).
  TypeScript 5.9.3, tsup 8.5.1, esbuild 0.27.7, astronomy-engine 2.1.19 and
  vitest 2.1.9, as installed in the checkout (`results/00-start.log`).
- **The OQ6 environment was not used.** No check needs pyerfa or numpy.
  C3 loads the conformance suite's L2 arbiter (`conformance/arbiters/l2/build.py`)
  from its file, unmodified, but `tools/angles.py` puts its own `erfa` module
  in place of pyerfa before loading it, whatever Python runs it (the stub
  gives `cal2jd` and raises for every other function), and the arbiter
  imports no numpy. `checks.sh` runs C3 with `python3`, and the system Python
  3.9.6 loaded the arbiter, as RC2-PLAN 5.11 item 4 foresaw ("C3 if Python
  3.9.6 loads the arbiter"). So the toolchain's `py311-oq6` environment
  stayed unused, and the arbiter raised in no case.
- **When** 2026-11-04, from 12:55:27 to 13:01:45 (ICT); `checks.sh` from
  12:56:02 to 12:56:33, exit 1, the status it gives when any step fails
  (here C1b).
- **Build** `npm run build` once, under `nice -n 10`, before the checks
  (`results/02-build.log`).
- **Site inputs.** `checks.sh` read the ΔT model's Python twin and its
  table (`docs/platform/evidence/deltat-2026-09-25/tools/lib.py` and
  `table.json`) from the git objects of the site clone at site main
  9a67f761bc231741c6571af2dfae65b798954e11, with lazy fetching off. The
  preregistration pins the commit; it gives no SHA-256 for these two files,
  so they are recorded here: lib.py blob `59e06bcf`, 13,405 bytes, SHA-256
  `c220599dbe409f464a8bbea19cd02585b3f0c005c770eaede4fa1e17e51e600f`;
  table.json blob `6220b0d2`, 4,642 bytes, SHA-256
  `80ddc3598a2c4332dea3af97051a821525189a04c77281cf7c7e3ab94793c175`
  (`results/01-site-inputs.log`); the copies `checks.sh` used have the same
  SHA-256 (`results/04-outputs.log`). lib.py imports only the standard
  library. Only `rev-parse` and `cat-file` ran in that clone; nothing in it
  was edited.
- **Corpora** (section 5), as `tools/corpora.mjs` builds them: T1 32 TT
  instants, T2 64 UT1 instants, T3 the 7 seams at the instant and 1 ms
  either side (21 instants), each in the forms F1 to F5, and E 11 event
  windows. The dumps hold T1 13,312 records, T2 42,304, T3 13,881 and E 11
  windows with 16 events; none was refused (`results/04-outputs.log`). They
  are the engine's results the references read: 22,092,167, 82,962,041,
  27,717,890 and 24,272 bytes, kept in the run's scratch folder and not
  committed. Their SHA-256: dump-T1.json `04beb1cd7a4bb7fdb343b76c2494d02345f2d2d5bb1559a7afb27d9a038c1f2a`,
  dump-T2.json `98e63ed8cfe9753d9141de258b5049f20f8784e6c9651189430debf719f948da`,
  dump-T3.json `d7ea757458e49670e55ec4dc05a5989e8fa542736880536bb495eb000dc0411f`,
  dump-E.json `3c596f1a14fd0cf957afd94ceda1efbf4a1d22e01715307325c464c7be28b650`
  (`results/03-checks.log`).
- **Logs, and the paths shortened by hand.** Each log under `results/` was
  written by this run's own wrapper, not by a tool of this unit: it begins
  with the machine, Node, npm, Python, commit, environment, free disk,
  working folder, command and start time, and ends with the exit status.
  The wrapper shortened local paths in every log by hand, with `sed`, to
  `<checkout>`, `<scratch>` (this run's scratch folder), `<scratchpad>`,
  `<programme>` and `<home>`; a search of `results/` for the user name and
  for the prefixes of the home and temporary folders finds nothing. The
  tools' JSON outputs needed no shortening (they name the dumps by file
  name only) and are copied unchanged: their SHA-256 in the scratch folder
  and in `results/` are equal (`results/04-outputs.log`).

## Checks and controls

| check | verdict | figures (this run) | controls | failed as required |
| --- | --- | --- | --- | --- |
| C1, the band table reimplemented | pass | 31,016 records judged (T1 8,480, T2 16,960, T3 5,565, E 11 windows), 0 problems (`results/c1.json`) | (a) σTT = d on every UTC input: 27,923 problems; (b) the linear sum u + d after the table: 8,569; (c) every zero band 5e-324: 78,068; (d) topocentric bands without w: 12,540; (e) a zero band where speeds is null: 585 | yes, all five |
| C1b, the recorded σ against their sources | **FAIL** | 586 distinct instants (465 `zodiacs-deltat/1`, 121 `iers-utc/1`), **19 problems**, all at T3's 1956-01-01T12:00Z and 2026-09-24T00:00Z seams (below; `results/c1b.json`) | (a) u without the 0.79 ms: 243 problems; (b) d at the year of jdTt: 282 | yes, both |
| C2, against JPL Horizons rates | pass | 3,080 records (T1, the Sun, the Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto, apparent and geometric, `equatorial-icrs` and `ecliptic-icrs`, the forms whose σTT is not 0), 0 without Horizons rows, 0 problems. Reported, not judged: the distance bands against the Horizons distance rate × σTT, 3,080 cases, largest difference 3.261304379933091e-09 au (`results/c2.json`) | (a) bands × 1.05: 5,880 problems; (b) σUT1 in place of σTT: 4,678; (c) each body against the next body's expected value: 6,141 | yes, all three |
| C3, angles and cusps against the L2 arbiter | pass | 6,644 records judged (σTT = 0: F1, and F3 from 1972 to the table's end, on T2 and T3), 0 problems, the arbiter raised in 0 cases. Counted and not judged, as the amendment of 2026-11-03 (review 1) fixes: 5,350 records whose σTT is not 0 (F3 and F5). At S7, inside the polar circle, the fallback cusps are judged (exactly 0, no problem) and the angles reported, not judged: 576 values, largest relative difference 2.09932422756363e-10 (`results/c3.json`) | (a) the solar-time rate, 15″ a second: 77,224 problems; (b) the next larger judged σUT1 in place of each record's own: 75,852 | yes, both |
| C4a to C4d, the pinned ΔT (consistency, not accuracy) | pass | 16,768 records on T2; failures: C4a 0, C4b 0, C4c 0, C4d 0. Reported, not judged: the true nodes outside C4a's tolerance in 372 values; first order over ±σUT1 at S5 and S7 outside C4b (ii)'s tolerance in 108 values; C4c's largest relative difference 612.2006775867486, where the 1e-6″ floor governs (no value failed C4c); C4d's band over the pinned partials in 10,215 cases, smallest 1.000285837230734, median 1.681658303343823, largest 24281796.758687064 (`results/c4.json`) | C4a, bands × 1.001: 2,988 problems; C4b, the solar-time rate, (i): 73,728 and (ii): 50,085; C4c, b11c5e8's bands without the TT term: 64,124; C4c, bands × 1.1: 38,855; C4d, the bands without w: 1,912 | yes, all six |
| C5, event bands | pass | 16 events in 11 windows, every event with a band, 0 problems (`results/c5.json`) | (a) `band.utc` = d: 10 problems in 8 windows, among them E-Sun-0-2000, whose event is on the IERS basis; (b) the bands of the window's first instant: 18 problems in 8 windows, among them E-Sun-0-2150 and the four Moon windows of the two seams (1971-12 and 2027-09) | yes, both |
| C6, no value moves (the fixture rule) | pass | the committed `src/fixtures/calc-roundtrip.json` (38 cases, regenerated on x86-64: commit X, c50ca6e, and again in 8173f1e after review 1, as the evidence README records) against a253973's: (i) 28 band keys, (ii) 26 `conventions` arrays, (iii) 30 version strings (27 `version`, 3 `engineVersion`, all from 1.1.0-rc.1 to 1.1.0-rc.2), (iv) 6 bases (cases 4, 12 and 26, position and speed), 0 other differences (`results/c6.json`) | one longitude in its last place and one added key; one engine version set to another; one ephemeris version changed; one mean point's basis given another text; a band key added to a refused result: each reported | yes, all five |
| C7, the API only grows | pass | 15 reports. Against a253973 (13 reports): 11 declarations added, 4 grew (`CalcEvent`, `CalcPosition`, `ChartResult`, `HousesResult`), 30 "exported by" lines gained entry points, in the six reports `calc`, `geo`, `receipt`, `techniques`, `timing` and `vedic`, and two new reports, `lite.api.md` and `time.api.md`. Against 3129edec, the commit before the band commits (14 reports): 13 added, 4 grew, 0 gained, one new report, `lite.api.md`. 0 problems. The additions include the varga sensitivity's declarations in `vedic.api.md`, which the rule allows as additions (`results/c7.json`) | a declaration line removed: 1 problem; an "exported by" line that loses an entry point: 1 | yes, both |
| The named tests (section 6, as amended) | pass | the 14 named tests of `src/time-bands.test.ts` and `src/calc.test.ts` pass on the real source (`results/named-controls.json`) | 11 controls, below | yes, all eleven |
| C8, the new sentences against the claims ledger | **void, as run in SR**; not run here | below | | |
| C9, the release state in production | not run: after the owner merges the site's adoption | | | |

### The named tests' controls

Each is an exact edit of a copy of the source in the scratch folder; the
tests named as "must fail" failed under each (`results/named-controls.json`):

| control | must fail | named tests that failed under it |
| --- | --- | --- |
| (a) the TT band d on every UTC input | rows, seams, zeros, eventsCharts | rows, seams, zeros, sidereal, eventsCharts |
| (d) the topocentric bands without w | topocentric | topocentric |
| the calc instant's record given `timeScale.input` `"tt"` | same | same, nullBand |
| a `timeBands` that returns zeros for a record without a time scale | range | range |
| a `calc()` that gives a zero band without speeds | nullBand | nullBand, id |
| bands left in radians | radians | radians |
| whole-sign cusp bands set to the ascendant's | whole | whole |
| the angle bands without their rate on TT (b11c5e8's) | ttTerm, sidereal, eventsCharts | ttTerm, polarLimit, sidereal, eventsCharts |
| sidereal angle bands whose rate on TT leaves out the ayanamsa's | ttTerm, sidereal | ttTerm, sidereal |
| the cusps' rate on TT taken across a side that falls back (4f4c1e8's) | polarLimit | polarLimit |
| the id left out of `events()`'s receipt | id | id |

## C1b: the 19 problems

`results/c1b.json` lists all 19 (the tool keeps the first 20). Each instant at
the IERS basis is judged twice, on `ut1MinusUtc.sigma` and on
`deltaT.sigma`, which must equal it, so each instant there gives two
problems. What the engine recorded at those times is in
`results/05-c1b-records.log`, which reads this run's T3 dump and the
committed IERS rows. It is not a check and not a rerun: it computes no
reference and changes no verdict.

1. **14 problems, 1 µs: 0.000817 s recorded, 0.000816 s expected,** at
   every instant of 2026's observed segment in the corpus: the four
   non-pinned instants at 2026-09-23T23:59:59.999Z (8 problems) and three
   of the five at 2026-09-24T00:00:00.000Z (6). The largest formal error of
   2026's 267 rows flagged I is 0.0000265 s (2026-09-12), 26.5 µs. The
   engine's table generator rounds it with `Math.round(error * 1e6)`
   (`scripts/build-time-scales.mjs:235`), 27 µs, which halves up; the
   reference rounds it with Python's `round(float(error) * 1e6)`
   (`tools/bands.py:270`), 26 µs, which halves to even. With the 0.79 ms
   added they give 0.000817 and 0.000816. Neither the preregistration nor
   `docs/time.md` says how a half microsecond rounds; `bands.py`'s docstring
   takes the errors "in whole microseconds, as the table stores them".
2. **4 problems, 0.000898 s recorded, 0.000816 s expected,** at
   2026-09-24T00:00:00.000Z, the last instant of the observed segment: the
   TT-input instant (carried by 50 `calc()` and 80 `houses()` records of F1)
   and the UT1-input instant (50 and 80 records of F2) record the
   prediction's σ, source `"predicted"`. The UTC-input instant, and
   `chart()`'s instants on the same TT and UT1 inputs, record 0.000817,
   source `"observed"`. All five record the same jdUt1, 2461307.4999998496.
   The reference reads each record's UTC to the millisecond, so it puts
   every one in the observed segment.
3. **1 problem, 0.46 s recorded, 0.03 s expected,** at
   1956-01-01T12:00:00.000Z, the model's year 1956.0, where σ steps from
   0.46 s to 0.03 s: the TT-input instant (50 `calc()` and 80 `houses()`
   records of F1) records `deltaT.sigma` 0.46, segment `"reconstructed"`,
   ΔT 31.34999999999981 s, with jdUt1 2435474, which is the year 1956.0 at
   which the twin gives the expected 0.03. The UTC-input and UT1-input
   instants, and `chart()` on the same TT input, record 0.03, segment
   `"observed"`, ΔT 31.35 s.

At 1 ms before and after the 1956 seam and 1 ms after 2026-09-24T00:00Z,
no instant failed, and no instant outside these two seams failed. In
kinds 2 and 3 records of one input, at a step's own instant, carry the
values of different sides of the step while recording the same jdUt1. A
version 2 of C1b would have to fix how a half microsecond rounds and which
side of a step an instant at the step takes; this run settles neither.

## C8: void, as run in SR

Not run in this formal run, as the plan and the amendment of 2026-11-03
("the site run (SR) on b11c5e8: C8 is void as run") fix. Recorded from the
site runs' reports, programme notes outside this repository
(`notes/rc2-2026-11-01/sr/REPORT.md` and `sr3/REPORT.md`): in SR, on
b11c5e8, the control sentence "The band bounds the error of every
position.", planted in a scratch copy of the rc.2 reference as a paragraph
of `release/README.txt` and as the first paragraph of
`functions/time.timeBands.html`'s comment, was not listed by the claims
extractor (`--unlisted`: 46 sentences, the planted one not among them),
because no word of it is a trigger of lexicon 2; with ", in arcseconds"
added it was listed in both places (48). SR3, on 5c00cb8, planted the same
sentence in the same two places: 47 unlisted sentences with and without it,
the listing identical line for line, the sentence not listed. By section 9 a
check whose control does not fail is void: C8 is void, its version 2 is due
in the site's adoption with a lexicon that selects the band sentences, and
no other sentence was tried here.

## Not run, and departures from the preregistration

- **C8** not run (above). **C9** not run: it reads production after the
  owner merges the site's adoption pull request.
- **C2 in `ecliptic-true-of-date`.** The preregistration's OQ6 row says
  that with pyerfa C2 adds that frame. The owner approved pyerfa under
  OQ6, but no amendment of this unit adds the frame, and the committed
  tools have no path for it (`tools/dump.mjs` tags C2 records in the two
  ICRS frames only, and `tools/horizons.py` rotates the Horizons vectors
  into those two only). Adding it would
  mean writing a tool during the run, which the formal rules forbid. C2 ran
  in `equatorial-icrs` and `ecliptic-icrs`, on the Horizons responses
  committed in `docs/evidence/calc-api/horizons/`, with no new request.
- **C6's other clauses.** `checks.sh`'s C6 is the fixture rule, and it ran
  on the committed fixture, which commit X regenerated on x86-64. The
  conformance results' regeneration and the clause on `npm test` are not
  part of it and were not run here; the evidence README's sections on the
  x86-64 regeneration and on the checks on the tree record those runs.
- **C7 on the reports as committed.** The preregistration's C7 regenerates
  `api/*.api.md` with `npm run api:report`; `checks.sh` compares the
  reports committed at 237b226 and does not regenerate them, and this run
  did not run `npm run api:report`, which writes to `api/`, outside this
  folder. The gates on the tree ran the API check (the evidence README).
- **T0 not tried again.** The tools were tried on T0 before the formal run,
  as the amendments record; this run did not repeat it.
- **Writes outside this folder.** The build wrote `dist/`, and the named
  tests' controls, which link the checkout's `node_modules` into their
  scratch copy, updated vitest's cache, `node_modules/.vite/vitest/results.json`;
  git ignores both. No `__pycache__` was written beside the tools or the
  arbiter.
- **The other units' folders.** Every file under
  `docs/evidence/1.1.0-rc.2-20261102/` outside `time-bands/`, 193 files with
  the uncommitted results in `f89/`, `lite/` and `time-entry/`, has the same
  name and bytes at the end as at the start (`results/99-end.log`). The
  modification of `carrier/carrier-gates.sh` was there at the start
  (`results/00-start.log`) and is not this run's.

## The release state

Section 9 makes the unit `validated` when every check passes and every
control fails. Here C1b failed, with both its controls failing, and C8 is
void as run in SR, so version 1's evidence does not meet R-M3c, and this
run does not make the unit `validated`. By section 9 a fix of C1b is a
version 2, with its own preregistration that cites this one and these
results, and C8's version 2 is already due in the site's adoption. OQ5 is
not ratified (`../OWNER-ANSWERS.md`), so a version that passes could reach
`validated` at most until the owner ratifies R-M3c, and `accepted` needs C9
besides. Section 7's ledger sentence ("otherwise to `validated`, naming
what is missing") is read here with section 9, under which the evidence
meets R-M3c only when every check passes; what the ledger records for
P1.M3c after this run is for the coordinator and the owner to decide.

## Files

In `results/`: `00-start.log` (the state at the start, the SHA-256 of this
preregistration and of the tools as run), `01-site-inputs.log`,
`02-build.log`, `03-checks.log` (`checks.sh`'s whole output), `04-outputs.log`
(the dumps, and the outputs copied), `05-c1b-records.log` (what the engine
recorded at C1b's problem times), `99-end.log` (the state at the end, with
the SHA-256 of each file above); and the tools' outputs as written,
`c1.json`, `c1b.json`, `c2.json`, `c3.json`, `c4.json`, `c5.json`,
`c6.json`, `c7.json` and `named-controls.json`.
