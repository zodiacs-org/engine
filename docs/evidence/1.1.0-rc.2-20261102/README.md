# 1.1.0-rc.2, 2026-11-02

The second candidate for 1.1.0, cut from engine main at `a253973` (the merge
of zodiacs-org/engine#77), which carries 1.1.0-rc.1. It brings five
preregistered units of the cut into the package (below), two of them as new
entry points that load no ephemeris, `@zodiacs/engine/time` and
`@zodiacs/engine/lite`, which make fifteen public entry points. CHANGELOG.md,
*1.1.0-rc.2*, says what changes for a caller. It is not to be published on
npm until the owner approves it. Times are Asia/Bangkok.

This README was begun by the commit "Document 1.1.0-rc.2". Each section
marked *To be filled* holds no result yet: the commit that makes those runs
writes it, with their outputs beside it.

## The units

| Unit, as zodiacs.org names it | In the package | Folder |
| --- | --- | --- |
| F-89, nine wording corrections (the F-89 part of P1.14) | statements in the README, NOTICE, LICENSING.md and doc comments | [`f89/`](f89/) |
| F-53 | `@zodiacs/engine/time`: the time basis and the frame of date without the ephemeris | [`time-entry/`](time-entry/) |
| P1.M3c | `timeBands` in `./time`, and the bands of `./calc`'s results | [`time-bands/`](time-bands/) |
| P2.E declinations, sect, composite and dignities | `@zodiacs/engine/lite`, with `sectReading` | [`lite/`](lite/) |
| P2.B.vargas | `vargaSensitivity` in `./vedic` | [`varga-sensitivity/`](varga-sensitivity/) |

Each folder holds the unit's `PREREGISTRATION.md`. The commit "Preregister
1.1.0-rc.2's units before any code" committed the five together and nothing
else, before any code of the cut, and none has been edited in place since:
the owner's answers, the varga sensitivity's departures from its design and
the changes made after reviews 1 and 2 are dated amendments added to each
one's amendments section, with no line removed or changed. The varga sensitivity's
inputs (`INPUTS.md`, `births.json`, `births-erfa.json` and `seams.json`, with
their generators) followed in "Fix the inputs of the varga sensitivity
check", before any of its code; after review 1 a further seam input,
`seams-f3b.json` (F3b), and its generator `tools/seams_f3b.mjs` were added by
a dated amendment. Each unit's check tools are in its `tools/`, committed
before its formal runs; `f89/` also has its own README and item 2's
blind-band record, and the amendments made after review 1 have the outputs
they cite beside them (`time-bands/tt-step.json` and `distance-floor.json`,
`varga-sensitivity/c3d-replica.json` and `rate-premises.json`), and so does
the amendment made after review 2 for the varga sensitivity's derived bounds
(`varga-sensitivity/derived-bounds.json`).
`docs/evidence/calc-api/tools/bounds.py`, the generator of
`src/calc-bounds.ts`, gained `MEAN_POINTS_BASIS` and, after review 1,
`MEAN_POINTS_SPEED_BASIS`, and no bound's value changed (`f89/README.md`,
*The bounds generator*).

## The owner's answers

`OWNER-ANSWERS.md` records the answers to the cut's owner questions, OQ1 to
OQ14, which the owner delegated to the programme's coding agent on
2026-11-03; they were recorded before any formal run. Among them are the
cut's scope (OQ1), the two new entries (OQ2), the sizes (OQ3, below) and the
scratch installs the formal runs may use (OQ6). OQ5, the ratification of the
readings each unit chose after the scoping runs, and OQ10's Q5 are not
answered under that delegation and stay with the owner. Until the owner
ratifies those readings, a unit that these runs decide can be `validated`,
not `accepted`, and F-53 is recorded "fixed and deployed; readings awaiting
ratification".

SR, the cut's scratch site run on b11c5e8, found the time bands' check C8
void as run: the claims extractor did not list its control sentence
(`time-bands/PREREGISTRATION.md`, the amendment of 2026-11-03 on SR). So
version 1 of P1.M3c cannot meet R-M3c on C8 in this cut, whatever its other
checks give; C8's version 2 is due in the site's adoption. The lite entry's
B5, whose control was the same sentence, did not behave there either
(`lite/PREREGISTRATION.md`, its amendment on SR).

## Regenerated on Linux x86-64

The commit "Regenerate the x86-64 outputs for 1.1.0-rc.2" (`c50ca6e`), after
every code change of the cut, rebuilt the two files whose values arm64
rounds differently, as for 1.1.0-rc.1: `src/fixtures/calc-roundtrip.json`
(`node scripts/build-calc-roundtrip.mjs`, 38 cases) and
`conformance/results/zodiacs-engine.json` (`run.mjs --out`), then
`conformance/RESULTS.md` and `conformance/results/summary.json`
(`report.mjs`). It used the official Node 22.22.2 linux-x64 build in an
x86-64 virtual machine on a Mac, under emulation, on this tree's build
(`tools/x86-64-regeneration.sh`, a byte for byte copy of 1.1.0-rc.1's; its
output is `results/x86-64-regeneration.log`, whose closing `git status` lists
the files the run rewrote before that commit took them in). Every step
exits 0.

- **The conformance results.** Of the 500 vectors, 267 pass, 192 fail, 41
  are unsupported and none is in error: L1 48 pass and 192 fail of 240, L2
  150 pass of 150, L3 69 pass and 41 unsupported of 110. These are
  1.1.0-rc.1's verdicts. The four conformance files the commit changed,
  `conformance/results/zodiacs-engine.json`, `conformance/RESULTS.md`,
  `conformance/results/summary.json` and
  `conformance/results/zodiacs-engine.notes.md` (edited before the run),
  differ from a253973's only where they name the engine's version.
- **The calc round-trip fixture.** Its difference from a253973's may hold only
  what the time bands' check C6, and F-89's E6, allow: the added `band` keys,
  `time-band:first-order` in `conventions` arrays, the 30 engine version
  strings, and the `basis` of the bounds of the three mean-point cases.
  `time-bands/tools/fixture-diff.mjs` compares the two files. The commit's
  message records that it found no other difference and that its control was
  reported; its output is recorded with the time bands' formal results
  (below).

The commit "Regenerate the x86-64 outputs after review 1" (`8173f1e`) ran
the same script again, with the official Node 22.22.2 linux-x64 build in an
x86-64 virtual machine on a Mac, under emulation, because review 1's batch A
moved calc values: the `houses()` bands of the fixture's cases 30
and 31 gained the angles' rate on TT, and the speed bounds of the three
mean-point cases took `MEAN_POINTS_SPEED_BASIS`. It built from the tree of
`6d7486d`, the commit before it, and its output is
`results/x86-64-regeneration-after-review-1.log`. Every step exits 0; the
conformance outputs came back byte for byte as committed, and only the
fixture changed, so the fixture in the tree is that run's. The two logs have
the same header and name no commit; the commits that took them in say which
tree each built. After review 2, `time-bands/tools/fixture-diff.mjs` holds each
allowed change to its own rule (the time bands' amendment of 2026-11-04,
"review 2: C6's tool holds each allowed change to its rule"); run on this
fixture it passes, and each of its five controls fails.

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.1.0-rc.1
archive and the build of the tree of the commit that writes them, "Update
the size records after review 2" (Node 22.22.2, darwin-arm64): each entry
point's import graph, in bytes, against its budget in
`scripts/verify-package-contents.mjs`, and the package. The headroom is the
budget's excess over the graph, per cent of the graph, rounded down. A later
commit that changes packed bytes measures them again.

| | 1.1.0-rc.1 | 1.1.0-rc.2 | budget | headroom, % |
| --- | ---: | ---: | ---: | ---: |
| `.` | 105,980 | 106,325 in 13 files | 108,500 | 2.04 |
| `./calc` | 145,261 | 151,426 in 15 | 156,000, from 145,500 | 3.02 |
| `./conventions` | 2,754 | 2,754 in 2 | 2,900 | 5.30 |
| `./crossings` | 9,942 | 9,942 in 2 | 10,000 | 0.58 |
| `./deltat` | 5,232 | 5,232 in 2 | 5,500 | 5.12 |
| `./geo` | 35,439 | 35,439 in 4 | 35,500 | 0.17 |
| `./houses` | 13,678 | 13,678 in 1 | 15,000 | 9.66 |
| `./internal` | 66,287 | 66,586 in 8 | 68,000 | 2.12 |
| `./internal/math` | 19,175 | 19,224 in 4 | 20,000 | 4.03 |
| `./lite` | | 28,930 in 5 | 29,000 (new) | 0.24 |
| `./receipt` | 72,500 | 72,549 in 8 | 76,500 | 5.44 |
| `./sky` | 94,149 | 94,448 in 12 | 97,000 | 2.70 |
| `./techniques` | 155,805 | 156,210 in 15 | 160,000 | 2.42 |
| `./time` | | 42,306 in 7 | 42,400 (new) | 0.22 |
| `./timing` | 125,356 | 125,693 in 15 | 129,000 | 2.63 |
| `./vedic` | 127,751 | 141,340 in 14 | 143,000, from 128,000 | 1.17 |
| `./window` | 104,242 | 104,557 in 10 | 105,000 | 0.42 |
| package, unpacked | 1,006,494 in 77 files | 1,096,783 in 90 files | 1,100,000, from 1,020,000 | 0.29 |

The two new budgets, `./calc`'s and `./vedic`'s raises and the cap are the
ceilings approved under the owner's delegation of 2026-11-03 (OQ3 in
`OWNER-ANSWERS.md`): each budget written is the ceiling, and the comment
beside it gives the measured graph and its headroom. `./calc` grows with the
F-89 corrections, the time bands and the chunks split out for `./time`, and
`./vedic` with the varga sensitivity and the same chunks. `./time` loads the
root's time scale, ΔT, nutation, frame, houses and signs, so the build moves
the nutation and the frame out of the ephemeris chunk, and `src/signs.ts`
out of the chunk it shared with `src/aspects.ts` and `src/types.ts`, into
chunks of their own; each graph that loads them grows by the imports and
exports that join the parts, and `./techniques`' also by the two modules the
composite functions and the name helpers moved to. `./conventions`,
`./crossings`, `./deltat`, `./geo` and `./houses` do not change.

The package grows by 90,289 bytes: 50,692 of JavaScript that only the opt-in
entry points load, 345 of the root's graph, 21,520 of declarations (1,012 of
them reached from the root's `index.d.ts`), 17,312 of README, CHANGELOG,
LICENSING.md and NOTICE, and 420 of manifest. The zone histories are
unchanged, 189,144 bytes in 16 files of their 200,000. The CHANGELOG keeps
its whole history: OQ3's other choice, moving its 0.x history out of the
package in place of raising the cap, was not taken. A later commit that
changes packed bytes measures them again.

## The gate scripts

`gates.sh` and `tree-jobs.sh` beside this file, and `carrier/pack-source.sh`
and `carrier/carrier-gates.sh`, are 1.1.0-rc.1's, writing here, with these
changes, each commented where it is made:

- **Sparse, blobless clones.** The clones that `pack-source.sh` and
  `carrier-gates.sh` make are blobless (`--filter=blob:none`), and their
  sparse checkout, `/*` and `!/docs/evidence/calc-sidereal-2026-10-05/`,
  leaves that folder out, as the clone the cut is made in does.
  1.1.0-rc.1's made plain `git clone --no-local` checkouts, which write
  every file. `docs/` is not packed, so the archive's bytes do not depend on
  it. From a local repository each clone runs its upload-pack with
  `uploadpack.allowFilter`, without which git ignores the filter. `gates.sh`
  and `tree-jobs.sh` run in the checkout they are given, and refuse one whose
  sparse checkout does not leave the folder out, or in which the folder
  exists (an untracked copy, say), as review 1 asked.
- **Archive rebuilds only in CI.** `node scripts/verify-archive-binding.mjs
  --rebuild-all`, and the archive check on the carrier, which rebuilds HEAD,
  write every file of a rebuilt tree from git objects, that folder included
  (`materialize` in `scripts/verify-archive-binding.mjs`). They run only in
  CI's `archives` job and the archive step of its `engine` job:
  `carrier-gates.sh` leaves that step out of its `engine` job and refuses its
  `archives` job.
- **The generators only in CI.** The conformance workflow's `generators` job
  installs pyerfa and numpy and downloads tzdata from IANA;
  `carrier-gates.sh` refuses it.
- **G-V5's check of the committed table** (after review 2). `gates.sh` runs
  the varga sensitivity's `time_per_arcsecond.mjs --check` after the build,
  against `docs/vedic.md` as committed: the varga sensitivity's formal run
  writes the table and the source commit commits it, so `gates.sh` runs again
  on the source commit for this step. Before the table is written the step
  says so and does not count (`varga-sensitivity/PREREGISTRATION.md`, the
  amendment of 2026-11-04, "review 2: the procedure's checks can fail").
- **The time entry's checks on the archive** (after review 2).
  `carrier-gates.sh` has a job, `time-entry`, for the rerun below.

The record of the gates cites the CI run of each job left to CI.

## Checks on the tree before the source commit

On the reviewed tree (`e2edd3a`), one at a time, on darwin-arm64:

- `gates.sh`, CI's engine job, on Node 22.22.2, 20.19.0 and 24.21.0
  (`gates.log`, `full-tests-*.log`): typecheck, the build, the export smoke
  test, the API check, the package contents and the pack dry run pass on
  each. The suite fails on each only the 4 tests that fail on darwin-arm64 in
  1.1.0-rc.1's record: tests 25 and 17 of `src/calc-fixtures.test.ts`, which
  replay one round-trip case, and the returns and void-of-course checks of
  `src/techniques/site-parity.test.ts`. CI runs the suite on x86-64, where
  the pins were taken. G-V5's step is recorded as not run: `docs/vedic.md`
  holds its placeholder until the varga sensitivity's formal run writes the
  table.
- `tree-jobs.sh` (`tree-jobs.log`): the build, the pack, the packed consumer
  on Node 20.19.0, 22.7.0, 22.22.2 and 24.21.0, the conformance job's four
  checks and the atlas job's two pass.
- The archive check (`archive-check.log`), with lazy fetching off and no
  `--rebuild-all`: every recorded archive holds its recorded bytes and is
  bound to its source commit, and the rebuild of HEAD is skipped while no
  1.1.0-rc.2 archive is carried. Rebuilds run only in CI (K12).

## Reviews and the site run

Two independent reviews read the candidate, each in parts: the first on
`b11c5e8`, acted on in `a5c1a38`, `b954a78` and `6d7486d`, with the x86-64
regeneration (`8173f1e`) and the size records (`4f4c1e8`) after them; the
second on `4f4c1e8`, acted on in `415781e`, with T12's tool (`7d3c5ae`,
written late), the size records (`5c00cb8`) and `e2edd3a`. Each commit's
message says what it changes and why. Both reviews ran some inputs the formal
runs hold before those runs; each unit's amendments say which, and the
readings they touch are `validated` only until the owner ratifies.

The site run built zodiacs.org's main with the packed candidate in place of
1.1.0-rc.1, in a scratch clone outside every repository, on `b11c5e8`,
`4f4c1e8` and `5c00cb8`, and committed nothing; its records are kept with
the programme's notes, outside the repository. Every bundle allowance held on
the default build and with production's flags; the engine reference built for
all fifteen public entry points, and its export-coverage control failed as it
must; every new sentence the site's claims extractor selects is backed by
committed evidence here; F-89's S1 holds. The time bands' C8, and lite's B5,
are void as run: the sentence their control plants has no trigger word in the
extractor's lexicon, so it was not selected, and each needs a version 2 in
the site's adoption (time-bands and lite amendments of 2026-11-03).

## Formal runs

*To be filled.* Each unit's checks as its preregistration fixes them, on the
reviewed tree's build, one heavy job at a time: F-89's in `f89/`, the time
entry's in `time-entry/`, the time bands' in `time-bands/`, the lite entry's
in `lite/` and the varga sensitivity's in `varga-sensitivity/`. Each output
is committed unchanged in method, with the machine, Node, Python and commit
recorded, and each folder's `RESULTS.md` gives each check's verdict, each
control's outcome and every departure from the preregistration. They form
the source commit, which changes no packed byte.

## On the carrier

*To be filled.* The archive is packed once from the source commit by
`carrier/pack-source.sh` on Node 22.22.2, 20.19.0 and 24.21.0, and carried,
with its SHA-256 receipt and its `artifacts/archives.json` entry, by a child
of that commit. `carrier/carrier-gates.sh` then runs CI's jobs on the
carrier (engine on the three Node versions, pack, consumer on four,
conformance and atlas); the archives job, the engine job's archive step and
the generators job run in CI, cited here by run id.

The time entry's checks T1 to T13 run again on the carried archive, as
`time-entry/PREREGISTRATION.md` requires (sections 6 and 9: T1 to T13
committed at the source commit and rerun on the archive, in the carrier's
gates): `carrier-gates.sh time-entry` on the carrier, in a sparse clone, with
the site's `src/lib/engine/time-basis.mjs` and `time-basis.d.mts` read from
site main's git objects (9a67f761) into files outside every checkout, and
Node 20.19.0 for T3. It extracts the archive into a consumer and finds the
clone's build byte for byte the archive's `dist/*.js` and `dist/*.d.ts`; T1's
runtime names, T3, T4, T5, T7, T8 and T10 read the archive; T1's `api:check`
and `src/time.test.ts`, T2 and T13 (the export smoke test) and T9 (package
contents) read the build, whose module lists the archive does not carry; T6
and T11 read the sources. T12's tool, `time-entry/tools/declarations.mts`,
which that preregistration's section 12 names, is not yet in the tree, so
the job records T12 as not run, and fails, until the tool is committed and
the job runs it.

## Not covered here

- The site does not use this candidate. Adopting it is the site's step, in
  a pull request of its own, and comes before any publication of 1.1.
- No npm publication, which needs the owner's approval.
- No unit is `accepted` while OQ5 is with the owner.
