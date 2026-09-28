# 0.1.1-rc.14 checks, 2026-09-28

rc.14 answers two independent reviews. The first reviewed rc.13 and made three
major, five minor and three informational findings. The second reviewed a first
local build of rc.14 and found one blocker and four minor issues. rc.13's
commits (`f05ea02`, `4eee700`) and its archive (`12db9dce…`) are unchanged.
Each finding below says what changed and which file here shows it.
`validation.json` gathers the results; every figure in it is read from these
files. Local paths in the outputs are shortened to `<checkout>`, `<work>` and
`<tmp>`.

## The archive

`artifacts/zodiacs-engine-0.1.1-rc.14.tgz` is carried by the commit after the
one that adds this directory: SHA-256
`d3106eb39fcad0b0cee1ad9010c5b44c01acb8fc3a1bac28a84abf66bacee5e4`, 86,867
bytes, 30 files. It was packed on Node 22.22.2 (npm 10.9.7). A second clean
build and pack, and clean builds and packs on Node 20.19.0 (npm 10.8.2) and
24.21.0 (npm 11.19.0), gave the same bytes (`pack.json`, `second-pack.json`,
`pack-determinism.log`).

## The first rc.14 build, superseded before publication

A first build of rc.14, SHA-256
`5ed5ca1eebeb5a918ca0e37d80df78669a68c15af6cec6d33c9c8a590f683a02` (85,104
bytes, 30 files), was packed from `74a4471` and carried locally in `cca9f44`.
It was never pushed, published or cited anywhere public. Its review found:

- a blocker: it packed LICENSING.md from before main's conformance section, so
  merging main, as the release must, changed a packed file under the same
  version, and the archive check would fail on the merge;
- three ways past the archive check;
- the chart's Sun flagged out of bounds far from J2000, at 1,407 of the 7,994
  solstices in `EPHEMERIS_SPAN` (none in rc.13);
- NOTICE, LICENSING.md and the README naming the wrong file for the Table S15
  values.

Since that build was never published, rc.14 was rebuilt rather than versioned
anew. `cca9f44` was dropped, `74a4471` stays as the base of the fixes, main
(`8c4946b`) was merged into it in `8c3d94f`, and the fixes and this archive
follow. The first build's bytes are in no commit of this history, so the
archive check has nothing to record for them.

## Findings of the rc.13 review

### 1. Supported Node versions (major)

`engines` said `>=18`. astronomy-engine 2.1.19 ships ES modules in a package
without `"type": "module"`, and plain Node loads them as ES modules only from
20.19.0 and 22.7.0. `package.json` now says `"^20.19.0 || >=22.7.0"`, the
README gives the reason and says bundlers are unaffected, CI installs the
packed archive in a clean consumer on 20.19.0, 22.7.0, 22 and 24, and the
consumer check refuses an older runtime and says why.

- `node-support.log`: a plain `import` of the packed archive fails with "Named
  export 'Body' not found" on 18.20.8, 20.18.3, 21.7.3 and 22.6.0, and loads
  on 20.19.0, 22.7.0 (with a `MODULE_TYPELESS_PACKAGE_JSON` warning), 22.22.2
  and 24.21.0.
- `packed-consumer-matrix.json`: the full consumer check (types and 25
  behaviour groups) passed on 20.19.0, 22.7.0, 22.22.2 and 24.21.0 against the
  same archive; `packed-consumer.json` is the 22.22.2 run in full.
- Node 18.20.8, 20.18.3, 20.19.0, 22.6.0 and 22.7.0 were downloaded from
  nodejs.org and checked against its `SHASUMS256.txt`; 21.7.3, 22.22.2 and
  24.21.0 are the ones rc.13 used.

### 2. Archive binding (major)

`scripts/verify-archive-binding.mjs` works from a manifest,
`artifacts/archives.json`, which records each archive's version, digest, size,
file count and source commit. It reads every commit reachable from HEAD (`git
rev-list HEAD`, then each commit's tree), so no history simplification can
hide a side branch. rc.11's first packing, `13d637db…`, is allowed only in
`00bdae7`. Every carried version's receipt must name its recorded bytes. Each
archive is bound to its source commit: that commit is in history and names the
version, the commit that introduces the archive is the source commit or a
child of it, and the packed `package.json`, README, CHANGELOG, LICENSE,
LICENSING.md and NOTICE are byte-identical to the source commit's.
`--rebuild-all` rebuilds every archive from its source commit in a temporary
worktree; a second CI job runs it. The second review's fixes to this check are
under M1 and B1 below.

- `review-synthetic.log`: the first review's two synthetic repositories,
  copied and given one commit that records the manifest. The rc.13 check
  passes both. The rc.14 check fails both: it names the side-branch repack
  (`e1510363…` in `eabd776`), the 0.0.2 archive carried and removed on another
  side branch, and the restored `13d637db…`, besides what does not fit the
  manifest in those synthetic trees, such as an archive that is not a tar file.
- `archive-binding.log`: the default check on Node 20.19.0, 22.22.2 and
  24.21.0 before rc.14's archive is committed, so its rebuild is skipped: 8
  recorded archives across 45 commits.
- `archive-rebuilds.log`: `--rebuild-all` rebuilt all eight recorded archives
  from their source commits, rc.11's superseded packing included, byte for
  byte.

### 3. The Sun's exemption (major)

rc.13 said the Sun defines the bound and so is never beyond it. That is wrong.

- `sun-solstices.json`: computed with ERFA (IAU 2006/2000A, the Earth from
  `erfa.epv00`), the real Sun is beyond the true obliquity at 402 of the 800
  solstices from 1800 to 2199, by up to 1.09″. DE440s agrees within 0.008″
  over 1850–2149, where it has 300 of 600, by up to 1.09″.
- The engine's margin is beyond at 400 of the 800, by up to 1.35″, and has
  the real sign at only 404. At the solstices its solar latitude averages
  −1.12″ in 1800–1899 and +1.12″ in 2100–2199; the real Sun's averages zero.

The exemption is documented as a convention, because the engine's solar
declination error is larger than the effect. The CHANGELOG's rc.13 entry, the
README and the test comment are corrected. The 2024 June and 1970 December
solstices in the tests are the two examples in `sun-solstices.json`: the real
Sun 0.59″ inside and 0.05″ beyond, the engine 0.19″ and 0.21″ beyond. Which
rows it covers changed again under M2 below.

### 4. The margin, and the obliquity (minor)

(a) Each row has `boundMarginArcsec`. `declination-truth.json` compares the
engine with DE440s at 20,000 seeded instants from 1850 to 2150. The largest
declination errors, which the README tabulates, run from 2.7″ (Sun) to 21.6″
(Saturn). In that sample the engine's margin and DE440s's had opposite signs
only where the engine's margin was smaller than the body's largest error: at
most 16.0″, for Uranus. The review's three wrong-sign examples are reproduced
there: at their instants the engine puts Mars and Venus 1.57″ and 1.86″ inside
the bound where DE440s has them 1.05″ and 1.24″ beyond, and Mercury 2.09″
beyond where DE440s has it 1.40″ inside.

(b) `trueObliquity` is documented as astronomy-engine's five-term truncation
of IAU 2000B. `declination-truth.json` measures it against ERFA's `obl06` plus
`nut00b` (85.6 mas at most) and plus `nut06a` (85.4 mas).

### 5. Exact separations (minor)

`src/declination.test.ts` checks the review's cases, (−1e-20, 0) → 1e-20 and
(−0.1, 0.2) → 0.30000000000000004, and 3,000 random pairs of every scale
against BigInt rationals. The packed consumer checks the first two.

### 6. The rc.13 migration note (minor)

Reworded with the real bound, about 2⁻⁴⁴°. `orb-difference.json`: over 200,000
random pairs the largest difference between rc.12's and rc.14's orbs is 2⁻⁴⁵°,
and the review's example (Moon 331.026, Sun 103.38600000000001, 132.36°) is
orb 0 in rc.12 and 2⁻⁴⁶° in rc.13 and rc.14.

### 7. The ephemeris span (minor)

`EPHEMERIS_SPAN` is astronomy-engine's own tabulated range, TT J2000 ± 730,000
days, beyond which its source calls the computation "super slow".
`far-dates.json`: rc.13 took more than 20 s for a position on −30000-06-01 and
on 30000-06-01, and put the Sun 32.5° and 29.3° off the ecliptic; rc.14
refuses both in about a millisecond, and still evaluates the instants just
inside the span. `src/ephemeris-span.test.ts` covers every entry point and a
pinned ΔT clock.

### 8. Naming, and the reference URL (minor)

The shipped CHANGELOG no longer names the separate earlier package's npm
package, and `npm run package:contents` fails if any packed file does. TypeDoc
canonical URLs point to https://zodiacs.org/developers/engine/reference/.

### 9–11. Informational

- Labels: the rule is stated in UTF-16 code units, with `trim`'s white space,
  C0 controls and DEL rejected, and C1 controls, U+200B and lone surrogates
  accepted. The CHANGELOG records rc.13's message change.
- `performance.json`, fastest of 63 runs per build on a shared four-core
  machine: in the review's worst case `findConfiguredAspects` took 1.72 s in
  rc.14 and 0.19 s in rc.12, and `findDeclinationAspects` 0.47 s and 0.07 s.
  The second review measured 1.86 s and 0.48 s for rc.14 on the same
  workload; the CHANGELOG gives both. An ordinary chart's configured aspects
  and declinations took under 0.3 ms each.
- Licence: `MIT AND CC-BY-4.0`. `package-contents.log` shows the check that
  `package.json`, LICENSING.md, NOTICE and the README agree, and the packed
  consumer checks the installed metadata.

## Findings of the review of the first rc.14 build

### B1. The merge of main (blocker)

main (`8c4946b`, the conformance suite) adds a section to LICENSING.md, which
is packed. The first build predated it, so a merge of main changed a packed
file under a version already carried. The default check rebuilds the checkout
and so failed on such a merge; `--rebuild-all` rebuilt only source commits and
passed. Now:

- main is merged first (`8c3d94f`, LICENSING.md keeping both rc.14's licence
  statement and main's section), and the archive is built from a source commit
  that contains the merge;
- both modes rebuild a clean worktree of HEAD, so `--rebuild-all` cannot pass
  where the default fails.

`b1-replay.log` (`b1-replay.sh`) replays the blocker on real history in a
throwaway clone: the first build carried on `74a4471`, then main merged. Both
modes fail on HEAD's rebuild, whose LICENSING.md differs (it packs to
`861e9000…`, 85,298 bytes, as the review found), while every recorded archive,
the first build included, still rebuilds from its source commit.
`scripts/verify-archive-binding.test.mjs` has the same case on a synthetic
package that npm packs.

### M1. Three ways past the archive check (minor)

- Manifest edits: the check trusted `archives.json` as it stood at HEAD, so a
  rewritten manifest could whitelist replaced bytes. The manifest is now
  append-only: every committed version of it must be a prefix of HEAD's, and
  each commit's must extend its parents'. Superseded entries are pinned in the
  script, and a manifest cannot add one.
- Symbolic links: `artifacts/` could be a symbolic link to other bytes in some
  commit, or at HEAD, restored later by a merge. In every commit, `artifacts/`,
  where present, must now be a real directory holding only regular files named
  as archives, receipts, `archives.json` or `README.md`.
- The working tree: the check read HEAD's files from disk. It now reads git
  objects only, and rebuilds HEAD in a clean worktree. An archive that HEAD
  does not hold fails even when it is on disk, and uncommitted changes neither
  pass nor fail the check.

The README and `artifacts/README.md` now state exactly what the check
guarantees, and that it cannot detect history rewritten before CI sees it and
needs merge commits (a squash or rebase merge drops the source commits).

- `review-binding-attacks.log`: the review's ten synthetic cases
  (`review-binding-attacks.mjs`), run against this check. It refuses all eight
  attacks; the clean baseline and case 4, a dirty working tree over a correct
  HEAD, pass, as they should. The review's case 5 committed through a helper
  that ran `git add -A`, which added its "untracked" archive back; this copy
  commits without it, and the check fails the case.
- `scripts/verify-archive-binding.test.mjs`: 13 cases, among them each of the
  review's bypasses and the blocker, run in `npm test`.

### M2. The chart's Sun far from J2000 (minor)

The first build exempted a `Sun` row only within 0.001° of the ecliptic. The
engine's own solar latitude exceeds that at most solstices far from J2000 (the
longest run of years in which both stay within it is 1641 to 2413), reaching
−68.3″ at the June solstice of year 2 and +25.8″ at that of 3902, while the
real Sun's stays within about 1.2″. `chartDeclinations`
now exempts the chart's own Sun at any latitude, as rc.13 did; the latitude
rule applies to rows supplied to `declinationsForBodies`.

- `sun-span.json`: at the engine's own 7,994 solstices from year 1 to 3997,
  its solar latitude exceeds 3.6″ at 5,402, with a positive margin at 1,407.
  rc.13 flags none of them, the first rc.14 build all 1,407, and this build
  none.
- `src/declination.test.ts` checks 2600-06-21T00:50:56Z, the June solstice of
  year 2 and that of 3902: the chart's Sun is not flagged, while the same rows
  given to `declinationsForBodies` are flagged wherever the margin is positive.

### M4. The Table S15 values' file (minor)

NOTICE, LICENSING.md and the README said the values are in `dist/deltat.js`,
a 161-byte re-export. They now say the package's ΔT module, exported as
`@zodiacs/engine/deltat`, is in a shared chunk under `dist/` that
`dist/deltat.js` re-exports. `npm run package:contents` checks that exactly one
packed chunk holds the model and that `dist/deltat.js` re-exports it, without
naming the chunk's hashed file name.

### Informational

- The earlier CHANGELOG entries now name pull request #5 of
  github.com/ZodiacsOfficial/sdk, which a reader can check.
- The CHANGELOG's timings give the measured range, 1.7 s to 1.9 s.
- The README and `artifacts/README.md` say to merge with merge commits.
- The TypeDoc canonical URL is unchanged; the site serves it.

## Gates

| Gate | Result | File |
| --- | --- | --- |
| Typecheck, Node 22.22.2, 20.19.0, 24.21.0 | pass | `typecheck.log`, `test-matrix.log` |
| Tests, Node 22.22.2, 20.19.0, 24.21.0 | 2,677 passed in 34 files, each | `full-tests.log`, `test-matrix.log` |
| New and changed tests on earlier sources | fail as they should: 27 of 59 on rc.13's, 11 of 38 on the first rc.14 build's | `pre-fix-failures.log` |
| Build, export smoke, package contents, pack dry run | pass | `build.log`, `exports.log`, `package-contents.log`, `pack-dry-run.log` |
| Pack determinism (Node 20.19.0, 22.22.2 twice, 24.21.0) | identical | `pack-determinism.log` |
| Packed consumer (Node 20.19.0, 22.7.0, 22.22.2, 24.21.0) | pass | `packed-consumer-matrix.json` |
| Plain import on unsupported and supported Node | fails and loads as documented | `node-support.log` |
| Archive binding, default (Node 20.19.0, 22.22.2, 24.21.0) | pass | `archive-binding.log` |
| Archive binding, `--rebuild-all` | 8 of 8 identical | `archive-rebuilds.log` |
| The first review's synthetic repositories | rc.13's check passes both, this one fails both | `review-synthetic.log` |
| The second review's attacks | all 8 refused | `review-binding-attacks.log` |
| The blocker replayed on real history | both modes fail, as they must | `b1-replay.log` |
| Exact rc.10 compatibility | 571 of 571 | `compatibility.json` |
| Exact oracle (rc.13's script) | 53,168 cases, 0 mismatches | `exact-oracle.json` |
| Independent progression mapping | 204 cases, within 1 ms | `progression-independent.json` |
| The chart's Sun at every solstice in the span | never flagged | `sun-span.json` |
| Site adapter parity (site `f2bd0dd`) | 1,020 of 1,020 rows exact | `site-adoption-parity.json` |
| Conformance: self-test, vectors, verdicts, RESULTS.md | 7 of 7; 500 conform; 232 pass, 222 fail, 46 unsupported, as committed; current | `conformance.log` |

The same gates are rerun on the carrier commit from a clean clone, and
`conformance/results/` is regenerated for rc.14 in the commit after it.

## What is not established

- The DE440s declination errors are maxima of a seeded sample, not bounds, and
  cover 1850–2150 only.
- The Sun's exemption is a convention. The engine cannot say whether the real
  Sun is beyond the bound at a given solstice.
- `EPHEMERIS_SPAN` is where astronomy-engine evaluates at all, not where it is
  accurate; accuracy was compared only within `REFERENCE_SPAN`.
- The archive check cannot detect history rewritten before CI sees it, and
  needs merge commits.
- The physical 0.01″ declination target remains unmet.
- The CI jobs added in rc.14 (the packed consumer on each runtime,
  `--rebuild-all`) have run here with the same scripts, not yet on GitHub
  Actions.
- Timings come from a shared machine; the ratios between versions are more
  telling than the absolute figures.
- No npm publication, merge, push or site adoption is represented here, and
  the reviews are AI-assisted, not human approval.
- No Swiss Ephemeris code, data or output was used. ERFA and DE440s are the
  references, and only statistics and a few examples are committed.

## Reproduction

From a source checkout, with Node 20.19.0, 22.7.0 or later:

```sh
npm ci
npm run typecheck && npm test && npm run build
npm run exports:smoke && npm run package:contents && npm run pack:dry-run
npm run archive:binding
node scripts/verify-archive-binding.mjs --rebuild-all
mkdir -p "$PWD/../pack" && npm pack --ignore-scripts --pack-destination "$PWD/../pack"
TMPDIR=/a/directory/without/node_modules/above \
  npm run consumer:smoke -- "$PWD/../pack/zodiacs-engine-0.1.1-rc.14.tgz"
```

The comparisons need Python 3 with numpy, pyerfa and jplephem, and JPL's
`de440s.bsp` (SHA-256
`c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`):

```sh
python docs/evidence/rc14-20260928/sun-solstices.py dist/index.js de440s.bsp sun-solstices.json
python docs/evidence/rc14-20260928/declination-truth.py dist/index.js de440s.bsp declination-truth.json
```

`performance.mjs`, `far-dates.mjs` and `sun-span.mjs` take `<label>=<dist/index.js>`
for each build to compare, `orb-difference.mjs` two builds' `dist/index.js`,
`node-support.sh` an archive and a list of Node `bin` directories,
`review-synthetic.mjs` the first review's directory and this checkout,
`review-binding-attacks.mjs` this checkout's check and a scratch directory, and
`b1-replay.sh` this checkout and the first build's archive.
