# The varga sensitivity in 1.1.0-rc.2: the formal run, and G-V4 run again in full

The formal run of `PREREGISTRATION.md` in this folder, P2.B.vargas
(`vargaSensitivity` in `@zodiacs/engine/vedic`: the instants at which a change
of birth time moves each divisional chart's sign), with every dated amendment
at its end applied, and with the committed tools in `tools/`. The amendments
applied: the owner's answers of 2026-11-03 (OQ6 yes, so G-V4 ran with pyerfa;
OQ5 not answered); the implementation's departures; review 1's seam input F3b
with C3d on it, its procedure that records every step, C4a's verdict taken
side by side, its two corrected figures and 66° as a margin; review 2's
disclosure of what it ran before this run, the boundary of a change at a
station, the procedure's checks that can fail (G-V5's `--check` moved to
`../gates.sh`) and the committed derived bounds. `tools/checks.sh` is the
procedure: it ran once, alone, after one build. In the formal run nothing was
rerun, and no tool, rule or tolerance was changed. Its outputs, as written,
are in 47df12f.

F1 and the inputs, G-V1, G-V2 (a) and (b), G-V3 on F2, F3 and F3b, section
7's table and the named tests pass in the formal run, and every one of their
controls failed as required; G-V5's table is written into `docs/vedic.md` and
its control failed as required. The formal run was **stopped during G-V4**,
after G-V4's comparison and before its controls C4a and C4b: the free disk
fell from 5.6 GiB to 2.6 GiB in 30 s, under the 4 GiB at which FORMAL-COMMON
says to stop and report. The run also found that **F4's calls had not been
made on the Ascendant alone**, as section 6 fixes F4: a departure of the
committed `tools/load.mjs`. The amendment of 2026-11-04 ("after the formal
run: G-V4's interruption and the loader", 7b29ddd) changed the loader and
`checks.sh` after the formal run, and **G-V4 then ran again in full** with
them (its section below): **G-V4 passes** (35,204 sides judged, 0
mismatches, every difference under 1.4 ms), and **C4a and C4b each failed as
required**. As the amendment announced, a note compares its Ascendant rows
with the interrupted run's: **all 18,000 are the same**.

- **Commit** of the formal run 237b2265fcc53ae51abcb4f8e895e64c66321f5e
  (branch `rc2/main-first`), the reviewed tree whose packed bytes are the
  source commit's; HEAD was the same at the start and at the end
  (`results/00-start.log`, `results/99-end.log`). G-V4 run again in full ran
  at 7b29dddf179ea1e4b0643fd86108d5d826988ed7, whose sources are 237b226's
  (`results-erfa/00-start.log`, `results-erfa/99-end.log`).
- **Machine** darwin-arm64 (macOS 27.0.1), 10 CPUs (4 performance and 6
  efficiency cores), 17,179,869,184 bytes of memory. **Node** v22.22.2 (npm
  10.9.7) for the build and every Node step. TypeScript 5.9.3, tsup 8.5.1,
  esbuild 0.27.7, astronomy-engine 2.1.19 and vitest 2.1.9, as installed in
  the checkout (`results/00-start.log`). `README.md` gives the environment of
  both runs.
- **Python, by step.** The system Python 3.9.6 (`/usr/bin/python3 -I -B`, as
  `checks.sh` names it) for F1's `varga_changes.py --check`, G-V1's
  `boundary_fixtures.py --output`, section 7's `derived_bounds.py` and its
  control's verdict (`results/derived-bounds.json` records 3.9.6). Python
  3.11.16 with pyerfa 2.0.1.5 and numpy 2.4.6, the OQ6 environment
  (`<programme>/toolchain/py311-oq6/venv/bin/python`, outside every
  repository, approved under OQ6; `checks.sh` runs it with `-I -B`), for
  G-V4's `varga_ascendant.py` only: in the formal run the comparison, and C4a,
  which had started when the run was stopped; in G-V4 run again in full the
  comparison, C4a and C4b (`results-erfa/compare.json`, `control-c4a.json` and
  `control-c4b.json` record Python 3.11.16 and pyerfa 2.0.1.5; the arbiter
  does not record numpy, whose version is in `results/00-start.log`,
  `results-erfa/00-start.log` and each log's first lines). pyswisseph was not
  used.
- **When** 2026-11-04 (ICT). The formal run from 13:15:16 to 14:48:41:
  `checks.sh` from 13:15:31 until the disk watch stopped it at 14:42:31; then
  the record steps (`results/03-outputs.log` to `results/99-end.log`). G-V4
  run again in full from 15:09:01 to 15:14:39: `checks.sh --g-v4` from
  15:09:18 to 15:13:50.
- **Build** `npm run build` once, under `nice -n 10`, before the checks
  (`results/01-build.log`): version 1.1.0-rc.2, 57 JavaScript files in
  `dist/`, digest `21b80ef0dcafb71f108a397e015218083e1cf346741961b4b36ff429c8888109`
  (the digest `tools/load.mjs` takes, in `results/run.json` and
  `results/time-per-arcsecond.json`). G-V4 run again in full built once more
  and found the same version, count and digest before it ran
  (`results-erfa/01-build.log`, `results-erfa/run.json`).
- **Priority and workers.** `checks.sh` ran under `nice -n 10`, with 10 worker
  threads for the checker, which `checks.sh` passes to `checker.mjs` and
  `controls.mjs`: Node's `availableParallelism()` on this machine, the most
  `checker.mjs` takes. G-V3's checker took 74.77 minutes
  (`results/check.json`).
- **Free disk** (`df -k /System/Volumes/Data`) in the formal run: 7.4 GiB
  before the build and before `checks.sh` (7,748,840 KiB); beside
  `checks.sh`, the run's watch took 348 samples, every 15 s
  (`results/03-outputs.log`): 9,714,516 KiB at the first sample of G-V3's
  step (13:16:46), before the checker; 6,089,512 at G-V5 (14:39:46);
  5,959,532 at G-V4 (14:40:31); then 5,913,668 (14:42:01), 4,217,776
  (14:42:16) and 2,759,188 (14:42:31), where the watch stopped the run. At the
  end 2.3 GiB (`results/99-end.log`). For G-V4 run again in full, below.
- **Inputs.** `boundaries.json`, F1 and its generator, F2, F4 and their
  generator, F3 and its generator, and F3b and its generator each match the
  SHA-256 recorded for it (`results/inputs-sha256.txt`).
- **Logs, and the paths shortened by hand.** Each log under `results/`
  (`00-start.log` to `99-end.log`) and under `results-erfa/` (`00-start.log`
  to `99-end.log`, G-V4 run again in full) was written by the run's own
  wrapper, not by a tool of this unit: it begins with the machine, Node, npm,
  both Pythons, the commit, the environment, the free disk, the working
  folder, the command and the start time, and ends with the exit status;
  local paths are shortened as the log is written, to `<checkout>`,
  `<scratch>` (the run's scratch folder), `<scratchpad>`, `<programme>` and
  `<home>`. By hand, in the formal run:
  - `results/02-checks.log` is `checks.sh`'s whole output. The wrapper was
    stopped with the run, so it wrote neither the log's closing line nor its
    shortened copy; the raw log, unchanged, was shortened to it afterwards in
    the same way (`results/03-outputs.log` gives both SHA-256).
  - Nine outputs held absolute paths that the tools write: `results/run.json`
    (3 of the checkout), `results/check.json` (1), `results/controls.json`
    (1 of the checkout, 3 of the scratch folder), `results/f1-check.json` (1),
    `results/tests.json` (vitest's report, 6), `results/time-per-arcsecond-write.txt`
    (1), `results/time-per-arcsecond-control-copy.txt` (1 of the scratch
    folder, 1 of the checkout), `results/time-per-arcsecond-control.txt` (1
    of the scratch folder) and the formal run's `results-erfa/run.json` (1;
    in 47df12f). Each was shortened in the same way and nothing else in it
    changed; each is kept as written in the scratch folder, its SHA-256
    before and after is in `results/03-outputs.log`, and the JSON among them
    still parses.
  - Two headings of `results/03-outputs.log` printed the search pattern for
    local paths, which held the local user name; it was replaced there by
    `<user>` (`results/05-hand-edit.log`, with both SHA-256).
  - `results/99-end.log` was written three times: after the hand edit, and
    again because its search for local paths matched its own heading. The
    last writing stands; its search, of every file in `results/` and
    `results-erfa/` but itself, finds no user name and no temporary folder's
    path.

  In G-V4 run again in full, `results-erfa/run.json` held one absolute path
  of the checkout, shortened by hand in the same way (SHA-256 before and after
  in `results-erfa/03-outputs.log`); its search for local paths prints no
  pattern, and `results-erfa/99-end.log` finds none in `results-erfa/`.

## Checks and controls

| check | verdict | figures | controls | failed as required |
| --- | --- | --- | --- | --- |
| F1 and the inputs (section 6) | pass | `varga_changes.py --check`: identical; 3,480 part boundaries, 3,456 changes, 24 keeps (the D2 at its 12 sign starts; the D10 and the D24 at 30, 90, 150, 210, 270 and 330°) (`results/f1-check.json`); the ten recorded SHA-256 match (`results/inputs-sha256.txt`) | none in this run (F1's control ran in commit I, `INPUTS.md`) | |
| G-V1, the assignments stay exact | pass | `boundary_fixtures.py --output` regenerates `boundaries.json` byte for byte (`cmp`), SHA-256 `3578be675ddb51bb80ab543431d654c9a6e7bcab4d70d9abcae381ea29dcd51f` as recorded (`results/boundaries-sha256.txt`); `src/vedic/boundaries.test.ts` 21 of 21 tests pass, the 18 varga tests ("places D… exactly") among them (`results/tests.json`) | the naive `Math.floor(lon * 7560)` in `src/vedic/grid.ts`: 6 of 21 tests fail, D7, D9, D27 and D45, with the nakshatras and padas and the KP subs, as the 2026-09-28 evidence recorded | yes |
| G-V2 (a), which boundaries are changes | pass | the 18 per-key tests ("the change boundaries are the fixture's change rows") and the count test pass (`results/tests.json`) | (i) every part boundary a change (`src/vedic/varga.ts`): exactly 24 mismatches; (ii) F1's change row `[1002960,10,11,1]` (the D45) made a keep: exactly 1 (`results/test-controls.json`) | yes, both |
| G-V2 (b), every reported change crosses a change row | pass | 133,060 reported changes (F2 132,594, F3 460, F3b 6), 0 exceptions (`results/check.json`, `results/04-figures.log`) | (iii) F2 birth 0's Ascendant D2 `next.boundary` set to 150, the sign start next to it, a keep: G-V2 (b) fails once, with M4 once (`results/controls.json`) | yes |
| G-V3, instants exact in the engine's arithmetic, none missed | pass | 1,015 calls (F2's 1,000 births, F3's 13 cases, F3b's 2), none threw and no row was refused (185,562 rows on F2, 234 on F3, 36 on F3b); 0 failures of M0 to M6; the 12 planted F3 cases and both F3b cases give their expected change, key, side, millisecond, boundary and signs, and F3 case 5 (not planted) has none to give; M5 sampled 28,894,264 instants with 28,968,291 calls of the public API (`results/check.json`, `results/04-figures.log`) | C3a: one `next.at` 1 ms later (F2 birth 0, the Ascendant's D1): M2 fails once (with M4 and M5 once); one `next` set to null: M5 fails once. C3b, every body's bound divided by 10, on the first 50 births of F2 (ids 0 to 49): 5,364 rows refused (M0; the 20 the report keeps are all `rate-bound`), so not a pass. C3c, the Ascendant's changes at the ends of 60 s brackets, on the same 50: M2 fails 1,800 times (M4 1,800, M5 900). C3d, a seam finder that returns none, on F3b: M6 fails on both cases (no `next` found) (`results/controls.json`) | yes, all five |
| Section 7, the derived bounds | table written | `R_lo` stays above zero up to 66.498285945° for `a` of 0.0003 degree a day, 66.498284072° for the largest linear rate and 66.498271498° for a star definition (0.0213), as `derived-bounds.json` beside this file records; at 66°, `R_lo` 28.659597 and `R_hi` 16,993.494669 degrees a day for 0.0003 (`results/derived-bounds.json`) | a real lower bound asked for at 66.6°: the 3 rows there have none, and the script says so 3 times on stderr; the check exits 1 (`results/derived-bounds-control-verdict.txt`) | yes |
| G-V5, the bodies' instants stated, not judged | table written into `docs/vedic.md` | 10 bodies, 29,220 samples each of the engine's speed, every 5 days from 1800-01-01 to 2200-01-01 UTC; 1″ moves an instant by 1.9 s (Moon), 25 s (Sun), 5.7 min (Saturn) at the median speed, and 2.1 s, 26 s and 25 min at the 10th percentile (`results/time-per-arcsecond.md`, `.json`); `--check` against `docs/vedic.md` is a step of `../gates.sh` (not run here, below) | a copy of `docs/vedic.md` with the Sun's 25 at the median made 26: `--check` on it exits 1 (`results/time-per-arcsecond-control.txt`) | yes |
| G-V4, the Ascendant against ERFA | **pass**, in G-V4 run again in full (below); interrupted in the formal run | 1,000 births of F4, each call searching the Ascendant alone; 36,000 sides of its 18 keys: 35,204 judged and compared, 796 not judged, 0 mismatches of boundary or sign, every difference within 5 s. Largest, median and 99th percentile of the difference: 0 to 45°, 18,114 sides, 1.060546875, 0.5 and 0.9931640625 ms; 45 to 60°, 6,320 sides, 1.24609375, 0.51513671875 and 1.0634765625 ms; 60 to 66°, 10,770 sides, 1.3603515625, 0.5073089599609375 and 1.0791015625 ms (`results-erfa/compare.json`) | C4a, the engine's instants shifted by 6 s: all 35,204 compared sides fail. C4b, the other definition's ayanamsa: 34,829 of the 35,208 compared sides fail (`results-erfa/control-c4a.json`, `control-c4b.json`) | yes, both |
| The named tests (section 8, as amended) | pass | 160 of 160 tests in 6 files: `src/vedic/varga-time.test.ts` 83, `src/vedic/ayanamsa.test.ts` 24, `src/vedic/boundaries.test.ts` 21, `src/vedic/dasha.test.ts` 17, `src/vedic/jyotish.test.ts` 14 and `src/sign-rulers.test.ts` 1 (`results/tests.json`) | 10 controls, below | yes, all ten |

`results/steps.tsv` records each step of the formal run's `checks.sh` with
its kind and exit status: every step that ran exited as required, and the
last two rows are G-V4's run on F4 and its comparison. It has no row for C4a
and C4b, and that `checks.sh` did not reach its end. `results-erfa/steps.tsv`
records G-V4 run again in full: its four steps, the run on F4, the
comparison, C4a and C4b, each exited as required.

### The named tests' controls

Each is one exact replacement in a file of the working tree, the test file
run, and the file restored and checked against its SHA-256
(`tools/test-controls.mjs`; `results/test-controls.json`):

| control | must fail | tests that failed under it |
| --- | --- | --- |
| G-V1: the naive floor in `src/vedic/grid.ts` | at least one of the 18 varga tests | 6 of 21: D7, D9, D27, D45, the nakshatras and padas, the KP subs |
| G-V2 (a) (i): every part boundary a change, `src/vedic/varga.ts` | G-V2 (a) with exactly 24 mismatches | 5 of 83 (the D2, D10 and D24 tests, the D2 run through 0°, the docs' birth); 24 mismatches |
| G-V2 (a) (ii): one change row of F1 a keep | G-V2 (a) with exactly one mismatch | 3 of 83 (the count test, the D45 test, the test file's own control (i)); 1 mismatch |
| the mean ayanamsa subtracted | the evaluation paths' test | 11 of 83, the six bit-for-bit cases among them |
| one copied rate bound changed | the copied bounds' test | 1 of 83, that test |
| no 1 ms terminal step | the one-millisecond touch | 8 of 83, the two one-millisecond touches among them |
| brackets allowed across seams | the backward step | 1 of 83, that case |
| a build that computes instead of refusing | each refusal test | 18 of 83, every refusal test |
| an instant 1 ms later | the docs' synthetic birth | 5 of 83, the docs' birth among them |
| a change's direction through turn(d + 180) - 180 (4f4c1e8's) | the last step of one unit in the last place, analytic and through the public API | 3 of 83, those three |

### G-V3: reported outside the pass rule

From `results/check.json` and `results/run.json` (sums and counts in
`results/04-figures.log`):

- **Changes found**, over the 18 keys and all 1,015 calls: the Ascendant
  36,330, the Moon 33,652, Mercury 15,777, Venus 15,464, the Sun 15,329, Mars
  10,345, Jupiter 2,637, Saturn 1,275, each mean node 1,056, and on the 103
  births that ask for them Uranus 50, Neptune 46 and Pluto 43; 133,060 in
  all. By point and key in `results/check.json`.
- **Null sides**: 238,604 (F2 238,530, F3 8, F3b 66).
- **Evaluations per call**: mean 2,410.2, median 2,338, largest 22,292,
  against the budget of 2,000,000. The largest for one point: Mercury 20,522,
  the Ascendant 4,405, the Moon 2,636.
- **Run times**: `run.mjs` 0.30 minutes for the 1,015 calls (a call's mean
  17.77 ms, median 15.34 ms, largest 149.74 ms); the checker 74.77 minutes
  with 10 workers.
- **The disclosure**: at each of F2's 1,000 birth instants the public API
  gave the same bits alone and 1 ms after a call at the millisecond before,
  for every point (0 births differ).

## G-V4 run again in full

The amendment of 2026-11-04 ("after the formal run: G-V4's interruption and
the loader", committed in 7b29ddd) changed `tools/load.mjs`, so that a
birth's `points` replace the corpus's only where the birth carries them, and
added `checks.sh --g-v4`, which runs section 10's step 5 alone with the same
four commands and records them in `results-erfa/steps.tsv`. With
`tools/calls_digest.mjs` it showed that the calls of F2 (1,000), F3 (13) and
F3b (2) do not change, and that F4's 1,000 calls now name `["Ascendant"]`
where they named no points (`loader-fix.json`). G-V4 then ran again in full,
once, alone; nothing in it was rerun, and no tool, rule or tolerance was
changed during it. Its outputs replace the interrupted run's in
`results-erfa/`; those stay in 47df12f.

- **Environment.** Commit 7b29dddf179ea1e4b0643fd86108d5d826988ed7 (branch
  `rc2/main-first`), whose sources are 237b226's; HEAD was the same at the
  start and at the end (`results-erfa/00-start.log`,
  `results-erfa/99-end.log`). darwin-arm64 (macOS 27.0.1); Node v22.22.2 (npm
  10.9.7); Python 3.11.16 with pyerfa 2.0.1.5 and numpy 2.4.6, the OQ6
  environment, for the arbiter, its comparison and both controls; the system
  Python 3.9.6 is in the logs' first lines but no step of `--g-v4` runs it.
- **Build.** `npm run build` once, under `nice -n 10`; `tools/load.mjs` read
  it as version 1.1.0-rc.2, 57 JavaScript files, digest
  `21b80ef0dcafb71f108a397e015218083e1cf346741961b4b36ff429c8888109`, the
  formal run's (`results-erfa/01-build.log`; `results-erfa/run.json`).
- **The command**, from the repository root: `nice -n 10 zsh
  docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/checks.sh --g-v4
  <scratch>/work 10 <programme>/toolchain/py311-oq6/venv/bin/python`, from
  15:09:18 to 15:13:50, exit 0 (`results-erfa/02-g-v4.log`).
- **Free disk**: 13,507,724 KiB (12.9 GiB) before the step; beside it the
  watch took 19 samples, every 15 s, the least 13,507,728 KiB (12.9 GiB); 15
  GiB at the end (`results-erfa/03-outputs.log`, `results-erfa/99-end.log`).
- **F4's calls**: 1,000, each naming and searching the Ascendant alone; none
  threw; 18,000 rows, none refused, 36,000 changes and no null side
  (`results-erfa/03-outputs.log`). `run.mjs` took 0.03 minutes (a call's mean
  1.993 ms, median 1.906 ms, largest 21.438 ms; `results-erfa/run.json`).
- **The verdict under section 8's pass rule: PASS.** Over all judged sides
  of all 1,000 births, 0 mismatches of boundary or sign, and every
  difference within 5 s (`results-erfa/compare.json`):

  | latitude band | sides compared | largest difference | median | 99th percentile |
  | --- | ---: | ---: | ---: | ---: |
  | 0 to 45° | 18,114 | 1.060546875 ms | 0.5 ms | 0.9931640625 ms |
  | 45 to 60° | 6,320 | 1.24609375 ms | 0.51513671875 ms | 1.0634765625 ms |
  | 60 to 66° | 10,770 | 1.3603515625 ms | 0.5073089599609375 ms | 1.0791015625 ms |

  Judged: 35,204 sides, all of them compared (both report a change); not
  judged: 796, under the side rule and the rule on the ends of `searched`.
- **C4a**, the engine's instants shifted by 6 s, must fail every compared
  side: all 35,204 compared sides fail (35,204 mismatches; the largest
  difference by band 6,001.060546875, 6,001.24609375 and 6,001.3603515625
  ms), so **it failed as required** (`results-erfa/control-c4a.json`).
- **C4b**, the arbiter given the other definition's ayanamsa, must fail at
  least one comparison: 35,208 sides judged and compared, 792 not judged;
  34,829 of them fail, so **it failed as required**
  (`results-erfa/control-c4b.json`; of the 200 failures it lists, 10 differ in
  boundary or signs and the others in time only).
- **The note** the amendment announces (not a check; no verdict depends on
  it; `results-erfa/04-note.log`, with its script). The interrupted run's
  `results-erfa/results.jsonl`, read with `GIT_NO_LAZY_FETCH=1 git show` from
  47df12f (blob `0afb2ec44dcbedf56e0c0a48fdbec5398f9b3e5e`, 52,322,903
  bytes, SHA-256 `c7edbf99b616503759e3ef63484091031aaa39768f7c90b33c0a2d401c5f1768`,
  as the formal run recorded it in `results/03-outputs.log`), holds 1,000
  calls that named no points and searched the default ten; this run's 1,000
  name and search the Ascendant alone. **Each of the interrupted run's 18,000
  Ascendant rows equals this run's row for its birth and key**: 18,000
  compared, 18,000 identical, none differing, none unmatched. The results'
  other fields (`ayanamsa`, `utc`, `timeScale`, `horizonMinutes`,
  `searched`, `verification`, `flags`) are equal in all 1,000 calls, as is
  the Ascendant's count of evaluations. `compare.json` has the same bytes in
  both runs (SHA-256
  `f4822b62f1873a78cb4982969f17f3f4d5c9502f4419b3d947fe2cbcef7d55ba`,
  `results-erfa/00-start.log` and `results-erfa/99-end.log`).
- **Writes.** The build wrote `dist/`, which git ignores. Nothing else
  outside `results-erfa/` changed: the 256 other files under
  `docs/evidence/1.1.0-rc.2-20261102/` (this folder's `results/` among them)
  have their bytes of the start, `docs/vedic.md` and `src/` are unchanged,
  and no `__pycache__` was written (`results-erfa/99-end.log`).

## Not run, and why

- **C4a and C4b in the formal run (G-V4's controls).** The run's disk watch
  read 2,759,188 KiB free at 14:42:31, under 4 GiB (4,194,304 KiB), after
  5,913,668 at 14:42:01 and 4,217,776 at 14:42:16. FORMAL-COMMON says to stop
  and report under 4 GiB, so the watch stopped `checks.sh` and the processes
  under it (SIGTERM; the step's status 143), after G-V4's run on F4 and its
  comparison, while `varga_ascendant.py --control c4a` had started. Neither
  control wrote its output (`results/03-outputs.log`: `control-c4a.json` and
  `control-c4b.json` absent; no process of the run left). The fall of
  3,154,480 KiB in 30 s was not the run's writing: everything `checks.sh`
  wrote into `results/` and `results-erfa/` comes to 106,259,086 bytes
  (`results/03-outputs.log`). The free disk was still under 4 GiB when the
  formal run's record ended (2.3 GiB at 14:48, `results/99-end.log`). Under
  the amendment of 2026-11-04, G-V4 ran again in full, its controls with it,
  and each failed as required (above).
- **G-V5's `--check` against `docs/vedic.md`.** Moved by the amendment of
  2026-11-04 ("review 2: the procedure's checks can fail") to `../gates.sh`,
  which runs it on the source commit, against the table as committed
  (47df12f).
- **The private birth-data search** (section 10, step 7) runs before a push;
  no run here pushed anything.
- **README.md** (section 10, step 6: "README.md with the environment"). The
  formal run wrote none; it was written after G-V4 ran again in full, with
  the environment of both runs.

## How the checks ran, and other notes

- **F4's calls in the formal run searched ten points, not the Ascendant
  alone.** `births-erfa.json` gives the Ascendant only in its shared options
  (`"points": ["Ascendant"]`), and its births carry no `points`.
  `tools/load.mjs` built each call of F2 and F4 with the options
  `{ ...corpus.options, points }`, `points` being the birth's own, which is
  undefined for every birth of F4; so the option was dropped, and each call
  searched the default ten points (the formal run's
  `results-erfa/results.jsonl`, in 47df12f: 180,000 rows, the 18 keys of 10
  points for each of the 1,000 births, none refused, 131,670 changes). The
  arbiter reads the Ascendant's rows only (`tools/varga_ascendant.py`):
  18,000 rows, 36,000 sides. Section 6 fixes F4 as "the Ascendant only". The
  tool was not changed during the formal run (FORMAL-COMMON). The amendment
  of 2026-11-04 changed it afterwards (7b29ddd), and G-V4 ran again in full
  with it: its calls search the Ascendant alone, and its Ascendant rows are
  the interrupted run's, row for row (the note, above). F2, F3 and F3b were
  not affected: each birth of F2 carries its own `points` (F2's 185,562 rows
  are the 18 keys of its 10,309 points), and each case of F3 and F3b its own
  options; `loader-fix.json` shows their calls unchanged by the fix.
- **Section 10's order.** The formal run's `checks.sh` runs G-V1, G-V2 (a)
  and the named tests, G-V3 with its controls, section 7, G-V5, then G-V4,
  and that run kept it; G-V4 run again in full is section 10's step 5 alone,
  after them.
- **Writes outside this folder, in the formal run.** The build wrote
  `dist/`, and vitest updated its cache,
  `node_modules/.vite/vitest/results.json`; git ignores both.
  `time_per_arcsecond.mjs --write` wrote the G-V5 table between the two
  markers of `docs/vedic.md`, in place of the placeholder, the one change
  that run makes to a tracked file outside this folder (its diff is in
  `results/99-end.log`). `tools/test-controls.mjs` edits and restores
  `src/vedic/grid.ts`, `src/vedic/varga.ts`, `src/vedic/varga-time.ts` and
  `src/vedic/fixtures/varga-changes.json` while it runs; at the end each has
  its SHA-256 of the start, as has `boundaries.json`
  (`results/99-end.log`). No `__pycache__` was written beside the tools or
  the rules and references they import.
- **The other units' folders, in the formal run.** Every file under
  `docs/evidence/1.1.0-rc.2-20261102/` outside `varga-sensitivity/`, 202 files
  with the uncommitted results in `f89/`, `lite/`, `time-entry/` and
  `time-bands/`, has the same name and bytes at the end as at the start
  (`results/99-end.log`). The modification of `carrier/carrier-gates.sh`
  was there at the start (`results/00-start.log`) and is not that run's.
- **The excluded folder.** `docs/evidence/calc-sidereal-2026-10-05/` is
  absent from the sparse checkout at the start and at the end of both runs;
  every git command that walks the tree carried the exclusion pathspec, and
  no search entered that folder.

## Release state (section 11)

**No state changes on these runs: P2.B.vargas stays `partial` until section
11's second condition holds, and can then be `validated` at most.** G-V1 to
G-V4 now pass as preregistered and amended, and every one of their controls
failed as required: G-V1 to G-V3 in the formal run, G-V4 in its run again in
full. The first condition also needs the evidence committed and
reproducible, and G-V5's statement in `docs/vedic.md` with its evidence: the
table is committed (47df12f), and its `--check` is a step of `../gates.sh`
on the source commit. The second condition, `deployed`, still needs the
carried 1.1.0-rc.2 archive, the owner's merge of it, the site's adoption
merged, and the production checks, each also run on the deployment before
the adoption, where it must fail. With both, the unit is `validated`. It is
`accepted` only once the owner ratifies section 3's reading (OQ5, not
ratified, `../OWNER-ANSWERS.md`); G-V4's reading, whose interrupted
comparison was seen before the amendment of 2026-11-04, and the readings the
reviews saw before the formal run stay `validated` on the same terms
(section 13). The ledger figure moves (83.95 to 85.95 of 182.45) only on
acceptance.

## Files

In `results/`, the formal run: `00-start.log` (the state at the start, with
the SHA-256 of this preregistration, `INPUTS.md`, the inputs and the tools as
run), `01-build.log`, `02-checks.log` (`checks.sh`'s whole output, up to the
stop), `03-outputs.log` (the disk watch and the stop, the outputs as written,
and the paths shortened by hand), `04-figures.log` (the figures above that
the tools do not print as such: sums, counts by corpus and point, and
listings, read from the outputs, with its script; not a check),
`05-hand-edit.log`, and `99-end.log` (the state at the end, with the SHA-256
of each file before it); and the tools' outputs: `steps.tsv`,
`f1-check.json`, `boundaries-sha256.txt`, `inputs-sha256.recorded`,
`inputs-sha256.txt`, `tests.json`, `test-controls.json`, `results.jsonl`
(F2, F3 and F3b's results), `run.json`, `check.json`, `controls.json`,
`controls-summary.txt`, `derived-bounds.json`, `derived-bounds-control.txt`,
`derived-bounds-control-verdict.txt`, `time-per-arcsecond.json`,
`time-per-arcsecond.md`, `time-per-arcsecond-write.txt`,
`time-per-arcsecond-control-copy.txt` and `time-per-arcsecond-control.txt`.

In `results-erfa/`, G-V4 run again in full: `00-start.log` (the state at the
start, with the SHA-256 of the preregistration, `loader-fix.json`, F4 and the
tools as run, and of the interrupted run's three files), `01-build.log` (the
build and its digest), `02-g-v4.log` (`checks.sh --g-v4`'s whole output),
`03-outputs.log` (the disk watch, the steps, counts read from the results,
the outputs as written, and the path shortened by hand), `04-note.log` (the
note, with its script) and `99-end.log` (the state at the end, with the
SHA-256 of each file before it); and the tools' outputs: `steps.tsv`,
`results.jsonl` (F4's results, the Ascendant alone), `run.json`,
`compare.json`, `control-c4a.json` and `control-c4b.json`. The interrupted
run's `results-erfa/` (`results.jsonl`, `run.json` and `compare.json`) is
in 47df12f.

Beside them: `README.md` (the environment of both runs). Outside this folder:
`docs/vedic.md`'s G-V5 table (in 47df12f).
