# 2.0.0-rc.4: gates, archive and sizes

The fourth candidate for 2.0.0, on main at `900455f` (2.0.0-rc.3 with pull
request 139) with three fixes, which the owner approved, with this cut, on
20 November 2026 (CHANGELOG.md, 2.0.0-rc.4):

- `require()` of `@zodiacs/engine` or of any entry point throws an `Error`
  with code `ERR_ZODIACS_ESM_ONLY`, through a `"require"` condition on each
  of the 20 exports that points at `dist/esm-only.cjs`;
- the root refuses a name that is not a body with `RangeError("Unknown
  body: ...")` before any source is asked, where on the default source the
  DE440 reader's `De440Error` reached the caller;
- the README's *Configurable aspects* and *Declinations and parallels*
  examples build their own chart and run as pasted.

| Commit | What |
| --- | --- |
| `2eb863f1f4f4a490be83a27bf692096569dc4cd7` | the three fixes, still 2.0.0-rc.3 |
| `4c2bd2c7a3296dc6112deb45965efc27bdbe7376` | "Begin 2.0.0-rc.4": version, CHANGELOG, README, budgets; the archive's source commit |
| `edaf0705610b6c9f83092a1df88242213b8f9c48` | "Carry the packed 2.0.0-rc.4 tarball" |
| `cb5727cf6510fbbab65e2eff1dbe9e5c42ad00bc` | the envelopes 2.0.0-rc.4 writes (`src/fixtures/receipts-by-writer/2.0.0-rc.4.json`) |

This folder is added in the commit after those. None of the commits after
the source commit changes a packed file.

## Gates

Run locally on Node 22.23.4 with npm 10.9.9 (Linux x86-64,
`results/node-22.23.4.txt`) on the tree of `e56782c`, with the archive
carried; paths in the logs are shortened to `<checkout>`,
`<node-22.23.4>`, `<scratch>` and `$TMPDIR`. CI's gates are the authority
(`.github/workflows/`); conformance there runs on Node 22.22.2, which this
host does not have.

| Gate | Result | Log |
| --- | --- | --- |
| `npm run typecheck` | pass | `results/typecheck.log` |
| `npm test` | 5,466 passed, 4 skipped, 24 failed, all 24 in `scripts/verify-archive-binding.test.mjs` (below) | `results/test.log` |
| `npm run build` | pass | `results/build.log` |
| `npm run exports:smoke` | pass | `results/exports-smoke.log` |
| `npm run api:check` | pass | `results/api-check.log` |
| `npm run package:contents` | pass, with the budgets and cap below | `results/package-contents.log` |
| `npm run pack:dry-run` | 101 files | `results/pack-dry-run.log` |
| conformance selftest, `validate.mjs --expect-total 640`, `run.mjs --check` for both of this engine's runs, `report.mjs --check` | selftest 13 pass; 640 vectors conform; default source 569 pass, 0 fail, 71 unsupported; on astronomy-engine 341 pass, 228 fail, 71 unsupported; every verdict matches the committed results, which are current | `results/conformance.log` |
| `node atlas/tools/check.mjs`, `node --test atlas/tools/selftest.mjs` | pass; selftest 26 pass | `results/atlas.log` |
| `node scripts/verify-packed-consumer.mjs` | **not run**: refused at its guard (below) | `results/consumer-v22.23.4.log` |
| `node scripts/verify-archive-binding.mjs` | **not run**: refused at its guard (below) | `results/archive-binding.log` |

The 4 skipped tests are the 3 tier B kernel tests, which the DE440 tier B
job runs, and the tzdata 2025c test in `src/geo/zone-history.test.ts`,
which runs only on a host with tzdata 2025c. Both are skipped by design.
`scripts/root-unchanged.test.mjs` passed, 3 of 3, against the carried
2.0.0-rc.4 archive, and `src/receipt-major-readers.test.ts` passed with the
new fixture.

This host has a `node_modules` directory at the filesystem root, so every
temporary directory has one above it. `scripts/verify-archive-binding.mjs`
and `scripts/verify-packed-consumer.mjs` refuse to start there ("/node_modules
lies at or above the temporary directory"), and so do the 24 tests of
`scripts/verify-archive-binding.test.mjs`, which start the check: 22 of
the 24 failures print that message, and the other 2 stop at the check's
exit status of 1 without printing its output. The guard was not changed.
The same 24 tests failed on `2eb863f`, before this cut, as that commit's
handoff records.
These checks are left to CI: the engine job's archive check and unit tests,
the archives job's `--rebuild-all`, and the packed-consumer job.

In their place, and not as a substitute for them, the carried archive was
installed by hand into an empty consumer under `/tmp` (`npm install` of
the tarball; `results/manual-consumer.log`, with its script
`results/manual-consumer-check.mjs`): `require()` was refused with
`ERR_ZODIACS_ESM_ONLY` on 20 of 20 entry points, `import()` from CommonJS
loaded the package, `natalChart` computed on the default source `de440`,
`ENGINE_VERSION` is `2.0.0-rc.4`, and `searchLongitudeCrossings("Vulcan",
...)` threw `RangeError: Unknown body: Vulcan`.

## Conformance results

The committed results (`conformance/results/`, `RESULTS.md`,
`summary.json`) were not regenerated for this candidate: the rule is to
regenerate them with the harness on Node 22.22.2, which this host does not
have. They still name 2.0.0-rc.3 as the engine that made them. Every
verdict of 2.0.0-rc.4 matches them on Node 22.23.4 (above); CI's
conformance job checks the same on Node 22.22.2.

## Sizes

Measured on this candidate's build with `npm run package:contents`
(`results/package-contents.log`). Nine import graphs were over their
budgets, each by the 143 bytes the body check adds to every graph that
holds `src/ephemeris.ts`; the root had 27 bytes to spare. Each budget is
raised to the measurement rounded up to the next 100 bytes:

| Entry | Old budget | 2.0.0-rc.3 | 2.0.0-rc.4 | New budget |
| --- | ---: | ---: | ---: | ---: |
| `.` | 154,200 | 154,173 | 154,316 | 154,400 |
| `./calc` | 205,400 | 205,334 | 205,477 | 205,500 |
| `./core` | 110,800 | 110,765 | 110,908 | 111,000 |
| `./internal` | 112,400 | 112,381 | 112,524 | 112,600 |
| `./sky` | 139,900 | 139,835 | 139,978 | 140,000 |
| `./techniques` | 207,600 | 207,561 | 207,704 | 207,800 |
| `./timing` | 173,500 | 173,476 | 173,619 | 173,700 |
| `./vedic` | 189,300 | 189,208 | 189,351 | 189,400 |
| `./window` | 152,800 | 152,731 | 152,874 | 152,900 |
| package beside the pack | 1,438,000 | 1,437,512 | 1,446,177 | 1,446,200 |

The cap is raised to the measurement rounded up to the next 100 bytes. The
2.0.0-rc.3 column is that candidate's record
(`docs/evidence/2.0.0-rc.3-20261117/`). The other graphs are inside their
budgets, unchanged; the zone histories are 188,964 bytes of 200,000 in 16
files. The budgets and the cap are for the owner to decide with the
candidate.

## Figures measured on this build

- **The span's ends** (README): `span-ends.mjs` from
  `docs/evidence/continuous-utc-20261117/` on the checkout's build of the
  source commit, Node 22.23.4: natalChart's last UTC
  3998-09-03T05:58:50.816Z, calc's 2199-12-31T23:58:50.815Z
  (`results/span-ends.json`), the same as on 2.0.0-rc.3.
- **Bundle sizes**: not measured again. The README's *Bundle size in a web
  page* gives 2.0.0-rc.3's figures and says they were measured on
  2.0.0-rc.3's archive.

## The archive

Packed once from a clean tree of the source commit (`git archive`, `npm
ci`, `npm run build`, `npm pack --ignore-scripts`) on Node 22.23.4 with npm
10.9.9 (`results/pack.log`): `zodiacs-engine-2.0.0-rc.4.tgz`, SHA-256
`6e334f19cf2db7acc8c834b307f37cb67733979e1c43672d914d68eefe7a2e4d`,
2,784,281 bytes, 101 files, 4,765,729 unpacked. The pack of the working
checkout, built on the same Node, gave the same bytes. Its `package.json`,
`README.md`, `CHANGELOG.md`, `LICENSE`, `LICENSING.md` and `NOTICE` are
byte-identical to the source commit's, and `dist/esm-only.cjs` to
`src/esm-only.cjs`. 2.0.0-rc.3's archive, receipt, entry and row are
unchanged.

Nothing was tagged, released or published. All birth data in the tests and
evidence is synthetic.