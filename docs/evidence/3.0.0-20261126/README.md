# 3.0.0's cut

The measurements behind the sizes that the 3.0.0 entry of `CHANGELOG.md` and
`docs/releases/v3.0.0-release-notes-DRAFT.md` give, made on 26 November 2026
on the cut's tree: branch `admin/engine-3.0.0` with the version changed to
3.0.0, written from git objects into a new folder under `/tmp` (outside the
checkout, with no `package.json` or `node_modules` above it), installed with
`npm ci --ignore-scripts`, built with `npm run build` and packed with
`npm pack --ignore-scripts`. The machine was macOS on Apple silicon (arm64).
Unless a file says otherwise, Node was the official 22.22.2 build for
darwin-arm64 with npm 10.9.7, whose zlib is Chromium's (1.3.1-e00f703). CI
runs on Linux x64.

| File | Command | What it gives |
| --- | --- | --- |
| `results/package-size.json` | `node docs/evidence/3.0.0-20261126/measure-archive.mjs zodiacs-engine-3.0.0.tgz` | the archive: 2,889,273 bytes, 107 files, 4,903,887 bytes unpacked, of which 3,319,552 are the DE440 pack's base64 and 170,000 the minor-body tables'; the rest, 1,414,335, is under the cap of 1,463,000 |
| `results/package-contents.txt` | `node scripts/verify-package-contents.mjs`, in the built tree | the check passes; each entry point's import graph beside the pack and the tables, and its budget |
| `results/build.txt` | the line that `scripts/build-chunk-imports.mjs` prints in `npm run build` | 71 bare chunk imports taken out of 13 entry files |
| `results/bundles-node-22.22.2.json` | `node docs/evidence/3.0.0-readme-20261126/measure-bundles.mjs`, in the built tree | esbuild 0.27.7 browser bundles of an application, minified, then gzipped at level 9: the root's `natalChart` 79,787 and 36,624 bytes; with `useDe440` 3,419,715 and 2,402,512; with Chiron alone 104,011 and 50,747, 24,224 and 14,123 more; with all five minor bodies 260,349 and 152,554, 180,562 and 115,930 more |
| `results/bundles-node-26.4.0.json` | the same, with Homebrew's Node 26.4.0 | the same minified sizes; gzipped by its system zlib (1.2.12), 36,213 for the root's `natalChart`, the figure README.md gives, and 2,441,053 with `useDe440` |

The official Node 24.13.0 build (npm 11.6.2) packed the same archive, byte
for byte, and measured the same bundles as Node 22.22.2. Gzipped sizes
depend on the zlib that compresses them: Homebrew's Node 26.4.0 links the
system's zlib where the official builds carry Chromium's, and the two give
different bytes for the same input. The archive is gzipped too: from the
carried 2.1.0 archive's source commit, the official Node 22.22.2 and 24.13.0
builds pack that archive byte for byte, and Homebrew's Node 26.4.0 packs the
same tar into 2,828,719 bytes in place of 2,790,732.
`docs/evidence/3.0.0-readme-20261126/`, which README.md cites, measured on
Node 26.4.0.

The conformance results of this build (`conformance/results/zodiacs-engine.json`
and `conformance/results/zodiacs-engine-astronomy-engine.json`) were written
by the harness (`run.mjs --out`, then `report.mjs`) on the same Node 22.22.2.
Every verdict is the one the 2.1.0 files held. On the pack the residuals of
L1-POS-0153 to L1-POS-0160, and on astronomy-engine the residual of
L1-POS-0110 and the timing estimate of L4-STA-0013, differ from those files'
in the ninth to twelfth significant digit: the 2.1.0 files were not written
on this machine, and results computed on arm64 and x64 can differ in their
last bits (`src/time-scale-near-end.test.ts` and
`src/techniques/site-parity.test.ts` hold x64 results to the bit, and fail
here).
