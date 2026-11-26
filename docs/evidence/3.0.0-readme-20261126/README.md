# 3.0.0's README figures

The measurements behind the figures that `README.md`, `docs/guide.md`,
`docs/comparison.md`, `docs/de440.md` and `docs/calc.md` give for 3.0.0, made
on 26 November 2026 on the 3.0.0 candidate's build: branch
`admin/engine-3.0.0` at the commit that adds this folder, built with
`npm run build`. The version had not been bumped yet, so `package.json`, the
archive name and the conformance adapter's `engineVersion` still say 2.1.0.
The version is bumped at the cut, and the checks in CI
(`scripts/ratchet.mjs`, `npm run package:contents`) measure that build
again. The machine was macOS on Apple silicon (arm64), Node 26.4.0
unless a file says otherwise; CI runs on Linux x64.

| File | Command | What it gives |
| --- | --- | --- |
| `results/bundles.json` | `node docs/evidence/3.0.0-readme-20261126/measure-bundles.mjs` | esbuild 0.27.7 browser bundles, minified and gzipped at level 9: the root's `natalChart` 79,787 and 36,213 bytes, without the DE440 pack; with `useDe440` 3,419,715 and 2,441,049; the whole `./de440/pack` entry 3,342,559 and 2,406,590; Chiron alone adds 14,403 gzipped bytes and all five minor bodies 117,965 |
| `results/conformance-de440.json` | `run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" --out RUN.json`, then `compare-conformance.mjs RUN.json conformance/results/zodiacs-engine.json` | after `useDe440()`: 639 of 640 pass, 1 unsupported; all 640 verdicts and residuals equal the committed file's; L1 240 of 240, longitude median 0.00175″ and largest 0.01265″ |
| `results/conformance-astronomy-engine.json` | the same with `--ephemeris astronomy-engine`, against `conformance/results/zodiacs-engine-astronomy-engine.json` | on astronomy-engine, the default: 392 pass, 247 fail, 1 unsupported; all 640 equal the committed file's; L1 48 of 240, longitude median 2.083″ and largest 18.774″ |
| `results/conformance-check-*.txt` | `run.mjs ... --check` against each committed file | every verdict matches |
| `results/require.txt` | `node probes/require/probe.cjs`, from a folder whose `node_modules` held this build, on Node 20.19.0, 22.12.0, 24.13.0 and 26.4.0 | `require()` of the root, `./de440/pack` and `./calc` loads the modules `import()` gives; only Node 22.12.0 prints an `ExperimentalWarning` |
| `results/typescript.txt` | `tsc --noEmit --strict` on `probes/typescript/` with TypeScript 5.9.3 (the repository's) | a CommonJS project type-checks `require()` of the package with `"module": "nodenext"` or `"node20"`, and fails with `"node18"` or `"node16"` (TS1471, TS1479) |
| `results/package-contents.txt`, `results/pack-dry-run.txt` | `npm run package:contents`, `npm pack --dry-run --ignore-scripts` | 107 files, `docs/calc.md` and `skills/zodiacs-compute/SKILL.md` among them; the rest beside the pack and the minor-body tables 1,406,665 bytes of the 1,463,000 cap |
| `results/ratchet.txt` | `node scripts/ratchet.mjs --check --tests .cache/vitest-report.json`, after `npx vitest run --exclude '**/._*' --reporter=json --outputFile=.cache/vitest-report.json` | every measurement inside `budgets.json`: the gzip sizes above, the L1 vectors' largest difference 0.0126″, the minor bodies' 0.532″, 639 conformance passes, 5,729 tests passed (of 5,739; the 6 that fail on this machine fail on Apple silicon only, or because vitest cannot load a path with a space, and 4 are skipped by design) |

The conformance runs used Node 26.4.0, whose time zone data (ICU 78.3, tzdb
2026a) is not the conformance workflow's Node 22.22.2; only the adapter's
`timeZones` text, which names the runtime, and its `positions` text, which
from 3.0.0 says that the adapter calls `useDe440()`, differ from the
committed files. The committed results are regenerated on Node 22.22.2 at
the cut.

The accuracy figures for True Black Moon Lilith (12 NASA JPL Horizons Moon
states, 1850 to 2150: 1.589″ largest and 0.050″ median after `useDe440()`,
396″ largest on astronomy-engine) and for the minor bodies (500 Horizons
places: 0.532″ largest after `useDe440()`, 1.682″ on astronomy-engine) are
measured and held by `src/true-lilith.test.ts` and
`src/minor-bodies.test.ts`, which state them; `scripts/ratchet.mjs` measures
the minor bodies' 0.532″ and the L1 vectors' 0.0126″ again in CI.

TypeScript 5.8's support for `require()` of an ES module under
`"module": "nodenext"` is TypeScript's own (its 5.8 release notes); only
5.9.3 was run here.
