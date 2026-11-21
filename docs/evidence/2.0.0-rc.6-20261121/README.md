# 2.0.0-rc.6: gates, archive and sizes

The sixth candidate for 2.0.0 (`ZOD-344`), cut on `main` at `ed8be41`
(2.0.0-rc.5, pull request 140) with pull request 128 (`f8a7e7e`, Tehran 1979
host time zone probe, signed off under `ZOD-340`) merged by merge commit,
`ZOD-341`'s `LICENSING.md` and `NOTICE` updates, correction 18, the 2.x
README lines, regenerated suite 0.3.0 conformance results on Node 22.22.2,
and six-runtime conformance on Linux x64 (`docs/evidence/runtime-conformance-20261121/`).

| Commit | What |
| --- | --- |
| `f2f59147` | merge pull request 128 (`f8a7e7e`) with `--no-ff` |
| `b25c55cb0543f8dfbc1818b4287665efd1321b67` | "Begin 2.0.0-rc.6": version, CHANGELOG, README, LICENSING.md, NOTICE, budgets, conformance results |
| `1a2e176b1daf2f4d5100877f0e855c248ab25a76` | "Finalize 2.0.0-rc.6 packed docs with six-runtime evidence and log paths"; the archive's `sourceCommit` |
| `b8fe833e32d5bf7b3469031795e67cccb8453bd5` | "Carry the packed 2.0.0-rc.6 tarball" |

This folder and the `2.0.0-rc.6` records fixture are added in the commit
after the carrier. No commit after the source commit changes a packed file.

## Gates

Run locally on Node `v22.22.2` with npm `10.9.7` (ICU 78.2, tz 2025c) on the
carrier tree (`b8fe833e32d5`), with `TMPDIR` outside the checkout. CI's
workflows on GitHub Actions remain the authority.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | pass (18 entry points match `api/`) | `results/api-check.log` |
| `npm run package:contents` | pass (101 files, 4,778,514 unpacked, 1,458,962 of 1,459,000 beside DE440 pack) | `results/package-contents.log` |
| `npm run pack:dry-run` | 101 files | `results/pack-dry-run.log` |
| Conformance suite 0.3.0 (`selftest`, `validate --expect-total 640`, both `run.mjs --check`, `report.mjs --check`) | selftest 13 pass; 640 vectors conform; DE440 569 pass / 0 fail / 71 unsupported; astronomy-engine 341 pass / 228 fail / 71 unsupported; all verdicts match | `results/conformance.log` |
| Atlas (`check.mjs`, `selftest.mjs`) | pass; 26 selftest pass | `results/atlas.log` |
| `node scripts/verify-release-archive.mjs 2.0.0-rc.6` | pass (matches carried entry and receipt) | `results/release-archive.log` |
| `node scripts/verify-archive-binding.mjs` | pass (rebuilt HEAD `b8fe833e32d5` byte-identical on Node `v22.22.2`; 35 recorded archives across 570 commits) | `results/archive-binding.log` |
| `node scripts/verify-packed-consumer.mjs` | pass on Node `v22.22.2`, TypeScript 5.9.3, 20/20 `ERR_ZODIACS_ESM_ONLY`, DE440, fallback and types | `results/packed-consumer.log` |
| `dist/` comparison against `2.0.0-rc.5` | 94 of 95 `dist/` files identical after normalizing version string; only `dist/geo.js` grew by +9 bytes (17,823 to 17,832, PR 128) | `results/dist-vs-rc5.txt` |
| Tehran 1979 host probe on Node 22.22.2 (tz 2025c) | both `Asia/Tehran` and `Iran` at 1979-05-26 12:00 resolve to 08:30Z with `host-zone-data-differs` | `results/host-says-22.22.2.json` |
| Span ends (`span-ends.mjs`) | `natalChartLastUtc` 3998-09-03T05:58:50.816Z; `calcLastUtc` 2199-12-31T23:58:50.815Z | `results/span-ends.json` |
| Tamper check (1-byte flip on a copy under `/tmp`) | `verify-release-archive.mjs` exited 1 with SHA-256 mismatch | `results/tamper-check.log` |
| Records across the major (`later-reader.mjs` + `src/receipt-major-readers.test.ts`) | 31 carried archives, 153 envelopes read; 628/628 tests passed | `../records-2.0.0-20261120/` |
| Six-runtime conformance on Linux x64 (CI run `44881492972`) | 569/569 supported verdicts agree with Node 22.22.2 across Bun, Deno, Chromium, Firefox and WebKit on root and core | `../runtime-conformance-20261121/` |

## Sizes and cap

Measured on this candidate's build (`results/package-contents.log`):

- All 20 entry-point import graphs remain inside their `2.0.0-rc.5` budgets.
  `./geo` grew by 9 bytes, from 47,715 to 47,724 (budget 47,800), from pull
  request 128's Tehran 1979 probe. Every other entry-point import graph is
  unchanged from `2.0.0-rc.5`.
- Zone histories: 188,964 bytes of 200,000 in 16 files.
- Package unpacked beside the DE440 pack: **1,458,962 bytes** in 101 files
  (total unpacked 4,778,514 bytes; DE440 pack 3,319,552 bytes), up 9,047
  bytes from `2.0.0-rc.5`'s 1,449,915 bytes due to pull request 128 (+9
  bytes), `ZOD-341`'s `LICENSING.md` and `NOTICE` updates, the `2.0.0-rc.6`
  `CHANGELOG.md` entry and the 2.x `README.md` updates.
- `TOTAL_CAP` in `scripts/verify-package-contents.mjs` is raised from
  1,450,000 to **1,459,000** (the measurement rounded up to the next 1,000
  bytes), for the owner to approve with this candidate.

## The archive

Packed once from a clean tree of source commit
`1a2e176b1daf2f4d5100877f0e855c248ab25a76` (`git archive`, `npm ci`,
`npm run build`, `npm pack --ignore-scripts`) on Node `v22.22.2` with npm
`10.9.7`:

- File: `artifacts/zodiacs-engine-2.0.0-rc.6.tgz`
- SHA-256: `59217e2b12126f424554811b21d1902e9b4f9b2014e2fbf9ca1f06f2bf587631`
- Bytes: 2,788,419
- Files: 101 (4,778,514 bytes unpacked)

Nothing was tagged, released or published. All birth data in tests and
evidence is synthetic.
