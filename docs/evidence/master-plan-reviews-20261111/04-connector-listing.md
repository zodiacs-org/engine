# Review 4: connector listing

This is about listing the Zodiacs connector (its remote MCP server) in an AI
assistant's connector directory. It is not about `LISTINGS.md` at the root of
the site repository, which is a different document: its first lines read
"Listings & Distribution Playbook ... token profiles, verified lists,
aggregator listings, and search indexing". That file plays no part here.

Redone on 2026-11-11 in two passes. The first pass had the engine repository
and the connector's tool definitions as a session showed them. The second
pass, which this text now reflects, opened:

- the live server: `POST https://zodiacs.org/mcp`, `initialize` and
  `tools/list`, at 14:53 UTC on 2026-11-11 (server `zodiacs`, version 0.6.6,
  19 tools), and five tool calls with synthetic input;
- the site repository at `47fee79f`: the server's source under
  `src/ai-tools/`, the listing records under
  `docs/platform/zodiacs-ai/` and `docs/platform/zodiacs-ai/claude-directory/`,
  `integrations/chatgpt/`, and the site's open pull requests 968, 970, 971,
  972, 974 and 975 (read with `gh`, not changed);
- the directories' published rules, fetched the same day (addresses in
  *The rules read*, below);
- the live pages `https://zodiacs.org/privacy/` ("Last updated: 7 November
  2026"), `/terms/`, `/developers/ai/` and `/developers/mcp/`.

This is a dry read of facts against rules. Nothing was submitted, saved in
a portal, sent to a reviewer or changed. ZOD-58 is the later dry run before
a resubmission; this review does not stand in for it.

## Where the listing stands (second pass; replaces the first pass's D1)

The first pass found one sentence about a submission, in an unmerged draft
of the engine repository, and said the record was missing. The record is in
the site repository.

**Claude directory** (`docs/platform/zodiacs-ai/claude-directory/LISTING.md`
in the site repository):

- Submitted 7 October 2026 as server 0.4.0 with six tools (`:214-216`,
  `:241-243`). The portal shows "In review".
- Synced to thirteen tools on 16 October; notes sent to the reviewers on
  15 October and a correction the same day on ticket #145701231
  (`:161-195`).
- "the copy of the tools reviewers see moved to 7 November: 19 tools"
  (`:7-9`), and on 8 November "19 tools, the copy dated 8 November, with a
  portal note that some items were left out to fit its size limits. The
  listing is still in review." (`:19-21`).
- No reply, approval or rejection from the reviewers is recorded.

**OpenAI directory** (`docs/platform/zodiacs-ai/RESUBMISSION-0.6.0.md`,
`PORTAL_REVIEW.md`):

- Version "1.0.0" in the portal's numbering was rejected. On appeal (case
  18573273) the reviewers said the rejection "concerned `get_occasion_sky`.
  Its `baby` occasion ... could collect identifying or locating information
  about a child under 13" (`RESUBMISSION-0.6.0.md:35-40`).
- 0.6.5 removed that occasion. "Dias submitted 0.6.6 on 7 November and it is
  in review" (`:11`). The under-13 refusal of 8 November changed no tool
  definition, "so nothing is uploaded or resubmitted" (`:18`).

**MCP Registry:** not published. It "needs the owner's approval to publish
and a verified `org.zodiacs` namespace"
(`docs/platform/evidence/hosted-mcp-review-20261018/README.md:5-6`).

So the first pass's worry, that reviewers might be looking at 13 tools while
users get 19, does not hold for the tool list: both portals have the 19.
What the reviewers have been *told* is another matter (D1).

## The rules read

Fetched on 2026-11-11, all with status 200:

- Anthropic Software Directory Policy,
  `https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy`
  ("Updated over 2 weeks ago"; the older MCP Directory Policy and the
  Connectors Directory FAQ now redirect to it or to the developer pages).
- Anthropic's submission guide and review criteria,
  `https://claude.com/docs/connectors/building/submission.md` and
  `.../review-criteria.md`, with `.../index.md` for limits.
- OpenAI's "Plugin guidelines",
  `https://developers.openai.com/plugins/plugin-guidelines`, to which the
  former Apps SDK submission guidelines now redirect, and
  `https://developers.openai.com/plugins/deploy/submission`.
- The MCP Registry's pages under `https://modelcontextprotocol.io/registry/`
  and its `server.json` schema of 2025-12-11.

Not read: OpenAI's usage policies and Anthropic's child-safety guidance for
developers.

## The dry read

### Passes, on what was observed

| Rule (quoted) | Source | Observed |
| --- | --- | --- |
| "MCP servers must provide all applicable annotations for their tools, in particular readOnlyHint, destructiveHint, and title." | Anthropic policy 5E | All 19 tools in the live `tools/list` carry `title` and `annotations` with `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`, an `idempotentHint`, and `annotations.title`. Set in the site's `src/ai-tools/contracts.ts:156` and `server.ts:123`. |
| "Set readOnlyHint, destructiveHint, and openWorldHint to explicit boolean values" | OpenAI guidelines | Same. |
| "MCP tool names must not exceed 64 characters." | Anthropic policy 5C | Longest name is 21 characters. |
| "Remote MCP servers should support the Streamable HTTP transport." | Anthropic policy 5F | `POST /mcp` answered `initialize` with `content-type: text/event-stream`, protocol `2025-06-18`. |
| "OAuth 2.0 if your tools act on a user's account, or no authentication for public data" | Anthropic submission guide | No sign-in. The listing records "No authentication" (`LISTING.md:323`). |
| "must provide a clear, accessible privacy policy link explaining data collection, usage, and retention." | Anthropic policy 3A | `https://zodiacs.org/privacy/` covers the connector under "AI integration candidates" and gives the host's log retention (30 days). |
| "Plugins must be suitable for general audiences, including users aged 13 [to] 17. Plugins may not explicitly target children under 13." | OpenAI guidelines | The server refuses a birth date less than 13 years ago (called live: refused) and its instructions bar romance framing under 18. |

This corrects the first pass's D2, which could not see annotations and
guessed they might be missing. They are present.

### D1. What the reviewers were told no longer matches the server

- The description saved in the Claude portal: "the last recorded listing
  description is the 0.5.1 wording of 28 October" (site pull request 968).
  The record itself says "The directory text already submitted still says
  Zodiacs makes no personal predictions ... That portal copy has not been
  resubmitted" (`LISTING.md:48-51`). The server now gives forecasts, scores
  and ratings (D5).
- The note of 15 October told the reviewers "Zodiacs never chooses or ranks
  dates, scores relationships or predicts outcomes" (`LISTING.md:194-195`),
  withdrawn the same day. A second sentence from that day, that share links
  carry first names, has not been withdrawn: "Nothing sent so far withdraws
  the 15 October sentence" (pull request 968). The server's instructions
  now say "Links never carry ... the names you give".
- No email to the reviewers names 0.6.6 or the under-13 refusal (pull
  request 968).

Rule: "Developers must notify Anthropic of material changes to their
Software's functionality, tool or capability descriptions, data practices,
or connected endpoints" (Anthropic policy 3H), and "descriptions must
precisely match actual functionality" (2B). Pull request 968 holds a draft
note, marked "Draft, not sent". It is an owner decision whether to send it.

### D2. The documentation address in the listing names no tools

The listing's documentation URL is `https://zodiacs.org/developers/ai/`
(`LISTING.md:263-273`). Read live, that page returned 200 and contains none
of the 19 tool names; pull request 968 notes the site's data file "still
says the server has six tools". `https://zodiacs.org/developers/mcp/`
documents a different product, the local server "zodiacs-mcp-server
0.1.0-rc.26" with "The eight tools", and gives a GitHub issues link as its
only contact.

Rule: "Developers must document how their Software works, its intended
purpose, and how users can troubleshoot issues." (Anthropic policy 3C), and
"at least three working examples of prompts" (3E). Site pull request 972
(open, draft) rewrites `/developers/ai/` with the 19 tools, limits, six
example prompts, troubleshooting and a support address. Until it is live,
this is a fail on the plain reading.

### D3. "Never stores or logs birth details": what the evidence covers

The server's instructions, `get_capabilities` and the privacy page all say
"Zodiacs never stores or logs birth details." The site repository holds:

- Tests that the adapter writes no argument logs and keeps responses
  uncacheable (`src/ai-tools/http.test.ts`, `tools.test.ts:84`,
  `under-13.test.ts:125`, `lifetime.test.ts:17`).
- A provider log review dated 2026-10-02, on staging, of 32 request rows:
  no body canary seen, with the stated limit "this does not prove absence
  in every host/provider layer"
  (`docs/platform/zodiacs-ai/evidence/provider-log-review.json`). It
  predates every tool that takes a birth date (0.5.0, 15 October).
- The process-cache finding the first pass cited (F-59) is closed:
  "deployed in fd1ce88a; scoped post-release verification complete", with
  the limit "not runtime heap inspection"
  (`docs/platform/programme/FINDINGS.md:414-419`). That corrects the first
  pass, which had only the engine repository's stale note.
- Still open in the site's own words: "Host, CDN and provider metadata
  retention still need owner review" (`integrations/chatgpt/README.md:67-68`).

The privacy page is careful where the short sentence is not: the host
"keeps routine request logs ... for 30 days", and tool arguments "pass
through the assistant provider". The connector uses POST bodies, so birth
details are not in the logged address. What is missing is a log review on
production made after the birth-date tools shipped. Rule: "Software must not
collect extraneous conversation data, even for logging purposes" (Anthropic
policy 1E). On the stated behaviour this passes; the evidence for the
deployed server is one staging review that predates the tools concerned.

### D4. Descriptions that direct the assistant

Rule, Anthropic review criteria: "Describe what the tool does, and don't
tell Claude how to behave." Rejected if they "Instruct Claude to call
external software or tools the user didn't request" or "promote products
and services". OpenAI: "Do not insert unrelated content, attempt to redirect
the interaction".

In the live `tools/list` and instructions today:

- `get_horoscope`: "If you can schedule tasks for the person, offer once,
  briefly, to send them their horoscope every morning".
- Instructions: "Share the scores, ratings and astrological forecasts
  plainly and confidently".
- `get_compatibility`: "lead with the score and verdict in plain words".

On the plain wording the first is the clearest fail, the other two are
tone-setting that the first rule also covers. The review-criteria sentence
names tool descriptions and does not mention the server's `instructions`.
The policy's section 2 is wider: it applies to software that gives the
assistant tools or capabilities through natural-language descriptions, and
2G says "All behavioral guidance must be human-readable and clearly
presented". That reads as covering `instructions` too. It is a reading, not
a ruling (`BREAKER.md`, S5).
Site pull request 971 (open, draft) rewrites 15 of the 19 descriptions,
removes the schedule offer, and reports version 0.6.7 on its branch. It
leaves sign-up and invite links in results. It is not live: the server
answered 0.6.6 with the old wording.

The instructions that protect people (never guess a birth time, ask before
using someone else's details, no betting, investment, election or health
readings, no romance framing under 18) relate to the tools' function and
are not what the rule is aimed at.

### D5. The product now forecasts and scores; the listing copy says it does not

The owner changed the rule on 4 November 2026: "Horoscopes and transit
readings are forecasts: share them plainly and confidently"
(`LISTING.md`, *Product rule and 0.6.1 prepared*). The live tools return "a
compatibility score out of 100", rate a date "from 0 to 100", and give "a
personal forecast". The site's terms page, read live, says "nothing on the
site should be treated as a prediction of future events". The engine
repository's rule is "No predictions in documentation or examples: the
engine computes facts."

These are three different statements about the same product. The engine's
rule governs the engine. For a listing, the description must match what the
server does (D1), and the terms page and the instructions should not pull
in opposite directions on the word "prediction".

### D6. Accuracy wording

None of the 19 descriptions or the instructions contains an arcsecond
figure, "NASA", "JPL", "precise" or "Swiss". `get_capabilities` returns
`"assessment":"finite-reference-cases-only"` and
`"broadDateRange":"not-certified"`. That is the right state for a listing.

Two things sit beside it:

- The connector links every result to `https://zodiacs.org/methodology/`,
  which states accuracy against Swiss Ephemeris and gives a Neptune time
  that contradicts the connector's (Review 2, B9; Review 1, A8).
- The first pass could not tell which ephemeris the connector uses. It is
  astronomy-engine 2.1.19 under engine 1.1.0-rc.2, by its own answer. DE440
  is not in use (Review 1, A5).

### D7. Other people's data and other people's terms

- **Famous charts.** The first pass asked whether living people are
  included. They are not: the connector's index holds 104 people, all
  deceased, and the build refuses a living record
  (`scripts/build-ai-people.mjs:7-10`, `:33`, in the site repository).
  Charts are "cast for local noon because their birth times are not on
  record". The privacy page gives `people@zodiacs.org` for corrections.
- **GeoNames.** `find_birthplace` returns `source: { name: 'GeoNames
  cities15000', licence: 'CC BY 4.0', ... }`
  (`src/ai-tools/features/birthplace.ts:174-178`). It names the source and
  the licence and gives no link to either. GeoNames's export page
  (`https://www.geonames.org/export/`, read 2026-11-11) asks users to "give
  credit to GeoNames when using data or web services with a link or another
  reference to GeoNames", so a name without a link meets "another
  reference". (Review 3 quotes GeoNames's `readme.txt`, which has the
  licence and not this sentence.)
- **Coordinates.** OpenAI's guidelines say "Avoid requesting raw location
  fields (for example, city or coordinates) in your input schema." Five
  tools take latitude and longitude. They are a birthplace's, not the
  user's position, and `find_birthplace` exists to supply them. Expect a
  finding or a question; OpenAI's automated scan has already flagged
  `get_occasion_sky` and `get_compatibility` for "further review"
  (`PORTAL_REVIEW.md:22-24`).
- **A second person's birth details.** `get_compatibility` takes them. The
  instructions say "Ask before using someone else's birth details". Rule:
  "Software must prioritize protecting user privacy and the privacy
  interests of third parties" (Anthropic policy 1D). The server cannot
  check that the assistant asked.

### D8. Things a reviewer may raise that the records do not answer

- **The capabilities answer.** `get_capabilities` lists 13 names in `tools`
  and 19 in prose, because of "the thirteen names its published schema
  allows" (`src/ai-tools/tools.ts:404`). Rule: descriptions and results
  "must precisely match actual functionality".
- **Tokens.** Anthropic's policy: "We do not generally allow cryptocurrency
  software in our directory." The connector has no such function. The
  site's footer says "Zodiacs.org also operates Astrofolio, the Zodiac token
  collection", and the terms page has a section on digital-asset risks.
  Every tool result links to that site.
- **Links that count visits.** Results link to zodiacs.org with
  `?ref=assistant` or `?ref=chatgpt`. The privacy page discloses it. Rule:
  not "primarily ... an advertising or promotional vehicle" (Anthropic
  4C). Results also carry sign-up and invite links (pull request 971).
- **Support.** The Claude listing gives `admin@zodiacs.org`; the OpenAI
  package gives `https://zodiacs.org/about/` as `supportURL`, and
  `integrations/chatgpt/README.md:85` gives a third address. OpenAI asks
  for an "HTTPS customer support page".
- **Two hosted endpoints.** A draft in the engine repository names
  `https://zodiacs.org/mcp/engine` beside `/mcp`
  (`bot/astrologer-hosted-tools:bots/astrologer/template/LISTING.md:27`),
  with other tool names. It was not probed here.
- **Size, and two published rules not set against the server before**
  (fix round, `BREAKER.md` S5). The earlier wording set the 150,468 bytes
  of the live `tools/list` response against Anthropic's limit of about
  150,000 characters for a tool *result*. Those are different things; no
  tool result seen came near that limit. The rules the size bears on are
  these.
  - Anthropic's policy, 5B: "MCP servers must be frugal with their use of
    tokens ... When possible, users should be given options to exclude
    unnecessary text in the response." Observed: `tools/list` is 150,468
    bytes, every tool carries an `outputSchema`, the portal noted "some
    items were left out to fit its size limits", and each result this
    review received carried a full receipt (conventions, coverage and about
    25 convention identifiers) beside its answer. The second reader
    measured three results at 9,089 to 15,277 bytes. The server gives no
    option to leave the receipt out. The plan lists "short conventions
    instead of 3 KB per result".
  - OpenAI's guidelines: "Do not include diagnostic, telemetry, or internal
    identifiers ... such as session IDs, trace IDs, request IDs,
    timestamps, or logging metadata ... unless they are strictly required
    to fulfill the user's query." Observed: every result carries a receipt
    with a SHA-256 digest, engine and ephemeris versions and convention
    identifiers. Whether a receipt is "strictly required" is the
    reviewer's call. It is the product's provenance, and the server's own
    instructions say to mention such details "only if the person asks".

### What ZOD-62 means for the listing

The under-13 refusal answers OpenAI's rejection. It also blocks a chart for
any recent moment (Review 2, B12). The master plan's answer is a separate
"chart for a moment" call. That would be a new tool definition, and both
portals treat new tools as needing review (OpenAI: "New tools remain
unavailable until approved", `SUBMISSION.md:152-159`). It should be planned
with the resubmission, not after it.

## Summary for the later dry run (ZOD-58)

| | Item | State today |
| --- | --- | --- |
| Pass | Annotations, titles, name length, transport, no auth, privacy page, under-13 refusal | Observed live |
| Fail on plain reading | Documentation page names no tools (D2) | Fix drafted: site PR 972 |
| Fail on plain reading | Descriptions direct the assistant (D4) | Fix drafted: site PR 971 |
| Mismatch | Portal description and notes against the live server (D1) | Draft note in site PR 968, not sent |
| Thin evidence | Storage claim on production (D3) | One staging log review, 2026-10-02 |
| Open | Coordinates in schemas, capabilities count, token footer, support address (D7, D8) | No record of a decision |
| Open | Token frugality and receipts in every result (D8, Anthropic 5B; OpenAI's rule on identifiers) | No record of a decision |

## Not checked

- No portal was opened. Everything about the portals is from the site
  repository's records.
- The reviewers' own messages, other than what those records quote.
- Tool results other than the five calls made, and the size of the largest.
- The interactive panels (`_meta.ui`), their themes and screenshots.
- `https://zodiacs.org/mcp/engine`.
- Whether production serves the site's `main`.
