# Dash removal (B1j)

`bots/astrologer/facts/dedash.ts` removes en and em dashes (U+2012, U+2013,
U+2014, U+2015, U+2212) from a reading. It is deterministic and calls no
model. Its rules, in order: a dash between two point names becomes a hyphen
("Moon-Saturn"); a range between numbers, dates, months or weekdays becomes
" to " (" and " after "between"); a minus sign before a number becomes "-";
an unspaced en dash between other words becomes a hyphen; two clause dashes
in one sentence become commas; a single clause dash becomes a colon before a
list, a full stop before a capitalised new sentence, and otherwise a comma.
URLs, inline code and fenced code blocks are not changed. The CLI is
`dedash-cli.ts` (`--write file ...`, or stdin to stdout).

`grading/run.py` runs it on the reading in place before every check: after
the first writing and after each revision. `grading/run.py` and
`bots/astrologer/grading/run.py` are identical.

## Applied to the 64 v10 final readings

The 64 finals in `grading/readings/*.md` (drafts excluded) were first copied
to `grading/readings_predash/`, then rewritten with
`dedash-cli.ts --write`.

| | Dashes (U+2012 to U+2015, U+2212) |
|---|---|
| Before | 49, in 24 readings |
| After | 0 |
| Inside URLs or code (left alone) | 0 |

All 49 were en dashes between two planet names, so every change in this set
is a dash replaced by a hyphen: replacing each dash in the copies with "-"
gives the new files byte for byte. The other rules (ranges, paired and
single clause dashes, list markers, URLs and code) are exercised only by the
unit tests in `bots/astrologer/facts/dedash.test.ts`.

## Examples

| Reading | Before | After |
|---|---|---|
| E1 | In modern astrology this softens and blurs the Venus–Saturn theme for the weeks around the station, which is a reason to keep play simple and familiar. | In modern astrology this softens and blurs the Venus-Saturn theme for the weeks around the station, which is a reason to keep play simple and familiar. |
| H2 | This touches the Moon in your twelfth house and the Sun–Moon theme: a steadying period for the private routines you keep. | This touches the Moon in your twelfth house and the Sun-Moon theme: a steadying period for the private routines you keep. |
| M5 | [L11] says the chains end in two loops, Mercury–Jupiter and Mars–Saturn. | [L11] says the chains end in two loops, Mercury-Jupiter and Mars-Saturn. |
| O8 | [T14] transiting Sun opposition natal Moon, exact 2027-01-27, echoes the Moon–Mars pull. | [T14] transiting Sun opposition natal Moon, exact 2027-01-27, echoes the Moon-Mars pull. |
| P14 | These touch the Moon–Saturn pair directly, so the weeks around this date suit reflection on burdens and comfort. | These touch the Moon-Saturn pair directly, so the weeks around this date suit reflection on burdens and comfort. |

## Checker

`check-cli.ts` against each chart's sheet (`grading/sheets/<id>.txt`):

| | Pass | Fail |
|---|---|---|
| Before (`readings_predash/`) | 64 | 0 |
| After (`readings/`) | 64 | 0 |

The verdict of every reading is the same before and after. Grading was not
rerun.
