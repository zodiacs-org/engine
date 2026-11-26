# 3.0.0's README figures

The measurements behind the figures that `README.md`, `docs/guide.md`,
`docs/comparison.md`, `docs/de440.md` and `docs/calc.md` give for 3.0.0, made
on 26 November 2026 on the 3.0.0 candidate's build (branch
`admin/engine-3.0.0` at the commit that adds this folder, built with
`npm run build`) and made again on 27 November, after the independent
review's fixes, on branch `admin/engine-3.0.0-r2` at the commit that
corrects this folder. The version had not been bumped yet, so
`package.json`, the archive name and the conformance adapter's
`engineVersion` still say 2.1.0. The version is bumped at the cut, and the
checks in CI (`scripts/ratchet.mjs`, `npm run package:contents`) measure
that build again. The machine was macOS on Apple silicon (arm64); the files
of 27 November name their Node, and the rest were made on Node 26.4.0. CI
runs on Linux x64.

| File | Command | What it gives |
| --- | --- | --- |
| `results/bundles.json` | `node docs/evidence/3.0.0-readme-20261126/measure-bundles.mjs` on Node 22.22.2 from nodejs.org (zlib 1.3.1), 27 November | esbuild 0.27.7 browser bundles, minified and gzipped at level 9: the root's `natalChart` 79,787 and 36,624 bytes, without the DE440 pack; with `useDe440` 3,419,715 and 2,402,512; the whole `./de440/pack` entry 3,342,559 and 2,367,563; Chiron alone adds 14,132 gzipped bytes and all five minor bodies 115,938 |
| `results/bundles-node-26.4.0.json` | the same on Homebrew's Node 26.4.0, linked to the system's zlib 1.2.12, 27 November | the same minified bytes; gzipped 36,213, 2,441,049, 2,406,590, and 14,419 and 117,978 added: another zlib compresses the same bytes to other sizes. The figures of 26 November (36,213 and the rest, and 14,403 and 117,965 before the minor bodies' speed fix of 27 November) came from this Node |
| `results/conformance-de440.json` | `run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out RUN.json`, then `compare-conformance.mjs RUN.json conformance/results/zodiacs-engine.json` (Node 22.22.2, 27 November) | after `useDe440()`: 639 of 640 pass, 1 unsupported; all 640 verdicts equal the committed file's (2.1.0's, written on Linux x64), and every summary figure to the bit; 632 of 640 residuals equal it to the bit, and 10 of the run's 859 residual values, in 8 vectors (L1-POS-0153 to L1-POS-0160) differ by at most 2.0 × 10⁻¹⁰″, from the 6th to the 9th significant digit of the residual; L1 240 of 240, longitude median 0.00175″ and largest 0.01265″ |
| `results/conformance-astronomy-engine.json` | the same with `--ephemeris astronomy-engine`, against `conformance/results/zodiacs-engine-astronomy-engine.json` | on astronomy-engine, the default: 392 pass, 247 fail, 1 unsupported; all 640 verdicts and every summary figure equal the committed file's; 639 of 640 residuals equal it to the bit, and of the run's 859 residual values only L1-POS-0110's latitude differs, by 1.0 × 10⁻⁹″, in its 9th significant digit; L4-STA-0013's recorded timing estimate (`meta.timingSeconds`, not a residual) differs in its 9th; L1 48 of 240, longitude median 2.083″ and largest 18.774″ |
| `results/conformance-*-against-2.1.0-arm64.json` | the same two runs of the adapter on 2.1.0's carried archive (`ZODIACS_ENGINE_DIST` set to its `dist/`, with astronomy-engine 2.1.19 beside it), on this machine and Node 22.22.2, compared with 3.0.0's runs by `compare-conformance.mjs` | 2.1.0's build on this machine gives 3.0.0's 640 verdicts, residuals and recorded values to the bit, on both sources: the differences from the committed files come from the machine (Apple silicon against the Linux x64 that wrote them), not from 3.0.0's code |
| `results/conformance-check-*.txt` | `run.mjs ... --check` against each committed file (Node 22.22.2, 27 November) | every verdict matches |
| `results/require.txt` | `node probes/require/probe.cjs`, from a folder whose `node_modules` held this build, on Node 20.19.0, 22.12.0, 24.13.0 and 26.4.0 | `require()` of the root, `./de440/pack` and `./calc` loads the modules `import()` gives; only Node 22.12.0 prints an `ExperimentalWarning` |
| `results/typescript.txt` | `tsc --noEmit --strict` on `probes/typescript/` with TypeScript 5.9.3 (the repository's) | a CommonJS project type-checks `require()` of the package with `"module": "nodenext"` or `"node20"`, and fails with `"node18"` or `"node16"` (TS1471, TS1479) |
| `results/package-contents.txt`, `results/pack-dry-run.txt` | `npm run package:contents`, `npm pack --dry-run --ignore-scripts`, on Node 22.22.2, 27 November | 107 files, `docs/calc.md` and `skills/zodiacs-compute/SKILL.md` among them; the rest beside the pack and the minor-body tables 1,410,393 bytes of the 1,463,000 cap (1,406,665 on 26 November, before the review's fixes) |
| `results/ratchet.txt` | `node scripts/ratchet.mjs --check --tests .cache/vitest-report.json`, after `npx vitest run --exclude '**/._*' --reporter=json --outputFile=.cache/vitest-report.json`, on Node 22.22.2, 27 November | every measurement inside `budgets.json`: the gzip sizes above, the L1 vectors' largest difference 0.0126″, the minor bodies' 0.53211″, 639 conformance passes, the passing tests over the floor, and no skipped test but those skipped by design |

The conformance runs of 26 November used Node 26.4.0, and
`compare-conformance.mjs` then compared a field the harness does not write
(`residuals`; the harness writes `residual`), so it reported all 640
residuals equal when they were not. On 27 November the script was corrected
and the runs made again on Node 22.22.2, the conformance workflow's version:
those are the files above. Only the adapter's `positions` text, which from
3.0.0 says that the adapter calls `useDe440()`, differs from the committed
files' configuration. The committed results are regenerated on Node 22.22.2
at the cut, on this machine.

The accuracy figures for True Black Moon Lilith (12 NASA JPL Horizons Moon
states, 1850 to 2150: largest 1.58961″ in longitude and 0.07631″ in
latitude, median 0.04864″, after `useDe440()`; largest 396.105″, median
178.110″, on astronomy-engine) and for the minor bodies (500 Horizons
places: largest 0.53211″ after `useDe440()`, 1.68213″ on astronomy-engine)
were measured again on 27 November with the tests' own arithmetic, each
rounded up at its last digit; the
documents quote them rounded outward (1.59″, 0.077″, 0.049″, 397″, 179″,
0.54″, 1.7″), and `src/true-lilith.test.ts` and `src/minor-bodies.test.ts`
hold the largest under 1.59″ and 397″, and 0.54″ and 1.7″. On 26 November
they were quoted as 1.589″, 0.076″, 0.050″, 396″, 178″, 0.532″ and 1.682″,
each but the median under its measurement. `scripts/ratchet.mjs` measures
the minor bodies' largest and the L1 vectors' 0.0126″ again in CI.

TypeScript 5.8's support for `require()` of an ES module under
`"module": "nodenext"` is TypeScript's own (its 5.8 release notes); only
5.9.3 was run here.

On 27 November, after a second independent review, `minorBodyPositions`
reads its list of bodies with `Array.from`, which refuses the holes of a
sparse list where `map` skipped them. On the cut's build, measured as above
on Node 22.22.2, all five minor bodies add 180,606 bytes minified and
115,942 gzipped to the root's `natalChart` (7 and 4 more than above), and
the `./minor-bodies` graph is 60,282 bytes; the other bundle sizes above
are unchanged. `README.md` and `docs/guide.md` quote 115,942, from
`docs/evidence/3.0.0-20261127/results/bundles-node-22.22.2.json`.
