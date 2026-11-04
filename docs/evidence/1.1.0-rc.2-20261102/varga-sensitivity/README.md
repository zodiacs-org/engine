# P2.B.vargas evidence: the environment

The environment in which the varga sensitivity's checks ran for
`@zodiacs/engine` 1.1.0-rc.2 (`PREREGISTRATION.md`, section 10, step 6:
"README.md with the environment"). `PREREGISTRATION.md` fixes the checks,
`INPUTS.md` the inputs, and `RESULTS.md` gives each check's verdict and
figures. Every value below is in the logs it cites; local paths there are
shortened to `<checkout>`, `<scratch>`, `<scratchpad>`, `<programme>` and
`<home>`.

| | the formal run | G-V4 run again in full |
| --- | --- | --- |
| when (ICT) | 2026-11-04, 13:15:16 to 14:48:41 | 2026-11-04, 15:09:01 to 15:14:39 |
| commit | 237b2265fcc53ae51abcb4f8e895e64c66321f5e (branch `rc2/main-first`) | 7b29dddf179ea1e4b0643fd86108d5d826988ed7 (branch `rc2/main-first`), whose sources are 237b226's |
| what ran | `tools/checks.sh WORK 10 PYTHON`, section 10's steps 3 to 5; stopped during G-V4, before C4a and C4b, under 4 GiB free | `tools/checks.sh --g-v4 WORK 10 PYTHON`, section 10's step 5 alone, under the amendment of 2026-11-04 |
| platform | darwin-arm64, macOS 27.0.1; 10 CPUs (4 performance and 6 efficiency cores), 17,179,869,184 bytes of memory | the same |
| Node | v22.22.2, npm 10.9.7 (`<programme>/toolchain/node-v22.22.2-darwin-arm64/bin`, first on PATH) | the same |
| the build | `npm run build` once, under `nice -n 10`: version 1.1.0-rc.2, 57 JavaScript files in `dist/`, digest `21b80ef0dcafb71f108a397e015218083e1cf346741961b4b36ff429c8888109` as `tools/load.mjs` takes it | the same version, count and digest |
| installed in the checkout | TypeScript 5.9.3, tsup 8.5.1, esbuild 0.27.7, astronomy-engine 2.1.19, vitest 2.1.9 | the same |
| the system Python | 3.9.6 (`/usr/bin/python3`, run with `-I -B`): F1's `varga_changes.py --check`, G-V1's `boundary_fixtures.py --output`, section 7's `derived_bounds.py` and its control | 3.9.6, recorded; no step of `--g-v4` runs it |
| the OQ6 environment's Python | 3.11.16 (`<programme>/toolchain/py311-oq6/venv/bin/python`, outside every repository, approved under OQ6, run with `-I -B`): G-V4's `varga_ascendant.py`, the comparison, and C4a, which had started when the run was stopped | 3.11.16, the same: G-V4's comparison, C4a and C4b |
| pyerfa | 2.0.1.5 | 2.0.1.5 |
| numpy | 2.4.6 | 2.4.6 |
| pyswisseph | not used | not used |
| environment variables | `TMPDIR` in the run's scratch folder, outside the checkout; `npm_config_offline=true`; `GIT_NO_LAZY_FETCH=1`; `GIT_OPTIONAL_LOCKS=0`; `NODE_OPTIONS` unset | the same |
| priority and workers | `nice -n 10`; 10 worker threads for G-V3's checker and its controls | `nice -n 10`; the `--g-v4` mode uses no workers |
| logs | `results/00-start.log` (all of the above at the start), `results/01-build.log` (the build), and the first lines of every log in `results/` | `results-erfa/00-start.log`, `results-erfa/01-build.log` (the build and its digest), and the first lines of every log in `results-erfa/` |

The tools' outputs record what they ran on: `results/run.json`,
`results/time-per-arcsecond.json` and `results-erfa/run.json` the build's
version and digest, Node and the platform; `results/derived-bounds.json` the
system Python's version; `results-erfa/compare.json`, `control-c4a.json` and
`control-c4b.json` the OQ6 Python's version and pyerfa's. The arbiter does not
record numpy's version, which the logs give.
