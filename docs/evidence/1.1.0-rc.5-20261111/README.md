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
