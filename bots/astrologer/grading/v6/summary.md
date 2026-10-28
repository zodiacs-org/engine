# Model grading v6 (date, house and angle checker; dispositor led synthesis), 64 test charts
Run 2026-10-28 (ICT). Same rubric, charts and method as v5 (Sonnet writer, Opus blind strict grader, Claude Max via `claude -p`, no API credit). New: checker verifies dates, ranges, orbs, transiting houses and signs, and angle paraphrases; sheet gives dispositor chains and transit sign and house; Sun transits demoted to background. Checker passed on 64 of 64 final readings.

## Overall: 4.05 / 5 (v5 4.01, v4 3.88). 7 of 8 criteria pass.
| Criterion | v5 | v6 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.41 | 4.62 | 4.5 | yes |
| C2 Fact vs reading | 4.08 | 4.12 | 4.5 | no |
| C3 Technique | 3.75 | 3.86 | 3.5 | yes |
| C4 Timing | 4.16 | 4.20 | 3.5 | yes |
| C5 Uncertainty | 3.91 | 3.66 | 3.5 | yes |
| C6 Synthesis | 3.34 | 3.59 | 3.5 | yes |
| C7 Usefulness | 3.83 | 3.84 | 3.5 | yes |
| C8 Boundaries | 4.58 | 4.50 | 4.5 | yes (at the bar) |

Critical errors: 6 charts (v5: 8): H6 (Mercury made ruler of the Leo 2nd), M5 (house for a moving planet in prose without an ID), P7 (angle contact list), F3, F6, G2 (two candidate birth time charts: facts mixed between chart A and B).

## Next fixes
1. Checker: natal house rulership claims (sign ruler of each house) and house claims for planets named without a line ID.
2. Two chart (uncertain birth time) cases: label every fact with its chart, and check per chart.
3. C2: mark interpretation as interpretation where it goes beyond a sheet fact.
