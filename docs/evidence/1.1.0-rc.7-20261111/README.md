# 1.1.0-rc.7: evidence

What `CHANGELOG.md` states about 1.1.0-rc.7, and where each statement comes
from. The candidate is a draft cut for the owner's review on 11 November
2026; nothing is published.

## What it carries

1.1.0-rc.6 (branch `admin/engine-1.1.0-rc.6`, pull request 91, head
`ce4ba82`), which this branch starts from, and the dense DE440 sweep (branch
`admin/zod-65-engine-phase-1-replace-receipt-error-limits`, pull request 92,
head `255b615`), merged with a merge commit. Neither pull request was merged
into `main` when this was cut. Merging 91, then 92, then this candidate's own
pull request gives the same history; this pull request alone carries all
three.

The sweep compared `calc()` with NAIF's `de440.bsp` at noon TT on each of the
146,097 days from 1800-01-01 to 2199-12-31 (run 43037857931,
`docs/evidence/de440-sweep-20261111/README.md`). It changed no packed file and
left regenerating `src/calc-bounds.ts` to a later candidate. This candidate
does it.

## The bounds

`src/calc-bounds.ts` is now written by
`docs/evidence/de440-sweep-20261111/tools/write_bounds.py`, from two
summaries, and is not edited by hand:

- the sweep's `results/summary.json` for the 32 rows it measured: the
  geocentric Sun, Moon and Mercury to Pluto with each of the three
  corrections, and the true node and its opposite point (apparent only).
  Their basis is `SWEPT_BASIS`. A value the sweep did not measure, the
  nodes' distance and rate, keeps what the row had, which is null;
- `docs/evidence/calc-api/rc16/summary.json`, as before, for every other row:
  69 rows heliocentric, barycentric and topocentric on `MEASURED_BASIS`
  (JPL Horizons, DE441, 32 instants), and the mean node, the mean south node
  and Black Moon Lilith, 3 rows, on `MEAN_POINTS_BASIS` and
  `MEAN_POINTS_SPEED_BASIS` (ERFA, the same 32 instants). Their values and
  their basis sentences are unchanged, word for word. The three barycentric
  Sun rows stay out of the file, as before: `calc.ts` derives them from the
  barycentre's error.

So 72 rows of the file stay on the 32 instants, and 32 rows move to the
sweep. `SWEPT` names the three geocentric groups; within them every row but
the mean points' is the sweep's, which the tool and
`src/calc-bounds.test.ts` both check. `calc.ts` gives each bound the basis of
its row: position, distance and speed alike.

The rule is the preregistered one (`docs/evidence/calc-api/PREREGISTRATION.md`):
the largest difference over every instant and frame, rounded up to two
significant figures. Old to new, [position arcseconds, relative distance,
rate arcseconds a day]:

| row | position | distance | rate |
| --- | --- | --- | --- |
| apparent Sun | 3.0 to 3.4 | 1.5e-05 to 1.7e-05 | 0.18 to 0.24 |
| apparent Moon | 8.3 to 12 | 0.00014 to 0.00015 | 1.1 to 2.9 |
| apparent Mercury | 9.3 to 17 | 3.6e-05 to 7.8e-05 | 2.2 to 3.6 |
| apparent Venus | 11 to 24 | 3.2e-05 to 8.3e-05 | 0.64 to 1.4 |
| apparent Mars | 6.6 to 23 | 5.8e-05 to 8.7e-05 | 0.45 to 0.74 |
| apparent Jupiter | 13 to 17 | 4.7e-05 to 7.9e-05 | 0.061 to 0.11 |
| apparent Saturn | 18 to 24 | 6.8e-05 to 7.7e-05 | 0.03 to 0.06 |
| apparent Uranus | 20 to 20 | 4.2e-05 to 5.6e-05 | 0.02 to 0.03 |
| apparent Neptune | 21 to 22 | 4.2e-05 to 4.7e-05 | 0.013 to 0.019 |
| apparent Pluto | 25 to 30 | 6.3e-05 to 6.3e-05 | 0.014 to 0.018 |
| apparent North Node, South Node | 16 to 33 | none | none |
| astrometric and geometric Moon | 7.6 to 12 | 3.6e-05 to 4.8e-05 | 1.1 (geometric 0.97) to 2.9 |

The astrometric and geometric rows of the other bodies take the apparent
rows' new values (the sweep found them equal after rounding). No value
falls. `docs/versioning.md` allows a bound found to be wrong to be corrected
in a minor release; these are such corrections.

`write_bounds.py` also checks, before writing, two points an independent
review of the sweep raised (`docs/evidence/edge-cases-20261111/SWEEP-REVIEW.md`
in draft pull request 93, not merged; its findings 2 and 4):

- the plan's sanity limits, 60″ for any body and 10″ for the Sun: none is
  passed (the largest is the node's 32.64″, the Sun's 3.33″);
- a largest difference that the sweep keeps to six significant figures and
  that falls exactly on a two-figure value, from which rounding up could give
  a bound one unit low: none does.

Its findings 1 and 3 are below (*The re-measure*) and in the owner decisions.

`docs/evidence/calc-api/tools/bounds.py` no longer writes the file: it says
so and stops, and its `--check` now reports a difference, as the sweep's dry
run already expected. `tools/dry_run.py` takes its baseline from what
`bounds.py` writes from `rc16/summary.json` (the table before this
candidate) rather than from the file, so it reproduces the committed
`results/report.md` and `results/calc-bounds.dry-run.diff` byte for byte, as
before; this was checked on a copy of `results/`.

## What else the bounds reach

- `src/fixtures/calc-roundtrip.json`, rebuilt by
  `scripts/build-calc-roundtrip.mjs`: of its 38 cases, the bounds' values and
  basis sentences change, and the version in the receipts. No position, no
  other field.
- `src/calc-sidereal.test.ts` took the Moon's speed bound as 1.1; it now
  reads it from `calc()`.
- `src/calc-bounds.test.ts`: the rows against both summaries, the 32 and 72
  rows, `SWEPT`, and each row's basis in `calc()`'s results.
- `README.md`, `LICENSING.md`, `NOTICE` and `docs/calc.md` say what the
  bounds rest on; `docs/calc.md` has a section on the sweep.
- The conformance results are regenerated on Node 22.22.2: the version alone
  changes. They quote no bound.
- `api/` does not change: the bounds are values, not declarations.

Not changed: any sentence on the site. The sweep supports "within 30
arcseconds" for the Sun, the Moon and the planets over 1800 to 2199 and not
for the nodes (33″); whether and how to say it is the owner's decision.

## Do positions differ between 1.1.0-rc.3 and this candidate?

No, on every check made:

- **The sources.** Between `main` at `bc0b5a7` (1.1.0-rc.3, what the sweep
  measured) and 1.1.0-rc.6, `src/` changes in `src/geo/timezone.ts` and
  `src/receipt.ts` (the clock-change choice), `src/geo.ts` (a type export),
  `src/types.ts` (`ENGINE_VERSION`) and three test files. This candidate
  adds `src/calc-bounds.ts`, `src/calc.ts` (the basis of each bound and
  nothing else) and tests. None of these is read by a geocentric position
  computed from a TT instant, which is what the sweep asks for. The
  dependency is astronomy-engine 2.1.19 in both lockfiles.
- **A sample.** `same-positions.log` is `tools/same-positions.sh` run on
  this candidate's build and on the carried
  `artifacts/zodiacs-engine-1.1.0-rc.3.tgz`, unpacked, on Node 22.22.2: the
  sweep's own engine side on the first 1,500 days of each of its eight eras,
  12,000 instants, 32 cases and 8 frames each. The values are the same bytes
  in all eight eras.
- **The fixtures.** The rebuilt `calc-roundtrip.json` has every position it
  had.
- **The re-measure** (below): the sweep's workflow on this candidate's build,
  all 146,097 instants.

## The re-measure

The sweep's workflow (`.github/workflows/de440-sweep.yml`) runs on a pull
request that changes `src/calc-bounds.ts` or the sweep's tools, so it runs on
this candidate's pull request. It builds the checked-out tree, runs all
146,097 instants against the kernel, and gains one step here:
`write_bounds.py --against` on the run's results, which prints for each of
the 32 rows the largest difference found and the limit `src/calc-bounds.ts`
quotes, fails if any is over, and says era by era whether the engine's values
are the same bytes as the committed sweep's. The workflow cannot be
dispatched by hand from a branch until it is on `main`.

On a pull request, `actions/checkout` builds the merge of the head into
`main` (the review's finding 1). While `main` is `bc0b5a7`, which this
branch contains, that merge has this branch's tree.

It ran on the source commit `ca3ae0f` as run 43055363587 (attempt 1,
event `pull_request`), ten jobs, all green. The checkout was GitHub's merge
commit `42a864b` of `ca3ae0f` into `bc0b5a7`; its tree is `ca3ae0f`'s
(`f031cff`), checked here with git. The build was `@zodiacs/engine`
1.1.0-rc.7, `distSha256` `a8da9056…3a29`, on Node v22.23.4; the kernel's
digest was checked as before.

- `remeasure/against-43055363587.log`: the new step's output, as the job
  printed it (and as `write_bounds.py --against` gives it here on the
  fetched results). In all eight eras the engine's values are the same bytes
  as the committed sweep's on 1.1.0-rc.3, and every largest difference of
  the 32 rows, position, distance and rate, is within the limit
  `src/calc-bounds.ts` quotes. Position, apparent places, largest found
  against the limit, arcseconds: Sun 3.332 / 3.4, Moon 11.875 / 12, Mercury
  16.9101 / 17, Venus 23.3123 / 24, Mars 22.9118 / 23, Jupiter 16.8076 / 17,
  Saturn 23.2102 / 24, Uranus 19.6414 / 20, Neptune 21.2794 / 22, Pluto
  29.8591 / 30, the nodes 32.639 / 33.
- `remeasure/results-43055363587.sha256`: the SHA-256 of each file of the
  run's results and of the tar the job printed in its log. The results were
  read from the log, as the sweep's were (its deviation 2), and each file
  matches the digest the job printed. Their bounds and longitudes are the
  committed sweep's, number for number. They are not committed again: the
  committed sweep is the source of `src/calc-bounds.ts`, and this run shows
  that it holds for this build.

The margins are thin by construction: a limit is the largest difference
rounded up to two significant figures, so the Sun's rate (0.239 against
0.24), Pluto's position (29.86 against 30) and Mars's (22.91 against 23)
are close to theirs.

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.1.0-rc.6
archive, unpacked, and the build of this candidate's tree (Node 22.22.2,
Linux x86-64). `./calc` is 153,980 bytes against 153,922 (58 bytes, the new
basis sentence and its choice), under its budget of 156,000; no other entry
changes. The package is 1,152,017 bytes against 1,148,327: 3,690 more, of
which the CHANGELOG entry is 2,888, the README's lines 379, `LICENSING.md`
and `NOTICE` 365, and JavaScript 58.

## Budgets

The package cap rises from 1,150,000 to 1,155,000, which leaves 0.25 per
cent. AGENTS.md allows a rise only when a candidate is cut, with the reason
in `CHANGELOG.md`. The owner has not yet approved it: it is one of this
candidate's decisions. No entry point's budget changes.

## The archive

`carrier/pack-source-ca3ae0f.log`: clean clones of the source commit
`ca3ae0f`, each installed with `npm ci`, built and packed with
`npm pack --ignore-scripts` outside the checkout, on Node 22.22.2, 20.19.0
and 24.21.0 (Linux x86-64, 11 November 2026). All three packed SHA-256
`71348be1f8dc2772945cc86c72af475091d105da9e7ff5b4411c517adc9fc80a`, 335,403
bytes, 94 files; the carried file is the Node 22.22.2 one.

## The gates on the source commit

The gate workflows ran on the source commit `ca3ae0f` on GitHub, as the head
of draft pull request 95, before the archive was carried, and every job
passed: CI run 43055363489 (the engine job on Node 20, 22 and 24, the
rebuild of every archive carried then, the pack, the packed consumers on
Node 20.19.0, 22.7.0, 22 and 24, and the DE440 tier-B job), Conformance run
43055363317 and Atlas run 43055363454. The repository's other workflows
passed on it too: DE440 sweep 43055363587 (above), Python package
43055363627, Offline CLI consumer 43055363474 and CodeQL 43055363385.

## The gates on the carrier

Run locally on the carrier `4428332` before it was pushed (Linux x86-64,
`TMPDIR` outside the checkout):

- `carrier/gates-4428332.log`: the engine job's steps on Node 22.22.2
  (typecheck, the suite with 100 files and 4,204 tests passed and 3 tests
  skipped, build, export smoke, `api:check`, package contents, pack dry
  run), `node scripts/verify-archive-binding.mjs` on Node 20.19.0, 24.21.0
  and 22.22.2, each rebuilding HEAD to the carried bytes, the
  packed-consumer check on the carried archive on Node 22.22.2, 20.19.0 and
  24.21.0, on Node 22.22.2 the conformance checks (the self-test, the count
  of 500 vectors, `run.mjs --check` and `report.mjs --check`) and the atlas
  check and self-test, and `write_bounds.py --check`. Every step exits 0.
- `carrier/rebuild-all-4428332-v22.22.2.log`:
  `node scripts/verify-archive-binding.mjs --rebuild-all` on Node 22.22.2,
  the lines that name each archive: every recorded archive, this one
  included, rebuilds from its source commit byte for byte.

The workflow runs on the carrier and on this record's commit come after
this file and are on pull request 95. The tier-B check on NAIF's kernel and
the packed consumer on Node 22.7.0 were not run locally; the CI run on the
source commit has a job for each, and both passed.

## Reviews

No independent review of this candidate has been done. The sweep had one,
read-only, in draft pull request 93; this candidate acts on its findings 2
and 4 in the tool, and its findings 1 and 3 are above and in the owner's
decisions. If a review finds anything in the package, the fix is a new
candidate, not an edit of this archive.

