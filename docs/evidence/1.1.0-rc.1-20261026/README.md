# 1.1.0-rc.1, 2026-10-26

The first candidate for 1.1.0, on 1.0.0 (main at `4771fa6`, the merge of
zodiacs-org/engine#70). Natal receipts name their conventions as ids of the
Zodiacs conventions registry, which zodiacs.org publishes at
`/developers/conventions/` (its R44), and a new entry point,
`@zodiacs/engine/conventions`, gives those ids. It is not to be published on
npm until the owner approves it. Times are Asia/Bangkok.

## What changes

- **A new conventions set.** `createNatalEnvelope` writes 1.0.0's set with
  `conventionIds:
  "zodiacs-conventions-registry;receipt-and-result;sorted-unique;in-receipt"`,
  and the receipt gains `conventionIds`: every id that the receipt and its
  result name, in code-unit order, each once. From the receipt: each
  conventions and coverage field's key and value, the requested and actual
  house systems, why there are no houses, each flag, the reference, the
  instant's scale and the ephemeris. From the result: the ΔT model and
  segment, the time basis and the source of UT1 − UTC. That is the rule of
  the site's registry tests: `natalReceiptIds` in zodiacs-org/site
  `tests/conventions-registry.test.ts` for the receipt, and its
  `calcReceiptIds` reading of an instant's time records for the result. On 57
  synthetic envelopes, every house system at four latitudes and charts
  untimed, without a place, flagged and on TT and UT1, it gives the same ids;
  they name 51 distinct ids, and the registry the site publishes (version
  2026-10-18) holds every one but the new set's own
  (`results/site-rule.txt`, `tools/site-rule.mjs`). The site adds that one
  when it adopts this release. docs/versioning.md lets a minor release start
  to write a new set; a record's fields change only with one.
- **A required feature.** An envelope of the new set requires
  `convention-ids`. Every release reads an envelope's features before
  anything in its receipt, so an earlier one refuses the record as
  `unsupported_feature`, as docs/versioning.md promises. With the field alone
  it would say `invalid_shape` (`results/earlier-readers.json`, below).
  docs/versioning.md now asks a feature of every new set.
- **The codec.** It requires the ids under the new set, exactly as
  `natalConventionIds` derives them from the envelope's own fields, and the
  feature with them; it refuses either under any other set. A receipt names
  the engine that computed its chart, which may be earlier or later than the
  one that wrote the record, so the new set is accepted from 0.1.1-rc.16, as
  1.0.0's set is, with no upper bound: this release reads every record 1.0.0
  reads.
- **`@zodiacs/engine/conventions`**: `natalConventionIds`, `conventionId`,
  `parseConventionId`, `conventionAddress` and `CONVENTIONS_REGISTRY`. The
  rule and the id syntax live in `src/convention-ids.ts`, a module the entry
  and the receipt codec share, so `./receipt` loads only what it calls. The
  entry imports no module of another entry, and the export smoke test checks
  that the root reaches neither module.
- **The version**, 1.1.0-rc.1, in `package.json`, the lockfile,
  `ENGINE_VERSION` and `typedoc.json`; the calc round-trip fixture and the
  conformance results name it (below).

## Reviews

Two reviews read the first source commit, `848e659`, and the suite branch on
it; neither changed anything in the repository.

**An independent review** rebuilt the tree in its own clone and ran CI's
jobs, the comparisons and probes of its own. It found no blocker, two major
findings and eight minor ones. The commit after `848e659` acts on them:

- **Major: the version gates.** `848e659` accepted 1.0.0's set only before
  1.1.0-rc.1 and the new set only from it. But a receipt names the engine
  that computed its chart: 1.0.0 writes its set for a chart a later engine
  computed, and reads it back, so 1.1 refused records 1.0.0 reads, and
  `createNatalEnvelope` refused a chart 1.0.0 computed. Both sets are now
  accepted from 0.1.1-rc.16 with no upper bound, and
  `src/receipt-ids.test.ts` checks both directions.
- **Major: the set's own id.** Every receipt names `conventionIds:...`,
  which the registry does not hold until the site adopts this release. The
  CHANGELOG and README now say so, and the site's adoption comes before any
  publication of 1.1.
- **Minor, acted on:**
  - `docs/versioning.md` named twelve entry points; it names thirteen.
  - `conventionAddress` threw `URIError` for a value with a lone surrogate;
    the id syntax now refuses lone surrogates, with a `RangeError`, and a
    test.
  - The ids take room from `extensions` under `NATAL_ENVELOPE_LIMITS`; the
    CHANGELOG states how much (`results/extension-room.txt`).
  - "A timed chart with Placidus houses names 22" held for the tests' chart
    only; the CHANGELOG now names that chart.
  - The ids now include the result's time records, which the registry lists
    under natal results.
  - `./receipt` loaded `parseConventionId` and `conventionAddress`, which it
    never calls; the module split takes them out of its graph (72,500 bytes
    where `848e659` had 72,688).
  - `CONVENTIONS_REGISTRY` was declared with its URL as a literal type; it is
    a `string`, as `ENGINE_VERSION` is.
  - In the suite, `validate.mjs` did not pin the released files; the suite
    branch now pins each file's SHA-256.

**A second review** split the work among six readers (the codec, the new
entry's API, the documentation's claims, the release mechanics, the tests and
the suite), each finding then put to three readers who tried to refute it.
Most of its findings were the first review's. The commit after them acts on
the rest:

- **Tests that a wrong id could pass.** The codec checks the ids last, so a
  test that edits a field the ids are built from, and expects a refusal,
  would pass on the ids alone if the rule it is named for broke. The edit
  helpers of `src/receipt.test.ts`, `src/receipt-time-basis.test.ts`,
  `src/reference-span.test.ts`, `src/deltat-chart.test.ts`,
  `src/porphyry.test.ts` and `src/house-systems.test.ts` now rebuild the ids
  after an edit, so only the named rule can refuse; all still pass.
- **Controls and orders.** The hand-made rc.6 receipt that Porphyry is
  refused in now has a passing control, a Placidus chart edited the same way,
  and takes rc.3's set by its content. A test checks that features are read
  before anything in a receipt. The per-case id tests compare with a copy of
  the site's rule written apart from `natalConventionIds`. The nutation
  set's refusals run on 1.0.0's receipt too.
- **The 1.0.0 fixture.** Its SHA-256 is pinned, the runtime that wrote it is
  recorded, and a test replays it: this engine's positions, angles and cusps
  are within 1e-9° of the stored ones. An older record's ids, and the
  writer's path for a malformed field, have tests.
- **The API and the README.** The type `parseConventionId` returns is
  `ConventionIdParts`, so the name `ConventionId` is free for the id itself.
  The README's install instruction names this candidate's archive: `npm
  install @zodiacs/engine` installs 1.0.0, which has no `./conventions`. The
  export smoke test checks that the new entry's graph holds only its own two
  modules.
- **The CHANGELOG** gives the cap's reason for all the growth, the
  battery's limits (1.0.0's twelve entry points, one machine, chunk names and
  the version set aside), and that `NATAL_RECEIPT_CONVENTION_SETS` moves
  each earlier set one place.
- **The suite:** the L3 generator writes 0.2.0's file beside its `--out`;
  `readSuite` takes an earlier release's own levels; the offline CLI bundles
  `arbiters/release.py`, which the bundled generators import.
- **Recorded, not changed:** an envelope of an earlier set that requires
  `convention-ids` is now `inconsistent_result` where 1.0.0 said
  `unsupported_feature`; both refuse it, and no engine writes it. The id
  syntax accepts more than the registry holds, and an id's address follows
  the registry's page as zodiacs.org publishes it; `natalConventionIds` is
  the new set's rule, so a different rule needs a new set.

## Checks on the tree before the source commit

Each script names its command; each log shortens local paths.

- `gates.sh`, CI's engine job on Node 22.22.2, 20.19.0 and 24.21.0
  (darwin-arm64, an Apple M4): typecheck, the full suite, build, export
  smoke, the API check, package contents and the pack dry run (`gates.log`,
  `full-tests-*.log`). Every step passed but the suite, which failed the 4
  tests that fail on arm64 in 1.0.0's record too, and only those: the calc
  round trip's case that two tests replay, and the two site-parity checks of
  returns and void-of-course windows. 3,874 of 3,878 tests passed on Node
  22.22.2, and 3,873 with 1 skipped on Node 20.19.0 and 24.21.0. CI runs the
  suite on x86-64, where the pins were taken.
- `tree-jobs.sh`, CI's other jobs (`tree-jobs.log`): the build and the pack
  on Node 22.22.2, the packed-consumer check on that pack with Node 20.19.0,
  22.7.0, 22.22.2 and 24.21.0, which also checks the new entry and an
  envelope's ids and feature (`conventionIds: "passed"`); the conformance
  self-test, the 500 vectors, the verdicts and RESULTS.md; and the atlas check
  and self-test. All passed. The pack was 292,721 bytes, SHA-256
  `52352d3f8fde4a262483e4a5a6217e02d814aa53269b49c0333325e6c0d6a7b6`; the
  archive will be packed from the source commit (`carrier/pack-source.sh`).
- **Regenerated on Linux x86-64**, as for 1.0.0, with the official Node
  22.22.2 linux-x64 build in an x86-64 virtual machine on this Mac under
  emulation: `src/fixtures/calc-roundtrip.json`
  (`node scripts/build-calc-roundtrip.mjs`), where the version alone changes,
  in 30 places; and `conformance/results/zodiacs-engine.json`
  (`run.mjs --out`), where it changes in one, with the 500 verdicts 1.0.0's:
  267 pass, 192 fail, 41 unsupported, none in error. `report.mjs` then
  rewrote `RESULTS.md` and `results/summary.json`, and the notes name
  1.1.0-rc.1. Run again on this tree's build after the reviews
  (`tools/x86-64-regeneration.sh`, `results/x86-64-regeneration.log`), every
  step exits 0 and the committed files come back byte for byte.

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
imports that chunk under its new name (`results/declarations.txt`). Of the 48
JavaScript files, with chunk names' hashes and the version set aside, 35 are
1.0.0's; 10 hold 1.0.0's lines in another order, their chunks renamed; and 3
are new code: `receipt.js`, `conventions.js` and the chunk of ids the two
share (`results/javascript.txt`).

## Records

- `results/earlier-readers.json` (`tools/earlier-readers.mjs`): the codec of
  each carried archive, 0.1.1-rc.7 to 1.0.0, 14 in all, each checked against
  `artifacts/archives.json`, given an envelope this build writes. Each
  refuses it as `unsupported_feature`, and as `invalid_shape` with the
  feature taken out. This build reads it, and refuses it without the feature
  as `inconsistent_result`.
- `results/extension-room.txt` (`tools/extension-room.mjs`): for the tests'
  chart, the envelope grows from 5,585 bytes on the carried 1.0.0 archive to
  6,976 on this build, the longest string `createNatalEnvelope` accepts as an
  extension falls from 59,927 to 58,536 characters, and the longest array of
  numbers from 3,816 to 3,787 entries.
- `src/fixtures/receipt-1.0.0.json`, written by the carried 1.0.0 archive
  for the synthetic chart of the rc.13 to rc.15 fixtures
  (`tools/make-receipt-1.0.0.mjs`): this build parses it and serializes it to
  its own bytes (`src/receipt-ids.test.ts`, `src/receipt-nutation.test.ts`,
  `src/receipt-versions.test.ts`), and replays it to positions, angles and
  cusps within 1e-9° of its own (`src/receipt-ids.test.ts`, which pins the
  file's SHA-256).

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.0.0
archive and this build.

| | 1.0.0 | 1.1.0-rc.1 | budget |
| --- | ---: | ---: | ---: |
| `./conventions` | | 2,754 | 2,900 (new) |
| `./receipt` | 69,491 | 72,500 | 76,500, from 70,000 |
| `.` | 105,975 | 105,980 | 108,500 |
| package, unpacked | 991,915 in 74 files | 1,006,494 in 77 files | 1,020,000, from 1,000,000 |

`./receipt` loads the chunk of ids it shares with the new entry and the
codec's new set, its feature and its check of the ids. The package grows by
14,579 bytes: 3,740 of JavaScript only the opt-in entries load, 3,370 of
declarations, 7,328 of README and CHANGELOG, 136 of manifest and the 5 of the
version in the root's graph. Each other graph that loads the version grows
by 5 bytes. The owner approved both raises on 2026-10-26.

## Not covered here

- The archive, its carrier commit and the gates on the carrier follow, once
  the source commit is settled (`carrier/`).
- The site does not use this candidate. Adopting it is the site's step, and
  it comes before any publication of 1.1: its registry gains the namespace
  `conventionIds` with the new set's id, its tests take the new set, and its
  compute receipts carry ids of their own.
- No npm publication, which needs the owner's approval.
