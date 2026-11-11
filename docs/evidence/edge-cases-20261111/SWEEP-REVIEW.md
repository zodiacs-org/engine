# Review of the ZOD-65 dense DE440 sweep (ZOD-97, S1 to S3)

Read-only. Reviewed at `origin/admin/zod-65-engine-phase-1-replace-receipt-error-limits`
as fetched on 2026-11-11: `255b615`, three commits ahead of `bc0b5a7`
(`origin/main`): `3cb8aee` (plan and tools), `1313fed` (results of run
43037857931), `255b615` (a note on a second run). Nothing on that branch, on
PR 91, PR 92, the sweep workflow or `src/calc-bounds.ts` was changed: the
branch was fetched, read with `git show` and `git archive`, and its workflow
runs were read with `gh` (S3).

**This review approves no public accuracy sentence.** The sweep's README has
a section "What a public sentence can say"; the notes on it at the end are
for whoever decides, and are not an endorsement.

## What was inspected

- `PLAN.md`, `tools/sweep.py`, `tools/engine_sweep.mjs`, `tools/dry_run.py`,
  `.github/workflows/de440-sweep.yml` at `3cb8aee`, in full.
- `README.md` and `results/` at `255b615`.
- Workflow run 43037857931 (event `pull_request`, head `3cb8aee`, attempt 1):
  its ten jobs, all `success`, and its full log.
- The run's artifact `de440-sweep-results`, downloaded and compared with the
  committed `results/`: **identical, file for file** (`diff -r`).
- A rebuild: `sweep.py merge` run here on the committed era files with
  pyerfa 2.0.1.5, numpy 2.4.6 and jplephem 2.24 on Python 3.13.5 wrote a
  `summary.json` and a `tables.md` **byte-identical** to the committed ones.
- Not done: the eras were not recomputed (that needs the kernel and the
  workflow), and runs 43040210028 (`1313fed`) and 43042023256 (`255b615`),
  both `success`, were listed but not compared.

## S1: the plan against what ran

What the log of run 43037857931 shows:

| plan | what ran | verdict |
| --- | --- | --- |
| Kernel from NAIF's URL or the shared cache, pinned SHA-256 | cache hit (`cache-hit=true bytes=119799808`), then `sha256sum -c` against `a4ce9bf9…c4b5`: `OK` in the kernel job and in each of the eight era jobs, nine in all | as planned (the sweep's README lists the cache as its deviation 1) |
| 146,097 noon-TT instants, 1800-01-01 to 2199-12-31 | `summary.json`: `n` 146097, JD 2378497.0 to 2524593.0 TT, eight eras that join | as planned |
| Arbiter and libraries | Python 3.11, pyerfa 2.0.1.5, numpy 2.4.6, jplephem 2.24 recorded in the results | as planned |
| Self-checks S1 and S2 before any era | S1 largest 0.00291″ against a 0.01″ gate, S2 largest 0.0216″ against a 0.05″ gate, both PASS, in the kernel job that the era jobs need | as planned |
| The plan's P1 (kernel), P2 (sweep), P3 (results committed, dry run), P4 (no packed file) | all ten jobs green; results committed with the run id and the kernel's SHA-256; the branch adds a workflow and files under `docs/evidence/` only | met |
| "It measures the build of the commit it runs on" | every job checked out `refs/remotes/pull/92/merge`, `029c10a` ("Merge 3cb8aee… into bc0b5a7…"); the results record `3cb8aee` | **deviation, harmless for this run**: finding 1 |
| Results committed from the run | read from the job log as a base64 tar (the sweep's deviation 2) | checked here against the artifact: identical |

Material deviations: none that changes a number in this run. Finding 1 is a
real difference between what the results say was built and what was checked
out; the two trees are the same here because `main` was still `bc0b5a7`.

## S2: the results

From the committed `results/summary.json` and `tables.md` (run 43037857931,
engine 1.1.0-rc.3, `distSha256` `76db31bd…4251`, Node v22.23.4). Apparent
places, largest difference over the 146,097 instants, arcseconds, as the
tables print them:

| body | figure ZOD-65 quotes from the earlier review | sweep, ecliptic longitude of date | on (TT JD) | sweep, largest angle in any frame | receipt limit now (32 instants) | limit by the same rule from the sweep |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| Sun | 2.4 | 2.38165 | 2452686.0 | 3.33 | 3.0 | 3.4 |
| Moon | 12.0 | 11.9166 | 2384412.0 | 11.88 | 8.3 | 12 |
| Mercury | | 14.1183 | 2500757.0 | 16.91 | 9.3 | 17 |
| Venus | 22.9 | 22.9137 | 2407048.0 | 23.31 | 11 | 24 |
| Mars | | 14.3181 | 2406872.0 | 22.91 | 6.6 | 23 |
| Jupiter | | 10.6368 | 2381685.0 | 16.81 | 13 | 17 |
| Saturn | | 13.0944 | 2496512.0 | 23.21 | 18 | 24 |
| Uranus | | 12.0816 | 2451411.0 | 19.64 | 20 | 20 |
| Neptune | | 19.7091 | 2391865.0 | 21.28 | 21 | 22 |
| Pluto | 29.2 | 29.1881 | 2524593.0, the last instant | 29.86 | 25 | 30 |
| True node | 32.4 | 32.6373 | 2522150.0 | 32.64 | 16 | 33 |

Read against the two things S2 names:

- **Against the earlier review's figures.** The Sun, the Moon, Venus and
  Pluto agree to within 0.1″ (2.38 against 2.4, 11.92 against 12.0, 22.91
  against 22.9, 29.19 against 29.2). The true node is 0.24″ larger in the
  sweep (32.64 against 32.4). The earlier review's data is not in the
  repository, so the sweep's figures are the only ones with evidence behind
  them; nothing here relies on the earlier ones.
- **Against the 32-instant receipt limits.** For the apparent places, ten of
  the eleven position limits a receipt quotes now are below what the sweep
  found. Only Uranus's holds (20 against 19.64). The largest shortfalls: the
  true node (16 quoted, 32.64 found), Mars (6.6, 22.91), Venus (11, 23.31).
  A receipt from 1.1.0-rc.3 therefore quotes limits that the engine exceeds.
  That is ZOD-65's subject and this review changes nothing.

Other checks made here on the committed results:

- The plan's sanity limits: no case is over 60″ and the Sun is not over 10″
  in any correction or frame (computed here from `summary.json`; the largest
  of all is the node's 32.64″). The tools do not check this (finding 4); the
  sweep's README states it and it is true.
- Finding 2 (rounding) does not bite in this run: none of the 92 maxima that
  feed a bound sits on a two-figure boundary.
- **The true node is not a planet and has no place under a 30″ sentence.** It
  is over 30″, and its reference is a definition applied to the kernel's
  Moon. The sweep's report keeps it out of its "within 30″" verdict, which is
  right.
- **Pluto's margin is thin and the reference decides it.** The sweep has
  29.19″ in longitude at the last instant, against DE440 in an IAU 2006/2000A
  frame; its largest angle is 29.86″. This job's own check against Horizons
  (DE441, Horizons's own equinox of date, deflection included) has 29.69″ at
  the same instant (`README.md`, P1). Pluto's difference is largest on the
  last day and still growing, so the last half-day of the span, which the
  sweep does not sample, is slightly worse (29.688″ against Horizons at
  23:45:36 TT). Any wording that says "within 30″" has between 0.1″ and 0.8″
  of room depending on what it is measured against and how.

## The plan against the tools and the workflow file, by reading

Point by point, plan against tools and workflow file.

| plan | tools and workflow at `3cb8aee` | verdict |
| --- | --- | --- |
| Kernel from NAIF's URL, pinned SHA-256, checked in every job that reads it, never uploaded | `kernel` job fetches or restores, then `sha256sum -c`; each `era` job restores with `fail-on-cache-miss` and checks the digest again; `sweep.py`'s `Kernel` checks it a third time before opening; the `results` job does not read the kernel; no upload step names it | as planned |
| 146,097 instants, TT JD 2378497.0 + i | `engine_sweep.mjs` (`FIRST_JD`, `dayIndex` by `Date.UTC`, asserts 146,097 for 1800 to 2200); `sweep.py merge` refuses unless the eras join end to end and sum to 146,097 | as planned |
| Ten bodies, three corrections, two nodes, eight frames, geocentric | `cases` in `engine_sweep.mjs`; `shard` refuses another case list or frame list | as planned |
| Engine from `dist/calc.js` built from the checked-out commit; the instant the engine ran is the one asked | `npm ci`, `npm run build` in each era job; `engine_sweep.mjs` throws unless `receipt.instants[0].jdTt === jd`, and on any refusal | as planned, with finding 1 |
| Eight eras, one build, one kernel | matrix of eight; `merge` compares `engine`, `distSha256`, `kernel`, `software`, `node` across eras | as planned |
| Arbiter: jplephem 2.24, pyerfa 2.0.1.5, numpy 2.4.6, Python 3.11 | `PYTHON_LIBRARIES` pins the three by version (not by hash); `setup-python` 3.11 (minor only); versions are written into every result | as planned |
| TDB by `erfa.dtdb`; NONE, LT (iterated to 1e-14 day), LT+S (`erfa.ab`), no deflection | `geocentric()` | as planned |
| Frames as `compare.py`'s `frame_matrix` | `frame_matrices()`; I compared the construction by reading, not by running | as planned |
| Node: osculating, kernel's geometric Moon, true ecliptic of date | `node_of_state()`; South Node 180° from it | as planned |
| Moon apparent against LT+S (the bound) and NONE (reported) | `shard` loops both; `merge` leaves NONE out of `bounds` and `longitudes` | as planned |
| Extra figure with the Sun's deflection, not in the bounds | `withDeflection`, apparent, true ecliptic of date only | as planned |
| S1 gate 0.01″, S2 gate 0.05″, both before any era | `selfcheck` exits non-zero on either; `era` has `needs: kernel` | as planned |
| Reported: for each case and frame the count, the largest and its date; per era median, p95, max | date kept for `position` and `lon` only; `lonCosLat`, `lat`, `distance`, `speed` keep count and largest without a date | small deviation (finding 5) |
| Sanity limits 60″ and 10″ "investigated and explained before anything is published" | no code checks them | a manual step (finding 4) |
| Bounds rule "the preregistered one, unchanged" | `up2` is `compare.py`'s, but it is fed values already rounded to six figures | deviation (finding 2) |
| Dry run changes no file | `dry_run.py` writes only into the results directory; the workflow runs `git diff --exit-code` after it | as planned |
| No packed file changes | the commit adds five files, all under `.github/` and `docs/evidence/` | as planned |

## Findings

**1. The recorded commit is not the tree that was built, on a pull request
run. Confirmed on run 43037857931** (checkout of `029c10a`, the merge of
`3cb8aee` into `bc0b5a7`; the results record `3cb8aee`). On a `pull_request` event `actions/checkout` checks out the merge of
the head into the base (`refs/pull/N/merge`) unless told otherwise, and the
workflow does not tell it otherwise. `SWEEP_COMMIT` is set to
`github.event.pull_request.head.sha`. The summary, `tables.md` and
`report.md` would then name the head commit while the engine that ran was
built from head merged with `main` as it stood at that moment. While `main`
is still `bc0b5a7` the two trees are the same and `distSha256` is the honest
identity either way. Once `main` moves they differ, and the plan's sentence
"It measures the build of the commit it runs on" would be attached to the
wrong commit. Fix: check out `ref: ${{ github.event.pull_request.head.sha }}`,
or record `github.sha` and say it is a merge commit. 

**2. The bounds are rounded up from values already rounded to nearest.**
`shard` writes its statistics through `six()` (six significant figures, to
nearest). `merge` forms the bounds from those with `up2` (up to two
figures). `compare.py`, the preregistered tool, rounds up from the unrounded
values and trims only when writing (`bounds` is excluded from its `trim`). A
largest difference that lies within 5 parts in 10 million above a two-figure
boundary would be rounded down onto the boundary and then not rounded up.
The chance is small for any one row and the effect is one unit in the second
figure, but the repository's rule is "do not round in the engine's favour"
and this path can. `up2`'s own `- 1e-9` is inherited from `compare.py`. Fix:
carry the maxima unrounded in the era files (or round them up there).

**3. A largest difference at daily noon is a sample, not a limit.** The
corpus is one instant a day at a fixed phase (noon TT). For error terms with
periods of days and longer that samples the range well, and 146,097 instants
is far better than 32. It is still the largest value *found*, and the rule
turns it into a number a receipt quotes as a limit, with no margin beyond
rounding up to two figures (between 0 % and 10 %, by accident of the
digits). Suggestion before the limits are regenerated: one more pass at
another phase (for example midnight TT plus an irrational fraction of a
day, or 146,097 instants drawn across the span) and a statement of how much
the largest moved. If it moves by more than the rounding, the wording
"limit" needs a margin or needs to become "largest difference found at".

**4. The sanity limits are not enforced by the tools.** The plan carries the
preregistration's 60″ and 10″ limits as something to investigate and explain.
Neither `sweep.py` nor `dry_run.py` tests them, so a green run says nothing
about them. A reader of the results should check them by eye, and the README
that the plan promises should say that this was done.

**5. Dates of the largest are kept for two of six measures.** See the table.
The plan's "the largest difference and the date it falls on" reads as
applying to all. Harmless for the bounds; it matters to whoever has to
explain a large rate or distance difference.

**6. A 30″ threshold appears in the tools and not in the plan.**
`dry_run.py` defines `PUBLIC_LIMIT_ARCSEC = 30.0` and writes a section "The
30 arcsecond sentence" with "within" or "NOT within". The plan says only that
the deflection figure exists "so that a public sentence about apparent
longitudes can be checked". The threshold was committed in the same commit as
the plan, so it was fixed before the first run; it should still be in
`PLAN.md` (or the README's deviations), since it is the one pass or fail
judgement the report makes. The same section leaves the true node out of the
"both are within" verdict and reports it separately; ZOD-65's quoted review
figure for the node (32.4″, hard-coded in `dry_run.py` as quoted, not as
evidence) is above 30.

**7. What the sweep does not measure, which any sentence built on it must
say.** These are scope limits the plan mostly states; they are gathered here
because the report's draft sentence does not repeat them all.

- TT instants only. ΔT is taken out on purpose. A user who gives a civil
  time gets the ΔT model's error on top, which after the IERS table ends is
  the larger term for the Moon (about 0.55″ per second of time). See class Y
  in `EDGE-CASES.md`.
- Geocentric only. No topocentric, heliocentric or barycentric row.
- Mars to Pluto are system barycentres on both sides. The engine's own
  convention is measured against the same convention; body centres differ
  from barycentres by up to 0.67″ (Uranus) per `conformance/arbiters/l1/README.md`.
- Apparent places are compared without light deflection (the engine's
  convention), with the deflected figure beside it for the true ecliptic of
  date only.
- The node's reference is a definition applied to the kernel's Moon, not an
  ephemeris quantity.
- 1800-01-01 to 2199-12-31, at noon. The first and last half-days of the
  span, and anything outside it, are not sampled.
- One build. `distSha256` identifies it; the figure does not carry to
  1.1.0-rc.6 or any other build without a rerun.

**8. The self-checks: what each one can catch.** S2 (kernel vectors against
Horizons's committed DE441 vectors at 32 instants) is independent of this
repository's code and checks the three vectors. S1 (apparent place and node
against `docs/evidence/de440-20261110/oracles/`) compares this code with an
earlier reduction that uses the same libraries, the same kernel and, by
`sweep.py`'s own comments, the same formulas as `validate.py`; it catches a
transcription error, not a shared mistake. No self-check exercises the seven
frame matrices other than the true ecliptic of date; they are the same ERFA
calls `compare.py` makes, and an error there would show as a large
engine-arbiter difference rather than hide. Adequate, in my reading, with
that understood.

**9. Smaller points.**

- `node-version: 22` and `python-version: "3.11"` float within the minor
  line. `merge` refuses eras run on different Node versions and the versions
  are recorded, so a result is traceable; it is not reproducible to the patch
  release the way `conformance.yml` (Node 22.22.2) is.
- pip installs are pinned by version, not by hash.
- A cache saved by a pull request run is scoped to that pull request. "One
  copy fetched from NAIF serves both" (the tier-B job and the sweep) holds
  when `main` has already cached the kernel; otherwise the sweep fetches its
  own. No effect on results.
- `merge` requires one `distSha256` across the eight era jobs, each of which
  builds for itself. If the build is not byte-reproducible across runners the
  merge fails loudly. If run 43037857931 failed in "Summary and tables", look
  there first.

## What I would want before the limits are regenerated from this sweep

1. Finding 1 fixed in the workflow, or the results saying that the checkout
   was a merge commit. For this run the tree is the same either way.
2. Finding 2 fixed. It did not change a row in this run; it can in another.
3. A second-phase pass (finding 3), or wording that says "largest found at
   one instant a day". Pluto's largest is on the last sampled day, so a
   sample at another phase will not be smaller there.
4. The 60″ and 10″ checks done by code rather than by eye (finding 4). They
   hold for this run.

## On the sweep README's "What a public sentence can say"

Not approved or rejected here; for whoever decides:

- It is stated against DE440 over one instant a day. Against Horizons, which
  is what ZOD-97's P1 names and what a reader can check for themselves, the
  same build is at 29.69″ for Pluto at the end of 2199.
- It rests on TT instants. A chart from a civil time after the IERS table
  ends also carries the ΔT model's error, which the sweep takes out by
  design.
- It is true of 1.1.0-rc.3's build `76db31bd…4251` and of no other build
  until rerun.
- It excludes the true node, correctly.
