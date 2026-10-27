# Model grading v3 (B1: engine supplies all numbers), 64 test charts
Run 2026-10-27/28 (ICT). Same method as v2 (Sonnet writer, Opus blind strict grader, Claude Max via `claude -p`, no API credit). Sheets now come from the engine facts builder (bots/astrologer/facts/).

## Overall: 4.02 / 5 (v2 3.99, v1 3.69). Still not at the launch bar.
| Criterion | v2 | v3 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.34 | 4.19 | 4.5 | no |
| C2 Fact vs reading | 4.56 | 4.70 | 4.5 | yes |
| C3 Technique | 3.66 | 3.48 | 3.5 | no (just) |
| C4 Timing | 3.31 | 4.23 | 3.5 | yes |
| C5 Uncertainty | 3.89 | 3.69 | 3.5 | yes |
| C6 Synthesis | 3.42 | 3.30 | 3.5 | no |
| C7 Usefulness | 3.75 | 3.61 | 3.5 | yes |
| C8 Boundaries | 4.97 | 4.92 | 4.5 | yes |

Critical errors: 11 charts (v2: 4). Pattern changed: the bot now quotes the engine lists correctly, then misparaphrases them in the Reading part (square called conjunction, "Mars squares Sun" for "Sun square Mars", Moon "on the Ascendant" 22 deg away). Sect doctrine reversed in night charts (M1, M2, M5). Infant/child charts read as adults (E1, F1, O16).

## Next fixes
1. Reading part may only reference contacts by the exact engine line (no rephrasing aspect type or direction); add a post-check that every aspect/contact named in the Reading matches a sheet line.
2. Engine to emit sect team explicitly (benefic/malefic of sect, out-of-sect malefic) and essential dignities, so the bot does not apply doctrine from memory.
3. Engine to emit native's age at window start; instructions to frame for children.
