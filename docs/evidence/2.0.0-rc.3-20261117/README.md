# 2.0.0-rc.3: gates, archive and sizes

The third candidate for 2.0.0, on main at `373ceda` (2.0.0-rc.2, merged in
pull request 112). The owner chose its set on 17 November 2026 ("Yes,
minus Yellowknife"): six signed-off pull requests, each merged with a merge
commit, in this order (CHANGELOG.md, 2.0.0-rc.3):

| Pull request | Head | Merge |
| --- | --- | --- |
| 114, Julian Day Numbers and local mean time in `./geo` | `c37e5eb` | `0a95e6c` |
| 115, near-miss birth keys refused | `fccf083` | `720eaab` |
| 117, `host-zone-data-differs` | `a73a8f1` | `c473cc5` |
| 118, tzdata 2026f, America/Yellowknife held at 2025c | `a41005a` | `a07bc78` |
| 119, the continuous-UTC rule | `34b0cee` | `c137cca` |
| 121, `@zodiacs/engine/core` | `8fa20ac` | `bda5ddb` |

Pull requests 120 and 122 are not in it. Source commit:
`0d41826f592d95a094e9234730dd594de5411e47` ("Begin 2.0.0-rc.3"). Carrier:
"Carry the packed 2.0.0-rc.3 tarball" (`4c2355c`).

## Merges

Three merges conflicted, each resolved by hand and named in its message:
117 (`docs/time.md`: both new sections kept, the day numbers' then the
host's zone data; `api/geo.api.md` regenerated), 118 (117's
`src/geo/timezone.ts` kept, 118's comment on `offsetAt` moved to
`src/geo/local-clock.ts`, where the code now is; `docs/time.md` names both
pinned archives' digests) and 121 (five `api/` reports, all 18 regenerated
with `npm run api:report`). 114, 115 and 119 merged without conflict.

## Gates on the source commit

Run locally on Node 22.22.2 (Linux x86-64, `results/node-22.22.2.txt`), in
a checkout with full history and `TMPDIR` outside it, except the packed
consumer and the archive check, which ran on Node 22.23.4 with npm 10.9.9 as
CI's default Node does; paths in the logs are shortened to `<checkout>`,
`<node-22.22.2>`, `<scratch>` and `$TMPDIR`.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm test` | 4,524 passed, 6 skipped; 1 file failed by design (below) | `results/test.log` |
| `npm run build` | pass | `results/build.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | 18 entry points match `api/` | `results/api-check.log` |
| `npm run package:contents` | pass, with the budgets and cap below | `results/package-contents.log` |
| `npm run pack:dry-run` | 100 files | `results/pack-dry-run.log` |
| conformance selftest, `validate.mjs --expect-total 500`, `run.mjs --check` for both of this engine's runs, `report.mjs --check` | 499 pass, 0 fail, 1 unsupported (on astronomy-engine 307, 192, 1); every verdict matches | `results/conformance.log` |
| `node atlas/tools/check.mjs`, `node --test atlas/tools/selftest.mjs` | pass | `results/atlas.log` |
| offline CLI consumer, `tools/cli/scripts/prepare-consumer.mjs` | 29 checks passed; the 1.0.0-rc.2 archive matches its pinned baseline | `results/offline-cli.log`, `results/offline-cli-consumer-report.json` |
| client contract generators `--check`, the TypeScript client's typecheck, build, `checks/run.mjs` and `checks/consumer.mjs` | pass | `results/client-contract.log` |
| `build-tz-shards.mjs --check` (tzdata 2026f) and `build-host-zone-probes.mjs --check` (2026f against 2021a), on the archives the fetch job recorded | `src/tzdb/` and the probe table match | `results/tz-generated.log` |

The 6 skipped tests are the 3 tier B kernel tests, which the DE440 tier B
job runs, and the 3 of `scripts/root-unchanged.test.mjs`. That file (pull
request 121) holds the root to the carried archive of the version in
`package.json`; at the source commit no 2.0.0-rc.3 archive is carried yet,
so its setup fails ("artifacts/archives.json carries no archive of
2.0.0-rc.3") and its tests are skipped. On the carrier it passes, 3 of 3
(`results/root-unchanged.log`). This is why, unlike 2.0.0-rc.2, the archive
was carried before the gate workflows ran: the CI unit-test step cannot pass
on the source commit alone.

## Conformance results

`conformance/results/zodiacs-engine.json`,
`conformance/results/zodiacs-engine-astronomy-engine.json`,
`conformance/results/summary.json` and `conformance/RESULTS.md` were
regenerated on the source tree with the harness (`run.mjs --out` for both
runs, then `report.mjs`) on Node 22.22.2. They name 2.0.0-rc.3 and
`tzdb 2026f`. No verdict differs from the pull requests' own runs: pull
request 114's 40 calendar and local mean time vectors pass, and the leap
second instant is the one vector left unsupported.

The offline CLI check held the carried 1.0.0-rc.2 archive to the
astronomy-engine results file, which now passes 40 vectors that archive
cannot answer. As pull request 114 asked the candidate to settle, it now
reads its own baseline,
`tools/cli/baselines/engine-1.0.0-rc.2-node-22.22.2.json`: the 500 ids and
verdicts of that file at `373ceda` (267 pass, 192 fail, 41 unsupported).

## Sizes

Measured on this candidate's build with `npm run package:contents`
(`results/package-contents.log`). Twelve import graphs were over their
budgets; each budget is raised to the measurement rounded up to the next
100 bytes (CHANGELOG.md has the reasons):

| Entry | Old budget | 2.0.0-rc.2 | 2.0.0-rc.3 | New budget |
| --- | ---: | ---: | ---: | ---: |
| `.` | 151,700 | 151,563 | 154,173 | 154,200 |
| `./calc` | 204,100 | 203,138 | 205,334 | 205,400 |
| `./core` | 109,600 | (none) | 110,765 | 110,800 |
| `./geo` | 36,500 | 36,178 | 47,715 | 47,800 |
| `./internal` | 110,900 | 110,362 | 112,381 | 112,400 |
| `./receipt` | 77,400 | 76,845 | 81,110 | 81,200 |
| `./sky` | 138,600 | 137,816 | 139,835 | 139,900 |
| `./techniques` | 207,300 | 205,247 | 207,561 | 207,600 |
| `./time` | 42,600 | 42,530 | 44,485 | 44,500 |
| `./timing` | 171,200 | 170,866 | 173,476 | 173,500 |
| `./vedic` | 187,100 | 186,598 | 189,208 | 189,300 |
| `./window` | 151,500 | 150,577 | 152,731 | 152,800 |
| package beside the pack | 1,289,000 | 1,284,237 | 1,437,512 | 1,438,000 |

The cap is raised to the measurement rounded up to the next 1,000 bytes;
the owner approved raising it for the core entry on 17 November 2026. The
other graphs are inside their budgets, unchanged; the zone histories are
188,964 bytes of 200,000 in 16 files.

## Figures measured on the archive

- **Bundle sizes** (README, *Bundle size in a web page*):
  `tools/bundle-weight/measure.mjs` on the carried archive, Node 22.22.2,
  esbuild 0.28.2, Rollup 4.67.4, Vite 8.3.5, webpack 5.112.2
  (`results/bundle-weight/results.json`, `report.md`; 41 checks, 0 failed).
  Browser load times were not measured: Playwright's Chromium download is
  blocked by this workspace's network policy. The root's page is 3,416,191
  to 3,418,817 bytes (2,279,842 to 2,281,947 with brotli), and 3,416,351 to
  3,418,978 after `setDefaultEphemeris("astronomy-engine")`; the core
  entry's 77,042 to 80,192 (28,800 to 30,554 with brotli); loaded on a
  click, the first script is 745 to 2,534 bytes and the pack's file
  3,415,737 to 3,446,051.
- **The span's ends** (README; CHANGELOG.md): `span-ends.mjs` from
  `docs/evidence/continuous-utc-20261117/` on the carried archive's
  package: natalChart's last UTC 3998-09-03T05:58:50.816Z, calc's
  2199-12-31T23:58:50.815Z (`results/span-ends.json`), as pull request 119
  measured on its branch.
- **Horizons**: `horizons-comparison.mjs` on the same package gives the
  same figures as pull request 119's `horizons-this-tree.json` but for the
  version (`results/horizons-2.0.0-rc.3.json`).

## The archive

Packed once from a clean tree of the source commit (`git archive`, `npm
ci`, `npm run build`, `npm pack --ignore-scripts`) on Node 22.23.4 with npm
10.9.9: `zodiacs-engine-2.0.0-rc.3.tgz`, SHA-256
`d465137931f5d28910443ca7ef01610606e9f708704364c61811d2936dc4ec55`,
2,781,676 bytes, 100 files, 4,757,064 unpacked. The pack of the working
checkout, built on Node 22.22.2, gave the same bytes. Its `dist/` is
byte-identical to that of the archive packed before the documents were
final, on which the bundle sizes were first measured; only CHANGELOG.md,
README.md, NOTICE and LICENSING.md differ.

On the carrier, `node scripts/verify-archive-binding.mjs` rebuilt HEAD and
found the archive byte-identical, with 32 recorded archives bound across
479 commits (`results/archive-binding.log`). The packed consumer passed on
it (`results/consumer-v22.23.4.log`). 2.0.0-rc.2's archive, receipt, entry
and row are unchanged.

Nothing was tagged, released or published. All birth data in the tests and
evidence is synthetic.
