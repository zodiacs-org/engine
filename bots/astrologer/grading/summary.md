# Model grading v9 (Opus writer), 64 test charts
Run 2026-10-28 (ICT). Same rubric, charts, grader (Opus, same prompt) and instructions as v8; only the writer changed from Sonnet to Opus, plus the P2 rulership check and three checker false positive fixes (M2, G4). Claude Max via `claude -p`, no API credit. About 157 Opus calls (64 writes, 29 revisions, 64 grades), roughly 50 minutes at 3 in parallel; no usage limit hit. Checker passed on 63 of 64 final readings.

## Overall: 4.33 / 5 (v8 4.14). 7 of 8 criteria pass.
| Criterion | v8 | v9 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.69 | 4.81 | 4.5 | yes |
| C2 Fact vs reading | 4.20 | 4.33 | 4.5 | no |
| C3 Technique | 3.80 | 4.00 | 3.5 | yes |
| C4 Timing | 4.31 | 4.39 | 3.5 | yes |
| C5 Uncertainty | 4.05 | 4.19 | 3.5 | yes |
| C6 Synthesis | 3.47 | 3.97 | 3.5 | yes |
| C7 Usefulness | 3.70 | 3.92 | 3.5 | yes |
| C8 Boundaries | 4.94 | 5.00 | 4.5 | yes |

Critical errors: 0 charts (v8: 1).

## Next
C2 is the only fail (4.33 vs 4.5): review its per chart notes; likely interpretation stated as fact.
