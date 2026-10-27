# Model grading v4 (exact-wording checker, engine sect/dignities/age), 64 test charts
Run 2026-10-28 (ICT). Same method as v3 (Sonnet writer, Opus blind strict grader, Claude Max via `claude -p`, no API credit), plus the reading checker with up to 2 revisions.

## Overall: 3.88 / 5 (v3 4.02, v2 3.99). Still not at the launch bar.
| Criterion | v3 | v4 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.19 | 4.64 | 4.5 | yes |
| C2 Fact vs reading | 4.70 | 4.59 | 4.5 | yes |
| C3 Technique | 3.48 | 3.02 | 3.5 | no |
| C4 Timing | 4.23 | 4.08 | 3.5 | yes |
| C5 Uncertainty | 3.69 | 3.55 | 3.5 | yes |
| C6 Synthesis | 3.30 | 3.03 | 3.5 | no |
| C7 Usefulness | 3.61 | 3.25 | 3.5 | no |
| C8 Boundaries | 4.92 | 4.84 | 4.5 | yes |

Critical errors: 3 charts (v3: 11): H7 (birthday date), O12 (Saturn "on the Ascendant axis"), P12 ("Venus on the rising degree"). All three are prose claims the checker does not parse (angle contacts, dates).

Trade-off: facts are now right, but the strict rules make readings list-like and timid. The writer often says a fact is "unavailable" when the sheet has it (E2, M5), skips chart ruler and sect synthesis, and over-hedges on uncertainty.

## Next fixes
1. Loosen the tone rules: keep exact wording for contacts but require a woven synthesis around the chart ruler, sect and dignity (the sheet gives these as facts).
2. Have the engine emit the chart ruler and its condition explicitly, and the solar return date.
3. Extend the checker to contacts with angles and to dates.
