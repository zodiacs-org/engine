# Review of the fix round (ZOD-97), 2026-11-13

A new session's adversarial review of commit `103190a` ("Edge-case report
corrections after the second session's findings"), against the three report
fixes Dias approved. The earlier findings are in `BREAKER.md`, which is
unchanged. This file changes no product code, tool, result or other report.

**This is not an accuracy statement and it approves no public sentence.**

## Verdict

**The three approved fixes hold. No blocker.** Five should-fix items and six
notes follow; all are wording or counts in `README.md`, none changes a
verdict. The product and methodology calls that Dias has not answered are
still listed as open and were not decided, in `README.md`, in the pull
request's description and in the builder's handoff.

| approved fix | holds? | how it was checked |
| --- | --- | --- |
| 1. T5 and P1 after 2050 on UTC reworded honestly | yes | T5 reads fail. P1 reads "pass on TT input and at the settled UTC instants to 2021; not testable on UTC input after 2050". The 36.23″ and both clocks were recomputed from the committed responses; the explanation was tested independently (below) |
| 2. Mixed rows read fail, passing parts beneath | yes | T3, T4 and T5 read fail in the table, at the head of each section and in the pull request's description, each with its passing parts. `positions()` outside the span is the first reason under T5. The word "mixed" is gone from the verdicts |
| 3. Counts: 110, not 120; T4's "30 of 30" | yes | recounted from `results/horizons-edge.json`: 120 records, 110 distinct body and Horizons-row pairs, 11 distinct instants. T4: 30 records, 20 distinct, and the README says the clause is met trivially |

## What was checked

- **The commit.** Author and committer `Zodiacs Admin <admin@zodiacs.org>`,
  no model name, no co-author line. 15 files, all under
  `docs/evidence/edge-cases-20261111/`. `BREAKER.md` and the three earlier
  result files are untouched. `git diff bc0b5a7 8da3a4e -- src/` is empty,
  so "the same `src/`" is true. Pull request 93 is open and a draft at
  `103190a`.
- **Reproduction.** On the build in this worktree (1.1.0-rc.3, Node
  v22.23.3), `horizons-edge.mjs compare`, `utc-after-2050.mjs compare`,
  `local-time-rule.mjs` and `calendar-switch.mjs` were rerun. All four
  rewrote their result files with no difference (`git status` clean
  afterwards).
- **Raw records.** All 34 responses in `horizons/` match the SHA-256 in the
  two query lists, and every one names DE441.
- **Figures in the README, recomputed from the result files.** The per-body
  table of largest differences (ten rows, rounded up to 0.01″), Pluto's
  angle (30.324″ at 2199-12-31 12:00 TT and 30.327″ at 23:45:36 TT, by a
  vector product, against the README's 30.33″), the UTC table's fifteen
  longitude cells and ten clock cells, "49 of the 50 are within 30″" (the
  largest of the 49 is Pluto, 27.88″), the Moon's band (57.54″), the ΔT
  sigma (103.05 s), `bounds.position` (8.3″, `measured`) and
  `natalChart()`'s empty `flags`. All agree.
- **The explanation of the 36.23″, tested rather than read.** If the
  difference is the two clocks, the engine given the TT that Horizons itself
  used (the response's UT plus its printed TDB−UT) should agree with
  Horizons about as well as on TT elsewhere. It does. Not committed as a
  script; `calc({ body, time: { jd, scale: "tt" } })` with
  `jd = jdUt + tdbMinusUtSeconds / 86400` from
  `results/utc-after-2050.json`:

  | UTC instant | Moon, UTC input | Moon, Horizons's own TT | clocks apart, s |
  | --- | ---: | ---: | ---: |
  | 2051-06-15 00:00 | 0.62 | −0.60 | 2.40 |
  | 2075-06-15 00:00 | 1.71 | −0.81 | 5.14 |
  | 2100-01-01 00:00 | 6.38 | 0.69 | 9.74 |
  | 2150-01-01 00:00 | 14.67 | 0.89 | 26.87 |
  | 2199-06-15 12:00 | 36.23 | 4.60 | 56.65 |

  At the last instant 31.63″ of the 36.23″ goes away with the clock
  difference (0.558″ per second over 56.65 s), and 4.60″ remains. Over all
  50 comparisons on Horizons's own TT the largest is Pluto, 27.93″. So "a
  difference of the two clocks" is right, with a remainder of 4.60″ that
  the README does not state: its "within 2.94″ on TT" is another instant
  (2199-12-31).

## Should-fix

1. **The mechanism of Horizons's clock is misdescribed, and the engine's
   own assumption is not stated.** The README says the 69.18 s is Horizons's
   "last prediction held constant" of Earth orientation and that the table
   "measures the difference between two extrapolations of the Earth's
   rotation". The committed responses say more exactly what it is
   (`horizons/utc-after-2050-301.txt`, "TIME" and "TDB-UT"): "Times AFTER
   1962 are in UTC", "the last known leap-second is used as a constant over
   future intervals", and for 1962 and later "the difference is with respect
   to UTC (TDB-UTC)". 69.184 s is 32.184 s plus 37 leap seconds. So
   Horizons's side is not an extrapolation of the Earth's rotation: it is
   UTC with no leap second after the last one announced. The engine's side
   is its ΔT model plus the assumption that UTC stays within 0.9 s of UT1:
   its receipt at 2199-06-15T12:00Z has `timeScale.ut1MinusUtc: { seconds:
   0, sigma: 0.9, source: "fallback" }` and `leapSeconds: null`. The table's
   two clock columns are therefore TDB−UTC and TT−UT1, two different
   quantities that are equal only under that assumption. The conclusion
   survives (nothing can arbitrate UT1 for 2199, so P1 is not testable
   there), but the sentence "no arbiter exists for the UT of a date that far
   ahead" hides that the caller's input is UTC, not UT1, and that the two
   systems read the same UTC stamp under two conventions. Suggested: quote
   Horizons's own words, name both conventions, and say that which of them
   a UTC stamp in 2199 will mean depends on leap-second policy. For
   context, not as evidence about either system: Resolution 4 of the 27th
   CGPM (2022) "decides that the maximum value for the difference (UT1-UTC)
   will be increased in, or before, 2035"
   (https://www.bipm.org/en/cgpm-2022/resolution-4, read 2026-11-13). What
   the engine should mean by a UTC input after that change is a product
   call, added to the open list below. It is not decided here.

2. **"It would not pass a day past the span" (P1, point 1) is not
   supported, and the README's own figures speak against it.** Pluto's
   longitude difference is 29.684″ at 12:00 TT and 29.688″ at 23:45:36 TT
   on 2199-12-31: 0.004″ in half a day, with 0.31″ of margin. From
   `results/utc-after-2050.json` it grows 1.8″ over the 199 days before
   that. Nothing was measured past the span (`calc()` refuses there), so the
   sentence is a forecast, and one day would not use up 0.31″ at either
   rate. This sentence predates the fix round. Remove it or replace it with
   the measured rate.

3. **T3's case table still has verdicts that are neither pass nor fail.**
   The README now states the two-outcome rule and the T3 row reads fail
   because a date in the skipped range "is accepted with no flag". In the
   case table four rows read "noted, not flagged" or "silent", and the
   paragraph beneath says only the silent ones fail while "the noted cases
   depend on reading the note as a flag". That is the mixed reading at case
   level. By the headline's own wording (nothing in `flags`) the noted cases
   fail too. Either mark them fail in the verdict column, or mark them
   "open" and say so in the headline; the two places should agree.

4. **The committed result files still carry the old three-way labels, and
   the README does not say so.** `results/horizons-edge.json` has
   `counts.T4: { pass: 130, degenerate-unflagged: 4 }` and `counts.T5: {
   pass: 12, flagged-by-natalChart-only: 3 }`; `calendar-switch.json` counts
   `noted: 5, silent: 2`. The 130 "pass" records include the 89.99° cases
   that the README now says were not shown to pass (the tool checks for
   twelve finite cusps and nothing else). Leaving the files alone was right
   for a reports-only round. One sentence in the README is needed: the
   `verdict` fields are the tools' labels, the README's table is the
   verdict, and `pass` on a T4 house record means only "twelve finite cusps
   and the expected flag".

5. **Two counts in the civil-time rows are wrong.** T1's row says "in four
   zones, 9 cases"; the table beneath and `results/local-time-rule.json`
   have five (America/New_York, Australia/Sydney, Australia/Lord_Howe,
   Europe/London, America/Sitka). The README's cases add to 22 (9, 7 and 6)
   while the result file has 23 passes: the fixture case `T2/L3-TZ-0035`
   (Pacific/Apia) carries a T2 id in the file and is not accounted for in
   either section's count. Both predate the fix round and were outside its
   brief, but they are counts in a report whose counts were just corrected.

## Notes

1. P2's row reads "pass on the same instants; the Moon on UTC input ... is
   over 30″". By P2's letter that case is "a fail pending explanation", and
   the subsection says so. Whether the explanation is accepted is the
   owner's judgment, not the report's; Dias's approved wording for fix 1
   reads as accepting it. Clearer: "pass on TT and to 2021; one UTC case
   over 30″, explained (clock difference)".
2. "the root's `natalChart()` on UTC for six settled UTC instants" should be
   six cases at five distinct instants, as the next sentence counts them.
3. "Every instant after 2050 in this table" and "the six instants after
   2050" include 2050-01-01 00:00 TT, which is neither after 2050 nor in
   T5's 2051 to 2199. Five of the six are.
4. T5's "12 of 12" is six instants for the Sun and the Moon. The README
   lists the six instants and not the two bodies.
5. The check on Horizons's own TT above shows the Moon at 4.60″ in June
   2199 where the TT table's largest is 2.94″. The README's "largest
   difference found per body" is over 11 instants and says so; the UTC
   subsection could give the 4.60″ so that the 36.23″ adds up.
6. `BREAKER.md` (earlier session, unchanged) names a scratch path under
   `/workspace/runs/` at its line 299, and that directory's name contains a
   model family name. The house rule is no model name in a file. Not
   changed here: this session may add this file only.

## Open, not decided (unchanged, plus one)

Listed as open in `README.md`, the pull request's description and the
builder's handoff; none was acted on in the fix round or here.

1. T4: whether an unflagged 180° flip of the ascendant inside the polar
   circle is "unstable". The scan behind it is still not committed.
2. Whether civil-time results are judged against the pinned tzdb 2025c or
   the host's data (Europe/Chisinau 2022-03-27 02:30 on a 2026c host).
3. Whether a 30″ statement is about longitude or the whole angle (Pluto,
   30.33″ as an angle at the end of 2199).
4. The live methodology page's Moon and ΔT figures late in the span.
5. Whether `calc()`'s time band and ΔT record count as "reported" for T5,
   and whether `natalChart()` should flag an extrapolated ΔT.
6. The calendar switch (refuse or flag), exactly ±90° (refuse or flag),
   `positions()` outside the span, and Samoa's chart for the next day under
   `dst-gap`.
7. New, from should-fix 1: what a UTC input means to the engine once UTC is
   allowed to drift from UT1 (in or before 2035), given that the engine
   takes UT1−UTC as 0 ± 0.9 s for future dates.

## Not done

- No new Horizons query was sent. The check on Horizons's own TT used the
  committed responses and is not committed as a script.
- The earlier session's polar scan, wider tz run and daily Pluto run were
  not rerun.
- `SWEEP-REVIEW.md` and S1 to S3 were not reviewed again; the fix round did
  not change them.
- No fix was applied. The should-fix items are for a later round, if the
  owner wants one.
