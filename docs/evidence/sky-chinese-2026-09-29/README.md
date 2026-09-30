# Sky: evidence (2026-09-29)

**In 0.1.1-rc.16.** This is the evidence of branch `feature-sky` for its sky
entry, as 0.1.1-rc.16 brings it in (`docs/evidence/rc16-20260930/`). The
branch also added a Chinese-calendar entry, `@zodiacs/engine/chinese`, whose
apparent Sun is a series fitted to JPL DE430; rc.16 holds it back until a
Sun source that is not JPL-derived is in hand, and leaves it out entirely.
Of this directory, as the branch recorded it, rc.16 carries:

- `PREREGISTRATION.md` unchanged, byte for byte as committed before any
  measurement (`255f45e`). It preregisters the Chinese entry's gates C1 to
  C4 beside the sky's; rc.16 acts on none of them and carries no result,
  tool or claim of them.
- The sky gates' results, `results/s1-skyfield.json`,
  `results/s2-swiss.json` and `results/hours-consistency.json`, unchanged,
  and `results/published.json` with its S3 part alone: the branch's file
  (SHA-256 `97231822660566877bbd69d3178f0d4b48d2528e79c8d4daf8dbd630f69471bd`,
  4,520 bytes) less its three C3 keys.
- The sky gates' tools. `published-compare.mjs` and `usno_fetch.py` keep
  their S3 parts; their C3 parts, which compared the Chinese entry's terms
  with USNO's seasons and HKO's table, are left out.
- Not `logs/`: the branch ran its package gates on its own tree, with the
  Chinese entry, and rc.16's gates are in `docs/evidence/rc16-20260930/`.

The rest of this file is the branch's, with its Chinese sections and its
figures about the Chinese entry taken out; the measurements are the
branch's, on its build. The sky gates were run again on rc.16's build after
the engine took the full IAU 2000B nutation: `rc16/` (`rc16/README.md`),
beside these results, which stay the branch's.

**Branch and base.** `feature-sky`, from `rc15-work` at `eb58011`
(0.1.1-rc.15, under review). The version was unchanged, the changelog had an
"Unreleased" entry, `artifacts/` was untouched, and nothing was published.

**What was added.** The opt-in entry point `@zodiacs/engine/sky`
([`docs/sky.md`](../../sky.md)). The root entry does not import it; its
import graph was unchanged.

**Preregistration.** [`PREREGISTRATION.md`](PREREGISTRATION.md) was committed
(`255f45e`) before the code it measures was written and before any
measurement ran. No gate was changed afterwards. A gate that failed is
reported as failed below, with its numbers.

**Instruments and inputs** (none of them committed):

| Input | Identity |
| --- | --- |
| JPL DE440s (the gates' reference) | `de440s.bsp`, 32,726,016 bytes, sha256 `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2` |
| skyfield 1.55, jplephem 2.24, numpy 2.4.6, pyerfa 2.0.1.5 | the first-principles computations and ERFA |
| pyswisseph 2.10.03, `sepl_18.se1`, `semo_18.se1` | Swiss Ephemeris, as an instrument: statistics only |
| USNO API v4.0.1 (`rstt/oneday`) | reachable; fetched 2026-09-29 |

**Use of Swiss Ephemeris.** Its values stayed in memory. `results/` holds its
statistics and verdicts only, and no engine constant or test expectation came
from it.

## Results

| Gate | Measured | Result |
| --- | --- | --- |
| S1 rise, set, transit vs skyfield + DE440s, 5 s | default conventions: 189,491 events, median 0.131 s, p95 0.999 s, max 11.62 s, 192 over, 0 missing, 0 extra; centre without refraction (Sun, Moon): 37,226 events, median 0.045 s, p95 0.174 s, max 2.19 s, 0 over | **fail** (192 Uranus events of 1950 at 65°) |
| S2 vs Swiss `rise_trans`, 5 s | default conventions: 188,982 events, median 0.155 s, p95 0.959 s, max 11.62 s, 192 over, 0 unpaired; centre without refraction (Sun, Moon): 37,224 events, median 0.083 s, p95 0.285 s, max 2.17 s, 0 over | **fail** (192 Uranus events at 65°) |
| S3 vs USNO, Sun and Moon, 30 s | 467 events, median 13.8 s, p95 27.9 s, max 30.15 s; 2 over; 3 unpaired | **fail** (5) |
| S4 planetary hours, worked examples (`src/sky/hours.test.ts`) | Chaucer: every ruler as stated; Skeat: hours of 82.32 and 37.70 min (82.5 and 37.5 ± 1.0); Heindel: the ninth hour, Mars's, 13:30:06–14:16:46 (13:32 and 14:18 ± 5 min); Cassius Dio: each day's first hour its own planet's | pass |
| S4 consistency with the rise/set function, 1 ms | 9,504 dates; 9,495 complete (9 with no sunrise on the UTC date), 227,880 hours, 0 failures | pass |

### S1: rise, set and transit against first principles

`results/s1-skyfield.json`, with the statistics by body, by latitude and by
kind of event, and each failing event. Both programs read the engine's UT1
and ΔT, so the differences are the positions and the searches. Every event
is paired and none is missing or extra. The 192 events over 5 s are all the
rises and sets of Uranus in 1950 at 65° N and 65° S (96 each), where the
planet, at declination +23.6° (astronomy-engine), rose and set at a grazing
angle: its altitude changed by 1.47′ to 2.50′ a minute at those events, and
each difference times that rate is 15.4″ to 17.9″ of altitude, the size of
astronomy-engine's error for Uranus (up to 19.3″ in declination against
DE440s in the README's comparison). At 65° S every failing rise is late and
every failing set early, at 65° N the reverse, by about the same amount: the
pattern a difference in declination gives. The largest difference is
11.62 s. The transits, which a declination error does not
move, are within 1.15 s everywhere; every other body is within 4.93 s
(Saturn), the Sun within 1.13 s and the Moon within 0.44 s. The centre of the
Sun and the Moon without refraction is within 2.19 s at all 37,226 events.

### S2: Swiss Ephemeris `rise_trans`

`results/s2-swiss.json`. With both sides on the engine's ΔT and UT1, the
default conventions agree within 5 s at every event but 192, all of Uranus
at latitude ±65°, where the planet, at a declination near +23°, rises and
sets at a grazing angle; the largest difference is 11.62 s. The engine's
Uranus comes from astronomy-engine, whose declination was up to 19.3″ from
DE440s in the README's comparison; at a grazing rise an arcsecond moves the
time by seconds. No other body has an event over 5 s; the largest among
them is 4.93 s (Saturn). The centre without refraction agrees within 2.17 s at all
37,224 events. Three events within 60 s of an edge of the window (one of
Saturn, two of Uranus) were left out of the count, as preregistered; the
file counts them as `edge`.

### S3: USNO

`results/published.json`. USNO gives the minute, so a difference up to 30 s
can be rounding alone; the gate leaves no room for the engine's own error or
for convention.

- Over 30 s: the Moon's rise at 34.60° S 58.38° W on 1950-03-20 (−30.06 s)
  and the Sun's set there on 2024-06-21 (−30.15 s). USNO uses a fixed 16′
  for the Sun's radius; the engine uses the day's (15.74′ in June, which
  `src/sky/riseset.test.ts` checks), and a smaller disc sets earlier.
- Listed by one and not the other: the Moon's upper transit at 23:59:30.013
  on 2024-06-21 at longitude 0° (two sites), which USNO lists as 00:00 on
  2024-06-22 (fetched separately, not committed); and the Moon's upper
  transit at Fairbanks on 2024-06-21, which USNO omits ("Object continuously
  below the Horizon") while the engine gives transits below the horizon.

## The entry points and their size

`npm run package:contents` on the branch's build (its
`logs/package-contents.log`, not carried), the sky rows:

| Entry | Import graph | Budget | Beyond the core's graph |
| --- | ---: | ---: | ---: |
| `.` | 95,273 | 100,000 | – (unchanged) |
| `./sky` | 83,254 | 92,000 | 15,902 |
| `./timing` | 112,614 | 120,000 | 30,344 (+129: its rulers now sit in a chunk shared with `./sky`) |

`./sky` reaches the ephemeris chunk for the engine's clock
(`onChartClock`), and so the core modules that chunk imports; it computes its
own sidereal time rather than import `gastHours`, whose export grew the
root's chunk.

## Reproducing

```sh
npm ci && npm run build
T=docs/evidence/sky-chinese-2026-09-29/tools
node $T/sky-engine.mjs /tmp/x/sky-engine.jsonl.gz
python $T/sky_reference.py /tmp/x/sky-engine.jsonl.gz de440s.bsp results/s1-skyfield.json   # skyfield venv
python3 $T/sky_swiss.py /tmp/x/sky-engine.jsonl.gz EPHE_DIR results/s2-swiss.json            # pyswisseph
node $T/hours-consistency.mjs results/hours-consistency.json
python3 $T/usno_fetch.py /tmp/x && node $T/published-compare.mjs /tmp/x results/published.json
```

## Not done, and uncertain

- The S1 and S2 gates fail for Uranus at ±65° (192 events each; in S1 all
  in 1950): astronomy-engine's position of the planet at grazing rises and
  sets. The engine's positions were not changed.
- The S3 gate fails against a table given to the minute, by at most 0.15 s
  beyond 30 s and at three events only one side lists.
- USNO's API gives times to the minute; its rounding rule is not stated on
  the pages read. The signed differences (`signedMin`, `signedMax` in
  `results/published.json`: −30.15 s to +29.78 s for USNO's rise, set and
  transit) fit rounding to the nearest minute.
