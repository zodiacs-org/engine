# Model grading of Astrologer readings, 64 test charts

Run 2026-10-27 (ICT). Writer: Claude Sonnet with template/INSTRUCTIONS.md + SOURCES.md. Grader: Claude Opus, separate strict blind-editor prompt (grader_system.md) scoring RUBRIC.md C1 to C8, told the author is unknown. Both ran through Claude Code on the Max plan (`claude -p`); no Anthropic API credit used.

Engine data: the live engine has no natal-with-houses tool yet (PLAN.md B1), so chart sheets were built from testset/charts.json (Swiss values that the engine matches within tolerance). Aspects were computed in run.py (orbs 8 deg major, 6 deg sextile). Links are placeholders. Sheets and readings stay on the box only (engine AGENTS.md forbids Swiss per-case values in the repo).

## Overall: 3.69 / 5 (pass bar: 3.5 every criterion, 4.5 on C1, C2, C8)

| Criterion | Mean | Pass? |
|---|---|---|
| C1 Fidelity to chart | 4.30 | no (needs 4.5) |
| C2 Fact vs reading | 4.53 | yes |
| C3 Technique | 2.80 | no |
| C4 Timing | 3.16 | no |
| C5 Uncertainty | 3.77 | yes |
| C6 Synthesis | 2.73 | no |
| C7 Usefulness, tone | 3.27 | no |
| C8 Boundaries | 4.97 | yes |

Critical errors: 5 charts (H8, P3, P9, M5, O10), all type (a), a statement the sheet contradicts (wrong aspect or house claim, "no natal planet tied to this station" when one is). No health, money or legal predictions; no invented birth times.
Flag counts (charts with at least one): technique errors 64, generic filler 57, invented meanings 52, position or date mismatch 46 (mostly small: wrong "closest aspect", missed near-cusp point, station near a natal point ignored).

## Worst 10
F2, F3, F6 (2.75), F1, F4 (3.12), F5 (3.25): DST fold cases. The bot refuses to read anything until the person picks a time, and falsely says all houses change. Under whole sign houses both versions usually share the rising sign, so most of the reading could be given.
U2 (3.25): unknown time; drops the 90-day calendar entirely and lists sign descriptions.
G4, G6 (3.38): DST gap; the clarifying question maps "before/after the clock change" to the wrong UTC candidate.
H4 (3.38): ignores sect, dignity and rulership; treats house 10 as the MC; misses stations on natal Sun/Moon.

## Top fixes to the template
1. Fold rule: compare the two versions; if the rising sign is the same, give the full reading and flag only angle-degree items. Ask only when signs differ.
2. Gap rule: spell out the mapping (e.g. "01:30 standard time, before the jump" = candidate 1) and check it against the UTC values.
3. Unknown time: still give the 90-day calendar for transits to planets (not angles).
4. Required technique checklist before interpreting: sect (day/night), chart ruler, dignities of Sun, Moon, ruler, house rulers.
5. Check every station and transit degree against natal points within 2 deg and say so; never say "nothing tied" without checking.
6. Rank aspects by orb from the tool output; never call one "tightest" without it.
7. Cusp rule: also flag points within 1 deg of a sign edge when birth time is uncertain.
8. Ban unsourced author attributions ("Houlding and Sasportas read this as...") and modern keywords attributed to Ptolemy; cite SOURCES.md only for technique.
9. Synthesis: end the natal part with 2 to 3 weighed themes, resolving contradictions, instead of a list.
10. State the 90-day window as exact dates (1 Nov 2026 to 29 Jan 2027).

## Human spot-check picks (10)
Worst: F3 (fold), U2 (unknown time), G4 (gap), P10 (pre-1970).
Typical: O5 (ordinary + transits), P3 (war-time, had a critical error), H6 (high latitude).
Best: P1 (double summer time + transits), G7 (gap), O9 (half-hour zone).

Caveats: one grader model, one run; model grader is a filter, not the human score. Harness notes: first pass had a mislabelled window and a 60' formatting bug; affected readings were regenerated and all 64 regraded.
Files: scores.csv (per chart), grades/*.json (full findings, box only), run.py, summarize.py, writer_system.md, grader_system.md.
