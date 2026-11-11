# Disagreements with the plan

**What "the plan" is here.** The first pass of this job could not open the
master plan and listed disagreements with what the engine repository showed
of it. The second pass opened it: the document "Zodiacs engine master plan"
(artifact id `814TqL6h6Nu3bjrD3FJBRy`, one tab, read in full on 2026-11-11),
and the Linear issues that extract from it, ZOD-63, ZOD-64, ZOD-65 and
ZOD-66, with ZOD-58 and ZOD-62, which it cites. This list is against that
text. It replaces the first pass's list; where an earlier item survives, it
is restated against the plan's own words.

The four original reviews the plan says it rests on ("four [...] reviews on
10 to 11 November 2026") were not found anywhere, so where the plan repeats
a review's figure with no other source, the figure can be checked and the
review cannot. Those cases are marked.

Each item gives what the plan or the issue says, what this review found,
and the evidence. Items are ordered by how much depends on them.

## A. Statements in the plan that the evidence contradicts

### 1. "The engine passes all 240 position and 150 house vectors."

*Plan, "Done":* "A conformance suite of 500 test vectors with independent
referees. The engine passes all 240 position and 150 house vectors."

*Found:* the engine passes 48 of the 240 position vectors and fails 192. It
passes all 150 house and angle vectors.

*Evidence:* `conformance/RESULTS.md`, section "@zodiacs/engine 1.1.0-rc.3":
"| L1 | `position.apparent.ecliptic-true-of-date` | 48 | 192 | 0 | 0 |". The
row that reads 240 passed and 0 failed is in the next section, "Swiss
Ephemeris 2.10.03". The plan appears to have read the second table for the
first. `CHANGELOG.md:73-74` gives the same totals: "267 pass, 192 fail, 41
unsupported".

*Consequence:* the plan's "Done" list overstates the default path, and its
finish line has no item for the 192. They can pass only on the DE440 path,
at the suite's 1″ tolerance.

### 2. Accuracy listed as "Done" before it was measured, and wider than what was measured

*Plan, "Done":* "Accuracy: within 30 arcseconds of NASA JPL DE440 on all
146,097 daily dates from 1800 to 2200. A sign differs in 0.03% of charts."
*Phase 3, "Unlocks":* "the public claim 'within 30 arcseconds of NASA JPL
DE440 on every one of 146,097 dates'".

*Found:*

- When the plan was written the only source was a review whose data is in
  neither repository. A committed measurement now exists, on an unmerged
  branch (pull request 92), made after the plan.
- That measurement supports the claim for the ecliptic longitude, and the
  whole angle, of the Sun, the Moon and the planets (largest 29.19″ and
  29.86″, Pluto). It contradicts it for the true node: 32.64″.
- The plan's sentence names no bodies and no coordinate. ZOD-65's version
  does ("Zodiac longitudes for the Sun, Moon and planets"). The plan's is
  false as written.
- "A sign differs in 0.03% of charts": no evidence in either repository or
  in the sweep. Unchecked.

*Evidence:* Review 1, A2;
`docs/evidence/de440-sweep-20261111/README.md` on the ZOD-65 branch
(`1313fed`).

### 3. "Pluto up to 29 hours" and "Neptune up to 9.4 h"

*Plan, "Left":* "Slow-planet sign-change times are off by hours on the
default path (Pluto up to 29 hours)." *ZOD-63:* "accuracy review: Neptune up
to 9.4 h, Pluto up to 29 h off on the default path".

*Found:* the review behind both figures was not found, and site pull request
975 declined to use them for want of evidence. This job measured it (Review
1, A10): against JPL Horizons, over every sign change the engine finds from
1800 to 2200, Neptune is off by up to 9.51 hours (1848) and Pluto by up to
31.54 hours (2185). So the plan's figures are about right and slightly low.
They are the figures of a 400-year span; over 1900 to 2099 the largest are
about 8 and 9.6 hours, which is what the site's table gives. The
disagreement is with stating them as known when no evidence was committed,
and with "up to 29 hours" as a ceiling: this check found more.

*Evidence:* Review 1, A10, and `sign-changes/` in this folder; site pull
request 975's body; `src/data/nasa-event-instants.json` in the site
repository (`largestCorrectionSeconds.ingresses`: 34562).

### 4. ZOD-65: "Receipts and conformance/RESULTS.md quote limits from 32 instants"

*Found:* `conformance/RESULTS.md` prints no such limits. It prints the
suite's residuals on 240 vectors. The 32-instant values are in
`src/calc-bounds.ts` and `docs/calc.md`. The issue's own comment of
2026-11-11 says so ("conformance/RESULTS.md does not print those limits").
The issue text has not been corrected.

### 5. The engine's documents say the hosted service uses DE440; the plan is right that it does not yet

*Plan, "Done":* "A DE440 precision path, built but not yet swept end to
end." *Phase 3:* "route slow-planet sign-change times through DE440 on the
hosted service."

*Found:* the plan is right and the engine's documents are ahead of it.
`docs/de440.md:7-8` says "zodiacs.org's hosted compute API uses it on its
server". The live connector answers with engine 1.1.0-rc.2 and
astronomy-engine, and the DE440 backend is an open draft (site pull request
943). Review 1, A5. Listed here because a reader of the repository would
take the plan to be wrong.

## B. Decisions in the plan this review would make differently

### 6. A finish line set at the measured maximum is not a test

*Plan, finish line 1:* "A full sweep of 146,097 daily dates against JPL
DE440 passes for the default path (within 30 arcseconds) and for the DE440
path (target within 1 arcsecond)."

*Found:* the default path's result is 29.19″ in longitude and 29.86″ in
angle, both at Pluto on the last day of the span and "still growing". A
line of 30″ passes by 0.14″ on the build measured and says nothing about
the next build, or the day after 2199-12-31. For the DE440 path, 1″ is
three orders of magnitude looser than what the pack does for the bodies
(at most 0.0016″ from the kernel) and barely holds for the true node
(0.84″): `docs/evidence/de440-20261110/pack-accuracy.json`.

*Instead:* state the default path's result as a measured table by body and
era, with no pass line. For the DE440 path set separate lines for the
bodies and for the node, from the pack's proven errors.

### 7. "Replace the receipts' error limits" with a denser sample, for one row group

*Plan, Phase 1:* "replace the receipts' error limits (measured on 32
moments) with the full sweep's figures." *ZOD-65:* "regenerate the limits
from the dense sample (or per era)".

*Found:* agreed that the values must change: ten of the eleven geocentric
apparent values are too low (pull request 92), and five were shown too low
by evidence already on `main` (Review 1, A1). Three reservations:

- The sweep covers the 32 geocentric rows. "The other 75 rows
  (heliocentric, barycentric, topocentric, the mean points) were not swept
  and would stay." They were measured the same way as the rows now shown to
  be too low by up to a factor of 3.5 (Mars, 6.6″ against 22.92″).
  `src/calc-bounds.ts:13` has one basis sentence for all of them.
- One instant a day at noon TT is still a sample. `docs/calc.md:295-296`
  already says "not limits: another instant can exceed them".
- The field is named `bounds`, and the plan and ZOD-65 both say "limits".

*Instead:* sweep the heliocentric and barycentric rows before the next
candidate (pull request 92's third owner decision offers this). Give each
row group its own basis text with count and spacing. Add a second pass at
instants off the daily grid and report whether it finds more. Keep the word
"measured".

### 8. "Add a quotable accuracy field to every result"

*Plan, Phase 3.*

*Found:* calc results already carry one, `bounds`, and since 0.1.1-rc.16 it
has understated the error by up to a factor of 3.5 while carrying a correct
`basis` string that an assistant does not read aloud (Review 2, B4). The live connector's receipts carry
`"assessment":"finite-reference-cases-only"` and
`"broadDateRange":"not-certified"`, which is the honest form.

*Instead:* do not add a second number. If a field is added it should be the
address of the measured table and the build it was measured on, not a
figure an assistant will read aloud.

### 9. Sign changes "right to the minute"

*Plan, finish line 2:* "Every sign change from Sun to Pluto, 1800 to 2200,
within 1 minute of JPL Horizons. Checked by: Horizons."

*Found:* on the default path, none of Pluto's 73 sign changes and one of
Neptune's 103 is within a minute of Horizons (Review 1, A10), so this line
is for the DE440 path only, and the plan should say so. Even there a line
in minutes is badly posed for the slow planets. Pluto's two worst cases are
either side of a station near a boundary, where a few milliarcseconds move
the crossing by minutes and a little more can add or remove a crossing. The
pack's own error (up to 0.0005″ for Pluto), the IAU 2000B nutation (up to
0.0023″ from IAU 2000A) and the difference between DE440 and Horizons's
DE441 are all of that size.

*Instead:* define the test in longitude at Horizons's instant (for example
within a stated number of milliarcseconds), which is well posed at every
crossing, and report the time difference as a consequence. List separately
any crossing one source has and the other does not.

### 10. Two mechanisms for the same fix

*Plan, Phase 1:* "fix the Neptune into Aries mismatch". *Phase 3:* "route
slow-planet sign-change times through DE440 on the hosted service".
*ZOD-63:* "serve the Horizons or DE440-checked time where one exists, and
show an uncertainty window".

*Found:* site pull request 975 takes the first route: it serves times from
the site's Horizons table (498 sign changes; the outer planets from 1899 to
2100) and leaves the engine's time in the `calculation` block of the same
answer. So one tool result will hold 17:35:23 and 14:31:41 together, and
outside the table's years the engine's time is served alone. Site pull
request 943 is the second route. Neither is live: the connector returned
14:31:41 on 2026-11-11 (Review 2, B9).

*Instead:* treat the table as a stopgap with an end date, and say in the
result which source each time came from. The plan should name the order:
the table now, DE440 when pull request 943 is validated, and the table
removed then.

### 11. The directory steps are in the wrong order for ZOD-62

*Plan, Phase 1:* the ZOD-58 fixes, which "Unlocks: the directory
resubmission". *Phase 4:* "ZOD-62: add a 'chart for a moment' call", which
"Unlocks: the directory listing, and ZOD-61".

*Found:* the listing is already in review at both directories with 19
tools (Review 4). OpenAI rejected an earlier version over a child's data in
one tool. A "chart for a moment" call is a new tool that takes a date, a
time and a place and is exempt from the under-13 refusal. Both portals
review new tools, and this one sits exactly where the earlier rejection
was. Adding it after a Phase 1 resubmission means a second review round on
the most sensitive point.

*Instead:* decide ZOD-62's design before the next resubmission, and either
include it or tell the reviewers it is coming.

### 12. "Checked by: ... the connector directory approving the listing"

*Plan, finish line 7:* "The connector, the methodology page and Horizons
agree on a fixed list of 20 sky facts. Checked by: Horizons, and by the
connector directory approving the listing."

*Found:* a directory review checks policy: annotations, descriptions,
privacy, documentation (Review 4, *The rules read*). Nothing in the rules
read checks a sky fact. The list of 20 facts is not defined anywhere.

*Instead:* drop the directory from this item's check, define the 20 facts
in a committed file with their Horizons queries, and run it in CI against
the live connector.

### 13. ZOD-64 refuses a silent guess; ZOD-66 keeps one; and there are three conventions for an unknown time

*Plan, Phase 1:* "stop treating a bare date as midnight UTC." *Phase 2:*
"let the caller choose the earlier or later reading of a repeated hour, and
flag it." *ZOD-66:* the default stays the first pass.

*Found:*

- The engine on `main` casts a bare date for midnight UTC with no flag;
  pull request 88 refuses it. The connector casts it for noon UTC and says
  so. The methodology page says "the site uses 12:00 local civil time".
  Three surfaces, three conventions (Review 2, B11).
- For a repeated hour the engine keeps a silent default and a flag after
  the fact. The agent skill's rule is "ask for disambiguation or carry
  both; don't silently pick one" (`skills/zodiacs-compute/SKILL.md:43-45`).

*Instead:* write one rule for an unknown time and one for a repeated hour,
in one place, and make the three surfaces cite it. Keep the engine's
default for 1.x and record it as a known inconsistency.

### 14. The letters

*Plan, Phase 6:* "write to NAIF, IERS and CDS. Start these in week one".
*Finish line 5:* "written answers or documented fallbacks for NAIF, IERS
and CDS". *Risk 1:* "NAIF, IERS or IMCCE never reply, so the fallbacks
(server-only data pack, drop the 1972 rows) must be ready."

*Found:*

- NAIF was written to on 2026-09-30; the site's record says "No answer yet.
  Do not resend it." The plan does not mention it.
- ESA is missing. Its terms for Hipparcos data are non-commercial with a
  request required for commercial use (Review 3, C9).
- The CDS's site is down after a security incident (Review 3).
- "Drop the 1972 rows" does not remove everything that comes from EOP 20
  C04. `LICENSING.md:6-9` names "the UT1 table in 1972 and some of the ΔT
  table's values from 1941".
- No record of any question to IMCCE was found.
- JPL's own FAQ calls Horizons output public domain, so that part of the
  NAIF question is answered and need not be asked.

*Instead:* add ESA; make the NAIF letter a follow-up; write the C04
fallback to cover the ΔT values too; and take IMCCE out of the risk or
record the contact.

### 15. Swiss Ephemeris: the plan sees the site's history and not the live page

*Plan, Phase 6:* "decide what to do with the site repo history that holds
about 44,000 Swiss-generated values."

*Found:* the figure matches the site's record (44,071 tokens removed from
the tree, history not rewritten). The plan does not mention four other
places where Swiss Ephemeris is the yardstick, each of which matters more
to a reader than the history does:

- the live methodology page's section "Agreement with Swiss Ephemeris",
  with figures to 0.1″ (Review 1, A8);
- three sentences in the engine's README (Review 1, A6);
- the bot's test expectations, taken from Swiss Ephemeris and kept outside
  the repository, against `AGENTS.md` (Review 2, B6);
- 24 ΔT values Swiss returned, in the conformance suite's inputs, and two
  ayanamsa constants read from its documentation (Review 3, C2).

*Instead:* add these to Phase 1 ("nothing public is false" should include
"nothing public rests on a reference the rules exclude"), or change the
rule first.

### 16. Behaviour changes ship without the agent skill

*Plan, Phase 4 and its closing list of help offered:* tool descriptions and the "How we
calculate" page are to be rewritten. The agent skill in the engine
repository is not mentioned.

*Found:* the skill describes 0.1.1-rc.16, forbids a tool its own reference
page documents, and no check reads it (Review 2, B1).

*Instead:* add the skill to Phase 4 or withdraw it.

## C. Where the plan is confirmed

So that the list is not read as a rejection of the plan:

- "41 of 110 time and calendar tests are 'unsupported'": `conformance/RESULTS.md`, 69 pass and 41 unsupported.
- "rules taken from the visitor's device after 1970": every live receipt carries `host-intl-from-1970`.
- "the npm version trap": `npm view @zodiacs/engine dist-tags` on 2026-11-11 gave `latest: 1.0.0, next: 0.1.1-rc.16`.
- "@zodiacs/sdk, which is the token registry": its npm description is "Official read-only TypeScript SDK for the canonical Zodiacs.org registry ...".
- "13 tools listed, 19 exist": confirmed live (Review 2, B13).
- "tool descriptions that instruct Claude": confirmed against the directory's rule (Review 4, D4).
- "Neptune into Aries mismatch (connector says 14:31 UTC, methodology page says 17:35)": confirmed live.
- "version 0.6.6": the live server reports it.
- "A licence record that says go for MIT plus CC-BY-4.0, with open questions listed": `LICENSING.md:3-13`.
- "fix the 'New Moon' label": the engine returns "New Moon" at 12° past new (Review 2, B14).

## D. Parts of the plan that could not be checked

- The four original reviews. None was found. Every figure the plan takes
  from them with no other source is unchecked: "0.03% of charts", "about
  70% overall, roughly 85% of the calculations".
- "Topocentric houses above 66 degrees", "Samoa 2011", "years after 2050",
  and the other edge cases of Phase 2. They belong to job 1 (ZOD-97) and
  were not examined here.
- "make the receipt fingerprint the result, not only the method". The
  three receipts seen live had three different digests; what each digest
  covers was not examined.
- "wait for IMCCE on VSOP2013". No record found.
- The features ZOD-59, ZOD-60 and ZOD-61, and the plan's size estimates.
- "check your employment contract" and the lawyer's letter: outside what a
  repository can show.
