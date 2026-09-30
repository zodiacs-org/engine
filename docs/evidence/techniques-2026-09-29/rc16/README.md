# The techniques gates rerun on 0.1.1-rc.16's build

`../measure.mjs`, unchanged, run on the integrated 0.1.1-rc.16 candidate
after the engine took the full IAU 2000B nutation: the build of `704cadc`
with the calc bounds of the next commit, which the techniques entry does not
use; Node.js v22.22.2, tzdata 2025c. `measurements.json` is its output; the
branch's run, on the build of `19719ce`, stays in `../measurements.json`.
`meta.engine` reads 0.1.1-rc.15, the tree's version before the release
commit.

The site-parity fixtures the gates read (`src/techniques/fixtures/site-parity/`)
were generated again on this build before the rerun (commit `704cadc`): the
site's code at `67cccac5` runs on the engine it is given, so its returns and
void-of-course windows move with the nutation as the package's do. Its
solar-return instants moved by up to 7.2 s, its lunar returns by up to
0.59 s and its void-of-course windows by up to 0.372 s; the composite,
pattern, dignity and Moon-sign outputs were the same bytes.

| Gate | Branch's run | This run |
| --- | --- | --- |
| G1, parity with the site | 6,795 of 6,796 agree; R-E 34 by design | the same 6,795 of 6,796 (the M-Z case of 2011-12-30 in Pacific/Apia); R-E 35 by design, the extra one a site answer 1 ms from the package's, within the solver's 5 ms |
| G2, solar returns against USNO's 20 seasons, 120 s | 45.347 s | 42.27 s, pass |
| G3, returns against the Horizons Sun (60 s) and Moon (15 s) | 33.226 s and 6.869 s | 32.047 s and 6.809 s, pass |
| G4, offsets outside UTC−12:00 to +14:00 | the site's 16 zone names | unchanged (a unit test in the suite, which passes) |
| G5, sizes | root 95,273 unchanged; `./techniques` 141,745 of 150,000; package 695,069 of 700,000 | not the branch's question on this tree: the root is 103,537 bytes (rc.15 as carried: 97,704), with the nutation and the entries rc.16 adds; `./techniques` is 152,472, over its 150,000, by the nutation (its budget is raised with that reason in the release commit); the package cap is rc.16's |
| G6, no existing file under `src/` changed since `eb58011` | failed as run (23 tests under the session's TMPDIR) | not applicable: the integrated tree changes files the branch did not |
| G7, dates before 1970 | 7 of 7 disagreements a different midnight | the same 7 of 7 |

The R-E corpus (the site clips its scans to 1800–2200; the package does not)
is compared in `src/techniques/site-parity.test.ts` with its own allowance:
a site answer within 6 ms of the package's, or a site refusal. Every case
meets it.
