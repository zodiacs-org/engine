# 2.0.0-rc.1: gates, archive and sizes

The first candidate for 2.0.0, on main at `12943c1` (1.1.0) with pull
requests 109 (`695188e`, a bare birth date refused), 111 (`be5e540`,
`positions()` rows flagged), 110 (`edf7574`, `calendar-unknown`) and 105
(`1e6a664`, `polar-angles`) merged into it with merge commits, in that
order. The merge of 105 resolves its conflict with 110 in the flag lists:
both values are in `ChartFlag`, `FLAGS_TIME_BASIS`, the packed consumer's
typed list, every `api/*.api.md` and the client contract, and only
`"calendar-unknown"` is in `LocalResolution.flags` and `TimeResult.flags`.

Source commit: `5bbb4595a7bc26618a504de62805399e28d595d8` ("Begin
2.0.0-rc.1"). Carrier: "Carry the packed 2.0.0-rc.1 tarball".

## Gates on the source commit

Run locally on Node 22.23.4 with npm 10.9.9 (Linux x86-64), in a checkout
with full history and `TMPDIR` outside it; paths in the logs are shortened
to `<checkout>` and `$TMPDIR`.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm test` | 4,343 passed, 4 skipped (the 3 kernel tests, which the tier B job runs, and the tzdata 2025c test on a host without it) | `results/test.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | 17 entry points match `api/` | `results/api-check.log` |
| `npm run package:contents` | pass, with the budgets below | `results/package-contents.log` |
| `npm run pack:dry-run` | 98 files | `results/pack-dry-run.log` |
| `node scripts/verify-packed-consumer.mjs` on the carried archive | pass | `results/consumer-v22.23.4.log` |
| conformance selftest, `validate.mjs --expect-total 500`, `run.mjs --check`, `report.mjs --check` | 459 pass, 0 fail, 41 unsupported; every verdict matches | `results/conformance.log` |
| `node atlas/tools/check.mjs`, `node --test atlas/tools/selftest.mjs` | pass | `results/atlas.log` |
| client contract generators `--check`, the TypeScript client's typecheck, build and `checks/run.mjs` | pass | (not logged) |

On GitHub the gate workflows passed on the source commit: CI run
43907668826 (28 check runs on the commit, all successful once the
Python package workflow's queued macOS job is set aside), Conformance
43907668642 and Atlas 43907668886. There, as here, the archive-binding
check passed but skipped the rebuild of HEAD, since no archive was carried
for 2.0.0-rc.1 yet; that is why the archive was carried next.

The conformance results still name 1.1.0 (`conformance/results/`): the
verdicts are unchanged, and they were not regenerated here, since the
harness's `--out` is to be run on Node 22.22.2.

## Sizes

Measured on this candidate's build with `npm run package:contents`
(`results/package-contents.log`), against 1.1.0's
(`docs/evidence/1.1.0-20261116/results/package-contents.log`):

| | 1.1.0 | 2.0.0-rc.1 | budget before | budget now |
| --- | ---: | ---: | ---: | ---: |
| `./techniques` | 203,322 | 205,215 | 203,800 | 207,300 |
| `./geo` | 35,614 | 36,178 | 35,700 | 36,500 |
| `./receipt` | 75,808 | 76,623 | 76,500 | 77,400 |
| package beside the pack | 1,261,897 | 1,276,174 | 1,265,000 | 1,289,000 |

Each rise is the measurement and about one per cent, for the owner to decide
with the candidate. Every other import graph is inside its budget, unchanged.

## The archive

Packed once from a clean tree of the source commit (`git archive`, `npm
ci`, `npm run build`, `npm pack --ignore-scripts`) on Node 22.23.4 with npm
10.9.9: `zodiacs-engine-2.0.0-rc.1.tgz`, SHA-256
`9a1c07ca898da77ec266543130645f3e2528a1aeef1ebd15b1b83e07d19e673a`,
2,732,244 bytes, 98 files, 4,595,726 unpacked. The pack of the working
checkout gave the same bytes. It was not packed on other Node versions.

On the carrier, `node scripts/verify-archive-binding.mjs` rebuilt HEAD and
found the archive byte-identical, with 30 recorded archives bound across
434 commits (`results/archive-binding.log`).

Nothing was tagged, released or published. All birth data in the tests and
evidence is synthetic.
