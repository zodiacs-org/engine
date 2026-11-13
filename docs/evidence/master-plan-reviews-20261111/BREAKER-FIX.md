# Breaker review of the fix round (ZOD-98)

Written on 2026-11-13 by a new session that wrote neither the reviews nor
the fix round. It read the fix commit `b93d017` against the commit before
it (`0859999`), the builder's fix handoff, and `BREAKER.md`, and then went
back to the sources: Linear (ZOD-64, ZOD-66 and ZOD-98 with their
comments), the master plan (the whole document, through the documents
connector), pull requests 88, 91 and 94 (read with `gh`, not changed), this
repository at `8da3a4e`, the live connector (`tools/list` and two calls)
and nine of the addresses the fix round added. It changed nothing but this
file. `BREAKER.md` is kept as it was.

Each finding is a **blocker**, a **should-fix** or a **note**, as in
`BREAKER.md`.

## Verdict

**The approved fixes hold. No blocker.**

- **B1 is repaired.** The hold of the bare-date refusal for 2.0.0 is in the
  disagreements list as item 17, and Review 2 (B2, B11) and item 13 no
  longer present pull request 88 as the pending fix. Every quotation in
  those passages was found in its source today.
- **S1 to S8 were all applied**, and each holds in the review files, with
  the exceptions listed as should-fix below.
- Five should-fix items and seven notes. Three of the five are in text the
  fix round added. None reverses a finding.
- The owner's open product calls are still open and none was acted on.
  `LICENSING.md` is unchanged and nothing was sent to anyone.

ZOD-98's test R6, which `BREAKER.md` said did not pass as written, now
passes, with the residue in F2 and F5.

## B1, checked

| Statement in the fix round | Source opened today | Result |
| --- | --- | --- |
| ZOD-66, comment of 12:19 UTC on 2026-11-11: "The bare-date refusal (ZOD-64, #88) is held for 2.0.0." | Linear, created `2026-11-11T12:19:36Z` | Word for word |
| Pull request 91's body: "It does not contain #88. In 1.x a birth given as a bare date such as `"1990-05-03"` is still read as midnight UTC, as documented. The refusal is held for 2.0.0 by your decision of 11 November 2026." | `gh pr view 91`, line 7 | Word for word |
| "#88 stays open as the draft for 2.0.0, or can be closed and redone then", owner decision 2 | Same body, decision 2 | Word for word |
| "Whether `saturnReturn` and the progressions should also refuse a bare date is part of the 2.0.0 question, with #88" | Same body, decision 5 | Word for word |
| "The default is unchanged" (item 13) | Same body, line 4 | Word for word |
| ZOD-64, comment of 07:06 UTC: the Moon times "are written but not switched on, because they need a change to a published tool definition" | Linear, created `2026-11-11T07:06:59Z` | Word for word |
| Comment times: ZOD-64 at 07:06 and 08:16; ZOD-66 at 07:07, 08:16 and 12:19 | Linear | All five exist, and there are no others |
| The plan: Phase 1's heading and goal, its second item, finish line 4's heading, "or 2.0.0 if you change a default" | The plan, read in full | Found (but see F2 for what the ellipsis leaves out) |
| ZOD-64 "still lists the refusal among its fixes" | Linear, the description, last updated 2026-11-11 14:37 UTC | True: "Refuse it, or require timeKnown: false." |
| Pull requests 89 and 90 closed; 87, 88 and 91 open drafts; 91's head `ce4ba82` | `gh pr view` | True today. 88's head is `ac2b453`. |

A search of the five review files and the README for "88", "#88" and
`ac2b453` finds ten lines. None presents pull request 88 as a fix on its
way into 1.x. Review 2's B2 and B11 say "would refuse", name the hold and
point to item 17. Item 13 says the same and withdraws its own proposal.
The folder's README says the comments were missed and when they were read.

## Should-fix

### F1. One line of Review 1 still says the sign-change check has had no second reader

`01-accuracy.md:414`, under "Not checked": "A10's comparison is this job's
own and has had no second reader." Twenty lines above it the fix round
says the opposite, correctly: "The measurement has now had a second reader
(`BREAKER.md`, N2)". `sign-changes/README.md` was corrected; this line was
not. The pull request's body has the same stale sentence ("It has had no
second reader") beside the ESA sentence the builder's handoff already
names. Repair: reword line 414 (a second reader reproduced parts of it;
that reader's work has had no third), and edit the pull request body for
both sentences.

### F2. Item 17 says more than the plan's text supports, by an ellipsis

Item 17's heading is "Phase 1 cannot meet its goal for the package in
1.x", and its text says "Phase 1's goal and finish line 4 cannot be met in
1.x for this case". It quotes finish line 4 as "Each known edge case ...
returns a flag or a refusal." The plan's sentence, in full: "Each known
edge case (repeated hour, nonexistent date, poles, Topocentric houses above
66 degrees, years after 2050) returns a flag or a refusal." The bare date
is not in that list. Whether the heading "No silent wrong answers" reaches
it is a reading, and the ellipsis hides that it is one.

The goal is "nothing public is false". The package documents the midnight
reading (`README.md:344`, "Date-only strings mean UTC midnight", and
`README.md:877`), and pull request 91's body says "as documented". A
documented default is not plainly a false public statement.

What the sources do support, and it is enough for the item to stand: Phase
1 lists "stop treating a bare date as midnight UTC" as a task of "about a
week", and the decision moves that task to a major version. Repair: quote
the sentence whole, say the bare date is not among its named cases, and
change the heading to say that a Phase 1 task is held for 2.0.0.

`BREAKER.md`, B1, framed it the same way ("Phase 1 cannot meet its goal
for the engine in 1.x"), so this began with the first breaker review and
the builder followed it.

### F3. Item 17 gives the decision a reason that no source records, and offers as its own an alternative that pull request 88 already put to the owner

"The decision has a reason this review does not dispute: refusing an input
that 1.0.0 accepts breaks callers, and `docs/versioning.md` governs that."
Neither the ZOD-66 comment nor pull request 91's body gives a reason. The
reason is the review's inference. It is a fair one
(`docs/versioning.md:33-35` makes "which input it refuses and how" part of
the public promise, and the plan's own Risk 3 is "Fixing defaults breaks
existing users; a rushed major version costs trust"), but it should be
marked as a reading, with those two citations.

The item's "*Instead*" and the handoff's call 16 propose "a flag on the
chart" for 1.x. Pull request 88's body, under "Owner decisions", already
says: "If you would rather not break those callers in the 1.1.0 line, the
alternative is to keep accepting the date and add a flag to the chart
instead; say so and I will redo it that way." The fix round read 88's
state and not its body. The item should cite it: the flag is an offer
already on the table, and the owner's decision did not take it up in
either text. That is the open call, and it stays open.

### F4. "Every result carries a receipt" is not true of the natal chart tool

Review 4, D8 (fix round): "each result this review received carried a full
receipt", and "Observed: every result carries a receipt with a SHA-256
digest, engine and ephemeris versions and convention identifiers."

Called here on 2026-11-13, `get_natal_chart` with `{"birthDate":"1990-05-03"}`
(the call Review 2, B11, also made) returned 14,809 bytes with the keys
`schema`, `ok`, `tool`, `data` and `links`, and no receipt, no digest and
no engine version anywhere in the text or the structured content.
`get_sky` with no arguments, called a minute later, has a receipt at
`data.calculation.receipt` and two digests. `BREAKER.md`, S5, said "every
result seen", and that reader saw three event and capability results; the
fix round widened it.

The same call bears on list D of the disagreements. The new entry on Phase
4 says that `get_natal_chart` returned `"houseSystem":null` (true today)
"and its receipts carry `"zodiac":"tropical"`". The natal chart result
contains neither word, tropical or sidereal. For the plan's "tropical or
sidereal stated up front" that is the more useful observation: on this
call the chart tool does not state it at all.

Repair: say which tools' results carried a receipt, and that the natal
chart result for a date alone did not. One call each; a chart with a time
and place was not tried here.

The other new observations in that entry do hold on today's `tools/list`
(150,468 bytes, 19 tools): the zone input is named `zone`, `birthZone` and
`currentZone`, and all seven time inputs carry the pattern for `HH:MM`
with no seconds.

### F5. Three plan statements are still in none of the four lists

S6 was applied as `BREAKER.md` asked: six entries added to C and eight to
D, each matching its source (checked: `README.md:551`, `CHANGELOG.md:5-8`,
18 export keys with two under `./internal`, `conformance/README.md:14-15`,
`conformance/RESULTS.md:56`, and ZOD-66's description for "always takes
the first pass, with only a dst-fold flag"). Reading the plan end to end
today finds three more that neither the first breaker review nor the fix
round listed:

- Done: "Positions, natal charts, transits, synastry, progressions,
  returns, ... sidereal and Vedic, void-of-course Moon, dignities,
  planetary hours."
- Done: "Zodiacal releasing with the Lot of Spirit and Lot of Fortune,
  including the 'loosing of the bond' flag."
- Not yet verified: "ZOD-60 and ZOD-61 list some parts as missing that the
  engine already has".

A search of the repository finds each named technique in `README.md` or
`docs/` (the loosing of the bond and the two Lots in
`docs/timing-hellenistic.md` and the README). That is a search for the
words and not a check of the features. They belong in C as "named in the
package's documentation, not tested here", or in D. This is a gap in the
first breaker review as much as in the fix round.

## Notes

### N1. S1 to S8, one by one

| Item | Applied | Holds |
| --- | --- | --- |
| S1 (the relayed time) | Review 2, B9 and "Not checked" | Yes. Three tools and three values, the relayed 14:30:44 marked as never seen live, `search_sky_events` marked as not offered. `tools/list` today has the same 19 names and no `search_sky_events`. |
| S2 (the plan's own words) | Items 6 and 9; Review 1, A10 | Yes. Both plan sentences are quoted whole and match the plan. The misreading is withdrawn in so many words. The 1823 case is carried with its figures (13.3 / 0.375 is 35.5, "about 35 times"). |
| S3 (the CDS's A&A rule) | Review 3, the table and new C13; item 14 | Yes. Both archive addresses open today; each sentence is on the page the review now gives for it, and "Updated at: 7 January 2026" is on the `/legals/` copy. The A&A sentence reads as quoted. `LICENSING.md` is unchanged. |
| S4 (ESA's wording) | Review 3, C9; item 14 | Yes in the review files. The pull request body still has the short form (the builder says so). The address added for the new reduction opens and has the quoted sentence and no licence statement. |
| S5 (two published rules) | Review 4, D8, D4 and the summary table | Yes, except F4. The mistaken size comparison is withdrawn. The reading of section 2 is marked as a reading. |
| S6 (lists C and D) | `05-disagreements.md` | Yes, with F5. |
| S7 (addresses) | Reviews 1, 3 and 4 | Yes. Opened today: the IERS data centre page ("EOP 20u24 C04" is on it), GeoNames's export page (the sentence is on it), both CfA ReadMe files (neither contains the word licence or copyright), Crossref's record (one licence entry, for text mining). The methodology page's sentence is now quoted whole and matches the page, including "The other 20 measurements are the far-future cases". OpenAlex is marked as one reading with no address. |
| S8 (Horizons) | `sign-changes/README.md`; Review 1, A10 | Yes. The caution is called the session's own, the 176 and the 12 requests are both said not to meet the policy, and the digests are called a record and not a check. No rerun was made. |

### N2. The commit and the pull request

`b93d017` is by `Zodiacs Admin <admin@zodiacs.org>`, with no trailer and
no model name. It changes seven files, all in this folder; `BREAKER.md`
and `LICENSING.md` are not among them. No en dash or em dash in the
changed files. Pull request 94 is open and a draft with head `b93d017`.
Pull request 91's head is `ce4ba82` and pull request 92's is `255b615`,
both open drafts, as before. ZOD-98 has no comment.

### N3. Whose reading is whose

The GeoNames export page is cited in Review 4, D7, as "read 2026-11-11".
That reading was the second reader's (`BREAKER.md`, S7), not the review's;
the handoff says no provider page was fetched in the fix round. The
sentence is on the page today, so nothing rests on it. The same is true of
the IERS data centre address. A few words ("by the second reader") would
make it exact.

### N4. The decision's record

The 2.0.0 decision is recorded in two texts and nowhere else that was
found: a Linear comment and a pull request body, both written for the
owner on 2026-11-11. Item 17 says so and asks for the plan and ZOD-64's
description to carry it. Neither has been changed, which is right: both
are the owner's.

### N5. The reviews against today's `main`

The README's new note is accurate. Between `bc0b5a7` and `8da3a4e`, outside
`docs/evidence/`, only `docs/calc.md` (60 lines) and `docs/techniques.md`
(16 lines) changed. `README.md`, `CHANGELOG.md`, `LICENSING.md`,
`docs/de440.md`, `docs/versioning.md` and `conformance/` are the same, so
every line number checked here still points at the quoted text. Review 1's
line numbers for `docs/calc.md` are those of `bc0b5a7`, as the note says.

### N6. Open calls

The handoff lists 17 calls for the owner. Each was compared with the fix
commit: none was acted on. Calls 16 and 17 are new and come from item 17
and D8; call 16 should carry the citation in F3. No letter, no listing
note and no Horizons rerun was made.

### N7. This review's own limits

- The methodology page, both archive copies and the other addresses were
  fetched once each with a generic client name. The three connector
  requests (`tools/list`, `get_natal_chart`, `get_sky`) used synthetic or
  no birth data.
- OpenAlex, the Royal Society's pages and Horizons were not opened.
- The site repository was not read again, so the quotations from site pull
  requests 974 and 975 in list D rest on the earlier readings.
- First-pass sections that the fix round did not touch were not read
  again.
- The responses fetched here are not committed. This session may commit
  this file only.
