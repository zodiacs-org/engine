# 0.1.1-rc.16 checks, 2026-09-30

rc.16 brings six pieces of work onto rc.15, as main has it at `93ebae9` (the
merge of zodiacs-org/engine#20), each from its feature branch as that
branch's own commits, in this order:

1. the uniform calculation API, `@zodiacs/engine/calc` (`feature-api`, 5
   commits);
2. birth-time windows, `@zodiacs/engine/window` (`feature-window`, 10 of its
   11 commits: `94b9fa2`, the Placidus bisection, is rc.15's already);
3. the techniques entry, `@zodiacs/engine/techniques` (`feature-techniques`,
   5 commits);
4. house positions, co-ascendants, cusp speeds (`@zodiacs/engine/houses`) and
   planetary returns (`feature-houses-extra`, 2 commits);
5. the sky entry, `@zodiacs/engine/sky` (`feature-sky`, 3 commits), without
   the branch's Chinese-calendar entry (*Held back*, below);
6. last, the full IAU 2000B nutation (`feature-nutation`, 4 commits).

The branches were cut from other bases: `feature-api` and `feature-window`
from `8c4946b` (main before rc.14), `feature-techniques`,
`feature-houses-extra` and `feature-sky` from `eb58011` (the gate records of
rc.15's first cut), and `feature-nutation` from `bcd532c` (the gate records of
rc.15's re-cut). The commits of those local rc.15 builds, which carried
living people's birth data (`../rc15-20260929/README.md`, *The published
history*), are not in this history: only each branch's own commits were
cherry-picked, onto `93ebae9`. The work is on branch `rc16-work`; nothing was
pushed or published, and no pull request was opened. This is rc.16 as re-cut
after its review: a first build was packed, carried and reviewed locally, and
discarded before any push (*The re-cut*).

Every figure below is read from a file in this directory, in a feature's
evidence directory or in a test named beside it. Local paths in the outputs
are shortened to `<checkout>`, `<clone>`, `<work>`, `<tmp>` and `<scratch>`.

## The commits

Each branch commit was cherry-picked in its branch's order and keeps its
author, date and message; the sky commits say in their messages what they
leave out. The branch commits in the first column are local and are not in
this repository.

| Branch commit | rc.16 commit | Subject |
| --- | --- | --- |
| `29679e8` | `9f38ed6` | Add @zodiacs/engine/calc: a uniform calculation API with frames and outputs |
| `6dc0c47` | `5bd3a8e` | Preregister the calc API's comparison with JPL Horizons and ERFA |
| `51e7f5f` | `8f8f25e` | Compare the calc API with JPL Horizons and ERFA; measured bounds |
| `aed3a1d` | `ed45426` | Add round-trip fixtures for the calc API |
| `8f8805c` | `3838e51` | Address the review of the calc API: bounds, span, receipts, evidence |
| (new) | `5d3400e` | Read the calc API's instants on rc.15's time basis |
| `670db8a` | `c637381` | Add @zodiacs/engine/window: birth-time window partitions |
| `d1000e6` | `d03f60c` | Preregister the 1,000-window check of birth-time windows |
| `7614f7b` | `09f8aa1` | Record the 1,000-window check of birth-time windows: PASS |
| `94b9fa2` | not taken: rc.15 carries it | Keep Placidus outside the polar circle: bisect where the iteration does not settle |
| `6933b1d` | `a8fb519` | birthWindow: leave slow node ingresses unresolved, split at the ΔT seam, guard the polar limit |
| `87bed02` | `e271718` | Name 2071 among the node's over-budget ingresses; reword the pole refusal |
| `a86d223` | `c68e68c` | Time birth-time windows again on the reworked search |
| `e0833ee` | `a33ac3e` | Fit the package under its 300,000-byte gate |
| `8a3331e` | `b9f566c` | Record the checks after the review: gates, the 1,000 windows and the review's 300 |
| `f9ae1de` | `4440865` | Correct the review's documentation points; add its second-round checker |
| `f703637` | `c1b047f` | Check the unresolved intervals' edges with the review's second-round checker |
| (new) | `f36d69e` | Put birth-time windows on rc.15's time basis |
| `d3bfca4` | `ecc4748` | Preregister the gates for the techniques entry point |
| `930ef6b` | `99f454e` | Add @zodiacs/engine/techniques: returns, relationship charts, void of course, patterns, dignities, Moon signs |
| `6fd9ff3` | `2646eef` | Correct the techniques' citations; measure ./geo's graph |
| `19719ce` | `eba9452` | Name the inputs of the differing cases in measure.mjs |
| `211aefd` | `0872cc0` | Record the results of the techniques gates |
| `8eb7c9c` | `e17ad9a` | Preregister the gates for house positions, co-ascendants, speeds and returns |
| `edb8f2b` | `d71567a` | Add house positions, co-ascendants, cusp speeds and planetary returns |
| `255f45e` | `e8e526f` | Preregister the sky and Chinese-calendar gates before measuring |
| `a10faf5` | `578c28d` | Add the sky entry point: rise, set, transit and planetary hours (the branch's "Add the sky and Chinese-calendar entry points", without the Chinese entry) |
| `219b60f` | `d66d30e` | Measure the sky entry; record the results (the branch's "Measure the sky and Chinese-calendar entries; record the results", for the sky alone) |
| (new) | `5e0d00c` | Budget the calc and window entries; keep the root off every opt-in entry |
| `3673d20` | `5df60b5` | Add the IAU 2000B nutation, all 77 terms, as an engine module |
| `f6c7147` | `c3aabbd` | Take the engine's nutation from its own IAU 2000B series |
| `45bdd34` | `3f8a55f` | Keep the nutation coefficients as text and sum the terms from products |
| `88ca0ce` | `148004a` | Record the evidence for the full IAU 2000B nutation, and document it |
| (new) | `704cadc` | Move calc, window and sky onto the engine's IAU 2000B nutation |
| (new) | `7e721b7` | Measure calc against Horizons and ERFA again after the nutation; bounds from the rerun |
| (new) | `aba647e` | Rerun each feature's gates and evidence figures after the nutation |
| (new) | `ddbbaa0` | Release candidate 0.1.1-rc.16: five opt-in entries and the full IAU 2000B nutation (the source commit) |
| (new) | `ef44477` | Carry the packed 0.1.1-rc.16 tarball (the carrier) |
| (new) | the commit that brings this version of this file | Record the gates on the rc.16 carrier ef44477 |

The archive packed from `ddbbaa0` is carried by its child `ef44477`, which
changes only `artifacts/`; the gates on the carrier are recorded by the
commit that brings this version of this file, which changes only this
directory (*The archive*, *The gates on the carrier*).

### The integration commits

- `5d3400e`: the calc entry was written before rc.15's time basis. It now
  reads every instant as `positions()` does (an ISO string or `Date` as UTC;
  a Julian date with its scale, `"UTC"`, `"UT1"` or `"TT"`; a pinned ΔT as in
  `natalChart`), takes the engine's sidereal time for `houses()`, forms its
  speeds on the time basis, and records `utc`, `jdUt1`, `jdTt`, `deltaT` and
  `timeScale` in each receipt. `scripts/build-calc-roundtrip.mjs` rebuilds
  the round-trip fixture from the build.
- `f36d69e`: the window entry now computes its angles as `natalChart` does on
  rc.15, and splits its search at every step of the time basis inside the
  reference span (the ΔT model's seam at 1941.0, 1972-01-01, each leap second
  and the end of the IERS table), found from the engine's own arithmetic;
  three tests compare every millisecond around such steps.
- `5e0d00c`: budgets for `./calc` and `./window`, the cap raised to 950,000
  bytes with its reasons, `OPT_IN_SOURCE` in `scripts/root-isolation.mjs`
  naming every opt-in entry's modules, and the sky entry in TypeDoc.
- `704cadc`: the nutation commits routed the root entry and the ayanamsas
  through `src/nutation.ts` and `src/frame.ts`; calc, window and sky still
  called astronomy-engine's five-term nutation, its rotations of date, its
  sidereal time or its observer functions. They now take the engine's own
  (`src/equator.ts`, new, builds the true and mean ecliptic and equator of
  date on the engine's precession and nutation; calc's topocentric observer is
  astronomy-engine's `terra` reproduced term for term, at the engine's
  sidereal time). The calc round-trip fixture and the techniques' site-parity
  fixtures were generated again on this build.
- `7e721b7`: calc's preregistered comparison rerun on the build of `704cadc`
  (`docs/evidence/calc-api/rc16/`), and `src/calc-bounds.ts` generated from
  the rerun.
- `aba647e`: every other feature's preregistered gates and evidence figures rerun
  on the build after the nutation, each beside its originals (*The gates of
  each feature, rerun*).
- The source commit: the version, the receipts' conventions set that
  names the nutation, the budgets, the CHANGELOG entry, the documentation and
  this directory (*The release commit*).

### The release commit

The source commit:

- sets the version, 0.1.1-rc.16 (`package.json`, `package-lock.json`,
  `ENGINE_VERSION` in `src/types.ts`, TypeDoc's title), names the new entry
  points in `package.json`'s description and in the abstracts of
  `CITATION.cff` and `.zenodo.json`;
- adds the receipts' conventions set that names the nutation, its version
  gates, the rc.15 receipt and their tests (*Receipts*), and moves the index
  of the earlier sets in two tests (`src/house-systems.test.ts`,
  `src/porphyry.test.ts`);
- raises the budgets, each with its reason (*Sizes and budgets*);
- replaces the CHANGELOG's "Unreleased" section, which gathered the branches'
  notes, with one entry for rc.16, and brings the README (the release
  paragraph, the documented entry points, calc's topocentric positions, the
  receipts), `AGENTS.md` and `CONTRIBUTING.md` (the opt-in entry points) and
  `docs/time.md` (the receipts) up to date;
- regenerates the conformance results with the version (*Conformance*), and
  the techniques' site-parity fixtures, whose data are the same bytes and
  whose `meta.engine` now reads 0.1.1-rc.16;
- drops the packed consumer's call a day away before each window cell
  (*Pinned tests whose expectations moved*), and has it import, type-check
  and check `./techniques` and `./sky`;
- names `src/first-millisecond.ts` in `OPT_IN_SOURCE` and its test;
- generates `src/fixtures/calc-roundtrip.json` again, whose receipts now
  record 0.1.1-rc.16;
- cites the new entries' sources in `LICENSING.md` and `NOTICE`, and names
  there the site's modules the techniques entry was adapted from;
- records the failed size and scope gates, the deviation of the techniques
  G1 rerun and the corrected nutation figures in the features' `rc16/`
  READMEs and the nutation's evidence README;
- adds this directory.

No code that computes a position, an angle, an instant or a partition
changes after `704cadc`: in `src/`, `7e721b7` changes calc's bounds table,
`aba647e` two comments in `src/window.ts`, and the release commit the
version, the receipts' conventions and version gates, tests and fixtures.
`tools/dist-compare.mjs` compares the builds, with the chunks' hashed names
and the version string set aside: 42 of the 44 JavaScript files of the source
commit's build are `704cadc`'s byte for byte, and the other two are
`calc.js`, by the bounds table, and `receipt.js`, by the conventions set and
its gates (`results/dist-compare-704cadc.json`). So the measurements taken on
the build of `704cadc` (the calc, window, techniques, houses and sky reruns)
hold for the source commit's build; the plumbing checks and the site-parity
fixtures were run on the source commit's tree itself.

### Conflicts and how each was resolved

Every conflict was in shared files that each branch had changed against its
own base; no source file of the engine conflicted.

- `29679e8` (calc): `CHANGELOG.md`, the branch's "Unreleased" section above
  rc.15's entry; `package.json`, `typedoc.json`, the `./calc` export, build
  entry and entry point beside rc.15's `./timing` and `./vedic`;
  `scripts/module-resolution-smoke.mjs`, rc.15's check from the build's module
  list kept, with calc's checks added; `scripts/verify-packed-consumer.mjs`,
  both sets of checks.
- `670db8a` (window): `scripts/verify-packed-consumer.mjs` and
  `typedoc.json`, both sides; its `CHANGELOG.md`, `README.md`, `package.json`
  and `scripts/module-resolution-smoke.mjs` hunks were placed beside calc's.
  The window's bullets went after calc's under "Unreleased" and the two
  migration lines were joined.
- `6933b1d`: `scripts/verify-packed-consumer.mjs`, both sides.
- `e0833ee` and `f9ae1de`: `CHANGELOG.md`. `f9ae1de` corrects "about 4e-9°"
  to "about 1e-8°" in a Placidus bullet that, on this base, is rc.15's
  released entry; rc.15's entry is left as released, and rc.16's entry
  carries the correction (its *Corrections*).
- `930ef6b` (techniques): `CHANGELOG.md`, `package.json`,
  `scripts/module-resolution-smoke.mjs` and `typedoc.json`, both sides.
- `edb8f2b` (houses and returns): `CHANGELOG.md`, `package.json`,
  `scripts/module-resolution-smoke.mjs`, `scripts/verify-package-contents.mjs`,
  `scripts/verify-packed-consumer.mjs` and `typedoc.json`, both sides.
- `a10faf5` (sky), applied without committing: `package.json`,
  `scripts/module-resolution-smoke.mjs` and
  `scripts/verify-package-contents.mjs`, the sky parts kept and the Chinese
  parts left out; then every Chinese file and hunk removed (*Held back*).
- `219b60f` (sky measurements), applied without committing: `CHANGELOG.md`,
  `NOTICE`, `README.md` and `scripts/verify-package-contents.mjs`, the sky
  parts kept; the six modify/delete conflicts (`docs/chinese.md`,
  `scripts/build-solar-data.py` and `src/chinese/{pillars.test.ts, pillars.ts,
  sun.ts, terms.ts}`) resolved by keeping the files out.
- `88ca0ce` (nutation evidence): `CHANGELOG.md`, the nutation's section after
  the others under "Unreleased". The release commit replaces that section
  with rc.16's entry.

### The Placidus check

`94b9fa2`, the Placidus bisection, came into rc.15 on its own
(`../rc15-20260929/README.md`). Its `src/houses.ts` is byte for byte rc.15's
at `93ebae9`, and `src/placidus-limit.test.ts` at the window branch's tip,
`f703637`, is rc.15's too. The tip's `src/houses.ts` differs from rc.15's in
one comment only: `f9ae1de` measured the band where the iteration does not
settle at about 1e-8° of the polar limit, where rc.15's comment says about
4e-9°. That correction comes in with `4440865`. So Placidus agrees: the
window branch's search relies on the code rc.15 ships.

## The re-cut

The first build of rc.16 had the same commits up to `aba647e`, then its own
source commit `b3c34d4`, the carrier `6815110` of its archive (SHA-256
`f73e55929d5b2daf64e781c078645839e1e83f0ce492989e09b0b569e59fe0bd`, 262,109
bytes), the record of the carrier's gates `d26e6ec`, and a merge of main
(`fab77a7`). None was pushed or published; they are local commits that are not
in this repository, and `artifacts/README.md` lists that archive as a
superseded local build. Its independent review found no blocker, three major
findings, two minor ones and some smaller points. This source commit is that
build's with these fixes; the code that computes is the same, and the archive
differs in `CHANGELOG.md`, `LICENSING.md` and `NOTICE`:

- Preregistered size and scope gates that fail on rc.16 were described as
  "not the branch's question" or "not applicable", and budgets were raised
  after the results without saying so. Techniques G5 and G6, houses gate B
  and the sky's package gate are now recorded as failed, with their numbers,
  in each feature's `rc16/README.md`, here and in the CHANGELOG, and each
  budget raised after the results is described as such (*The gates of each
  feature, rerun*, *Sizes and budgets*).
- Two CHANGELOG figures were the largest at sparse samples, which a denser
  grid exceeds, and a third was placed in the wrong band of latitude. The
  equation of the equinoxes against ERFA's `ee00`, given as 1.5e-5″, the
  largest at the 101 instants of `src/fixtures/nutation-erfa.json`, is
  3.50e-5″ every 0.1 day of TT from 1800 to 2200; IAU 2000B against IAU
  2006/2000A, given as 0.0037″, a longitude's largest difference at 4,001
  instants, is 0.00394″ in Δψ on that grid (in 2192); and Koch's largest
  change, 3.883″, given as one at 66° to 80°, is at 65.75°, while at 66° to
  80° Koch's cusps moved by at most 0.1023″. `tools/nutation-grid.mjs` (with
  `tools/nutation-grid.py`) and `tools/plumbing-by-latitude.mjs` measure them
  (`results/nutation-grid.json`, `results/plumbing-by-latitude.json`), and the
  CHANGELOG, `docs/calc.md` and the nutation's evidence README give each
  figure with the grid it was measured on.
- `LICENSING.md` and `NOTICE` did not cite the new entries' sources. They
  now cite the sky entry's radii, astronomical unit and WGS84 constants, the
  sources and editions of the dignity tables, and calc's frame bias and
  obliquity, and say that calc's bounds and barycentre error are
  measurements against JPL Horizons, not coefficients derived from JPL data;
  the provenance chain names the site's modules the techniques entry was
  adapted from (site commit `67cccac5`), and the paragraph on what the tests
  carry now names ERFA's output, USNO's tables, the NOVAS excerpt and the
  site's outputs, with the terms of each.
- `src/first-millisecond.ts`, which only the sky entry imports, was missing
  from `OPT_IN_SOURCE`, and a test pinned it as the root's; both now name it
  opt-in.
- The packed consumer did not import `./techniques` or `./sky`; it now
  imports both, type-checks them and checks their results (33 sections,
  where it had 31).
- The entries' plumbing tool's births and birth-time windows are labelled
  invented, and one birth, placed on the date and in the city of a
  historical event, is moved to a neutral date and place (the proof's
  verdict and figures are unchanged but for the planetary returns' median);
  `birth-data-names.txt` lists them. The history checks' outputs label the
  birth data they search for opaquely, not by name.
- Smaller corrections: all 192 conformance failures are positions (the text
  said "the other 191"); calc's 107 rows of bounds are 104 measured and 3
  derived; the techniques G1 rerun on rc.16's build is a deviation from the
  preregistration, and says so; and `src/fixtures/calc-roundtrip.json` was
  generated again on the release build, so that its receipts record
  0.1.1-rc.16 (16 lines, nothing else changes).

## Held back: the Chinese-calendar entry

`feature-sky` added two entry points, `@zodiacs/engine/sky` and
`@zodiacs/engine/chinese` (the 24 solar terms and the Four Pillars). The
Chinese entry's apparent Sun is a series fitted to JPL DE430
(`src/chinese/solar-data.ts` on the branch), and no coefficient set derived
from a JPL ephemeris ships until NAIF answers whether such derived
coefficients may be redistributed. It waits for a Sun source that is not
JPL-derived, and rc.16 leaves out all of it:

- source and tests: `src/chinese.ts`, `src/chinese/` (with its fixtures),
  `scripts/build-solar-data.py`;
- the `./chinese` export, build entry, budget, TypeDoc entry and the export
  smoke and packed-consumer checks;
- documentation: `docs/chinese.md`, and the Chinese bullets and lines of the
  CHANGELOG, README, `AGENTS.md` and `CONTRIBUTING.md`; the DE430 and IERS
  paragraphs the branch added to `LICENSING.md` and `NOTICE`;
- evidence claims: the results of the preregistered Chinese gates C1 to C4
  (`c1-skyfield.json`, `c2-swiss.json`, `hko-skyfield.json`, `nutation.json`,
  `true-solar.json`, `usno-seasons-skyfield.json`), the tools that made them
  (`terms-engine.mjs`, `terms_reference.py`, `terms_swiss.py`,
  `make_fixtures.py`), and the C3 part of `published-compare.mjs` and of
  `results/published.json`.

The sky branch's preregistration, `e8e526f`, is carried unchanged: it
preregistered C1 to C4 beside the sky's S1 to S4, and nothing in rc.16 acts on
C1 to C4. `docs/evidence/sky-chinese-2026-09-29/README.md` says what is carried
and what is not. The branch's `logs/` are not carried either: its gates ran on
its own tree, with the Chinese entry, and its test log held a test title from
rc.15's first cut that dated a real person's birthday. The CHANGELOG's rc.16
entry says the entry is held back and why.

## Birth data

The rule is `CONTRIBUTING.md`'s: synthetic data, or a published worked
example about a person who has died, cited where it is used with author,
title, year and page; never a living person's. Every added line of every
commit on this branch was checked, with two tools.

1. `../rc15-20260929/rebuilt/history-check.mjs`, unchanged, searches each
   commit's added lines, the binary files it adds or changes (archives
   decompressed), the paths it adds and its message, and then the whole tree
   of the last commit, for the birth data that rc.15's reviews removed, and
   lists the files that name each published example and whether each file that
   holds its birth data cites it. Its patterns and the examples' birth dates
   are kept outside the repository, because they are the birth data it looks
   for; it prints labels, counts, commits and paths, never a matched line, and
   its labels here are opaque, person A to person G, with the key kept outside
   the repository beside the patterns. `history-check.txt` is its output on
   `93ebae9..ef44477`, the 37 commits up to the carrier, with the changes of
   the commit that brings this version of this file staged: no birth data in
   any commit (the carried archive decompressed and read), in the staged
   changes or in the carrier's tree. The only names it finds are in rc.15's
   records, `../rc15-20260929/`, which name the people whose birth data
   rc.15's reviews removed, and the published examples appear only in files
   that cite them. The source commit held the same check on the 35 commits
   before it and its own changes, with the same result. As positive controls,
   with the same patterns, `history-check-control-first-cut.txt` is its output
   on the history of rc.15's first cut, `b0ddb88..eb58011`, from which the
   techniques, houses and sky branches were cut: birth data in 6 of its 33
   commits (24 lines) and in the tree of `eb58011` (28 lines); and
   `history-check-control-recut.txt` on the re-cut's, `b0ddb88..bcd532c`, from
   which the nutation branch was cut: in 9 of its 46 commits (33 lines) and in
   the tree of `bcd532c` (5 lines). Both histories are local and are not in
   this repository.
2. A broad review aid, run outside the repository because its output holds the
   lines it matches, listed every added line with a year from 1700 to 2029
   beside birth vocabulary or a capitalized pair of words, and every such
   pair, commit by commit and for the staged changes; each hit was read.
   `birth-data-names.txt` lists, names only, the people it found and why each
   may be there: authors, translators, editors and publishers of the works the
   new entries cite, figures of the sky entry's worked examples, a Duke of Lu
   whose reign dates an eclipse in the held-back Chinese part of the sky
   preregistration, and the author of the window evidence's random-number
   generator. The only birth data it found are invented and labelled so, the
   entries' plumbing tool's births and windows among them.

No commit adds a living person's birth data, and none adds a real person's
but the published examples rc.15 already carried (Saunders's charts of
Christopher Reeve, Coretta Scott King and Princess Diana, Estadella's of
Charlie Chaplin and the native of Valens's *Anthologies* IV.9): no commit of
rc.16 adds a line with their birth data, and in the tree each is in files
that cite it (`history-check.txt`, last section).

## The nutation, and what it moved

The nutation is the last feature, so every entry that computes on the
ephemeris was built and measured without it first. What it changes in the
root entry is in `docs/evidence/nutation-2026-09-29/` (its `README.md`,
*Results*), measured on its branch's base, the rc.15 re-cut, whose engine is
rc.15's. On this tree:

- **The root.** `results/root-plumbing.json` reruns that branch's plumbing
  proof (`docs/evidence/nutation-2026-09-29/tools/plumbing.mjs`, unchanged):
  this tree with the series cut to astronomy-engine's five terms and no
  complementary terms gives what the carried rc.15 archive gives, at 520
  synthetic charts on UTC, UT1, TT and a pinned ΔT, within 7.96e-13° (the
  lots), speeds within 1.14e-10° a day, every Saturn-return crossing at the
  same millisecond. With the full series every largest change equals the
  branch's run (`docs/evidence/nutation-2026-09-29/results/plumbing.json`) in
  every figure the two files give: longitudes up to 0.2380″, speeds up to
  0.0726″ a day, Koch cusps up to 3.883″ (at 65.75°), the angles up to 1.622″
  and the lots up to 3.345″ (both at 67.21°, among the 48 charts at 66° to
  80°, where Koch's cusps moved by at most 0.1023″), Saturn-return crossings
  up to 257 s near stations. So nothing else the integration brought reaches
  the root's results. `tools/plumbing-by-latitude.mjs` runs the same workload
  on the same two engines and places each figure
  (`results/plumbing-by-latitude.json`): within 66°, where 432 of the 480
  charts of 1800 to 2200 are, the angles moved by up to 0.4094″, Placidus's
  cusps by up to 0.5165″ and the lots by up to 0.7392″, and Koch's cusps by
  the 3.883″ above; the 40 charts outside 1800 to 2200, within 60°, by up to
  0.2148″, 0.2148″ and 0.3353″. 46 of the 48 charts at 66° to 80° fall back
  from Koch and Placidus to whole signs, on both engines. Both tools were run
  on this tree before the source commit, whose `src/` tree
  `root-plumbing.json` records.
- **The new entries.** `tools/entries-plumbing.mjs` does the same for calc,
  window, sky, techniques, houses and planetary returns: three engines are
  bundled from source, the integrated tree before the nutation (`5e0d00c`),
  this tree with the series cut to five terms, and this tree as it ships; each
  runs the same synthetic workloads in its own process, and every number is
  compared (`results/entries-plumbing.json`). Five terms against `5e0d00c`,
  gated at 1e-9°, 1e-9° a day, 1 ms and 1e-12 relative, with the structure
  identical: pass, over 178,416 values, with longitudes within 2.3e-13°,
  every angle within 6.9e-11° (a sky azimuth, near the zenith), speeds within
  1.2e-10° a day, distances within 3.5e-16 of their size and every instant to
  the millisecond. It was run on this tree before the source commit, whose
  `src/` tree it records. The full series against `5e0d00c`, reported:

  | Entry | What moved | Largest |
  | --- | --- | --- |
  | calc, true-of-date frames | longitude; latitude or declination; speed | 0.1136″; 0.0674″; 0.0554″ a day |
  | calc, mean-of-date, J2000.0 and ICRS frames | longitude and latitude | 3.4e-13°: unchanged |
  | calc, topocentric in those frames | longitude and latitude, as the observer now turns with the engine's sidereal time and nutation | 0.00092″ |
  | calc `houses()` | angles; cusps; ARMC; true obliquity | 0.3211″; 0.8732″ (Koch at 63.4° S); 0.0931″; 0.0561″ |
  | calc `events()` | crossing instants (the true node's slow crossing) | 4,867 ms |
  | window | switch instants; two windows gain a one-millisecond flicker of the true node's house at a cusp, which natalChart confirms | 17 ms |
  | sky | event instants; altitudes; azimuths (a transit near the zenith); planetary hours | 25 ms (the Moon); 0.0606″; 2.45″; 8 ms |
  | techniques | solar returns; lunar returns; void-of-course windows; Davison bodies and angles; composite positions; a return chart's angles, over the return's shift | 2,652 ms; 424 ms; 210 ms; 0.129″ and 0.1441″; 0.1081″; 41″ |
  | houses, fed the engine's sidereal time and obliquity | house positions; co-ascendants; cusp speeds (Koch at 63.4° S) | 0.773″; 0.3045″; 0.0091° a day |
  | planetary returns | return instants (a slow body near a station) | 79.2 s (median 2,327 ms) |

  The houses entry takes its inputs as given: given the same inputs it moves
  by nothing, and its preregistered gates, which take their sidereal times
  and obliquities from their own grids, give the branch's files byte for byte
  (*The gates of each feature, rerun*).

## The gates of each feature, rerun

Each feature's preregistered gates, and the figures its evidence records that
depend on longitudes, angles, sidereal time, ayanamsas or event instants, were
run again on the integrated tree after the nutation, with each feature's own
tools unchanged. The results are beside the originals, in an `rc16/` directory
of each feature's evidence; no preregistration and no original result was
changed. Each directory's README says what moved. A gate is recorded as failed
wherever rc.16 does not meet it as it was preregistered, the size and scope
gates included: rc.16 is not the tree they were written for, but it is the
tree that ships.

| Feature | Rerun | Result | Where |
| --- | --- | --- | --- |
| calc (`docs/evidence/calc-api/`) | the Horizons and ERFA comparison of `PREREGISTRATION.md`, on the build of `704cadc` | all twelve frame checks pass, where the first run failed the four through the nutation (C4, C5a, C9, C10) by up to 0.200″; positions against Horizons unchanged in the frames without the nutation and now the same in the true-of-date frames; of 107 rows of bounds, 104 measured and 3 derived (the barycentric Sun's), 71 measured rows fall, none rises, and the derived do not change | `rc16/` |
| window (`docs/evidence/birth-window/`) | the 1,000-window check of `PREREGISTRATION.md`; the review's second-round checker on its 57 edge windows; the scans behind the bounds (body rates, the obliquity's and the RAMC's rates on the engine's own nutation, the node's jitter and ingresses) | the 1,000 windows pass again, 24,188 sampled transitions all matched, none missed or extra, 1,487,520 millisecond checks without a failure; 87 windows' switch counts differ from the branch's, by the true node's flicker where a cusp passes it and, in five polar Alcabitius windows, by other houses, none in 1972 to 2027; the review's checker passes all 57 of its windows (278 edge checks); each body's bound is at least 1.9856 times its largest rate, the obliquity's 1.92 times (2.41 on the five-term nutation) and the jitter's 3.01 times (2.97); the same 24 of 294 node ingresses are over the budget | `rc16/` |
| techniques (`docs/evidence/techniques-2026-09-29/`) | `measure.mjs`, gates G1 to G7 | G2 42.27 s (was 45.347 s, gate 120 s) and G3 32.047 s and 6.809 s (were 33.226 s and 6.869 s, gates 60 s and 15 s) pass, and G4 and G7 as on the branch; **G1 fails** as on the branch, 6,795 of 6,796, with the site's outputs generated on this build, a deviation from the preregistration, which named the carried rc.15 archive; **G5 fails**: the root's graph is 103,537 bytes, not 95,273, `./techniques` 152,472, over 150,000, and the package 923,282, over the 700,000-byte cap; **G6 fails**: 20 of rc.15's files under `src/` change, 13 of them tests (it failed as run on the branch) | `rc16/` |
| houses and returns (`docs/evidence/houses-extra-2026-09-29/`) | the tools of its *Rerun*: gates P, A, S, F, R and the stations; gate B from the sizes and the tests | P, A, S and F and the stations: the branch's files byte for byte; R passes for every body, the Sun's worst 19.1 s (0.804″ of its motion), the Moon's 1.3 s (0.705″); USNO's March equinoxes within 49.7 s of 210 s; **B fails** (it passed on the branch): the root's graph is 103,537 bytes, not 95,273, `./timing` 123,039, over its 120,000, the package 923,282, over 700,000, and existing tests and results change with the nutation; `./houses`, 13,606 of 15,000, holds | `rc16/` |
| sky (`docs/evidence/sky-chinese-2026-09-29/`) | S1 (skyfield with DE440s), S2 (Swiss Ephemeris, statistics only), S3 (USNO's tables), S4; the package gates from the sizes and the gates on the tree | S1 and S2 fail at the same 192 rises and sets of Uranus in 1950 at 65° as on the branch, largest 11.603 s and 11.609 s (were 11.619 s and 11.625 s); every other body within 4.94 s; S3 fails as on the branch, the same 2 of 467 over 30 s and 3 listed by one side; S4 passes; **the package gate fails** (it passed on the branch): the root's graph, which was not to grow from 95,273 bytes, is 103,537 | `rc16/` |

The nutation branch had no preregistration; its own checks were run on its
base, and the root's plumbing proof above reruns the one that ties them to
this tree.

## Pinned tests whose expectations moved

Each expectation that pins a longitude, an angle, a sidereal time, an
ayanamsa or an instant was checked against the build with the full nutation.
The nutation branch changed the root's (`docs/evidence/nutation-2026-09-29/
README.md`, *Tests whose expectations changed*: the Mercury station of
February 2026, 5.94 s later, the polar-fallback receipt's ascendant, the
Placidus polar-limit latitude, the 1973 rc.14 replay). The integration
changed:

- `src/calc.test.ts`: the true-minus-mean test reads the engine's `tilt()`,
  and a new test places the topocentric observer at `houses()`'s RAMC and its
  geocentric latitude;
- `src/window.test.ts`: the reproduction of the Placidus review moves its
  latitude to 3e-9° below the engine's limit (66.56186193124925°, as
  `src/placidus-limit.test.ts` has it); the workaround for astronomy-engine's
  nutation cache goes;
- `src/sky/riseset.test.ts` and `src/receipt-time-basis.test.ts`: the
  workarounds for astronomy-engine's nutation cache go, the cut sky window and
  the replay now agreeing exactly;
- `src/equator.test.ts`, new: the four frames of date against ERFA's at the
  101 instants of `src/fixtures/nutation-erfa.json`, within 5e-6″;
- regenerated on this build: `src/fixtures/calc-roundtrip.json`
  (`scripts/build-calc-roundtrip.mjs`: true-of-date results by up to 0.119″,
  the houses case's midheaven by 0.061″ and its crossing by 772 ms; the other
  frames by under 2e-7″) and `src/techniques/fixtures/site-parity/`
  (`returns.json` and `void-of-course.json`: solar returns by up to 7.2 s,
  lunar returns by up to 0.59 s, void-of-course windows by up to 0.372 s; the
  other four files the same bytes), with `src/techniques/site-parity.test.ts`
  saying so, and, in the release commit, the site-parity fixtures'
  `meta.engine` and the round-trip receipts' engine version, 0.1.1-rc.16;
- `scripts/root-isolation.test.mjs`: `src/equator.ts` and, in the release
  commit, `src/first-millisecond.ts` are opt-in modules, and `src/frame.ts`
  and `src/nutation.ts` are the root's;
- `src/calc-bounds.ts` and its test, from calc's rerun.

`scripts/verify-packed-consumer.mjs` evaluated a chart a day away before each
window cell, because astronomy-engine reused its nutation within 86.4 ms; the
engine's nutation is computed for each instant, and the release commit drops
that call.

## Receipts

The current conventions set, `NATAL_RECEIPT_CONVENTION_SETS[0]`, is rc.15's
time-basis set with two changes: `nutation`,
`"iau2000b;equation-of-equinoxes-with-two-complementary-terms"`, new, and
`moonPosition`, `"astronomy-engine-geo-moon;no-light-time;no-aberration"`
(the Moon is astronomy-engine's `GeoMoon` turned by the engine's frame, where
rc.15 took its `EclipticGeoMoon`). The codec accepts it from 0.1.1-rc.16 on,
in SemVer order. rc.15's set moves to index 1 and is accepted from rc.15
alone, where rc.15 accepted it from rc.15 on; the older sets keep their
ranges.

`src/fixtures/receipt-rc15.json` is a receipt the carried rc.15 archive
serialized (`make-receipt-rc15.mjs`: the synthetic 1990-06-15 08:30 birth in
New York of the rc.13 and rc.14 fixtures, resolved as rc.15 resolves a local
birth). `src/receipt-nutation.test.ts` checks that it still parses, under
rc.15's set, with rc.15's engine record, and serializes back to the same
bytes; that it is accepted under rc.15 alone; that it replays as the request
it records, on the same time basis, every longitude within 0.3″ of what rc.15
stored and the angles and cusps within 1″; and that the current set is
refused without the nutation, with another nutation or with rc.15's Moon.
`src/receipt-versions.test.ts` and `src/receipt-time-basis.test.ts` give
each set's versions; the rc.8 and earlier sets keep theirs.

## Conformance

`conformance/results/zodiacs-engine.json` was regenerated on this tree with
adapter 0.2.0, then `RESULTS.md` and `results/summary.json`. Totals: 267 pass,
192 fail, 41 unsupported, 0 error of 500; rc.15: 266, 193, 41, 0. One verdict
moves (`conformance-changes.json`): `L1-POS-0041`, the Sun on 1908-05-30, fail
→ pass. The residuals: the ascendant from 0.182″ to 0.019″ at most, the
midheaven from 0.178″ to 0.0081″, the Vertex from 0.285″ to 0.013″, the East
Point from 0.103″ to 0.0068″ and the cusps from 0.489″ to 0.071″; the apparent
longitudes' median from 2.067″ to 2.083″ and maximum from 18.846″ to 18.774″,
latitudes unchanged. All 192 failures are positions (L1), astronomy-engine
against DE441, as rc.15's 193 were.

## Sizes and budgets

`sizes.json` (`sizes.mjs`, rc.15's with each graph's gzip size, level 9,
file by file, and rc.16's budgets read from the checkout) measures the
carried rc.15 archive, the integrated tree before the nutation (`5e0d00c`)
and this tree:

| Entry | rc.15 as carried | before the nutation (`5e0d00c`) | rc.16 | rc.16 beyond the root's graph | Budget | Headroom |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `.` | 97,704 (32,408) | 97,717 (32,422) | 103,537 (34,828) |  | 108,500 | 4.79 % |
| `./calc` |  | 106,779 (34,485) | 113,904 (37,490) | 35,754 (10,675) | 115,000 | 0.96 % |
| `./crossings` | 9,410 (2,768) | 9,410 (2,768) | 9,410 (2,768) | 173 (106) | 10,000 | 6.26 % |
| `./deltat` | 4,968 (1,944) | 4,968 (1,944) | 4,968 (1,944) | 161 (101) | 5,500 | 10.7 % |
| `./geo` | 34,135 (12,459) | 34,659 (12,953) | 34,659 (12,953) | 31,730 (11,858) | 35,000 | 0.98 % |
| `./houses` |  | 13,606 (3,503) | 13,606 (3,503) | 13,606 (3,503) | 15,000 | 10.24 % |
| `./internal` | 58,997 (20,156) | 59,010 (20,164) | 64,830 (22,572) | 305 (160) | 68,000 | 4.88 % |
| `./internal/math` | 18,165 (4,928) | 18,165 (4,928) | 18,165 (4,928) | 1,325 (445) | 20,000 | 10.1 % |
| `./receipt` | 66,200 (22,290) | 66,200 (22,290) | 66,580 (22,374) | 41,969 (11,894) | 70,000 | 5.13 % |
| `./sky` |  | 85,237 (28,477) | 92,109 (31,262) | 16,888 (5,542) | 97,000 | 5.31 % |
| `./techniques` |  | 146,652 (47,904) | 152,472 (50,308) | 62,610 (20,014) | 160,000 | 4.93 % |
| `./timing` | 114,916 (36,305) | 117,219 (37,073) | 123,039 (39,477) | 32,505 (8,851) | 129,000 | 4.84 % |
| `./vedic` | 116,779 (38,359) | 116,792 (38,367) | 122,131 (40,647) | 32,269 (10,353) | 128,000 | 4.8 % |
| `./window` |  | 97,064 (31,809) | 102,590 (34,123) | 33,677 (9,970) | 105,000 | 2.34 % |

Bytes, with the sum of the graph's files each gzipped at level 9 in
parentheses. The root's gzipped graph grows from 32,408 to 34,828 bytes; each
subpath's is in the table. Headroom is each budget over the rc.16 size, as a
percentage of the size, rounded down.

Every budget below was raised after these sizes had been measured, to fit
them, with its reason stated beside it in
`scripts/verify-package-contents.mjs`; each is rc.16's graph with about 5 per
cent over it. Raising a budget does not make a preregistered size gate pass:
techniques G5 fixed `./techniques` at 150,000 bytes and houses gate B
`./timing` at 120,000, and both gates are recorded as failed (*The gates of
each feature, rerun*).

- `.` 100,000 → 108,500: the nutation, 5,794 bytes (`src/nutation.ts`
  4,146 and `src/frame.ts` 2,110, less 508 in `src/ephemeris.ts`, and 46 of
  imports, exports and their use in `src/declination.ts` and
  `src/points.ts`), and 39 bytes of export names (`gastHours`, `tilt`,
  `eclipticOfDate`) that the calc, window and sky entries import from the
  root's shared chunk; `coreByModule` in `sizes.json` gives the split. Before
  the nutation the root had grown by 13 bytes, `gastHours`'s export
  (`5e0d00c`).
- `./internal` 60,000 → 68,000, `./timing` 120,000 → 129,000, `./vedic`
  120,000 → 128,000 and `./techniques` 150,000 (its branch's) → 160,000: the
  nutation in the ephemeris chunk that each loads.
- `./sky` 92,000 (its branch's) → 97,000: the nutation, and the frames of
  date it now takes from `src/equator.ts`, in a chunk shared with `./calc`.
- `./calc` 115,000 and `./window` 105,000, set in `5e0d00c` before the
  nutation, and `./houses` 15,000, its branch's, are not raised.

The package cap was raised from 700,000 to 950,000 bytes in `5e0d00c`, after
the five new entry points had been measured, for them and their documentation
(before the nutation they took the package to 879,777 bytes, 211,434 more than
rc.15 as carried); techniques G5 and houses gate B had required the package to
stay within 700,000 bytes without raising the cap, and fail. rc.16 is 923,282
bytes unpacked in 69 files, 254,939 more than rc.15 as carried and 2.89 per
cent under the cap; `scripts/verify-package-contents.mjs` gives the split of
its growth by kind. The zone histories are rc.15's, 189,144 bytes in 16 files.

## Gates on the tree

`gates.sh`, rc.15's `rebuilt/gates.sh` writing here, ran CI's engine job on
the tree of the source commit before it was made, once on each Node version
(`gates.log`, and the suite's output in `full-tests-<version>.log`):

| Node (npm) | Typecheck | Tests | Build, export smoke, package contents, pack dry run |
| --- | --- | --- | --- |
| 22.22.2 (10.9.7) | pass | 3,706 passed in 79 files | pass |
| 20.19.0 (10.8.2) | pass | 3,705 passed, 1 skipped, in 79 files | pass |
| 24.21.0 (11.19.0) | pass | 3,705 passed, 1 skipped, in 79 files | pass |

On 20.19.0 and 24.21.0 the skipped test is the tzdb 2025c comparison
(`src/geo/zone-history.test.ts`), as in rc.15. `npm run package:contents`
reports 69 files and 923,282 bytes unpacked on each. TypeDoc builds the API
reference with 0 errors and 8 warnings (`typedoc.log`): rc.15's five, a sixth
of the same kind for `CONVENTIONS_RC15`, and two for types of the sky entry
that it does not export, `PlanetaryDayBase` and `SkyWindow`. The archive check
reads commits, so it ran on the carrier (below).

## The archive

`artifacts/zodiacs-engine-0.1.1-rc.16.tgz` is packed from the source commit
`ddbbaa0` and carried by its child `ef44477`: SHA-256
`43a72d30e483d8ff22024e403c4bd0d86d81bb6e1d0ad138f857cd001ab015d8`, 266,934
bytes, 69 files, 923,282 bytes unpacked. It was packed once, after every gate
on the tree had passed: clean clones of `ddbbaa0`, each installed with
`npm ci`, built and packed the same bytes on Node 22.22.2 (npm 10.9.7),
20.19.0 (npm 10.8.2) and 24.21.0 (npm 11.19.0), 69 files each time
(`carrier/pack-source.log`, from `carrier/pack-source.sh`), and the carried
file is the Node 22.22.2 one. Unpacked, it differs from the first build's
archive, `f73e5592…`, in `CHANGELOG.md`, `LICENSING.md` and `NOTICE` alone;
that archive is not carried (*The re-cut*). The carrier's gates rebuild and
repack its source, as CI does, to the same bytes. `artifacts/archives.json`
records it with its source commit, its receipt
`artifacts/zodiacs-engine-0.1.1-rc.16.sha256` names its digest, and
`artifacts/README.md` lists it and lists the first build's archive as a
superseded local build; rc.15's row there now names its carrier, `cbad72c`,
and says it was merged.

## The gates on the carrier

`carrier/carrier-gates.sh` ran each of CI's jobs on the carrier, `ef44477`,
in a clean clone of the repository with full history, with `TMPDIR` outside
the clone and no `package.json` or `node_modules` at or above it. Every job
passes (logs in `carrier/`):

| Job | Node (npm) | Result | Log |
| --- | --- | --- | --- |
| engine: npm ci, typecheck, tests, build, export smoke, package contents, pack dry run, archive check | 22.22.2 (10.9.7) | 3,705 tests passed, 1 skipped, in 79 files; the other steps pass; the archive check as below | `engine-v22.22.2.log` |
| engine | 20.19.0 (10.8.2) | 3,704 passed, 2 skipped, in 79 files; the other steps pass | `engine-v20.19.0.log` |
| engine | 24.21.0 (11.19.0) | 3,704 passed, 2 skipped, in 79 files; the other steps pass (npm warns that esbuild's two install scripts are not covered by `allowScripts`) | `engine-v24.21.0.log` |
| archives: the archive check with `--rebuild-all` | 22.22.2 (10.9.7) | a rebuild of HEAD, and of each of the 11 recorded archives from its source commit, byte-identical to the recorded archive | `archives-v22.22.2.log` |
| pack: npm ci, build, `npm pack --ignore-scripts` | 22.22.2 (10.9.7) | byte-identical to the carried archive (`cmp`) | `pack-v22.22.2.log` |
| packed consumer, on the carried archive itself | 20.19.0 (10.8.2), 22.7.0 (10.8.2), 22.22.2 (10.9.7), 24.21.0 (11.19.0) | all 33 sections and the types pass on each version, `./techniques` and `./sky` among them, on the archive of SHA-256 `43a72d30…` | `consumer-v*.log` |
| conformance: npm ci, build, self-test, vectors, verdicts, `RESULTS.md` | 22.22.2 (10.9.7) | self-test 7 of 7; 500 vectors conform; 267 pass, 192 fail, 41 unsupported, 0 error, every verdict as committed; `RESULTS.md` and `results/summary.json` current | `conformance-v22.22.2.log` |
| conformance generators | Python 3.11.15, pyerfa 2.0.1.5, numpy 2.4.6 | L1, L2 and L3 rebuilt from their sources (tzdata and tzcode 2025c downloaded from IANA, digests checked) byte-identical to the committed vectors | `generators-v22.22.2.log` |
| atlas: checks and self-test, nothing installed | 22.22.2 (10.9.7) | all checks pass; self-test 26 of 26 | `atlas-v22.22.2.log` |

In a clean clone the tests run before the build, as in CI, so the test in
`scripts/root-isolation.test.mjs` that checks the checkout's own build is
skipped (it ran on the tree before the source commit, where a build was
present, *Gates on the tree*), and on 20.19.0 and 24.21.0 so is the tzdb
2025c comparison.

On each engine run the archive check found
`artifacts/zodiacs-engine-0.1.1-rc.16.tgz` byte-identical to a rebuild of
HEAD, and the 11 recorded archives (10 carried, 1 superseded) and their
receipts holding only their recorded bytes across 124 commits, each bound to
its source commit. With `--rebuild-all` each of the 11 was also rebuilt from
its source commit on Node 22.22.2 and matched its recorded bytes, rc.11's
superseded first packing and rc.16's, from `ddbbaa0`, included. The packed
consumer ran on the carried file, where CI's runs on the pack job's output;
the pack job shows the two are the same bytes. The generators' Python was a
virtual environment with the two libraries at the versions CI pins.

## What is not established

- The feature branches were reviewed on their own bases. This integration,
  the nutation's effect on each entry and rc.16 as a whole were reviewed
  once, independently, on the first build (*The re-cut*); the fixes in this
  source commit have not been reviewed.
- The rerun figures are sample maxima over their preregistered samples, as
  the originals were; none is a bound beyond what was measured.
- Swiss Ephemeris 2.10.03 (pyswisseph) was an instrument for the houses and
  sky gates; only statistics are committed, and no constant, tolerance or
  expectation was set from it.
- The window's rate bounds, jitter bound and the 1,000-window check are
  sampled, not proven, as on the branch.
- The Chinese-calendar entry is not in rc.16; nothing here measures it.
- The review's own 300 windows and its first checker (`check.mjs`) are not in
  this repository and were not run again; its second-round checker was, on
  the 57 windows the repository keeps.
- The window's run times in the README (a 10-minute window about 2 ms, a day
  about 0.23 s) are the branch's; the reruns here ran on a machine shared with
  other jobs, and their times are not comparable.
- calc's comparison reads the Horizons responses its branch committed
  (fetched 2026-09-28), not fetched again; USNO's rise and set tables were
  fetched again on 2026-09-30.
- No build of the Zodiacs site measured its engine chunk on rc.16; the
  nutation branch's stand-in is the only figure.
- CI has not run this candidate on GitHub Actions; the same scripts ran here.
- No npm publication, merge, push or site adoption is represented here, and
  the reviews are AI-assisted, not human approval.

## Reproduction

From a source checkout of the source commit, with Node 20.19.0, 22.7.0 or
later, after `npm ci` and `npm run build`:

```sh
node docs/evidence/rc16-20260930/sizes.mjs rc15=<rc.15 package> pre-nutation=<5e0d00c built and packed> rc16=. > sizes.json
node docs/evidence/nutation-2026-09-29/tools/plumbing.mjs docs/evidence/rc16-20260930/results/root-plumbing.json
node docs/evidence/rc16-20260930/tools/entries-plumbing.mjs docs/evidence/rc16-20260930/results/entries-plumbing.json
node docs/evidence/rc16-20260930/tools/plumbing-by-latitude.mjs docs/evidence/rc16-20260930/results/plumbing-by-latitude.json
node docs/evidence/rc16-20260930/tools/nutation-grid.mjs <Python with pyerfa 2.0.1.5> docs/evidence/rc16-20260930/results/nutation-grid.json
node scripts/build-calc-roundtrip.mjs
node docs/evidence/rc16-20260930/tools/window-rates.mjs
git show 93ebae9:conformance/results/zodiacs-engine.json > rc15.json
node docs/evidence/rc15-20260929/conformance-changes.mjs rc15.json conformance/results/zodiacs-engine.json conformance-changes.json
node docs/evidence/rc16-20260930/make-receipt-rc15.mjs > src/fixtures/receipt-rc15.json && echo >> src/fixtures/receipt-rc15.json
node docs/evidence/rc15-20260929/rebuilt/history-check.mjs 93ebae9..HEAD <patterns file> <examples file>
TMPDIR=<tmp> sh docs/evidence/rc16-20260930/gates.sh "$PWD" <directory of node and npm> <scratch directory>
```

`<rc.15 package>` is the carried rc.15 archive unpacked; `plumbing.mjs`,
`plumbing-by-latitude.mjs`, `entries-plumbing.mjs` and `make-receipt-rc15.mjs`
unpack it themselves, and `entries-plumbing.mjs` reads `5e0d00c` from git. The
history check's two input files are not committed, because they hold the birth
data it looks for; the script's header gives their formats. Each feature's
rerun is described, with its commands, in the `rc16/` directory of its
evidence.

The source commit packed from clean clones, and the carrier's gates, one job
and one Node version per call, each in a clean clone of `<repository>`:

```sh
TMPDIR=<tmp> sh docs/evidence/rc16-20260930/carrier/pack-source.sh <repository> <source commit> <node 22.22.2 bin> <node 20.19.0 bin> <node 24.21.0 bin>
TMPDIR=<tmp> sh docs/evidence/rc16-20260930/carrier/carrier-gates.sh <job> <repository> <carrier commit> <work directory> <directory of node and npm>
```

The jobs are `engine`, `archives`, `pack`, `consumer`, `conformance`, `atlas`
and `generators` (with `PYTHON` naming a Python that has pyerfa 2.0.1.5 and
numpy 2.4.6).
