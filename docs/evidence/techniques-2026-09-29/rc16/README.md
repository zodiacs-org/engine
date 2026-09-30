# The techniques gates rerun on 0.1.1-rc.16's build

`../measure.mjs`, unchanged, run on the integrated 0.1.1-rc.16 candidate
after the engine took the full IAU 2000B nutation: the build of `704cadc`
with the calc bounds of the next commit, which the techniques entry does not
use; Node.js v22.22.2, tzdata 2025c. `measurements.json` is its output; the
branch's run, on the build of `19719ce`, stays in `../measurements.json`.
`meta.engine` reads 0.1.1-rc.15, the tree's version before the release
commit.

On this build G1, G5 and G6 fail and G2, G3, G4 and G7 pass.

The site-parity fixtures the gates read (`src/techniques/fixtures/site-parity/`)
were generated again on this build before the rerun (commit `704cadc`): the
site's code at `67cccac5` runs on the engine it is given, so its returns and
void-of-course windows move with the nutation as the package's do. Its
solar-return instants moved by up to 7.2 s, its lunar returns by up to
0.59 s and its void-of-course windows by up to 0.372 s; the composite,
pattern, dignity and Moon-sign outputs were the same bytes. The release
commit generated them once more, on its own build (its `package.json` and
`dist/`, not packed): every output is the same bytes, and their
`meta.engine` reads 0.1.1-rc.16.

**Deviation.** The preregistration runs the site's modules on the engine the
package ports them into and names it: the carried rc.15 archive
(`3651c525…`, rc.15's first cut). This rerun ran them on rc.16's build
instead, and G1 compares the package with those outputs. The reason: on
rc.15's engine the site's returns and void-of-course windows would differ
from the package's by the nutation, not by the port, which is what G1
measures. It is a deviation from the preregistration all the same, and G1's
result here is on that basis.

| Gate | Branch's run | This run |
| --- | --- | --- |
| G1, parity with the site | 6,795 of 6,796 agree, failed; R-E 34 by design | **failed**, as on the branch: the same 6,795 of 6,796 (the M-Z case of 2011-12-30 in Pacific/Apia); R-E 35 by design, the extra one a site answer 1 ms from the package's, within the solver's 5 ms; the site's outputs from rc.16's build (the deviation above) |
| G2, solar returns against USNO's 20 seasons, 120 s | 45.347 s | 42.27 s, pass |
| G3, returns against the Horizons Sun (60 s) and Moon (15 s) | 33.226 s and 6.869 s | 32.047 s and 6.809 s, pass |
| G4, offsets outside UTC−12:00 to +14:00 | the site's 16 zone names | unchanged (a unit test in the suite, which passes) |
| G5, sizes | root 95,273 unchanged; `./techniques` 141,745 of 150,000; package 695,069 of 700,000; passed | **failed** on all three: the root's graph is 103,537 bytes, not rc.15's 95,273 (rc.15 as carried: 97,704), with the nutation and the entries rc.16 adds; `./techniques` is 152,472 bytes, over 150,000, by the nutation; the package is 923,282 bytes, over the 700,000-byte cap. rc.16 raised `./techniques`'s budget to 160,000 and the cap to 950,000 after these sizes were measured; that does not make G5 pass |
| G6, no existing file under `src/` changed since `eb58011`; every existing test passes unchanged | failed as run (23 tests under the session's TMPDIR) | **failed**: rc.16 changes 20 of rc.15's files under `src/` (at `93ebae9`; 52 of those at `eb58011`, which rc.15's re-cut changed too), 13 of them tests whose expectations moved with the nutation and the integration (`docs/evidence/rc16-20260930/`, *Pinned tests whose expectations moved*) |
| G7, dates before 1970 | 7 of 7 disagreements a different midnight | the same 7 of 7 |

The R-E corpus (the site clips its scans to 1800–2200; the package does not)
is compared in `src/techniques/site-parity.test.ts` with its own allowance:
a site answer within 6 ms of the package's, or a site refusal. Every case
meets it.
