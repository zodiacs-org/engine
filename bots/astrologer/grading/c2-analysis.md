# C2 in v9: where readings go beyond the sheet without marking it

v9 (Opus writer, round 7) scored C2 "fact and reading kept apart" at 4.33 over 64 grades (43 at 4, 21 at 5, none lower); the bar is 4.5. No grade gave a C2 critical error. This note groups the deductions behind the 4s.

## Method

The grader returns no per-criterion notes, so the C2 reasons were read from the free-text fields of every v9 grade in `/workspace/astrologer-bot/grading/grades/*.json` (`invented_meanings`, `technique_errors`, `position_date_mismatches`, `worst_problem`, `fix_for_writer`), with the reading and sheet beside them. All 64 grades were read. The patterns below came from that reading; `c2_patterns.py` then counts them with keyword rules over the notes, and counts the phrasing behind each pattern in the readings themselves:

```sh
python3 bots/astrologer/grading/c2_patterns.py /workspace/astrologer-bot/grading/grades /workspace/astrologer-bot/grading/readings
```

The rules are keyword matches, so a count is approximate (a note can match two patterns, and a few notes about technique also match). Every C2=4 grade matched at least one pattern. Several patterns also appear in grades that kept C2 at 5: the grader deducts when they pile up or sit in the factual voice, not on a single use.

| Pattern | Grades with C2=4 | Grades with C2=5 | Readings using the phrasing | Uses |
| --- | --- | --- | --- | --- |
| P1 Ranking or superlative stated as fact | 26 | 6 | 60 | 146 |
| P2 Writer-computed fact not on the sheet | 12 | 1 | 16 | 16 |
| P3 Modern or psychological meaning labelled "traditional" | 10 | 4 | 61 ("traditional ...") | 91 |
| P4 Sect or dignity doctrine turned into a settled outcome | 18 | 4 | 64 | 189 |
| P5 Dispositor chain turned into a cause | 18 | 10 | 21 | 22 |
| P6 Transit or station tied to a theme its contacts do not touch | 12 | 5 | (not matched in readings) | |

## The patterns

### P1. Rankings and superlatives in the voice of fact (26 of 43)

The most common deduction. The reading ranks planets, contacts or months with no reason given, in the same plain voice as the sheet facts. In the 64 final readings: "hardest planet" 53 times in 49 readings, "most reliable" or "most reliably" 33 times in 33, "heaviest" 27 times in 26 (18 of them "heaviest phase" or "heaviest month"), "strongest" 13, "weightiest" 6.

- F1: "'Saturn... which makes it the hardest planet': this is a valid traditional inference, but it is stated as calculated fact and is not marked as interpretation."
- G4: "'That makes it a well-supported ruler' and 'This is the chart's most dependable help' state interpretation in the voice of calculated fact."
- H1: "'December. This is the heaviest phase.': nothing on the sheet supports this." (A bare "December. This is the heaviest phase." or "... heaviest month." opens the December paragraph of 16 readings.)
- H4: "'Your ruler pauses on your strongest planet' ranks Mars as strongest ... the reading earlier called Mercury the 'centre of gravity'."
- M2: "'This is the strongest-conditioned planet in the chart' ranks dignities, which the sheet forbids."
- O2: "'Its help is the most reliable in the chart' states an interpretive ranking of Jupiter as fact."
- H6, U2, P3: "'The weightiest contact is [S3]'", "'the month's weightiest marker'", "'This is the weightiest period of the window'".

Source in the prompt: `INSTRUCTIONS.md` itself says "a benefic of sect gives its help most reliably" and "the malefic contrary to sect is the hardest planet in the chart", and asks the writer to rank themes and transits "by weight, heaviest first". The writer copies these words into the reading as conclusions.

### P2. Facts the writer worked out (12 of 43)

The reading states something only a calculation could give, and the sheet does not give it. Almost all are one sentence in the uncertainty note: "a small change of birth time does not move it out of that sign" (G6, H2, H4, H6, M5, O6, O11, O12, O13, P4, P10; 15 readings use "small change"). Others: "Venus is the most-touched natal point of these 90 days" (H7, a count), "Its exact aspect, [A1]" for an orb of 0°21' (P10), "major aspects with the engine's default orbs" (U1).

- M5: "'Mercury sits 1°43' before the end of Sagittarius [E3], but a small change in birth time does not move it': [E3] gives no time threshold, so this is the writer's own inference presented as a calculated fact."
- O13: "'Neither changes sign with a small change of birth time': the sheet does not compute this. It is a true inference, but it is presented in the 'Uncertainty' section as if it were engine output."

Source in the prompt: the uncertainty rules say "A planet other than the Moon near a sign edge does not change sign with a small change of birth time". The writer repeats the rule as a fact about this chart, and the `[E]` lines give only the distance to the edge.

### P3. "A traditional reading is" on a modern meaning (10 of 43, and a further 4 at C2=5)

The marker the prompt offers for interpretation, "a traditional reading is", is used 67 times in 60 of the 64 readings, often on Uranus, Neptune or Pluto, on a psychological gloss, or on a positive reframe of the twelfth house, retrograde motion or a nodal aspect. A traditional-trained rater reads it as a false attribution, so the marker that should separate fact from reading itself becomes an unsupported claim.

- G2: "'The aspect Moon trine Pluto ... adds, in a traditional reading, deep and steady attachments': Pluto has no place in traditional (Hellenistic or medieval) technique."
- U1: "'The trines to Uranus and Neptune ([A3], [A4]) add, in a traditional reading, intuition and sudden insight'."
- O1: "'A traditional reading of its retrograde motion is that it reconsiders and works inward': the inward, reconsidering retrograde is a modern psychological reading."
- G7, O5: a twelfth-house Moon read as a place of rest "in a traditional reading", where the tradition counts the twelfth a bad place.
- H2: "'A traditional reading is a pull between private emotional needs and the ninth-house call ...': a Moon-node square read as a 'calling' is a modern evolutionary idea."

### P4. Sect and dignity doctrine as a settled outcome (18 of 43)

The prompt's shorthand for sect and dignity is copied as a result for this chart, with a fact ID beside it: "the malefic of sect, so its demands are moderated and workable", "acts with its own resources" (also said of exaltation), "in fall/detriment, so its help comes indirectly", "a peregrine planet takes its colour from its lord". Every reading uses at least one of these words (189 uses).

- H5: "'It is also the malefic of sect, so its demands are moderated and workable': this is defensible, but it is stated as settled fact rather than as the traditional doctrine it comes from."
- O7: "'Saturn is the malefic of sect: still a malefic, but moderated, so its demands are workable ([K2])' ... attach a fact ID to an interpretive gloss, blurring calculation and reading."
- H5, O11: "'Its help is reliable but comes indirectly': Jupiter in detriment and peregrine ([D6]) argues for hindered or unreliable help."
- M1, O8: "'A planet in exaltation acts with its own resources' uses domicile language for exaltation."
- P7: "'In traditional terms a peregrine planet takes its colour from its lord' is presented as a settled rule."

Source in the prompt: these are the prompt's own words ("a malefic of sect is moderated, so its difficulties are milder and more workable"; "a planet in domicile or exaltation acts with its own resources"; "one in detriment or fall acts against the grain, indirectly"), given as rules rather than as tendencies the reading weighs.

### P5. Dispositor chains as causes (18 of 43)

A `[L]` chain or loop is quoted (a fact) and then joined to a behaviour with "so", "which is why" or "is how", which makes the behaviour read as part of the calculation.

- M3: "'Saturn disposes both [L1][L3], which is why your thinking about home tends toward structure': a domicile lord does not on its own give that psychological claim, and it is stated as a cause rather than a suggestion."
- O12: "'Saturn's chain [L7] runs ... which is why its demands land on the ruler's affairs.' ... almost every chain ends in the same loop."
- P1: "'He shares Mercury as dispositor with your ruler [L7], so the strain is workable': a shared dispositor does not, in any standard text, soften a Moon-Saturn opposition."
- P10: "'Because every chain ends here ([L11]), the chart's affairs pass through sixth-house matters' overstates what the final dispositor's house means."

Source in the prompt: "Connect sentences with 'because', 'but', 'so', 'which is why'" and "the final dispositor ... gathers the chart's affairs" invite exactly this: the causal connective sits between a quoted chain and a gloss.

### P6. Transit themes borrowed from another factor (12 of 43)

A transit or station is given a meaning from a natal house or planet that none of its contact lines touches: a Saturn station square the Ascendant read as "a test of the Sun" (H6), a Mars station in house 8 tied to "Saturn's twelfth-house quiet" (O2), a Saturn station on the Ascendant, Midheaven and Sun read as "Saturn's role in your life" (M3), a Jupiter station "linked" to a Mercury-Venus pair 2°08' away (P4), a contact-free Saturn station turned into "a quiet moment to review" (P10).

- P4: "Two links go beyond the computed facts ... both presented as if they follow from the sheet."
- H1: "'[T1] ... touches your Pluto theme' links an outer-planet transit to Pluto only through the Midheaven, with no stated contact to natal Pluto."

This overlaps C3 (technique), but the C2 cost is that the link is stated as if the sheet made it.

## What the C2=5 readings did differently

They use the same facts and the same markers, but the comparisons carry their reason ("the tightest station contact, orb 0°15'"), the uncertainty note quotes `[E]` and says what a different sign would change instead of saying nothing would, and "traditional" sits on sect, dignity and house doctrine rather than on the outer planets. The patterns above appear in them once or not at all.

## Fixes, by pattern

- P1, P4: rewrite the sect and dignity rule in `INSTRUCTIONS.md` as tendencies to weigh, and forbid superlatives ("hardest", "heaviest", "most reliable", "strongest", "main", "weightiest") unless the sentence gives the reason from the sheet and is marked as a reading. Drop "heaviest month/phase" period labels.
- P2: remove the prompt sentence that hands the writer the sign-edge conclusion; the uncertainty note quotes `[E]` and says what a different sign would change, never that it would not change. The checker can flag "does not change sign with a small change of birth time" mechanically.
- P3: "traditional" only for the seven classical planets and the doctrines on the sheet (sect, dignity, rulership, houses); meanings of Uranus, Neptune, Pluto and of the nodes are "a modern reading". Replace "a traditional reading is" in the list of markers.
- P5: a dispositor chain links planets; it is not a cause of behaviour. Mark the step ("one reading of this chain is ...") instead of "which is why".
- P6: tie a transit or station only to the natal points of its own contact lines (already in the prompt for houses; extend it to themes), and a station with no contact line is the station's own planet and house only.

## What was changed (round 8) and how the checker behaves on v9

`INSTRUCTIONS.md`: the prompt's own superlatives are gone (the sect and dignity rule now describes tendencies to weigh, "in traditional terms", with exaltation no longer given domicile's "own resources"); a **No rankings** rule; a **"Traditional" only for the tradition** rule; "one reading is" replaces "a traditional reading is" among the markers; "so" and "which is why" join a fact to its astrological condition, not to a behaviour, and a dispositor chain is not a cause; transits and stations tie to a theme only through their own contact lines, and a station with no contact is not read as a meaning; the uncertainty note never says whether a birth-time change would move a planet; "exact" only for a transit's exact date. Every other rule is unchanged.

Checker (`bots/astrologer/facts/check-reading.ts`, kind `voice`), rerun on the 64 final v9 readings and their 29 drafts:

| Rule | Final readings flagged | Uses | Of them C2=4 / C2=5 | Against the grades |
| --- | --- | --- | --- | --- |
| Ranking word (hardest, heaviest, weightiest, strongest, weakest, most reliable or dependable or difficult ...) | 59 | 140 | 41 / 18 | every match read is a ranking of a planet, contact or period; none quotes the sheet's tightest aspect |
| Sign kept under a change of birth time | 15 | 15 | 14 / 1 | all 11 readings the grader flagged for it (G6 H2 H4 H6 M5 O6 O11 O12 O13 P4 P10) are caught; the other 4 (E2 F3 H1 O8) make the same claim |
| Outer-planet meaning called traditional | 5 | 7 | 4 / 1 | 5 sentences the grader flagged (G2 twice, P10, U1 twice); 2 not flagged by the grader (M5, P12), where "a traditional reading" follows a sentence ending on Uranus or Pluto |

The 44 violations the checker recorded on these readings before the change are unchanged, so the new rules add flags without moving any old one. The modern glosses on classical factors (a gentle twelfth house, retrograde as reflection, a nodal "calling"; G3 G7 H2 O1 O5) and the dispositor and transit-theme leaps (P5, P6) are left to the prompt: no word-level rule separates them from sound readings.
