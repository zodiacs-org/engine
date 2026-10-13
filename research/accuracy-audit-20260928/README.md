# Convention-aligned engine accuracy audit

This companion explains the earlier one-arcsecond discrepancies without modifying the engine. It freezes the same rc.10 runtime, acquires new independent JPL vectors, applies independently generated ERFA rotations, and decomposes each original comparison into signed coordinate terms.

**Result:** the number of comparisons exceeding one arcsecond remains **168/210** after better aligning the reference conventions. Four previously exceeding cases move below the threshold and four previously below it move above. In the evaluated cases, orientation differences alone are much smaller than the remaining position discrepancies. The next priority is a controlled position-provider comparison; this is not evidence that a frame-only patch will achieve the goal.

| Measurement | Median | Maximum |
|---|---:|---:|
| Public chart vs independent ERFA-projected JPL reference | 2.916″ | 28.779″ |
| Geometric provider vector vs geometric JPL reference | 2.960″ | 28.870″ |
| Same JPL vector through engine vs independent rotation | 0.058″ | 0.160″ |
| Frame-bias interpretation sensitivity | 0.017″ | 0.023″ |

These are finite angular separations across 210 comparisons, not guaranteed error bounds. Corrections, EQJ/ICRF axes and model target centers retain explicit differences. Do not subtract table maxima or assign percentages of error to causes. See [FINDINGS.md](FINDINGS.md), [NEXT-BUILD.md](NEXT-BUILD.md), [AUDIT-PROTOCOL.md](AUDIT-PROTOCOL.md), and [REVIEW.md](REVIEW.md).

## What is included

- 438 newly acquired JPL vectors from 26 successful requests: 210 geometric, 210 light-time/stellar-aberration corrected, and 18 body-center controls.
- Exact raw responses, request receipts, actual returned time/frame/center/units checks, and offline reconstruction.
- 105 independent ERFA matrices for 21 dates, generation source and numerical controls.
- A source-level investigation of the frozen engine's orbital series, Moon policy, aberration approximation, nutation and frame lineage.
- 210 numerical decompositions with closure checks and a pure-function product sensitivity companion.
- Full original Q31 references, target/dependency byte identity, recorded results and separate agent review.

The earlier date set is reused deliberately for investigation. It is not a new blind holdout. Ordinary planetary comparisons use JPL LT+S, while the engine's geometric Moon is compared with JPL NONE. A successful runner means integrity and arithmetic checks passed; this audit has no numerical accuracy pass gate.

## Run offline

The scripts require Node.js and Python. The ordinary runner uses only built-in modules; regenerating the rotation fixture separately requires the pinned PyERFA environment described in `rotation/README.md`. For the safe archive bootstrap use Node 22.22.2 with its bundled npm 10.9.7, Python 3.12 or newer, npm access for its pinned dependency, and the sibling `engine-qualification-20260928/` directory, which supplies the reviewed preparation lockfile and complete installation check.

From this research directory in an engine checkout:

```sh
python3 bootstrap.py --tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz --runtime .runtime
node run-audit.mjs --engine .runtime/package/dist/index.js --out run-output/audit-001
```

For a standalone copy, provide an absolute archive path or omit `--tarball` to download the exact commit-pinned archive. Choose a new or empty runtime directory. The bootstrap preserves the archive's package metadata and installs only its locked runtime dependency beneath `.runtime/package/node_modules`, with lifecycle scripts disabled. It checks the entire prepared installation before reporting success. The [replacement baseline review](../engine-qualification-20260928/preparation/REVIEW.md) records why the source-commit lockfile replaces the unavailable original handoff lockfile; engine and dependency bytes are unchanged. Existing runtime directories are never overwritten. The runner rejects a changed distribution or dependency, reconstructs vector references offline, and requires fresh output. Its source-specific assumptions must be reviewed before adapting it to another provider or release; the earlier general verification toolkit remains available for successor candidates.

Recorded results are under `results/rc10/`. `report.json` contains individual observations, while `summary.json` records successful execution. The runner makes no network calls and edits no engine files. Acquisition is a separate explicit operation documented under `reference/`.

## How to read the sensitivity output

The ratio of an angular discrepancy to a sampled longitude rate is only a formal local input-time scale. Rates are measured at ±60 and ±300 seconds. The fixed stability heuristics pass all 210 evaluated cases, but **96 ratios extend beyond the ±300-second sampled neighborhood**, including two above a day. Those ratios are flagged as extrapolations, not demonstrated input-time changes or event-time errors. Passing the heuristics is not validation of a long time shift. The extrapolation flag was added during review after the first run; the original gates and astronomical results were preserved.

No predictive astrology discovery, Swiss compatibility certification, all-date precision claim, or production feature is claimed. This is an isolated measuring and planning tool. It supports choosing the next engineering experiment with evidence.
