# Breaker review of the four reviews (ZOD-98)

Written on 2026-11-11 by a second session that did not write the reviews and
was asked to break them against ZOD-98's tests R1 to R7. It read the files
in this folder at `b6c5518`, the builder's `HANDOFF.md`, and then went back
to the sources: this repository, pull request 92's branch (read only), the
site repository at `47fee79f`, the master plan, Linear, the live service,
the providers' pages and JPL Horizons. It changed nothing but this file.

Each finding is a **blocker** (a test fails until it is fixed), a
**should-fix** (a statement is wrong, incomplete or unsourced, and the test
still holds), or a **note**.

## Verdict on the builder's R1 to R7 table

| Test | Builder | After this review |
| --- | --- | --- |
| R1 | Pass, one weakness | **Pass.** The weakness is removed: the helper passes' quotations were fetched again here and all were found (N1). Five small sourcing gaps (S7). |
| R2 | Pass | **Pass.** The A1 and A2 tables match the committed files and pull request 92's README figure for figure. The sign-change measurement was reproduced and checked a second way (N2). |
| R3 | Pass | **Pass, with two corrections.** The live results reproduce. One relayed time was not checked and does not match the live tool (S1). The state of the bare-date fix is out of date (B1). |
| R4 | Pass, two partial rows | **Pass, with two corrections** (S3, S4). Every quoted term was found on the provider's page. |
| R5 | Pass | **Pass, with one gap** (S5). No confusion with the token playbook (N5). |
| R6 | Pass | **Does not pass as written.** One decision recorded in Linear on the day of the review is missing and two items rest on the state it replaced (B1). One item misreads the plan (S2). Several plan statements are in none of the four lists (S6). |
| R7 | Pass | **Pass** (N6). |

One blocker, eight should-fix, seven notes. The blocker is small to repair:
one new item and three amended passages.

## Blocker

### B1. The bare-date refusal was held for 2.0.0 on 2026-11-11, and the reviews do not know it (R6, R3)

What the reviews say:

- `02-ai-assistants.md` B2: "ZOD-64 and ZOD-66 are fixing two of the traps
  in code, on their own branches: a bare date is refused unless the time is
  declared unknown (`admin/zod-64-...`, commit `ac2b453`)".
- `02-ai-assistants.md` B11: "Pull request 88 (`ac2b453`, open, draft)
  refuses it."
- `05-disagreements.md` item 13: "pull request 88 refuses it", and
  "*Instead:* ... Keep the engine's default for 1.x and record it as a
  known inconsistency."

What the sources say:

- Linear, ZOD-66, comment of 2026-11-11 12:19 UTC: "Test release 1.1.0-rc.6
  now carries the earlier/later choice ... It replaces rc.4 (#89) and rc.5
  (#90), both closed unmerged. The bare-date refusal (ZOD-64, #88) is held
  for 2.0.0."
- Pull request 91's body (read with `gh pr view 91`, not changed), line 7:
  "It does not contain #88. In 1.x a birth given as a bare date such as
  `"1990-05-03"` is still read as midnight UTC, as documented. The refusal
  is held for 2.0.0 by your decision of 11 November 2026."
- `gh pr view`: 89 and 90 are closed; 87, 88 and 91 are open drafts.

Both were written about two and a half hours before the builder's live
calls (14:53 UTC). The folder's `README.md` says the comments were read on
ZOD-63 and ZOD-65 only, and `HANDOFF.md` says pull requests 87, 88 and 91
were read "by title".

Why it fails R6. The plan's Phase 1 says "stop treating a bare date as
midnight UTC" under the goal "nothing public is false", and finish line 4
is "No silent wrong answers". The owner's decision moves that fix out of
the 1.x line. That is a disagreement between the plan and a decision
already extracted into Linear, which is what ZOD-98 asks the list to hold,
and it is not there. Item 13's own advice ("keep the engine's default for
1.x") is the decision already taken, presented as a proposal.

Repair: add an item that states the plan's sentence, the decision, and what
follows (Phase 1 cannot meet its goal for the engine in 1.x; the connector
already declares noon UTC; pull request 91's body also leaves open whether
`saturnReturn` and the progressions refuse a bare date). Amend B2, B11 and
item 13. Read the comments on ZOD-64 and ZOD-66 and say so in the README.
The ZOD-64 comment of 07:06 UTC adds one more fact the reviews lack: the
last and next new and full Moon times "are written but not switched on,
because they need a change to a published tool definition".

## Should-fix

### S1. The third connector time is relayed, not observed, and the live tool gives another (R3)

`02-ai-assistants.md` B9 says that, by site pull request 975,
`search_sky_events` and `get_horoscope_period` "said 14:30:44; those were
not called here".

Called here at 15:29 UTC on 2026-11-11, `POST https://zodiacs.org/mcp`,
`get_horoscope_period` with `{"sign":"aries","period":"month","date":"2026-01-15"}`
returned `"utc":"2026-01-26T14:31:41.093Z"` for Neptune's ingress. That is
not 14:30:44. It is a third millisecond value beside the two the review
found (`.087` from `get_upcoming_events`, `.084` from `check_sky_fact`).
`search_sky_events` is not among the 19 names in the live `tools/list`, so
it cannot be called through the connector at all.

One call with one set of arguments does not show that 14:30:44 never
appears. It does show that the review states a contradiction it did not
observe, for one tool that answers differently today and one that is not
offered. B9 should give what was seen: three tools, three values in the
third decimal, all 3 hours 4 minutes from the page.

### S2. Item 9 says the plan should limit the one-minute line to the DE440 path. It already does (R6)

`05-disagreements.md` item 9 quotes finish line 2 as "Every sign change
from Sun to Pluto, 1800 to 2200, within 1 minute of JPL Horizons" and
concludes "this line is for the DE440 path only, and the plan should say
so". The plan's line begins with a sentence the item leaves out: "**Sign
changes right to the minute on the precise path.**" The plan says so.

The same applies in part to item 6. The plan's last section, "Not yet
verified", says: "The 1-arcsecond and 1-minute targets are proposals, not
measured results." Items 6 and 9 argue against both targets without
quoting that the plan itself marks them as proposals.

The second half of item 9 stands (a line in minutes is badly posed near a
station), and this review found a case that supports it (N2, the 1823
station).

### S3. The CDS's own rule for one of the three catalogues was not quoted (R4)

The archived VizieR licence page (Wayback copy
`https://web.archive.org/web/20261025102348/https://cds.unistra.fr/vizier-org/licences_vizier.html`)
has, under the general sentence that `LICENSING.md` and Review 3 quote, a
list by origin. One entry reads: "Data coming from A&A: Tabular data,
spectra or images coming from A&A (J/A+A) are free for a scientific usage."
Famaey et al. 2005 is `J/A+A/430/165`, one of the three catalogues the 20
values come from (`LICENSING.md:359-362`). `grep` finds no mention of the
A&A entry in `LICENSING.md`, and Review 3 does not have it. It does not
close the question. It makes it sharper for those values: the page grants
scientific use and no other.

Two smaller points in the same row of Review 3's table:

- It says both archived copies "carry the sentences `LICENSING.md` quotes,
  word for word, including 'The commercial usage of the data ...'". That
  sentence is in the VizieR page's copy (2026-10-25). It is not in the copy
  of `/legals/`
  (`https://web.archive.org/web/20260909122430/https://cds.unistra.fr/legals/`),
  which carries the other quotation ("The Data Sets must be cited ...").
- Neither Wayback address is given in the review. They are above.

### S4. C9's heading says more than C9 found (R4)

The heading is "ESA's terms for Hipparcos are non-commercial", `HANDOFF.md`
says "ESA's Hipparcos terms are non-commercial", the pull request body
says "ESA's terms for Hipparcos data are non-commercial", and item 14 says
"Its terms for Hipparcos data are non-commercial with a request required
for commercial use". The body of C9 is more careful: "whether ESA's terms
reach those values is not settled by what was read."

Both quoted texts were found today as quoted
(`https://www.cosmos.esa.int/web/hipparcos/catalogues` and
`https://www.cosmos.esa.int/web/esdc/terms-and-conditions`). What they
support is: the 1997 Hipparcos and Tycho Catalogues are CC BY-NC 3.0 IGO;
ESA's archive terms ask for a request before commercial use and do not use
the word non-commercial; the values the engine carries are from van
Leeuwen's 2007 reduction through VizieR, for which ESA's page states no
licence. The four short statements should say what the body says: a
question that is not in the record, not a finding that the terms are
non-commercial.

### S5. Two published rules were not set against the server (R5)

Both pages were fetched again here and both rules are on them.

- Anthropic's policy, 5B: "MCP servers must be frugal with their use of
  tokens ... When possible, users should be given options to exclude
  unnecessary text in the response." Observed here: the `tools/list`
  response is 150,468 bytes (the review's figure, confirmed), every tool
  carries an `outputSchema`, and the three event and capability results
  called were 9,089 to 15,277 bytes, each with a full receipt. The plan
  itself lists "short conventions instead of 3 KB per result".
- OpenAI's guidelines: "Do not include diagnostic, telemetry, or internal
  identifiers ... such as session IDs, trace IDs, request IDs, timestamps,
  or logging metadata ... unless they are strictly required to fulfill the
  user's query." Every result seen carries a receipt with a SHA-256
  digest, engine and ephemeris versions and convention identifiers.

Review 4's D8, "Result size", sets the 150,468 bytes of `tools/list`
against Anthropic's limit of about 150,000 characters for a tool
*result*. Those are different things. 5B is the rule the size bears on.

D4 says of the rule on directing the assistant that "whether it reaches
the server's `instructions` is not stated". Section 2 of the policy
applies to what it calls "Instructional Software", which is software that
gives the assistant tools or capabilities through natural language
descriptions, and 2G says "All behavioral
guidance must be human-readable and clearly presented". That reads as
covering instructions. It is a reading, not a ruling.

### S6. Plan statements that are in none of the four lists (R6)

ZOD-98 asks for "every point where the plan cannot be checked". These are
in neither A, B, C nor D of `05-disagreements.md`:

- Phase 4: "one house default everywhere, one name for the zone setting,
  one chart output shape, short conventions instead of 3 KB per result,
  tropical or sidereal stated up front", and "the sky fact checker's
  description". All can be checked against the live `tools/list` and
  results. None was.
- Phase 2: "Accept seconds in birth times."
- Done: "13 house systems" (confirmed here: `README.md:551`, "one of
  thirteen systems"); "16 public entry points" (confirmed here:
  `package.json` has 18 export keys, two of them under `./internal`, and
  `CHANGELOG.md:7` says sixteen); "Conformance levels L4 to L6 ... are
  planned but not written" (confirmed here: `conformance/README.md:14-15`);
  "The changelog says it waits for your approval" (confirmed here:
  `CHANGELOG.md:7-8`).
- ZOD-66: "Hold the 1.1.0 release until this lands", and "the rising sign
  about 12 degrees wrong".
- ZOD-63: "show an uncertainty window for slow-planet sign changes". Site
  pull request 975 puts a note in link titles and says a proper field
  needs a change to published definitions; the list does not say whether
  that meets the issue.
- ZOD-64: "'New Moon' at 17 degrees past new". Review 2, B14, reports 12°
  at one instant and leaves "ZOD-64 says 17°" unresolved. On the build of
  `main` the label changes from "New Moon" to "Waxing Crescent" at about
  22.5° (stepped here every 15 minutes from the review's instant: the
  change falls at 22.59°), so 17° is inside the range and the issue's
  figure is consistent.

The confirmed ones belong in C and the unchecked ones in D.

### S7. Sourcing gaps (R1)

Each of these is a statement with no address a reader can open. All but
the last two were found here.

- "The data centre now calls the series 'EOP 20u24 C04'": found at
  `https://datacenter.iers.org/eop.php`.
- GeoNames asks users to "give credit to GeoNames ... with a link or
  another reference" (Review 4, D7, citing "Review 3"). Review 3 quotes
  only `readme.txt`, which does not have the sentence. It is at
  `https://www.geonames.org/export/`.
- "0.05°" and the other methodology quotations: found. One is wrong by
  omission. Review 1, A8, says the page "says of the far future only that
  'none of them reaches one arcminute'". The page goes on: "the largest is
  24.8 arcseconds, Pluto at 2190, where the two ephemerides differ." The
  point A8 makes (the tenth-day run's 29.108″ is not printed) is right.
- `HANDOFF.md` and Review 1, A5, say `docs/de440.md` and `CHANGELOG.md`
  "say the hosted API uses DE440". `docs/de440.md:7` does ("uses it on its
  server"). `CHANGELOG.md:5-7` says "positions from JPL's DE440, for
  zodiacs.org's hosted compute API", which is a purpose and not a claim of
  use.
- "OpenAlex gives it as closed, no licence": no address. Not checked here.
- "The ReadMe files of I/311 and III/252, read from the CfA mirror": no
  address. Not checked here.

### S8. The Horizons requests did not follow JPL's fair-use policy, and the digests cannot be checked

The policy (`https://ssd-api.jpl.nasa.gov/doc/`, fetched here) says:
"Applications making automated connections must provide a valid,
application-specific User-Agent request header that includes correct
product name, version, and contact information", and "You agree to submit
only one API request at a time". The builder's 176 requests went one at a
time with Python's default header. `sign-changes/README.md` says so
openly. The reason it gives ("this job was not to send the project's
details to outside services") is not in the job's brief; it is a caution
of the session's own, and a reasonable one. The outcome is still 176
requests outside the policy.

The 12 requests of this review (N2) sent an application-specific name and
no contact, for the same reason. They do not meet the policy either.

A rerun under the project's name and contact is the owner's call. Until
then the figures stand on requests JPL's policy does not cover.

Second point. `results/horizons.json` keeps each response's SHA-256 and
not the response. Every Horizons response begins with a line such as
`Ephemeris / API_USER Wed Nov 11 07:39:44 2026 Pasadena, USA`, so the
same request never returns the same bytes, and no digest in the file can
be compared with anything. What can be checked is the two bracketing rows
kept with each record, and they do reproduce (N2). The README should say
that the digests are a record and not a check, or the responses should be
kept.

## Notes

### N1. The helper-pass quotations were fetched again and hold

`HANDOFF.md` names this as R1's weakness. Fetched here on 2026-11-11
between 15:30 and 15:40 UTC, and the quoted words found on the page:

- Licences: the EOP 20 C04 file header (no terms), its readme (none), the
  Centre's page ("Page updated on 2026, February 21", none), the IERS
  imprint (none), USNO Bulletin A ("Distribution Statement A ..."), the
  leap-second list ("This file is in the public domain."), the CDS's two
  pages (404) and its notice ("Last updated November 09, 2026 ... a
  cybersecurity incident"), ESA's two pages and its page for the new
  reduction, the ApJ page ("© 2004. The American Astronomical Society. All
  rights reserved."), the Europe PMC full text of PMC5247521 ("Published by
  the Royal Society under the terms of the Creative Commons Attribution
  License"), Crossref for both DOIs (a text-mining policy only), NAIF's
  rules, JPL's SSD FAQ ("No permissions are needed. The data provided on
  this site are considered public domain."), GeoNames's readme, IANA's
  `LICENSE`, the licence files of astronomy-engine and ERFA, and USNO's
  NOVAS page.
- Directory rules: the sections of Anthropic's policy that Review 4 cites
  (1D, 1E, 2B, 3A, 3C, 3E, 3H, 4C, 5C, 5E and 5F) and its sentence on
  cryptocurrency software (in 4A); the submission guide and
  review criteria; the limit of about 150,000 characters; OpenAI's
  guidelines on annotations, age, location fields and unrelated content,
  and "New tools remain unavailable until approved".

Not fetched again: the MCP Registry's pages, OpenAlex, the CfA mirror and
the Royal Society's own pages.

Review 3's summary of NAIF's rule for a modified kernel (the modifier's
name, and a changed file name) was also checked: both are on the page, in
two paragraphs.

### N2. The sign-change measurement survives a second look

- `tools/engine_ingresses.mjs`, run here on the `dist/` of `bc0b5a7`,
  gives a file identical byte for byte to `results/engine.json`.
  `tools/summarise.py` on `results/horizons.json` gives `summary.md`
  exactly.
- Seven records were asked of Horizons again with the same parameters
  (three days either side, ten minutes, `QUANTITIES='31'`,
  `TIME_TYPE='TT'`): Neptune 1848-10-16 (−9.5055 h), 1916-03-19 (−8.0597),
  2026-01-26 (+3.0617); Pluto 1971-10-05 (+0.4659), 2066-07-11 (+9.6292),
  2185-03-31 (+31.5404), 2185-04-23 (−31.3707). Each agrees with the
  committed record to the last figure shown.
- The README's stated limit is that it starts from the engine's crossings
  and would not see one that only Horizons has. Checked here the other way
  round: one row a day from Horizons for each body, JD 2378498.5 to
  2524592.5 TT (four requests, 146,095 rows a body), counting crossings of
  the twelve boundaries. Horizons has 103 for Neptune and 73 for Pluto,
  the engine's counts. So at one-day resolution there is no sign change on
  Horizons that the engine lacks.
- The same scan looked for near misses: a closest approach under 120″ to a
  boundary with no crossing within 40 days. There is one. On 1823-12-15
  Pluto turns direct 0.375″ inside Aries by Horizons (ten-minute rows over
  16 days, no crossing). The engine's Pluto on the same days comes no
  closer than 13.3″. Neither has a crossing, so nothing is missing, but
  the margin on the sky is 35 times smaller than the engine's error there.
  It is the clearest case for item 9's point and Review 1, A10, should
  carry it.
- "On the years the site's table covers, this check agrees": the site's
  table gives 34,562 s (9.60 h) as its largest ingress correction; this
  check's is 9.63 h (Pluto, 2066-07-11). They differ by under two minutes.
  The table holds two engine instants for some rows, so the builds differ.

These re-checks are this reviewer's. Their scripts and responses are not
committed (this session may commit this file only); they are in the job
folder, `breaker-evidence/`. They have had no third reader.

### N3. Review 1's tables match their sources

A1: every value was compared with `src/calc-bounds.ts`,
`docs/evidence/calc-api/rc16/tables.md:30-39`,
`declination-truth.json` and `conformance/results/summary.json`. A2: every
cell matches the README of `docs/evidence/de440-sweep-20261111/` on pull
request 92's branch, whose tip is still `255b615`. The figures are stated
as that branch's, unmerged and not rerun, and no sentence is approved.
ZOD-65's five maxima are treated as claims. `conformance/RESULTS.md:37`
has 48 passed and 192 failed, and `:74` is Swiss Ephemeris's 240.

### N4. The live results reproduce

At 15:29 UTC: server `zodiacs` 0.6.6, 19 tools, each with `title` and the
four hints; `get_capabilities` names engine 1.1.0-rc.2 and astronomy-engine
2.1.19, lists 13 tools in `tools` and 19 in `coverage.tools`;
`get_upcoming_events` gives `2026-01-26T14:31:41.087Z` and
`26/01/2026, 14:31:41 GMT+0`; `check_sky_fact` gives `.084` and "depends";
`get_natal_chart` refuses a birth date of 2026-11-11 in the words quoted,
and for 1990-05-03 alone returns `timeKnown: false` and
`"basis":"utc-noon"`. No tool description contains "NASA", "JPL",
"precise", "Swiss" or an arcsecond figure (D6 holds). Five tools take
coordinates (D7 holds). `get_occasion_sky` takes a date and a place and
casts no houses, so B12's "no way to ask for a chart of a moment with
houses" holds. The methodology page, the terms page, the privacy page and
the two developer pages read as quoted, and `/how-we-calculate/` is 404.

### N5. No confusion between the two "listings" documents

`LISTINGS.md` at the root of the site repository begins "Listings &
Distribution Playbook ... token profiles, verified lists, aggregator
listings". Review 4 sets it aside in its first paragraph and works from
`docs/platform/zodiacs-ai/claude-directory/LISTING.md` and
`RESUBMISSION-0.6.0.md`. The passages it quotes from those two files, from
`src/ai-tools/tools.ts:404`, `server.ts:127-129`,
`scripts/build-ai-people.mjs` and `docs/platform/programme/STATUS.md:1512`
were opened here and read as quoted. Site pull requests 943, 968, 970,
971, 972, 974 and 975 are all still open drafts.

### N6. R7 holds

- Pull request 94 is open and a draft; its 22 checks pass.
- Commits `9d8bd0c` and `b6c5518` are by `Zodiacs Admin
  <admin@zodiacs.org>`, with no trailer and no model name. The diff from
  `origin/main` is 13 new files, all in this folder.
- The ZOD-65 branch's last commit is `255b615` at 14:48:12 UTC, before the
  builder's second pass had network access (14:53 UTC). Pull request 91's
  head is `ce4ba82`.
- No release after `v0.1.1-rc.15` (2026-10-01). npm's record for
  `@zodiacs/engine` was last modified on 2026-10-11; `latest` is 1.0.0 and
  `next` is 0.1.1-rc.16.
- ZOD-98 has no comment.
- No en dash or em dash in the files of this folder.

### N7. Two things in the reviews that are better than the brief feared

- Review 1 does not repeat ZOD-65's figures as facts. It compares them
  with a committed sweep, says the sweep is on another branch and another
  build, and finds the node figure differs (32.64″ against 32.4″).
- Item 4 of the disagreements (ZOD-65's "`conformance/RESULTS.md` quote
  limits") is right and is confirmed by the issue's own comment of
  07:06 UTC.

## What was not done here

- No portal, mailbox or reviewer thread was opened.
- Pull request 92's sweep was not rerun and no kernel was used.
- The site repository's history was not read (one commit).
- No assistant model was given the tools.
- Job 1's branch and worktree were not read.
- The first-pass sections of Reviews 2 and 3 (B3 to B8, C2 to C8) were
  sampled, not checked line by line: B1, B2, B6, C1 and C2's citations
  were opened and read as quoted.
