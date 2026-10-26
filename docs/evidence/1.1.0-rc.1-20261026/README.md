# 1.1.0-rc.1, 2026-10-26

The first candidate for 1.1.0, on 1.0.0 (main at `4771fa6`, the merge of
zodiacs-org/engine#70). Natal receipts name their conventions as ids of the
Zodiacs conventions registry, which zodiacs.org publishes at
`/developers/conventions/` (its R44), and a new entry point,
`@zodiacs/engine/conventions`, gives those ids. It is not to be published on
npm until the owner approves it. Times are Asia/Bangkok.

## What changes

- **A new conventions set.** `createNatalEnvelope` writes 1.0.0's set with
  `conventionIds: "zodiacs-conventions-registry;sorted-unique;in-receipt"`,
  and the receipt gains `conventionIds`: every id the receipt names, sorted,
  each once: each conventions and coverage field's key and value, the
  requested and actual house systems, why there are no houses, each flag,
  the reference, the instant's scale and the ephemeris. That is the rule of
  the site's registry tests (`natalReceiptIds` in zodiacs-org/site
  `tests/conventions-registry.test.ts`): on 57 synthetic receipts, every
  house system at four latitudes and charts untimed, without a place,
  flagged and on TT and UT1, it gives the same ids (`results/site-rule.txt`,
  `tools/site-rule.mjs`). docs/versioning.md lets a minor release start to write a new
  set; a record's fields change only with one.
- **A required feature.** An envelope of the new set requires
  `convention-ids`. Every release reads an envelope's features before its
  receipt's fields, so an earlier one refuses the record as
  `unsupported_feature`, as docs/versioning.md promises. With the field alone
  it would say `invalid_shape`, because the receipt's fields are checked
  before its set (`results/earlier-readers.json`, below).
- **The codec.** It requires the ids under the new set, exactly as
  `natalConventionIds` derives them from the receipt's own fields, and the
  feature with them; it refuses either under any other set. Each set is
  accepted from the versions that can have written it: 1.0.0's from
  0.1.1-rc.16 and before 1.1.0-rc.1, in SemVer order, where 1.0.0 accepted
  it from 0.1.1-rc.16 on; the new one from 1.1.0-rc.1.
- **`@zodiacs/engine/conventions`**: `natalConventionIds`, `conventionId`,
  `parseConventionId`, `conventionAddress` and `CONVENTIONS_REGISTRY`. It
  imports no other module, and the root does not import it.
- **The version**, 1.1.0-rc.1, in `package.json`, the lockfile,
  `ENGINE_VERSION` and `typedoc.json`; the calc round-trip fixture and the
  conformance results name it (below).

## Checks on the tree before the source commit

Each script names its command; each log shortens local paths.

- `gates.sh`, CI's engine job on Node 22.22.2, 20.19.0 and 24.21.0
  (darwin-arm64, an Apple M4): typecheck, the full suite, build, export
  smoke, the API check, package contents and the pack dry run
  (`gates.log`, `full-tests-*.log`). Every step passed but the suite, which
  failed the 4 tests that fail on arm64 in 1.0.0's record too, and only
  those: the calc round trip's case that two tests replay, and the two
  site-parity checks of returns and void-of-course windows. 3,877 of 3,881
  tests passed on Node 22.22.2, and 3,876 with 1 skipped on Node 20.19.0
  and 24.21.0; 1.0.0 had 3,853. CI runs the suite on x86-64, where the pins
  were taken.
- `tree-jobs.sh`, CI's other jobs (`tree-jobs.log`): the build and the pack
  on Node 22.22.2, the packed-consumer check on that pack with Node
  20.19.0, 22.7.0, 22.22.2 and 24.21.0, which now also checks the new entry
  and a receipt's ids (`conventionIds: "passed"`); the conformance self-test,
  the 500 vectors, the verdicts and RESULTS.md; and the atlas check and
  self-test. All passed. The pack was 291,617 bytes, SHA-256
  `e64d3fa2dd2b0884c6b3d580d53f4a059c4ef81ce0a3f898cbd87be2b67dd3dc`; the
  archive will be packed from the source commit (`carrier/pack-source.sh`).
- **Regenerated on Linux x86-64**, as for 1.0.0, with the official Node
  22.22.2 linux-x64 build in an x86-64 virtual machine on this Mac under
  emulation: `src/fixtures/calc-roundtrip.json`
  (`node scripts/build-calc-roundtrip.mjs`), where the version alone changes,
  in 30 places; and `conformance/results/zodiacs-engine.json`
  (`run.mjs --out`), where it changes in one, with the 500 verdicts 1.0.0's:
  267 pass, 192 fail, 41 unsupported, none in error. `report.mjs` then
  rewrote `RESULTS.md` and `results/summary.json`, and the notes name
  1.1.0-rc.1.

## No value changes

`tools/compare-1.0.0.mjs` runs 1.0.0-rc.1's battery
(`../1.0.0-rc.1-20261006/tools/values.mjs`, unchanged), 6,417 calls over the
entry points, on the carried 1.0.0 archive and on this build, each in its own
process, on one machine (`results/values-compare.txt`):

- 6,288 lines are the same bytes;
- 129 differ, and each is 1.0.0's once what this candidate adds is taken out:
  the feature, the set's `conventionIds` and the receipt's `conventionIds`
  in a natal envelope, as an object or as serialized text, and the new set
  at the front of `NATAL_RECEIPT_CONVENTION_SETS`;
- no other line differs.

19 of the build's 23 declaration files are 1.0.0's byte for byte; the other
four are the new entry's, the receipt entry's, the declaration chunk that
holds the receipt's types (`zone-history-*.d.ts`) and `geo.d.ts`, which
imports that chunk under its new name
(`results/declarations.txt`). Of the 48 JavaScript files, with chunk names'
hashes and the version set aside, 35 are 1.0.0's; 10 hold 1.0.0's lines in
another order, their chunks renamed; and 3 are new code: `receipt.js`,
`conventions.js` and the chunk the two share (`results/javascript.txt`).

## Records

- `results/earlier-readers.json` (`tools/earlier-readers.mjs`): the codec of
  each carried archive, 0.1.1-rc.7 to 1.0.0, 14 in all, each checked against
  `artifacts/archives.json`, given an envelope this build writes. Each
  refuses it as `unsupported_feature`, and as `invalid_shape` with the
  feature taken out. This build reads it, and refuses it without the feature
  as `inconsistent_result`.
- `src/fixtures/receipt-1.0.0.json`, written by the carried 1.0.0 archive
  for the synthetic chart of the rc.13 to rc.15 fixtures
  (`tools/make-receipt-1.0.0.mjs`): this build parses it, serializes it to
  the same bytes and replays it (`src/receipt-ids.test.ts`,
  `src/receipt-nutation.test.ts`, `src/receipt-versions.test.ts`).

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.0.0
archive and this build.

| | 1.0.0 | 1.1.0-rc.1 | budget |
| --- | ---: | ---: | ---: |
| `./conventions` | | 2,330 | 2,500 (new) |
| `./receipt` | 69,491 | 72,688 | 76,500, from 70,000 |
| `.` | 105,975 | 105,980 | 108,500 |
| package, unpacked | 991,915 in 74 files | 1,003,274 in 77 files | 1,020,000, from 1,000,000 |

`./receipt` loads the new entry's chunk (2,073 bytes) and the codec's new
set, version gate, feature and check of the ids. The package grows by
11,359 bytes: 3,449 of JavaScript only the opt-in entries load, 2,661 of
declarations, 5,108 of README and CHANGELOG, 136 of manifest and the 5 of
the version in the root's graph. Each other graph that loads the version
grows by 5 bytes. A budget or the cap is raised only with the owner's
approval: this candidate asks for it for `./receipt` and the cap.

## Not covered here

- The archive, its carrier commit and the gates on the carrier follow, once
  the source commit is settled (`carrier/`).
- The site does not use this candidate. Adopting it is the site's step: its
  registry gains the namespace `conventionIds` with the new set's id, its
  tests take the new set, and its compute receipts carry ids of their own.
- No npm publication, which needs the owner's approval.
