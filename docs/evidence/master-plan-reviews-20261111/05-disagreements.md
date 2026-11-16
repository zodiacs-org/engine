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

Fix round, 2026-11-13, after the second reader's review (`BREAKER.md`):
item 17 is new (a decision recorded in Linear on 2026-11-11 that the list
had missed); items 6, 9, 13 and 14 are amended; lists C and D are
completed. Nothing else is changed.

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

Fix round: the plan's last section, "Not yet verified", says of the second
target: "The 1-arcsecond and 1-minute targets are proposals, not measured
results." So the plan does not claim 1″ as a result, and this item argues
with a proposal the plan marks as one. The point about the 30″ line stands
as written.

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

*Plan, finish line 2, in full:* "**Sign changes right to the minute on the
precise path.** Every sign change from Sun to Pluto, 1800 to 2200, within 1
minute of JPL Horizons. Checked by: Horizons." *"Not yet verified":* "The
1-arcsecond and 1-minute targets are proposals, not measured results."

*Found:* (Fix round. The earlier wording quoted the line without its first
sentence and concluded that "the plan should say" it is for the DE440 path
only. The plan does say so: "on the precise path". That part of the item
was a misreading and is withdrawn.) What stands: on the default path, none
of Pluto's 73 sign changes and one of Neptune's 103 is within a minute of
Horizons (Review 1, A10), so the line can only ever be met on the precise
path, as the plan has it. And even there a line
in minutes is badly posed for the slow planets. Pluto's two worst cases are
either side of a station near a boundary, where a few milliarcseconds move
the crossing by minutes and a little more can add or remove a crossing. The
pack's own error (up to 0.0005″ for Pluto), the IAU 2000B nutation (up to
0.0023″ from IAU 2000A) and the difference between DE440 and Horizons's
DE441 are all of that size. The second reader found the sharpest case: on
1823-12-15, by Horizons, Pluto turns direct 0.375″ inside Aries without
crossing (`BREAKER.md`, N2). A reference that differs by half an arcsecond
there has a pair of sign changes that Horizons does not.

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

- The engine on `main` casts a bare date for midnight UTC with no flag.
  Pull request 88 would refuse it, and the owner held that for 2.0.0 on
  2026-11-11 (item 17). The connector casts it for noon UTC and says so.
  The methodology page says "the site uses 12:00 local civil time". Three
  surfaces, three conventions (Review 2, B11), and by that decision they
  stay three through 1.x.
- For a repeated hour the engine keeps a silent default and a flag after
  the fact. The agent skill's rule is "ask for disambiguation or carry
  both; don't silently pick one" (`skills/zodiacs-compute/SKILL.md:43-45`).

*Instead:* write one rule for an unknown time and one for a repeated hour,
in one place, and make the three surfaces cite it.

Fix round: the earlier wording went on to propose "Keep the engine's
default for 1.x and record it as a known inconsistency". For the bare date
that is the decision the owner had already taken, in stronger form, hours
before this list was written; it was not this review's to propose. For the
repeated hour it is also what pull request 91 does ("The default is
unchanged"). What is left of the proposal is the record: neither decision
is written down where a caller of the package will read it as a known
inconsistency between the two cases.

### 14. The letters

*Plan, Phase 6:* "write to NAIF, IERS and CDS. Start these in week one".
*Finish line 5:* "written answers or documented fallbacks for NAIF, IERS
and CDS". *Risk 1:* "NAIF, IERS or IMCCE never reply, so the fallbacks
(server-only data pack, drop the 1972 rows) must be ready."

*Found:*

- NAIF was written to on 2026-09-30; the site's record says "No answer yet.
  Do not resend it." The plan does not mention it.
- ESA is missing. Its 1997 Hipparcos and Tycho Catalogues are under CC
  BY-NC 3.0 IGO and its archive terms ask for a request before commercial
  use; whether either reaches the values the engine carries, which are from
  the 2007 reduction through VizieR, is not settled (Review 3, C9). It is a
  question to put, not a finding that the terms are non-commercial.
- The CDS's own page grants only scientific use for data from Astronomy &
  Astrophysics, the origin of one of the three catalogues (Review 3, C13).
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

### 17 (fix round). The plan's bare-date fix is held for 2.0.0, so Phase 1 cannot meet its goal for the package in 1.x

*Plan, Phase 1, goal:* "nothing public is false." *Its second item:* "drop
millisecond precision; use unambiguous dates instead of 10/11/2026; stop
treating a bare date as midnight UTC." *Finish line 4:* "**No silent wrong
answers.** Each known edge case ... returns a flag or a refusal." *ZOD-64:*
"natalChart with a bare date silently means midnight UTC. Refuse it, or
require timeKnown: false."

*Decision already in Linear:* ZOD-66, comment of 2026-11-11 12:19 UTC: "Test
release 1.1.0-rc.6 now carries the earlier/later choice ... It replaces
rc.4 (#89) and rc.5 (#90), both closed unmerged. The bare-date refusal
(ZOD-64, #88) is held for 2.0.0." Pull request 91's body: "It does not
contain #88. In 1.x a birth given as a bare date such as `"1990-05-03"` is
still read as midnight UTC, as documented. The refusal is held for 2.0.0 by
your decision of 11 November 2026."

*Found:*

- The plan puts this fix in Phase 1 ("small, about a week"). The decision
  moves it to a major version the plan mentions only as a possibility
  ("or 2.0.0 if you change a default"). The plan and the decision
  disagree, and neither the plan nor ZOD-64's description has been changed
  to say so. ZOD-64 still lists the refusal among its fixes.
- The decision has a reason this review does not dispute: refusing an
  input that 1.0.0 accepts breaks callers, and `docs/versioning.md` governs
  that.
- What follows from it. On the package's default path, Phase 1's goal and
  finish line 4 cannot be met in 1.x for this case: `natalChart({ utc:
  "1990-05-03" })` on the build of `main` returns a chart with `flags: []`
  (Review 2, B11). The hosted connector is not affected: it already casts a
  bare date for noon UTC and says so.
- Pull request 91's body leaves a second part open: "A date passed on its
  own, and a birth given as a bare date, are both read as midnight UTC in
  1.x. Whether `saturnReturn` and the progressions should also refuse a
  bare date is part of the 2.0.0 question, with #88."
- Pull request 88 is still open as a draft, "as the draft for 2.0.0, or can
  be closed and redone then" (pull request 91, owner decision 2).
- ZOD-64's comment of 07:06 UTC records another piece of its list that is
  not live: the last and next new and full Moon times "are written but not
  switched on, because they need a change to a published tool definition".

*Evidence:* Linear, ZOD-64 (comments of 07:06 and 08:16 UTC) and ZOD-66
(comments of 07:07, 08:16 and 12:19 UTC), all 2026-11-11, read on
2026-11-13; pull request 91's body, read with `gh pr view 91` and not
changed (head `ce4ba82`); pull requests 89 and 90 closed, 87, 88 and 91
open drafts.

*Instead:* the decision is the owner's and is taken. What the plan needs is
to say it: move the bare-date refusal out of Phase 1 into the major
version, reword finish line 4 so that 1.x can meet it (a flag on the chart,
or the documented default stated in the result, would be a 1.x change that
breaks nobody), and correct ZOD-64's description. Whether a flag is wanted
in 1.x is an open product call, not answered here.

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
- "fix the 'New Moon' label": the engine returns "New Moon" at 12° past new (Review 2, B14). ZOD-64's "17 degrees past new" is consistent: the second reader found the label changes at about 22.59° on the same build (`BREAKER.md`, S6).
- "13 house systems": `README.md:551`, "`houseSystem` takes one of thirteen systems".
- "the third candidate for 1.1.0 is in the repo with 16 public entry points": `CHANGELOG.md:5-7`, "with sixteen public entry points"; `package.json` has 18 export keys, two of them under `./internal`. (True of `main` when the plan was written. A later candidate is in draft, pull request 91.)
- "1.1.0 is unpublished. The changelog says it waits for your approval": `CHANGELOG.md:7-8`, "It is not to be published on npm until the owner approves it."
- "Conformance levels L4 to L6 (events, Vedic, Hellenistic) are planned but not written": `conformance/README.md:14-15`.
- ZOD-66, "always takes the first pass, with only a dst-fold flag": `conformance/RESULTS.md`, "A repeated local time resolves to its earlier instant", and `README.md:650-654`.

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

Added in the fix round. These statements of the plan and the issues were in
none of the lists. None was checked, and each says what a check would need:

- Phase 4: "one house default everywhere, one name for the zone setting,
  one chart output shape ... tropical or sidereal stated up front". Not
  checked. It could be, against the live `tools/list` and results. What
  was seen in passing: the connector's `get_natal_chart` returned
  `"houseSystem":null` for a chart with no time, and its receipts carry
  `"zodiac":"tropical"`; tools name the zone input `zone`, `birthZone` and
  `currentZone`. That is not a check of the statement.
- Phase 4: "short conventions instead of 3 KB per result". Not measured by
  this review. The second reader measured three results at 9,089 to 15,277
  bytes each (`BREAKER.md`, S5); the share that is conventions was not
  measured.
- Phase 4: "the sky fact checker's description". Not checked against what
  the tool does beyond the one call in Review 2, B9.
- Phase 2: "Accept seconds in birth times." Not checked. The connector's
  `time` inputs take `HH:MM` only, by their published patterns; the
  engine's inputs were not examined.
- ZOD-66: "Hold the 1.1.0 release until this lands." A decision, not a
  fact; pull request 91 carries the change in a draft candidate.
- ZOD-66: "the rising sign about 12 degrees wrong" for a birth in the
  second pass. Not checked. An hour of sidereal time is 15° on the equator;
  what it is on the ecliptic at New York's latitude was not computed.
- ZOD-63: "show an uncertainty window for slow-planet sign changes". Site
  pull request 975 puts a note in link titles and says a proper field needs
  a change to published tool definitions. Whether that meets the issue is
  not judged here.
- ZOD-64: "Round to the minute" and "Return ISO local time with offset".
  Drafted in site pull request 974, not live (Review 2, B10). The drafts
  were not tested.
