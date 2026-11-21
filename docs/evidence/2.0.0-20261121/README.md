# 2.0.0: gates, archive and sizes

The `2.0.0` major release (`ZOD-345`): `2.0.0-rc.6` (merged on `main` at
`d9d4cad4`, pull request 142) with the version changed and nothing else under
`dist/`. Cut on 2026-11-21 under the owner's delegation of 2026-11-21 15:06
Asia/Bangkok.

## Gates (Node v22.22.2)

Run locally on Node `v22.22.2` with npm `10.9.7` (ICU 78.2, tz 2025c). CI's
workflows on GitHub Actions remain the authority.

| Gate | Result | Log / Generator |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | pass (18 entry points match `api/`, `git diff d9d4cad4 -- api/` empty) | `results/api-check.log` |
| `npm run package:contents` | pass (101 files, 4,782,240 unpacked, 1,462,688 of 1,463,000 beside DE440 pack; 0 entry budgets raised) | `results/package-contents.log` |
| `npm run pack:dry-run` | 101 files (same 101 names as 2.0.0-rc.6) | `results/pack-dry-run.log` |
| `python3 docs/evidence/2.0.0-20261121/distcmp.py` | 95 of 95 files EQUAL after normalizing `"2.0.0"` to `"2.0.0-rc.6"` (only `chunk-SCBK24HR.js` and `core.js` carry the version string); mutation check caught a synthetic change to a copy of `dist/index.js` | `distcmp.py`, `results/dist-vs-rc6.txt` |
| `node docs/evidence/2.0.0-20261121/verify-equivalence.mjs` (property test + boundaries) | 1,000/1,000 seeded random instants (1800 to 2199, LCG seed `20261121`) bit-identical to `2.0.0-rc.6` in Node `v22.22.2`; all 4 `2027-10-02` boundary charts identical excluding `engineVersion` | `verify-equivalence.mjs`, `results/property-1000.json` |
| `node docs/evidence/2.0.0-20261121/verify-equivalence.mjs` (earlier readers) | `2.0.0-rc.3` and `2.0.0-rc.6` read both synthetic inputs A and C; `1.1.0` reads A and refuses continuous-UTC input C as `unsupported_feature` | `verify-equivalence.mjs`, `results/earlier-readers.json` |
| Conformance suite 0.3.0 (`selftest`, `validate --expect-total 640`, both `run.mjs --check`, `report.mjs --check`) | selftest 13 pass; 640 vectors conform; DE440 569 pass / 0 fail / 71 unsupported; astronomy-engine 341 pass / 228 fail / 71 unsupported; all verdicts equal `2.0.0-rc.6` | `results/conformance.log` |
| Six-runtime conformance (Linux x64, GitHub Actions run `44883848231`) | all 569 supported verdicts on both root and `@zodiacs/engine/core` agree with Node 22.22.2 across Bun 1.4.4, Deno 2.9.6, Chromium 156.0.8078.4, Firefox 157.0 and WebKit 27.2; `matrix.json` and `core/matrix.json` identical to `2.0.0-rc.6` | `../runtime-conformance-2.0.0-20261121/` |
| Atlas (`check.mjs`, `selftest.mjs`) | pass; 26 selftest pass | `results/atlas.log` |
| Span ends (`span-ends.mjs`) | `natalChartLastUtc` 3998-09-03T05:58:50.816Z; `calcLastUtc` 2199-12-31T23:58:50.815Z | `results/span-ends.json` |
| VSOP2013 guard (`grep -ril vsop2013 dist/`, ZOD-307) | no matches (exit 1) | `results/vsop2013-check.log` |
| Records across the major (`npx vitest run src/receipt-major-readers.test.ts`) | pass across all 32 carried archives (158 envelopes, `0.1.1-rc.7` through `2.0.0`) | `../records-2.0.0-20261120/` |

## Carried archive and carrier checks

- Source commit: `174437a534f4bf92ce5d5d1c99df0774d8855f13` (packed files
  identical to `d22167501021acf9e992f8bd8eea85bf9f8f987a`).
- Carrier commit: `fbcde2cbdb962baa1d0e5d60f6e45cc0b76c7e4f` ("Carry the
  packed 2.0.0 tarball").
- Archive: `artifacts/zodiacs-engine-2.0.0.tgz`, **2,788,540 bytes**,
  **101 files**, SHA-256
  `6087d455276ba633eb0a2370c0a5f740ddd5b257c59b821f501c9b06d228a3e2`.
- `node scripts/verify-release-archive.mjs 2.0.0`: pass
  (`results/release-archive.log`).
- `node scripts/verify-archive-binding.mjs`: pass; rebuilt HEAD
  (`fbcde2cbdb96`) byte-identically on Node `v22.22.2` across 36 recorded
  archives (32 carried, 4 superseded) and 576 commits
  (`results/archive-binding.log`).
- `node scripts/verify-packed-consumer.mjs <checkout>/artifacts/zodiacs-engine-2.0.0.tgz`:
  pass across all runtime, fallback, `ERR_ZODIACS_ESM_ONLY` (20 entries) and
  TypeScript `5.9.3` type checks (`results/packed-consumer.log`).
- `tar -xOf artifacts/zodiacs-engine-2.0.0.tgz package/README.md | grep -n -i "unreleased\|not published\|draft for the owner"`:
  empty.

## Sizes and cap

Measured on this release's build (`results/package-contents.log`):

- All 20 entry-point import graphs remain inside their `2.0.0-rc.6` budgets
  (every graph carrying `ENGINE_VERSION` shrank by 5 bytes because `"2.0.0"`
  is 5 bytes shorter than `"2.0.0-rc.6"`). No entry budget is raised.
- Zone histories: 188,964 bytes of 200,000 in 16 files.
- Package unpacked beside the DE440 pack: **1,462,688 bytes** in 101 files
  (total unpacked 4,782,240 bytes; DE440 pack 3,319,552 bytes), up 3,726
  bytes from `2.0.0-rc.6`'s 1,458,962 bytes.
- `TOTAL_CAP` in `scripts/verify-package-contents.mjs` is raised from
  1,459,000 to **1,463,000** (the measurement rounded up to the next 1,000
  bytes), approved under the owner's delegation of 2026-11-21 15:06
  Asia/Bangkok.

## Reproduce equivalence checks

From the repository root on Node `v22.22.2` after `npm ci && npm run build`:

```sh
python3 docs/evidence/2.0.0-20261121/distcmp.py
node docs/evidence/2.0.0-20261121/verify-equivalence.mjs
```

Nothing was tagged, released or published. All birth data in tests and
evidence is synthetic.
