# 1.1.0-rc.6: evidence

What `CHANGELOG.md` states about 1.1.0-rc.6, and where each statement comes
from. The candidate is a draft cut for the owner's review on 11 November
2026; nothing is published.

## What it carries

One change, merged with a merge commit: the choice of pass for a wall time
the clock showed twice (`fold` in `@zodiacs/engine/geo`), from pull request
87, and one fix to it, the commit after the merge, which an independent
review of the 1.1.0-rc.5 draft asked for (below).

## Why there is no 1.1.0-rc.4 and no 1.1.0-rc.5

1.1.0-rc.4 was drafted in pull request 89 on 11 November 2026. It carried
this change and the refusal of a birth given as a calendar date with no time
(pull request 88). The owner decided on 11 November 2026 to hold the refusal
for 2.0.0, because it changes behaviour the README documents. This candidate
does not contain pull request 88.

1.1.0-rc.5 was drafted in pull request 90 on the same day, with the choice
of pass alone. An independent review of that draft was done before any
merge, and its findings are acted on here, so 1.1.0-rc.5 is superseded.

Neither pull request was merged and neither archive is carried on this
branch. Both numbers are skipped: an archive is never repacked under a
number it has already had.

## What the review of 1.1.0-rc.5 found, and what was done

1. The resolver wrote `policy.fold: "later"` into the local record whenever
   the caller asked for it, also for a time the clock showed once and for a
   skipped time, where the instant is the default's. Engines from before the
   choice refuse any record that says `"later"`, so those receipts could not
   be read by them, and the draft's CHANGELOG sentence that the option
   "changes nothing for a time the clock showed once" was untrue for the
   record. Fixed in `src/geo/timezone.ts`: `"later"` is recorded only where
   the wall time was repeated and the later pass was asked for. The codec
   (`validateLocal` in `src/receipt.ts`) now also refuses a record that says
   `"later"` without the `dst-fold` flag, as `invalid_context`.
2. `docs/versioning.md` said a record's fields change only with a new
   conventions set, and this change widens the values of `policy.fold`
   inside the current sets. The document now says so.
3. Tests the draft lacked, now in `src/geo/fold-choice.test.ts`: receipts of
   the later pass written, read back and unchanged for Lord Howe (a
   half-hour fold), Sydney, São Paulo and New York in 1883 with and without
   a birthplace; a `"later"` record under a conventions set from before the
   time basis refused as `unsupported_feature`; the altered-transition case
   asserting its error code; and an ordinary and a skipped time asked for
   their later pass giving the record they give unasked.
4. The records now name the workflow runs and the reviews (the sections on
   the gates, below).

The fix is itself a change to the package. Its independent review follows
this draft and is not recorded here.

## The checks

What is enforced, and where:

- `src/geo/fold-choice.test.ts`: both passes of six repeated wall times, the
  instants written out from the IANA time zone database's rules, the
  receipts of both passes, and the cases of item 3 above. `docs/time.md`
  describes the option.

## What earlier engines do with this candidate's receipts

`later-receipt-on-rc3.json` and `later-receipt-on-rc1.json` are
`tools/later-receipt-on-earlier-readers.mjs` run on 11 November 2026 (Node
22.22.2, Linux x86-64) on this candidate's build and on the carried archives
`artifacts/zodiacs-engine-1.1.0-rc.3.tgz` and
`artifacts/zodiacs-engine-1.1.0-rc.1.tgz`, unpacked. The births are
synthetic, in New York: 01:30 on 2021-11-07 (repeated), 12:00 on 2021-06-15
(ordinary) and 02:30 on 2021-03-14 (skipped), each asked for both passes.

- Repeated time: both readers read the record of the earlier pass and refuse
  the record of the later pass as `unsupported_feature`, as written and
  under their own version string.
- Ordinary time and skipped time: asking for the later pass gives the same
  receipt, byte for byte, as not asking (`sameReceiptWhicheverPassIsAsked`),
  it says `"earlier"`, and both readers read it. In the 1.1.0-rc.5 draft
  these two receipts said `"later"` and both readers refused them.

Engines before 1.1.0-rc.1 were not run.

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.1.0-rc.3
archive, unpacked, and the build of this candidate's tree (Node 22.22.2,
Linux x86-64): each entry point's import graph, in bytes, against its budget
in `scripts/verify-package-contents.mjs`, and the package. `./geo` is 35,584
bytes against 35,439 in 1.1.0-rc.3, and the package 1,148,327 bytes against
1,142,818. The CHANGELOG's split of the 5,509 bytes is `sizes.json`'s
`growthFrom`, with its documents (3,854) divided between `CHANGELOG.md`
(3,499) and `README.md` (355) by the two files' sizes in each package.

## Budgets

The owner approved two rises on 11 November 2026. AGENTS.md allows a rise
only when a candidate is cut, with the reason in `CHANGELOG.md`. This
candidate keeps both limits as approved and asks for nothing more.

- `./geo`: 35,500 to 35,600. The entry measures 35,584 bytes, which leaves
  0.04 per cent. The 1.1.0-rc.5 draft measured 35,574. The fix's own
  expression is 36 bytes, which alone would have made 35,610, over the
  approved limit; the same commit builds the flag from the kind of jump
  (`dst-${kind}` in place of a conditional that named both flags), which
  takes 26 bytes off and changes no value.
- The package cap: 1,145,000 to 1,150,000. The package measures 1,148,327
  bytes, which leaves 0.14 per cent.

## scripts/verify-rc10-compatibility.mjs

Not changed. The 1.1.0-rc.4 draft changed it only because of the refusal.

## The archive

`carrier/pack-source-c3efe91.log`: clean clones of the source commit
`c3efe91`, each installed with `npm ci`, built and packed with
`npm pack --ignore-scripts` outside the checkout, on Node 22.22.2, 20.19.0
and 24.21.0 (Linux x86-64, 11 November 2026). All three packed SHA-256
`648714ca7485c7381f338286b84a211752ddd425035f50f6e24267e80de6abde`, 333,982
bytes, 94 files; the carried file is the Node 22.22.2 one.

## The gates on the source commit

The gate workflows ran on the source commit `c3efe91` on GitHub, as the
head of draft pull request 91, before the archive was carried, and every
job passed: CI run 43014592658 (the engine job on Node 20, 22 and 24, the
rebuild of every archive carried then, the pack, the packed consumers on
Node 20.19.0, 22.7.0, 22 and 24, and the DE440 tier-B job), Conformance run 43014592715 and Atlas run
43014592797. The repository's other three workflows passed on it too:
Python package 43014592646, Offline CLI consumer 43014592821 and CodeQL
43014592681.

## The gates on the carrier

Run locally on the carrier `7210037` before it was pushed (Linux x86-64,
`TMPDIR` outside the checkout):

- `carrier/gates-7210037.log`: the engine job's steps on Node 22.22.2
  (typecheck, the suite with 100 files and 4,203 tests passed and 3 tests
  skipped, build, export smoke, `api:check`, package contents, pack dry
  run), `node scripts/verify-archive-binding.mjs` on Node 20.19.0, 24.21.0
  and 22.22.2, each rebuilding HEAD to the carried bytes, the
  packed-consumer check on the carried archive on Node 22.22.2, 20.19.0 and
  24.21.0, and on Node 22.22.2 the conformance checks (the self-test, the
  count of 500 vectors, `run.mjs --check` and `report.mjs --check`) and the
  atlas check and self-test. Every step exits 0.
- `carrier/rebuild-all-7210037-v22.22.2.log`:
  `node scripts/verify-archive-binding.mjs --rebuild-all` on Node 22.22.2,
  the lines that name each archive: every recorded archive, this one
  included, rebuilds from its source commit byte for byte.

The workflow runs on the carrier and on this record's commit come after
this file and are on pull request 91. The tier-B check on NAIF's kernel and
the packed consumer on Node 22.7.0 were not run locally; the CI run on the
source commit has a job for each, and both passed.

## Reviews

An independent review of the 1.1.0-rc.5 draft was done on 11 November 2026
and its four findings are acted on in this candidate (above). The fix made
here changes what a receipt records, so it needs its own independent
review: that review follows this draft and is not recorded here. If it
finds anything in the package, the fix is a new candidate, not an edit of
this archive.
