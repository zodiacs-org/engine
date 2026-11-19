# 2.0.0-rc.2: gates, archive and sizes

The second candidate for 2.0.0, on this same pull request (112):
2.0.0-rc.1 (`9eb5934`) with pull request 105's review fix (`522a0d6`)
merged into it (`79b9575`). The fix: a supplied chart's or natal receipt's
`polar-angles` claim is allowed where |latitude| ≥ 90° − ε₀ − 0.003°, ε₀
the whole IAU 2006 mean obliquity polynomial at its TT, where rc.1 used
the polynomial's constant and linear terms alone and refused, from 2936
on, some charts the engine itself had flagged (CHANGELOG.md, 2.0.0-rc.2;
`docs/houses.md`; `src/polar-angles.test.ts`).

Source commit: `05cd353af00e796e1fad65bf7085356c315b4b86` ("Begin
2.0.0-rc.2"). Carrier: "Carry the packed 2.0.0-rc.2 tarball".

## Gates on the source commit

Run locally on Node 22.23.4 with npm 10.9.9 (Linux x86-64), in a checkout
with full history and `TMPDIR` outside it, except the conformance and atlas
steps, which ran on Node 22.22.2 as their workflows do; paths in the logs
are shortened to `<checkout>`, `<node-22.22.2>` and `$TMPDIR`.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm test` | 4,366 passed, 4 skipped (the 3 kernel tests, which the tier B job runs, and the tzdata 2025c test on a host without it) | `results/test.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | 17 entry points match `api/` | `results/api-check.log` |
| `npm run package:contents` | pass, with the sizes below | `results/package-contents.log` |
| `npm run pack:dry-run` | 98 files | `results/pack-dry-run.log` |
| `node scripts/verify-packed-consumer.mjs` on the carried archive | pass | `results/consumer-v22.23.4.log` |
| conformance selftest, `validate.mjs --expect-total 500`, `run.mjs --check` for both of this engine's runs, `report.mjs --check` | 459 pass, 0 fail, 41 unsupported (on astronomy-engine 267, 192, 41); every verdict matches | `results/conformance.log` |
| `node atlas/tools/check.mjs`, `node --test atlas/tools/selftest.mjs` | pass | `results/atlas.log` |
| client contract generators `--check`, the TypeScript client's typecheck, build, `checks/run.mjs` and `checks/consumer.mjs` | pass | (not logged) |

On GitHub the gate workflows passed on the source commit: CI run
43920027679, Conformance 43920027647 and Atlas 43920027649, with Compute
client, Python Compute client, Python package and CodeQL. There, as here,
the archive-binding check passed but skipped the rebuild of HEAD, since no
archive was carried for 2.0.0-rc.2 yet; that is why the archive was carried
next. The source commit also changed this engine's conformance results, so
the Offline CLI consumer workflow ran on it too.

## Conformance results

`conformance/results/zodiacs-engine.json`,
`conformance/results/zodiacs-engine-astronomy-engine.json`,
`conformance/results/summary.json` and `conformance/RESULTS.md` were
regenerated on the source tree with the harness (`run.mjs --out` for both
runs, then `report.mjs`) on Node 22.22.2, the official linux-x64 binary,
downloaded from nodejs.org into a new empty directory and checked against
`SHASUMS256.txt` (`results/node-22.22.2.txt`). They name 2.0.0-rc.2. No
verdict changed; the 10 polar vectors whose charts fall back from Placidus
or Koch (`L2-POL-0001` to `0003` and `0005` to `0011`) now record
`polar-angles` beside `polar-fallback`, in both runs.

## Sizes

Measured on this candidate's build with `npm run package:contents`
(`results/package-contents.log`), against 2.0.0-rc.1's
(`docs/evidence/2.0.0-rc.1-20261116/results/package-contents.log`):

| | 2.0.0-rc.1 | 2.0.0-rc.2 | budget |
| --- | ---: | ---: | ---: |
| `.` (the root) | 151,531 | 151,563 | 151,700 |
| `./timing` | 170,834 | 170,866 | 171,200 |
| `./techniques` | 205,215 | 205,247 | 207,300 |
| `./receipt` | 76,623 | 76,845 | 77,400 |
| package beside the pack | 1,276,174 | 1,284,237 | 1,289,000 |

No budget or cap is raised. The fix adds 32 bytes to the root's chunk (and
so to every graph that holds it) and 222 to `./receipt`, which keeps its
own copy of the polynomial; the package grows with the CHANGELOG entry and
the README's lines. Every other import graph is inside its budget.

## The archive

Packed once from a clean tree of the source commit (`git archive`, `npm
ci`, `npm run build`, `npm pack --ignore-scripts`) on Node 22.23.4 with npm
10.9.9: `zodiacs-engine-2.0.0-rc.2.tgz`, SHA-256
`e0621630b5a0f9dbb6465f4f077630f313217d7b06ee88ffa960696fec5eb1cc`,
2,734,988 bytes, 98 files, 4,603,789 unpacked. The pack of the working
checkout gave the same bytes. It was not packed on other Node versions.

On the carrier, `node scripts/verify-archive-binding.mjs` rebuilt HEAD and
found the archive byte-identical, with 31 recorded archives bound across
440 commits (`results/archive-binding.log`). 2.0.0-rc.1's archive, receipt
and entry are unchanged.

Nothing was tagged, released or published. All birth data in the tests and
evidence is synthetic.
