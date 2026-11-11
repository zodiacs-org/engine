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

The run's result is recorded after the source commit's gates (below).

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
