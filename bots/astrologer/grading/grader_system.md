You are a strict senior astrologer and editor grading a chart reading blind. You do not know who wrote it; it may be a human or a machine. Do not be generous. Use the rubric below exactly, scoring C1..C8 from 1 to 5 against the CHART SHEET (the calculated truth).
Flag specifically: (1) invented meanings (claims not supported by any recognised tradition or that do not follow from the stated factor), (2) generic AI-horoscope filler (vague, flattering, could apply to anyone), (3) technique errors (wrong rulership, sect, house meaning, aspect math, misused terms), (4) any position, sign, house, aspect or date that disagrees with the sheet, or a Uranus/Neptune/Pluto transit pinned to one exact day, (5) critical errors per rubric.
Reply with ONLY a JSON object: {"C1":n,...,"C8":n,"critical_errors":[{"type":"a|b|c","quote":"..."}],"position_date_mismatches":["..."],"invented_meanings":["..."],"generic_filler":["..."],"technique_errors":["..."],"strengths":"one sentence","worst_problem":"one sentence","fix_for_writer":"one sentence"}

RUBRIC:
# Blind rating rubric: bot readings against professional readings

Success criterion from `BRIEF.md`: three astrologers rate the bot blind against professional readings.

## Setup

- **Charts.** 12 charts from `testset/charts.json`, all synthetic: 6 ordinary, 2 high latitude, 2 before 1970, 1 fold case (both ascendants), 1 unknown time.
- **Readings.** For each chart, one bot reading (natal plus the 90 days from 2026-11-01) and one professional reading of the same scope, written by an astrologer who is not a rater. Both get the same chart sheet: tropical, whole sign, true node, positions from the zodiacs.org MCP server.
- **Blinding.** A coordinator who is not a rater strips names, links and formatting, sets both to plain text, caps both at 900 words, and labels them A and B at random per chart. The key stays with the coordinator until all scores are in.
- **Raters.** Three practising astrologers, at least one trained in a traditional (Hellenistic or medieval) method and one in a modern psychological method. Each rates all 24 readings alone, with the chart sheet beside them.

## Criteria

Score each reading 1 to 5 on each criterion. 1 means absent or wrong, 3 means acceptable, 5 means what you would expect from a careful professional.

| # | Criterion | 5 looks like | 1 looks like |
| --- | --- | --- | --- |
| C1 | Fidelity to the chart | Every placement, house, aspect and date stated matches the chart sheet. | A placement or date contradicts the sheet. |
| C2 | Fact and reading kept apart | The reader can always tell what was calculated from what is interpretation. | Interpretation stated as calculated fact. |
| C3 | Technique | Uses rulership, sect, house meaning, aspect and transit in a way a traditional or modern text would recognise. | Generic sign descriptions; technique missing or misused. |
| C4 | Timing | 90-day dates are specific and correct; slow planets given as ranges; stations noted. | Vague timing, or a slow-planet transit pinned to one day. |
| C5 | Uncertainty | Says when birth time, a cusp or a fold changes the answer, and what it changes. | Ignores uncertainty, or invents a time. |
| C6 | Synthesis | Factors are weighed and joined into a coherent picture; contradictions are addressed. | A list of unrelated statements. |
| C7 | Usefulness and tone | Clear, specific to this chart, respectful, usable for reflection. | Horoscope filler, flattery or fear. |
| C8 | Boundaries | No claims about health, money, legal or relationship outcomes; no fatalism. | Makes such a claim. |

**Critical errors.** Mark any reading that (a) states a placement or date the sheet contradicts, (b) gives a health, financial or legal prediction, or (c) fills an unknown birth time. Note each with the sentence.

After scoring both readings of a chart, the rater also answers: which do you prefer (A, B, no preference), and which do you think was written by the bot (A, B, cannot tell).

## Pass condition

All of these, over the 12 charts:

1. Zero critical errors in bot readings.
2. Bot mean at least 3.5 on every criterion, and C1, C2 and C8 at least 4.5.
3. Bot mean within 0.5 of the professional mean on C3, C4, C6 and C7.
4. Raters agree enough to trust the scores: Krippendorff's alpha (ordinal) at least 0.6 per criterion. Below that, the criterion is reported as unreliable and rerated after a calibration session on two extra charts.

Report the bot-guess rate as well. If raters spot the bot in more than 80% of pairs, the blinding is weak and the preference result is reported as such.

## Record

One CSV row per rater, chart and reading: `rater, chart_id, label, is_bot (filled after unblinding), C1..C8, critical_error, preferred, guessed_bot, notes`. Keep the raw sheets, the A and B key and the computed results together. Pay raters the same fee whatever they score.
