# Model grading v10 (C2 fixes: no rankings, interpretation marked, Opus writer), 64 test charts
Run 2026-10-28 (ICT). Same rubric, charts, grader (Opus, same prompt) and Opus writer as v9. New: writer prompt and checker against the six C2 patterns in c2-analysis.md (rankings as fact, sect/dignity as outcome, dispositor chain as cause, self derived facts, transit tied to an untouched theme, modern meaning called traditional); P10 checker false positive fixed. Claude Max via `claude -p`, no API credit. About 160 Opus calls (64 writes, 32 revisions, 64 grades), roughly 80 minutes at 3 in parallel; no usage limit hit. Checker passed on 64 of 64 final readings.

## Overall: 4.33 / 5 (v9 4.33). 8 of 8 criteria pass.
| Criterion | v9 | v10 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.81 | 4.86 | 4.5 | yes |
| C2 Fact vs reading | 4.33 | 4.62 | 4.5 | yes |
| C3 Technique | 4.00 | 3.98 | 3.5 | yes |
| C4 Timing | 4.39 | 4.45 | 3.5 | yes |
| C5 Uncertainty | 4.19 | 4.00 | 3.5 | yes |
| C6 Synthesis | 3.97 | 3.88 | 3.5 | yes |
| C7 Usefulness | 3.92 | 3.84 | 3.5 | yes |
| C8 Boundaries | 5.00 | 5.00 | 4.5 | yes |

Critical errors: 1 chart (v9: 0): P14, a relative date ("two days earlier in that week") that does not match the sheet dates.

## Next
Checker: verify relative day offsets ("two days earlier", "the next day") between quoted dates.
