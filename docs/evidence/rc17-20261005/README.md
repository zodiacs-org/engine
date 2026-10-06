# 0.1.1-rc.17 checks, 2026-10-05

rc.17 adds the sidereal zodiac to the calc entry, `@zodiacs/engine/calc`, on
rc.16 as main has it at `23660f5` (the merge of zodiacs-org/engine#25). It is
seven commits on that base:

1. `18cb6b7`, *Compute the sidereal zodiac in the calc entry*: `calc()`,
   `houses()`, `events()` and `chart()` take `zodiac: { sidereal }`, with the
   nine built-in ayanamsas or a caller's own, where rc.16 refused it as
   `not-in-this-version`;
2. `0887541`, *Act on the sidereal review*,
3. `8070095`, *Act on the second sidereal review*,
4. `2ecc43c`, *Act on the third sidereal review*,
5. `d36642e`, *Act on the fourth sidereal review*, and
6. `8d8e837`, *Act on the fifth sidereal review*: the reviews of `18cb6b7`
   and their fixes (*Reviews*, below);
7. the source commit of this candidate, which this directory comes with: the
   version, the generated records that carry it, the CHANGELOG, the README
   and these checks (*The source commit*).

The feature's own checks, against the Vedic entry and against ERFA, are in
`../calc-sidereal-2026-10-05/`; this directory records what the candidate as
a whole was checked for. Every figure below is read from a file in this
directory, in that one or in a test named beside it, but the reviews'
findings (*Reviews*), which are their reports'. Local paths in the outputs
are shortened to `<checkout>`, `<tmp>` and `<scratch>`.

## The source commit

- Version 0.1.1-rc.17: `package.json`, `package-lock.json`, `ENGINE_VERSION`
  (`src/types.ts`) and TypeDoc's title (`typedoc.json`). The two tests that
  pin the version a new receipt records (`src/receipt-nutation.test.ts`,
  `src/receipt-time-basis.test.ts`) read 0.1.1-rc.17.
- Generated again on this tree: `src/fixtures/calc-roundtrip.json`, whose 29
  lines that name the engine's version change and nothing else
  (`node scripts/build-calc-roundtrip.mjs`); and the conformance results
  (*Conformance*).
- `CHANGELOG.md` gains the rc.17 entry and `README.md` describes this
  candidate. Both say what npm carries, as `npm-view.txt` records it on
  2026-10-05: rc.14 to rc.16, `latest` rc.15 and `next` rc.16, and not
  rc.17; the CHANGELOG notes that the entries of rc.14 to rc.16 call them
  unreleased.
- `NOTICE` and `LICENSING.md` say that the star-based ayanamsas' 22 values
  are in a shared chunk under `dist/` that `dist/vedic.js` and `dist/calc.js`
  import, where rc.16's said `dist/vedic.js`; `LICENSING.md` adds that calc's
  ayanamsa bounds are measurements.
- `scripts/verify-package-contents.mjs`: the reason given beside the calc
  entry's budget had the first build's sizes (138,580 bytes, 17,411 of them
  in the shared chunk and 7,265 in `calc.js`); it now has this build's
  (*Sizes and budgets*), the Vedic entry's comment its rc.17 size, the
  budgets' preamble says that rc.17 raises one, and the cap's comment gives
  rc.17's size. It now also checks that the star values are in one shared
  chunk that both entries import, and that `NOTICE` and `LICENSING.md` say
  so, as it checks the ΔT values.

## Reviews

`18cb6b7` was reviewed, and each commit that answered a review was reviewed
in turn: five reviews, AI-assisted, each in its own copy of the checkout. The
first three were one reviewer's, each building on its last; the fourth and
the fifth were a second and a third reviewer's, each given the commit and the
findings it answers. A sixth, a fourth reviewer's, read this source commit's
changes before they were committed. Every finding was acted on, by the next
commit or, for the first review's release finding and the sixth review's, by
this source commit. The commit messages of `0887541`, `8070095`, `2ecc43c`,
`d36642e` and `8d8e837` summarize each review and what was done; the
reviewers' probes are not in the repository.

1. The review of `18cb6b7` found the sidereal arithmetic correct and two
   findings that blocked a merge:
   - the packed files changed under the version of the carried rc.16
     archive, so CI's archive check would fail, and the CHANGELOG and README
     still said calc refused the sidereal zodiac. This source commit answers
     it: the version, the CHANGELOG entry, the README and a new archive
     (*The source commit*, *The archive*);
   - within a degree of the Sun, a denser run of the feature's own ERFA
     comparison parted from the engine by up to 0.0352″ and 17.1″ a day,
     against the 0.022″ and 0.40″ stated; a degree or more from the Sun the
     rate exceeded its bound out to 1.43°; and the stated cause did not fit
     the recorded figures.

   It also found the mean ayanamsa's bound set beside the true ayanamsa, two
   shapes under the one key `ayanamsa`, four gaps in the tests (the speed at
   a leap second, `events()` with a caller's ayanamsa, a caller's value near
   ±180°, the band edges) and four smaller points of wording and of error
   messages. `0887541` sampled densely near each star's pass by the Sun
   (`tools/dense_rates.py`), gave calc, houses and chart one shape, added
   the tests and corrected the rest.
2. The review of `0887541` found six of the nine findings fixed, two in
   part, and the release finding left to this commit. Its new finding
   blocked a merge: in years the dense comparison had not sampled, the
   engine and ERFA parted by up to 0.0574″ and 27.0″ a day within 0.3° of
   the Sun, 1.6 and 1.5 times the bounds. Three smaller ones: the epoch and
   linear band claimed every definition calc accepts, though a linear ayanamsa
   counted from an epoch at the edge of a Date's range carried 1.9 × 10⁻⁴″ a
   day of rounding in its rate; two test titles and assertions; and a count.
   `8070095` compares every star definition in every year from 1800 to 2199,
   builds a linear ayanamsa from its value at J2000.0, and fixes the rest.
3. The review of `8070095` found all of those fixed and nothing that blocked
   a merge. Of its five small findings, one was a bound: at 4,001 instants,
   two of 192,048 rates of epoch definitions parted from its reference by
   2.05 × 10⁻⁷″ a day, over the bound of 1.5 × 10⁻⁷, the rounding of two
   central differences. Four were documentation: 78 star-years over the
   earlier bounds that are 74, crossings of the deflection's cap up to 4.21
   minutes apart rather than 2.1, twelve years in which only the engine caps
   the deflection, and a citation of a section that does not exist.
   `2ecc43c` sets the rate bound at the floor of the engine's rounding, adds
   the engine's own crossings of the cap to the comparison with a check that
   each is sampled finely, and corrects the four.
4. The review of `2ecc43c` found the third review's findings fixed but one,
   and two problems in the record, neither in the engine's arithmetic.
   ERFA's cap had been read at the star's least apparent angle from the Sun,
   not at ERFA's least margin, about eight minutes later: ERFA caps in 286
   years, not 278; the engine alone in four, not twelve; and where both cap,
   the crossings fall up to 6.3 minutes apart, not 4.2. And the rate bound's
   floor was stated as covering calc's speeds, which add rounding of their
   own, up to 3.0 × 10⁻⁷″ a day in the cases it found. Smaller: two
   docstring errors in `tools/rounding_floor.py`, an epoch definition's
   rounding described as the engine's alone, and the fixture's units.
   `d36642e` reads the cap at ERFA's least margin and samples every 0.00001
   day wherever that margin is within 5 × 10⁻⁸ of zero, which covers both
   programs' crossings; says what the floor covers and what a speed adds;
   and corrects the rest. No bound changed.
5. The review of `d36642e` found the fourth review's findings fixed and no
   defect in the engine or the data, and rebuilt the every-year rows and
   results byte for byte. Two findings were in the record. Its account of
   why the fine rows cover the engine's crossings of the cap rested on the
   margins' difference at ERFA's least, 1.7 × 10⁻⁸, but at the engine's
   crossings ERFA's margin is up to 1.97 × 10⁻⁸ from zero. And the speeds'
   figures it gave as what calc adds were calc's whole difference from the
   definition's rate; a Julian date in TT gives a larger one, 3.45 × 10⁻⁷″ a
   day. Three smaller points: the fixture's units, the precision that
   `least_margin` claimed, and a sentence on the 1804 rate. `8d8e837`
   measures ERFA's margin at the engine's crossings
   (`dense_rates.py --erfa-at-crossings`), gives the limit on calc's speeds,
   about 6 × 10⁻⁷″ a day, and the largest found, adds that case to the speed
   test and corrects the rest. No bound, no engine code and no comparison
   changed.
6. The review of this source commit's changes found three statements in
   packed files false: the CHANGELOG said the round-trip fixture's earlier
   cases changed only in their version, where the sidereal Moon, refused in
   rc.16, is now computed and 15 cases gain `ayanamsa: null`; it said no
   value of `./vedic` moved but Raman's and Sri Yukteswar's, where a caller's
   linear ayanamsa moves too (*What did not change*); and `NOTICE` and
   `LICENSING.md` placed the star values in `dist/vedic.js`. Smaller: the
   package's growth was not split as rc.16's was; the README's statement of
   what npm carries had no record here; the README claimed bit-identity
   without its qualifier; this record repeated the fixture's error, gave a
   third-review figure without its scope or source and claimed every figure
   came from a file; and wording. This commit corrects each.

## What did not change

The rc.17 tree was built and its import graphs compared, entry by entry,
with the carried rc.16 archive, `artifacts/zodiacs-engine-0.1.1-rc.16.tgz`
(SHA-256 `43a72d30…`), by `tools/graph-compare.mjs`
(`results/graph-compare.txt`):

- At `8d8e837`, which still names itself 0.1.1-rc.16, the root entry and
  eleven others (`./crossings`, `./deltat`, `./geo`, `./houses`,
  `./internal`, `./internal/math`, `./receipt`, `./sky`, `./techniques`,
  `./timing` and `./window`) load the same files as rc.16's, byte for byte;
  only `./calc` and `./vedic` differ.
- On this tree the version's value differs, and with it the content-hashed
  name of the chunk that holds `ENGINE_VERSION`, and so the names in every
  chunk that imports it. With those names and that value written out of
  every file, the twelve graphs are again rc.16's; four of them (`./crossings`,
  `./deltat`, `./geo`, `./houses`) do not reach that chunk and are identical
  as built.
- Of the calc round-trip fixture's 25 cases from rc.16, 24 give the same
  values: 15 of them gain `ayanamsa: null` (`../calc-sidereal-2026-10-05/`
  explains it), and every receipt names rc.17. The 25th, the sidereal Moon,
  was refused `not-in-this-version` in rc.16 and is now computed.
- `./vedic`'s values are rc.16's but for its linear ayanamsas, which now
  count from J2000.0 rather than from their epochs (`18cb6b7`):
  `tools/linear-change.mjs` compares the two builds' `ayanamsa()` at 116
  instants from 1800 to 2199 (`results/linear-change.txt`). Every epoch and
  star definition gives the same value; Raman's moves by up to
  1.42 × 10⁻¹⁴° and Sri Yukteswar's by up to 1.07 × 10⁻¹⁴°; and a caller's
  linear ayanamsa by up to 6.82 × 10⁻¹³° from an epoch from 1800 to 2200,
  1.56 × 10⁻¹²° from the start of the Kali Yuga and 8.62 × 10⁻¹¹° from an
  epoch at either end of a Date's range, at 3,600″ a year.
- Conformance: every one of the 500 verdicts, and every residual, is rc.16's
  (*Conformance*).
- Receipts: no conventions set is added. The current set has been accepted
  from 0.1.1-rc.16 on, in SemVer order, so receipts written by rc.17 are
  accepted under it, as `src/receipt-nutation.test.ts` and
  `src/receipt-time-basis.test.ts` check for 0.1.1-rc.17.
- The techniques' site-parity fixtures (`src/techniques/fixtures/site-parity/`)
  were generated on rc.16's packed build and say so (`meta.engine`); they
  were not generated again, because the root's graph, which the site's code
  runs on, is rc.16's but for the version. The parity test passes on this
  tree against them.

## Conformance

`conformance/results/zodiacs-engine.json` was regenerated on this tree with
adapter 0.2.0, then `RESULTS.md` and `results/summary.json`, and
`results/zodiacs-engine.notes.md` names this release. Totals: 267 pass, 192
fail, 41 unsupported, 0 error of 500, as rc.16's. `conformance-changes.json`
(`../rc15-20260929/conformance-changes.mjs`, against rc.16's committed
results) finds no verdict that moves and no residual statistic that changes:
the files differ in the engine version alone.

## Birth data

The rule is `CONTRIBUTING.md`'s: synthetic data, or a published worked
example about a person who has died, cited where it is used with author,
title, year and page; never a living person's. Every added line of every
commit on this branch was checked with rc.16's two tools
(`../rc16-20260930/README.md`, *Birth data*).

1. `../rc15-20260929/rebuilt/history-check.mjs`, unchanged, with rc.16's
   patterns and examples, which are kept outside the repository because they
   are the birth data it looks for. `history-check.txt` is its output on
   `23660f5..HEAD`, the six commits before the source commit, with the
   source commit's changes staged: no birth data in any commit, in the staged
   changes or in the tree of `8d8e837`, and the published examples appear
   only in files that cite them. rc.16's positive controls
   (`../rc16-20260930/history-check-control-first-cut.txt` and
   `history-check-control-recut.txt`) show the same patterns finding birth
   data in histories that held it.
2. The broad review aid, run outside the repository because its output holds
   the lines it matches, listed every added line with a year from 1700 to
   2029 beside birth vocabulary or a capitalized pair of words, and every
   such pair, commit by commit and for the staged changes: 41 lines in six
   commits and the staged changes, each read. They hold the stars' and the
   ayanamsas' names (True Pushya, Sri Yukteswar), the comparison's years, the
   start of the Kali Yuga, the conformance notes' statistics, the names of
   tests in the suite's logs (a rule for circumpolar bodies named after its
   author, and two cities named for their time zones), the published worked
   examples that `history-check.txt` lists with their citations, and this
   record's own description of the aid; no person's birth data.

No commit adds a person's birth data.

## Sizes and budgets

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried rc.16
archive, with the budgets of its source commit `ddbbaa0`, and this tree:

| Entry | rc.16 | rc.17 | rc.17 beyond the root's graph | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: |
| `.` | 103,537 (34,828) | 103,537 (34,822) |  | 108,500 | 4.79 % |
| `./calc` | 113,904 (37,490) | 139,836 (45,927) | 61,686 (19,116) | 145,500 | 4.05 % |
| `./crossings` | 9,410 (2,768) | 9,410 (2,768) | 173 (106) | 10,000 | 6.26 % |
| `./deltat` | 4,968 (1,944) | 4,968 (1,944) | 161 (101) | 5,500 | 10.7 % |
| `./geo` | 34,659 (12,953) | 34,659 (12,953) | 31,730 (11,858) | 35,000 | 0.98 % |
| `./houses` | 13,606 (3,503) | 13,606 (3,503) | 13,606 (3,503) | 15,000 | 10.24 % |
| `./internal` | 64,830 (22,572) | 64,830 (22,568) | 305 (160) | 68,000 | 4.88 % |
| `./internal/math` | 18,165 (4,928) | 18,165 (4,928) | 1,325 (446) | 20,000 | 10.1 % |
| `./receipt` | 66,580 (22,374) | 66,580 (22,373) | 41,969 (11,893) | 70,000 | 5.13 % |
| `./sky` | 92,109 (31,262) | 92,109 (31,255) | 16,888 (5,539) | 97,000 | 5.31 % |
| `./techniques` | 152,472 (50,308) | 152,472 (50,304) | 62,610 (20,014) | 160,000 | 4.93 % |
| `./timing` | 123,039 (39,477) | 123,039 (39,471) | 32,505 (8,850) | 129,000 | 4.84 % |
| `./vedic` | 122,131 (40,647) | 123,639 (41,511) | 33,777 (11,221) | 128,000 | 3.52 % |
| `./window` | 102,590 (34,123) | 102,590 (34,118) | 33,677 (9,969) | 105,000 | 2.34 % |

Bytes, with the sum of the graph's files each gzipped at level 9 in
parentheses; headroom is the budget over the rc.17 size, as a percentage of
the size, rounded down. Graphs that load the same number of bytes gzip a few
bytes apart, because the hashed chunk names inside them changed.

One budget is raised, after the size it fits had been measured, with its
reason beside it in `scripts/verify-package-contents.mjs`: `./calc`, 115,000
→ 145,500, for the sidereal zodiac. The calc entry now imports the Vedic
entry's ayanamsas (`src/vedic/ayanamsa.ts`, with its star catalogue and
apparent places) and sidereal charts (`src/vedic/sidereal.ts`,
`src/vedic/grid.ts`), which esbuild puts, whole, in a chunk the two entries
share: 17,596 bytes, and 8,336 more in `calc.js`. `./vedic` grows by 1,508
bytes, to 123,639 of its 128,000, not raised.

The package is 946,349 bytes unpacked in 70 files, 23,067 more than rc.16's
923,282 in 69: 9,844 bytes (42.68 per cent of the growth) of JavaScript that
only the opt-in entry points load, the shared chunk and `calc.js`'s growth
less what left `vedic.js`; 4,618 (20.02) of declarations, `calc.d.ts`'s; and
8,605 (37.30) of documents, the CHANGELOG, README, `LICENSING.md` and
`NOTICE`. It is 0.38 per cent under the cap of 950,000. The cap was not
raised; the next candidate that grows the package by more than about 3,600
bytes will need it raised, or the package trimmed, with the reason in its
CHANGELOG. The zone histories are rc.16's, 189,144 bytes in 16 files.

## Gates on the tree

`gates.sh`, rc.16's writing here, ran CI's engine job on the tree of the
source commit before it was made, once on each Node version (`gates.log`, and
the suite's output in `full-tests-<version>.log`):

| Node (npm) | Typecheck | Tests | Build, export smoke, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,791 passed in 80 files | pass |
| 20.19.0 (10.8.2) | pass | 3,790 passed, 1 skipped, in 80 files | pass |
| 24.21.0 (11.19.0) | pass | 3,790 passed, 1 skipped, in 80 files | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), which runs only where Node's own time-zone
data is 2025c (theirs are 2025a and 2026c), as in rc.16. `npm run
package:contents` reports 70 files and 946,349 bytes unpacked on each.
TypeDoc builds the API reference with 0 errors and 8 warnings
(`typedoc.log`), rc.16's eight. The archive check reads commits, so it runs
on the carrier (below).

## The archive

The archive is packed once, after every gate on the tree has passed, from
the source commit itself: clean clones of it, each installed with `npm ci`,
built and packed on Node 22.22.2, 20.19.0 and 24.21.0
(`carrier/pack-source.sh`), must give the same bytes, and the Node 22.22.2
one is carried by the source commit's child, with its SHA-256 receipt, an
entry in `artifacts/archives.json` naming the source commit, and a row in
`artifacts/README.md`. Its digest, size and file count are recorded there,
and here by the commit that records the carrier's gates.

## The gates on the carrier

`carrier/carrier-gates.sh` runs each of CI's jobs on the carrier in a clean
clone of the repository with full history, with `TMPDIR` outside the clone
and no `package.json` or `node_modules` at or above it: the engine job on
Node 20.19.0, 22.22.2 and 24.21.0, the archive check with `--rebuild-all`,
the pack compared with the carried archive, the packed consumer on Node
20.19.0, 22.7.0, 22.22.2 and 24.21.0 (on the carried archive itself), the
conformance job, the conformance generators and the atlas. The commit after
the carrier records their logs in `carrier/`, and changes only this
directory.

## What is not established

- The ayanamsa bounds are the largest differences found over 2,333,979
  comparisons with ERFA's construction of the same definitions, every year
  from 1800 to 2199, densely near each star's passes by the Sun; they are
  measured, not proven, except a linear definition's rate bound, which is the
  floor of its own rounding between the rate's two instants. A speed in calc
  adds rounding of its own, a few tenths of a microarcsecond a day for a
  linear ayanamsa at 3,600″ a year, which no bound includes: with the
  definition's own, about 6 × 10⁻⁷″ a day at most, a limit derived from the
  roundings, not measured (`../calc-sidereal-2026-10-05/`). ERFA's Earth
  (`epv00`) is documented for 1900 to 2100, and the comparison uses it from
  1800 to 2200.
- The third review, by its report, sampled the star bands' cap crossings and
  edges ten to forty times more finely than the comparison does and found
  the star bounds held there, by 0.1 to 1.4 per cent (26.972″ a day at a
  crossing, against 27″); the epoch and linear rate bound it found exceeded
  (*Reviews*, 3). A change to the engine's Earth, or to the sampling, could
  take a difference past its bound.
- `tools/ayanamsa_rates.py` in `../calc-sidereal-2026-10-05/`, which writes
  the comparison's 960 sparse rows, was read by the first review only; it has
  not changed since `18cb6b7`, the commit that review covered.
- A star definition's bound depends on the star's angle from the Sun at the
  instant; within 0.3° of the Sun, where the star is on or beside the Sun's
  disc, the ayanamsa's rate can differ from ERFA's by up to 27″ a day.
- No Swiss Ephemeris output was used for rc.17; its sidereal results were not
  compared with `swe_calc_ut` with `SEFLG_SIDEREAL`.
- The reviews are AI-assisted, not human approval.
- CI has not run this candidate on GitHub Actions; the same scripts ran here.
- rc.17 is not to be published on npm: under the owner's delegated decision
  of 2026-10-05 the next publication is the 1.0 candidate. Nothing here
  represents a publication, a merge or the site's adoption.

## Reproduction

From a source checkout of the source commit, with Node 20.19.0, 22.7.0 or
later, after `npm ci` and `npm run build`:

```sh
node scripts/build-calc-roundtrip.mjs
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs
git show 23660f5:conformance/results/zodiacs-engine.json > rc16.json
node docs/evidence/rc15-20260929/conformance-changes.mjs rc16.json conformance/results/zodiacs-engine.json conformance-changes.json
node docs/evidence/rc16-20260930/sizes.mjs 0.1.1-rc.16=<rc.16 package> 0.1.1-rc.17=. > sizes.json
node docs/evidence/rc17-20261005/tools/graph-compare.mjs <rc.16 package>/dist dist
node docs/evidence/rc17-20261005/tools/linear-change.mjs <rc.16 package> .
npm view @zodiacs/engine versions dist-tags time --json
node docs/evidence/rc15-20260929/rebuilt/history-check.mjs 23660f5..HEAD <patterns file> <examples file>
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/gates.sh "$PWD" <directory of node and npm> <scratch directory>
```

`<rc.16 package>` is the carried rc.16 archive unpacked, with
`scripts/verify-package-contents.mjs` from `ddbbaa0` beside its `dist/` for
`sizes.mjs` to read its budgets, and, for `linear-change.mjs`, a
`node_modules` beside it that holds astronomy-engine 2.1.19, which its
`dist/vedic.js` imports (a link to the checkout's). The history check's two input files are not
committed, because they hold the birth data it looks for; the script's header
gives their formats.

The source commit packed from clean clones, and the carrier's gates, one job
and one Node version per call, each in a clean clone of `<repository>`:

```sh
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/carrier/pack-source.sh <repository> <source commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
TMPDIR=<tmp> sh docs/evidence/rc17-20261005/carrier/carrier-gates.sh <job> <repository> <carrier commit> <work directory> <directory of node and npm>
```

The jobs are `engine`, `archives`, `pack`, `consumer`, `conformance`, `atlas`
and `generators` (with `PYTHON` naming a Python that has pyerfa 2.0.1.5 and
numpy 2.4.6).
