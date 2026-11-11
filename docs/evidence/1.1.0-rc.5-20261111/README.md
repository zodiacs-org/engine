# 1.1.0-rc.5: evidence

What `CHANGELOG.md` states about 1.1.0-rc.5, and where each statement comes
from. The candidate is a draft cut for the owner's review on 11 November
2026; nothing is published.

## What it carries

One change, merged with a merge commit: the choice of pass for a wall time
the clock showed twice (`fold` in `@zodiacs/engine/geo`), from pull request
87.

## Why there is no 1.1.0-rc.4

1.1.0-rc.4 was drafted in pull request 89 on 11 November 2026. It carried
this change and the refusal of a birth given as a calendar date with no time
(pull request 88). The owner decided on 11 November 2026 to hold the refusal
for 2.0.0, because it changes behaviour the README documents. Pull request
89 was not merged and its archive is not carried on this branch, so the
version number is skipped: an archive is never repacked under a number it
has already had. This candidate does not contain pull request 88.

## The checks

What is enforced, and where:

- `src/geo/fold-choice.test.ts`: both passes of six repeated wall times, the
  instants written out from the IANA time zone database's rules, and the
  receipts of both passes. `docs/time.md` describes the option.

## What 1.1.0-rc.3 does with a "later" receipt

`later-receipt-on-rc3.json` is `tools/later-receipt-on-rc3.mjs` run on 11
November 2026 (Node 22.22.2, Linux x86-64) on this candidate's build and on
the carried archive `artifacts/zodiacs-engine-1.1.0-rc.3.tgz`, unpacked. The
birth is synthetic: 01:30 in New York on 2021-11-07. 1.1.0-rc.3 reads the
record of the earlier pass and refuses the record of the later pass as
`unsupported_feature`, as written and under its own version string. Engines
before 1.1.0-rc.3 were not run.

## Sizes

`sizes.json` (`../rc16-20260930/sizes.mjs`) measures the carried 1.1.0-rc.3
archive, unpacked, and the build of this candidate's tree (Node 22.22.2,
Linux x86-64): each entry point's import graph, in bytes, against its budget
in `scripts/verify-package-contents.mjs`, and the package. `./geo` is 35,574
bytes against 35,439 in 1.1.0-rc.3, and the package 1,147,669 bytes against
1,142,818. The CHANGELOG's split of the 4,851 bytes is `sizes.json`'s
`growthFrom`, with its documents (3,271) divided between `CHANGELOG.md`
(2,932) and `README.md` (339) by the two files' sizes in each package.

## Budgets

The owner approved two rises on 11 November 2026. AGENTS.md allows a rise
only when a candidate is cut, with the reason in `CHANGELOG.md`.

- `./geo`: 35,500 to 35,600. The entry measures 35,574 bytes, the same as in
  the 1.1.0-rc.4 draft, because the refusal that was left out never reached
  this entry. The limit is the next round hundred over the measured size,
  which leaves 0.07 per cent.
- The package cap: 1,145,000 to 1,150,000. The 1.1.0-rc.4 draft measured
  1,149,810 bytes and asked for 1,152,000. Without the refusal the package
  measures 1,147,669 bytes, so the cap is set lower than the figure the
  owner approved: the next round thousand that leaves at least the 0.19 per
  cent the last two cuts left, which is 1,150,000 (0.20 per cent).

## scripts/verify-rc10-compatibility.mjs

Not changed. The 1.1.0-rc.4 draft changed it only because of the refusal.

## The archive

`carrier/pack-source-a117a41.log`: clean clones of the source commit
`a117a41`, each installed with `npm ci`, built and packed with
`npm pack --ignore-scripts` outside the checkout, on Node 22.22.2, 20.19.0,
24.21.0 and 22.23.4 (Linux x86-64, 11 November 2026). All four packed
SHA-256 `536187846fa74d6179071c5306064c3be3cabd3f3881463003e8b92c2d5dd184`,
333,868 bytes, 94 files; the carried file is the Node 22.22.2 one.

## The gates on the carrier

Run locally on the carrier `9ee3061` before anything was pushed (Linux
x86-64, `TMPDIR` outside the checkout):

- `carrier/gates-9ee3061.log`: the engine job's steps on Node 22.22.2
  (typecheck, the suite with 100 files and 4,193 tests passed and 3 tests
  skipped, build, export smoke, `api:check`, package contents, pack dry
  run), `node scripts/verify-archive-binding.mjs` on Node 20.19.0, 24.21.0
  and 22.22.2, each rebuilding HEAD to the carried bytes, the
  packed-consumer check on the carried archive on Node 22.22.2, 20.19.0 and
  24.21.0, and on Node 22.22.2 the conformance checks (the self-test, the
  count of 500 vectors, `run.mjs --check` and `report.mjs --check`) and the
  atlas check and self-test. Every step exits 0.
- `carrier/rebuild-all-9ee3061-v22.23.4.log`:
  `node scripts/verify-archive-binding.mjs --rebuild-all` on Node 22.23.4,
  the lines that name each archive: every recorded archive, this one
  included, rebuilds from its source commit byte for byte.

The gate workflows had not run on the source commit when the archive was
carried. An independent review of the cut follows the draft and is not
recorded here. The tier-B check on NAIF's kernel and the packed consumer on
Node 22.7.0 were not run locally.
