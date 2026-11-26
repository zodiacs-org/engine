# 3.0.0's cut

The measurements behind the sizes that the 3.0.0 entry of `CHANGELOG.md` and
`docs/releases/v3.0.0-release-notes-DRAFT.md` give, made on 27 November 2026
on the cut's tree: branch `admin/engine-3.0.0-r3`, with the version changed
to 3.0.0 after the fixes of the two independent reviews of the candidate
(the second review's on `4f4aae99`), written
from git objects into a new folder under `/tmp` (outside the checkout, with
no `package.json` or `node_modules` above it), installed with
`npm ci --ignore-scripts --no-audit --no-fund`, built with `npm run build`
and packed with `npm pack --ignore-scripts`, as
`scripts/verify-archive-binding.mjs` rebuilds an archive. The machine was
macOS on Apple silicon (arm64). Unless a file says otherwise, Node was the
official 22.22.2 build for darwin-arm64 with npm 10.9.7, whose zlib is
Chromium's (1.3.1-e00f703). CI runs on Linux x64.

| File | Command | What it gives |
| --- | --- | --- |
| `results/package-size.json` | `node docs/evidence/3.0.0-20261127/measure-archive.mjs zodiacs-engine-3.0.0.tgz` | the archive: 2,891,227 bytes, 107 files, 4,909,679 bytes unpacked, of which 3,319,552 are the DE440 pack's base64 and 170,000 the minor-body tables'; the rest, 1,420,127, is under the cap of 1,463,000 |
| `results/package-contents.txt` | `node scripts/verify-package-contents.mjs`, in the built tree | the check passes; each entry point's import graph beside the pack and the tables, and its budget |
| `results/build.txt` | the line that `scripts/build-chunk-imports.mjs` prints in `npm run build` | 71 bare chunk imports taken out of 13 entry files |
| `results/bundles-node-22.22.2.json` | `node docs/evidence/3.0.0-readme-20261126/measure-bundles.mjs`, in the built tree | esbuild 0.27.7 browser bundles of an application, minified, then gzipped at level 9: the root's `natalChart` 79,787 and 36,624 bytes; with `useDe440` 3,419,715 and 2,402,512; with Chiron alone 104,048 and 50,756, 24,261 and 14,132 more; with all five minor bodies 260,393 and 152,566, 180,606 and 115,942 more |
| `results/bundles-node-26.4.0.json` | the same, with Homebrew's Node 26.4.0 | the same minified sizes; gzipped by its system zlib (1.2.12), 36,213 for the root's `natalChart` and 2,441,053 with `useDe440` |
| `results/zlib-and-2.1.0.txt` | 2.1.0's source commit packed again, as above, on three Nodes | the official Node 22.22.2 and 24.13.0 builds give the carried 2.1.0 archive byte for byte; Homebrew's Node 26.4.0 gives the same tar in 2,828,719 bytes of gzip in place of 2,790,732 |

The official Node 24.13.0 build (npm 11.6.2) packed the same archive, byte
for byte. Gzipped sizes depend on the zlib that compresses them: Homebrew's
Node 26.4.0 links the system's zlib where the official builds carry
Chromium's, and the two give different bytes for the same input. The
archive is gzipped too: from the carried 2.1.0 archive's source commit, the
official Node 22.22.2 and 24.13.0 builds pack that archive byte for byte,
and Homebrew's Node 26.4.0 packs the same tar into 2,828,719 bytes in place
of 2,790,732 (`results/zlib-and-2.1.0.txt`). Pack and check archives with an
official build.

The conformance results of this build (`conformance/results/zodiacs-engine.json`
and `conformance/results/zodiacs-engine-astronomy-engine.json`) were written
by the harness (`run.mjs --out`, then `report.mjs`) on the same Node 22.22.2.
Every verdict is the one the 2.1.0 files held. Eleven of their 1,718
residual values differ from those files' in the 6th to 9th significant
digit, by 1.0 × 10⁻⁹″ at most, and so does L4-STA-0013's timing estimate
in its 9th: the 2.1.0 files were written on Linux x64, and 2.1.0's own build
gives these values on this machine
(`docs/evidence/3.0.0-readme-20261126/`, `results/conformance-*.json`).
`src/time-scale-near-end.test.ts` and `src/techniques/site-parity.test.ts`
hold x64 results to the bit, and fail here.

This cut follows an earlier cut of 3.0.0 on the same day (`72bc7b8f`, branch
`admin/engine-3.0.0-r2`, never carried to `main`), and differs from it only
by the second review's fixes. Its conformance results, its `RESULTS.md` and
`summary.json`, and `src/fixtures/calc-roundtrip.json` (rebuilt by
`scripts/build-calc-roundtrip.mjs`) are byte for byte that cut's;
`results/zlib-and-2.1.0.txt` was made for that cut and made again for this
one, with the same bytes. Unpacked, the two archives differ in three
files: `dist/minor-bodies.js`, whose one changed line is the second review's
fix, and `CHANGELOG.md` and `README.md`, which give the figures it moves.
The `./minor-bodies` graph is 60,282 bytes (60,274 at the earlier cut), and
the bundles of the five minor bodies are 7 bytes larger minified and 4
gzipped; the other bundles are unchanged.
