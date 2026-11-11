# 1.1.0-rc.4: evidence

What `CHANGELOG.md` states about 1.1.0-rc.4, and where each statement comes
from. The candidate is a draft cut for the owner's review on 11 November
2026; nothing is published.

## What it carries

Two changes, each merged with a merge commit:

- the choice of pass for a wall time the clock showed twice (`fold` in
  `@zodiacs/engine/geo`), from pull request 87;
- the refusal of a birth given as a calendar date with no time, from pull
  request 88.

## The checks

What is enforced, and where:

- `src/geo/fold-choice.test.ts`: both passes of six repeated wall times, the
  instants written out from the IANA time zone database's rules, and the
  receipts of both passes. `docs/time.md` describes the option.
- `src/public-input.test.ts`: the refusal of a bare calendar date as a
  birth, through `natalChart`, `transits` and `synastry`, the
  `timeKnown: false` path, and the four ways of giving a full instant.
- `scripts/verify-packed-consumer.mjs`: the refusal and the
  `timeKnown: false` path on the packed build.

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
bytes against 35,439 in 1.1.0-rc.3, and the package 1,149,810 bytes against
1,142,818. The CHANGELOG's split of the 6,992 bytes is `sizes.json`'s
`growthFrom`, with its documents (4,897) divided between `CHANGELOG.md`
(3,962) and `README.md` (935) by the two files' sizes in each package.

## Budgets

The `./geo` budget (35,500 to 35,600) and the package cap (1,145,000 to
1,152,000) are raised in this draft. AGENTS.md allows a rise only when a
candidate is cut, with the reason in `CHANGELOG.md`. The owner asked for the
draft on 11 November 2026 and has not yet approved the two figures.

## scripts/verify-rc10-compatibility.mjs

Its cases that gave a birth as the bare date `2000-01-01` now write the same
instant out, `2000-01-01T00:00:00Z`, which 0.1.1-rc.10 reads as it read the
date. The `date-only` case, which sets `timeKnown: false`, is unchanged. The
script was not run for this candidate.
