# Model grading v2 (after 9 template fixes), 64 test charts

Run 2026-10-27 (ICT). Same method as v1 (in v1 summary below the table): Sonnet writer with template/INSTRUCTIONS.md + SOURCES.md, Opus blind strict grader on RUBRIC.md, Claude Max via `claude -p`, 3 at a time, no API credit. Sheet window label corrected to "2026-11-01 to 2027-01-29 inclusive" (v2 first pass flagged 4 charts only because the label said 01-30; those 4 were regraded).

## Overall: 3.99 / 5 (v1: 3.69). Still not at the launch bar.

| Criterion | v1 | v2 | Bar | Pass? |
|---|---|---|---|---|
| C1 Fidelity | 4.30 | 4.34 | 4.5 | no |
| C2 Fact vs reading | 4.53 | 4.56 | 4.5 | yes |
| C3 Technique | 2.80 | 3.66 | 3.5 | yes |
| C4 Timing | 3.16 | 3.31 | 3.5 | no |
| C5 Uncertainty | 3.77 | 3.89 | 3.5 | yes |
| C6 Synthesis | 2.73 | 3.42 | 3.5 | no |
| C7 Usefulness | 3.27 | 3.75 | 3.5 | yes |
| C8 Boundaries | 4.97 | 4.97 | 4.5 | yes |

Critical errors: 4 charts (v1: 5). All 5 v1 critical charts are now clean (H8, P3, P9, O10 clean; M5 clean after label fix). New ones: H2 (calls a Neptune station a square to the Sun), O13 (misstates station orbs), O18 ("touch nothing within 2 deg" when something does), M2 (wrong "tightest" aspect). All come from the bot doing its own degree math.

Odd birth times: fold charts improved (mean 2.75-3.25 to 3.38-3.88) and now give natal readings; gap mapping fixed (G6 3.38 to 3.88) but G4 still asks without reading; unknown time U1/U2 still give no 90-day calendar. Harness gap: sheets for fold, gap and unknown-time charts contain no transit list (testset has none), so the bot cannot build a calendar; C4 for these 15 charts is understated until the engine provides transits for them.

## Remaining weaknesses
1. Self-computed degree checks (stations vs natal points, aspect ranking) are often wrong. Fix: engine `event_search` should return contacts; the bot must not do degree arithmetic.
2. Cusp/uncertainty: still says "no point near a sign edge" when the Ascendant or Moon is within a few degrees and a round birth time could flip it.
3. Sect occasionally wrong (P4 called a day chart a night chart).
4. Generic filler (57 charts) and invented meanings (57) still flagged, though lighter.
5. Synthesis 3.42, just under bar.

## Next fixes
- Add station-to-natal contacts and aspect orbs to the tool output (engine side, PLAN.md B1), and forbid the bot from computing them.
- Sect rule by Sun's house is ambiguous at the horizon; use engine `sect` field.
- Give transits for fold (both versions), gap (both candidates) and unknown-time (noon chart, planets only) test charts.

## Human spot-check picks (10, from v2)
Worst: G4, F3, O5, P4. Typical: U1, H2 (critical), O13 (critical). Best: H7, P7, O6.
