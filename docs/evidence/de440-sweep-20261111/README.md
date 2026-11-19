# The dense DE440 sweep of the calc bounds

Linear ZOD-65. `PLAN.md`, committed before the first run, fixes the method,
the self-checks and the pass conditions. This file says what was run and what
came of it. Nothing in the package changes here: `src/calc-bounds.ts` is as it
was, and regenerating it is a later candidate's step.

## What was run

Workflow `DE440 sweep` (`.github/workflows/de440-sweep.yml`), run
[43037857931](https://github.com/zodiacs-org/engine/actions/runs/43037857931),
attempt 1, on 2026-11-11, for commit `3cb8aee` of this branch (the plan and
the tools on `main` at `bc0b5a7`): ten jobs, all green.

- **The kernel.** `de440.bsp`, 119,799,808 bytes, SHA-256
  `a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5`, the
  digest `ci.yml` pins. Every job that read it checked the digest first.
- **The engine.** `@zodiacs/engine` 1.1.0-rc.3 with astronomy-engine 2.1.19,
  built by `npm run build` on Node v22.23.4 in each job; the eight builds have
  one digest (`build.distSha256` in `results/summary.json`).
- **The arbiter's libraries.** Python 3.11, pyerfa 2.0.1.5 (ERFA 2.0.1), numpy
  2.4.6, jplephem 2.24 (`arbiter.software`).
- **The corpus.** Noon TT of every day from 1800-01-01 to 2199-12-31: 146,097
  instants, JD 2378497.0 to 2524593.0 TT, in eight eras of fifty years.
  Geocentric; the Sun, the Moon, Mercury to Pluto (Mars to Pluto as system
  barycentres) with each of the three corrections, and the true node and its
  opposite point; all eight frames.

## Results

`results/report.md` is the readable account, `results/tables.md` has every
table, `results/summary.json` every number, and `results/eras/` what each
era's job wrote. The largest differences over the 146,097 instants, in
arcseconds, apparent places:

| body | ecliptic longitude of date | angle, any of the eight frames | limit a receipt quotes now | limit by the same rule from the sweep |
| --- | ---: | ---: | ---: | ---: |
| Sun | 2.39 | 3.34 | 3.0 | 3.4 |
| Moon | 11.92 | 11.88 | 8.3 | 12 |
| Mercury | 14.12 | 16.92 | 9.3 | 17 |
| Venus | 22.92 | 23.32 | 11 | 24 |
| Mars | 14.32 | 22.92 | 6.6 | 23 |
| Jupiter | 10.64 | 16.81 | 13 | 17 |
| Saturn | 13.10 | 23.22 | 18 | 24 |
| Uranus | 12.09 | 19.65 | 20 | 20 |
| Neptune | 19.71 | 21.28 | 21 | 22 |
| Pluto | 29.19 | 29.86 | 25 | 30 |
| True node | 32.64 | 32.64 | 16 | 33 |

The first two columns are rounded up to 0.01″ from `results/tables.md`. The
angle is larger than the longitude difference where the engine's latitude
differs too: in the true ecliptic of date, Mars's by up to 18.54″ and the
Sun's by up to 3.15″ (`results/summary.json`, `de440`, the `lat` of the first
frame).

For the apparent places, ten of the eleven position limits a receipt quotes
now are below what the sweep found; only Uranus's holds (20″, against 19.65″
found). The 32 instants the limits came from were too few to find the worst
days.

The figures ZOD-65 quotes from an accuracy review of 1.1.0-rc.2 (Sun 2.4″,
Moon 12.0″, Venus 22.9″, Pluto 29.2″, true node 32.4″) agree with the
longitude column to 0.1″ for the four bodies. The node here is 0.24″ larger;
the review's data and its exact instants are not in this repository, so the
reason is not known.

Nothing passed the plan's sanity limits (60″ for any body, 10″ for the Sun).

## What a public sentence can say

Over these 146,097 instants the apparent ecliptic longitude of date of the
Sun, the Moon and each planet from Mercury to Pluto is within 30″ of DE440's:
the largest difference is 29.19″ (Pluto, on the last day, 2199-12-31), and
29.19″ again when the reference includes the Sun's light deflection. The
whole angle between the two directions is also within 30″ (29.86″, Pluto).

It cannot say more than that:

- The true node is not within 30″ (32.64″), so the sentence stays with the
  Sun, the Moon and the planets.
- Pluto's margin is 0.81″ in longitude and 0.14″ in angle, and its difference
  is still growing at the end of the span. The sentence holds for 1800 to
  2200 and for no day outside it.
- It is a statement about one instant a day (noon TT), geocentric, with Mars
  to Pluto as system barycentres, on the build named above. It is not a
  certification, not arcsecond accuracy, and says nothing about the time of a
  sign change.

## Self-checks

Both passed before any era ran (`results/selfcheck.json`).

- S1: the arbiter's full apparent places and node against the ERFA chain's
  oracles at 200 instants: at most 0.0030″, gate 0.01″.
- S2: the arbiter's three vectors against Horizons's committed vectors at the
  32 preregistered instants: at most 0.022″ (the Moon; DE440 and DE441 differ
  there), and at most 0.0000022″ for the other nine bodies; gate 0.05″.

## The dry run (P3)

```sh
CALC_API_RESULTS=docs/evidence/de440-sweep-20261111/results \
  python3 docs/evidence/calc-api/tools/bounds.py --check
# src/calc-bounds.ts differs from docs/evidence/de440-sweep-20261111/results/summary.json; run tools/bounds.py
# (exit status 1)
python3 docs/evidence/de440-sweep-20261111/tools/dry_run.py DIR   # DIR: a copy of results/
```

`bounds.py` writes the whole table from one summary, and the sweep's summary
holds the 32 geocentric rows only, so its check can say only that the file
would differ. `tools/dry_run.py` says how: `results/report.md` lists the 32
rows with each value now and from the sweep, and
`results/calc-bounds.dry-run.diff` is the same as a diff of the file's
numbers. All 32 rows would change and no value would fall. The other 75 rows
(heliocentric, barycentric, topocentric, the mean points) were not swept and
would stay.

After 1.1.0-rc.7, `tools/write_bounds.py` also compares the 9 topocentric
rows (the Sun, the Moon and Mars, each correction), value by value, with the
geocentric row of the same correction and body as it writes it: a
topocentric place is the geocentric one moved by the parallax, so the
geocentric differences carry over. Where the geocentric row is at or above a
topocentric row in every value, the tool leaves that row out, and calc.ts
gives the geocentric bound, labelled estimated, as for every other
topocentric body; it keeps a row at or above the geocentric one in every
value, and refuses one in between. All 9 rows are left out.
`src/calc-bounds.test.ts` checks it.

## Pass conditions

- P1, the kernel: passed. Job 130581408068 restored `de440.bsp` under the
  tier-B job's cache key and `sha256sum -c` accepted it. See Deviation 1.
- P2, the sweep: passed. Jobs 130581825656, 130581825588, 130581825577,
  130581825667, 130581825627, 130581825660, 130581825617 and 130581825531
  ran the eight eras, and job 130587516104 joined them into 146,097 instants
  and wrote the summary, the tables and the report.
- P3, the evidence and the dry run: passed, above.
- P4, nothing packed changes: this branch adds a workflow and files under
  `docs/evidence/` only.

## Reproducing

The era files are enough to rebuild the rest, with no kernel:

```sh
python3 -m pip install pyerfa==2.0.1.5 numpy==2.4.6 jplephem==2.24
GITHUB_REPOSITORY=zodiacs-org/engine GITHUB_WORKFLOW="DE440 sweep" GITHUB_RUN_ID=43037857931 \
  GITHUB_RUN_ATTEMPT=1 GITHUB_EVENT_NAME=pull_request SWEEP_COMMIT=3cb8aee8f68f766df99a95293a7a29c17928dc21 \
  python3 docs/evidence/de440-sweep-20261111/tools/sweep.py merge DIR \
  docs/evidence/de440-sweep-20261111/results/selfcheck.json docs/evidence/de440-sweep-20261111/results/eras/era-*.json
python3 docs/evidence/de440-sweep-20261111/tools/dry_run.py DIR
```

`DIR/summary.json`, `tables.md`, `report.md` and `calc-bounds.dry-run.diff`
then equal the committed ones byte for byte (checked on Python 3.13 as well).
The era files themselves need the kernel: run the workflow.

## Deviations

1. **The kernel came from the cache, not from a fetch in this run.** The
   tier-B job had already fetched `de440.bsp` from NAIF and saved it under the
   shared key, so the sweep's fetch step was skipped, as the plan intends
   ("fetched once"). The copy was checked against the pinned SHA-256 in all
   nine jobs that read it. The fetch step is the tier-B job's own, unchanged.
2. **The results were read from the job log.** The place this branch was
   drafted cannot reach GitHub's artifact store, so the last job also prints a
   gzipped tar of the results directory in base64 with its SHA-256
   (`c33df0fe1922b428d8b7711bc481336ece8496328cb707ec5d4e875ef0ba32c6`). The
   committed files are that tar's, and each one's SHA-256 is the one the job
   printed. The same directory is the run's artifact `de440-sweep-results`.
3. **No change of method.** The plan was followed as written.

## A second run

The workflow ran again when these results were committed (run
[43040210028](https://github.com/zodiacs-org/engine/actions/runs/43040210028),
commit `1313fed`, all green). It is not committed; it was compared with the
run above. The engine's values were the same bytes in all eight eras, every
position, longitude, latitude and distance statistic was the same, and so
were the bounds, the report and the dry-run diff. Some of the angular-rate
statistics differ in their sixth significant figure (247 of them, by at most
0.02 percent), in four of the eras: the arbiter's rates are differences over
0.0001 day, which magnify the last bit of a coordinate, and the runners'
processors do not all round alike. No bound moves.
