# 1.1.0: 1.1.0-rc.13 with the version changed

The release cut on 2026-11-16 from 1.1.0-rc.13 (merged in pull request
101). On 2026-11-16 the owner answered, in writing, the question "Do you
accept shipping the NASA DE440 data in 1.1.0?" with "Yes. I delegate these
decisions to you.", the acceptance `LICENSING.md` required before
publication. The maintainer approved the size budgets rc.12 raised the same
day, under that delegation. Nothing here was tagged or published.

To publish: run the Release workflow from `main` with `version` 1.1.0 and
`tag` latest, not the workflow's default `next`, so that `npm install
@zodiacs/engine`, as the README gives it, installs this release.

Machine: one Linux x86-64 host, Node 22.23.4 with npm 10.9.9.

## What changed against 1.1.0-rc.13

- The version string, 1.1.0-rc.13 to 1.1.0: `package.json`,
  `package-lock.json`, `ENGINE_VERSION` in `src/types.ts`, `typedoc.json`,
  the two tests that hold it, and in `src/fixtures/calc-roundtrip.json` the
  30 places that hold it.
- Packed documents: `CHANGELOG.md` (the 1.1.0 entry), `README.md` (the
  version line, the install section, the list of drafts, the unpacked size,
  the evidence folders) and `LICENSING.md` (the owner's acceptance of the
  DE440 pack, and the versions named in its note on the licence field).
  `LICENSE` and `NOTICE` are rc.13's byte for byte.
- `scripts/verify-package-contents.mjs`: a comment recording this release's
  size. No budget and not the cap.
- `conformance/`: run again on Node 22.22.2 (`run.mjs --out` for both
  engine runs, then `report.mjs`); the version alone changes in
  `RESULTS.md`, `results/summary.json`, `results/zodiacs-engine.json` and
  `results/zodiacs-engine-astronomy-engine.json`.

## The build against rc.13's

`distcmp.py` lists every file of a `dist/` with its SHA-256, after naming each
hashed chunk file `chunk-H` (the bundler names chunks by their content, so the
version string renames the chunks that hold it) and, on the 1.1.0 side,
writing `"1.1.0-rc.13"` for `"1.1.0"`. On the `dist/` of rc.13's carried
archive and of this tree's pack: `results/dist-vs-rc13.txt`, 92 files each,
EQUAL. So the code is rc.13's but for the version string.

## Gates on this tree, Node 22.23.4

- `npm run typecheck`: passed (`results/typecheck.log`).
- `npm test`, run after `npm run build` (three tests of the root's
  isolation and the lite entry skip without `dist/`): 4,308 passed, 4
  skipped, as rc.13's (`results/test.log`).
- `npm run exports:smoke`, `npm run api:check`, `npm run package:contents`
  (98 files, 4,581,449 bytes unpacked, 1,261,897 beside the pack, of the cap
  1,265,000): passed (`results/*.log`).
- The packed consumer on this tree's pack: passed
  (`results/consumer-v22.23.4.log`).
- Conformance, after the results were regenerated, its run and report on
  Node 22.22.2: every verdict matches the committed results, and
  `RESULTS.md` and `results/summary.json` are current
  (`results/conformance.log`).
- Atlas: passed (`results/atlas.log`).
- The archive-binding check needs full history and the carried archive; it
  runs in CI and on the carrier.

## The archive and its carrier

From a clean tree of the source commit `2496c28` (`git archive`, `npm ci`,
`npm run build`, `npm pack --ignore-scripts`) on Node 22.23.4:
`zodiacs-engine-1.1.0.tgz`, SHA-256
`4e53cda9bd6ccb5f5581c2a9af2f2ae4010af2599f411ac5220425e0932e41ac`,
2,726,321 bytes, 98 files, the same bytes as the pack of the working
checkout. It was carried in `d82d241` after every CI job had passed on the
source commit (CI run 43829378013 and its companion workflows, 28 check
runs).

`results/archive-binding.log`: `node scripts/verify-archive-binding.mjs` on
the carrier, full history, `TMPDIR` outside the checkout. The carried
archive is byte-identical to a rebuild of the carrier, and 29 recorded
archives (25 carried, 4 superseded) hold only their recorded bytes across
396 commits, each bound to its source commit. CI runs the check again, with
`--rebuild-all`, on the carrier.
