# Review 2: readiness for AI assistants

Redone on 2026-11-11 in two passes. The first pass had this repository only
(`origin/main` at `bc0b5a7`, and other branches read with `git show` and
`git grep`; branch files are cited as `branch:path`). The second pass called
the live connector at `https://zodiacs.org/mcp` (server `zodiacs` 0.6.6),
read the live methodology and developer pages, the site repository at
`47fee79f`, ZOD-62, ZOD-63, ZOD-64 and ZOD-66, and ran the built engine of
`main`. Its findings are in *Second pass: the live connector*, below; B1 and
B2 are amended where it changed them.

## What an assistant can use today, from this repository

| Piece | Where | State, in its own words |
| --- | --- | --- |
| The npm package | `package.json` (1.1.0-rc.3; npm's `latest` is 1.0.0, `README.md:34-36`) | Sixteen entry points, each with a declaration report in `api/` that CI checks (`ci.yml`, `npm run api:check`). |
| An agent skill | `skills/zodiacs-compute/` | "The skill is repository documentation" (`docs/evidence/agent-skill-20261001/README.md:8`); `bundle.json:10` has `"packagePublication": false`. |
| A bot template | `bots/astrologer/` | "Astrologer bot template (draft)"; "Nothing here is live, and nothing here ships in the npm package" (`bots/astrologer/README.md:1-3`). |
| Two HTTP clients | `clients/typescript/`, `clients/python/` | Private, version 0.0.0, not published (`clients/typescript/README.md:13-14`, `clients/python/README.md:7-8`). |
| A Python wrapper | `python/` | "alpha preview" on engine 0.1.1-rc.14 (`python/README.md:5-7`). |
| A local MCP server | `mcp/` on `infra/mcp-complete` and `infra/mcp-civil-time` | Unmerged, version 0.0.0, stdio and loopback HTTP only (Review 4). |

Nothing on `main` is an MCP server, and `README.md` has no section written
for an assistant.

## Findings

### B1. The skill describes a package that is ten candidates old

`skills/zodiacs-compute/references/tools.md:3-4` says it "was checked against
the site's deployed rc.15-era contracts on 2026-10-01", and `:76-78` that npm
"published engine `0.1.1-rc.16` under `next`; `latest` remained rc.15". The
package is 1.1.0-rc.3 and npm's `latest` is 1.0.0. The skill names no 1.x
version, none of `/time`, `/lite`, `/conventions` or `/de440`, and tells the
agent "Do not promise rc.16 opt-in APIs, a remote MCP endpoint, CLI or npm MCP
installation" (`SKILL.md:103-104`), while a branch of this repository says a
remote endpoint exists (`bot/astrologer-hosted-tools:bots/astrologer/template/LISTING.md:27`).
An agent that follows the skill today refuses things that exist and cites
versions that are superseded. No workflow reads `skills/`, so nothing catches
the drift.

Second pass. The skill sends agents to `https://zodiacs.org/developers/mcp/`
(`references/tools.md:9`) and says "Do not invent a `resolve_birth_time`
tool" (`SKILL.md:52`). That page, read live on 2026-11-11, describes the
local server "zodiacs-mcp-server 0.1.0-rc.26" and lists `resolve_birth_time`
among "The eight tools". The skill forbids a tool its own reference page
documents.

### B2. The rules an assistant most needs are in drafts, and the README has none

The good rules exist. They are in the skill (`SKILL.md:36-56`: "A date is an
interval, not midnight UTC"; "When two instants are possible, ask for
disambiguation or carry both"; "Do not silently substitute noon") and in the
bot template (`bots/astrologer/template/INSTRUCTIONS.md:7`, `:87-89`, `:108`).
The package's own README, which is what an assistant reads when asked to use
`@zodiacs/engine`, gives the mechanics only: `timeKnown: false`
(`README.md:585-587`), `RangeError` on an ambiguous local time
(`README.md:345-346`), the `dst-gap` and `dst-fold` flags
(`README.md:650-654`). It does not say what to tell a person.

ZOD-64 and ZOD-66 are fixing two of the traps in code, on their own branches:
a bare date is refused unless the time is declared unknown
(`admin/zod-64-...`, commit `ac2b453`), and a repeated hour can take the
later pass (`admin/zod-66-...`, commit `3ea3e98`). Both make the skill's
rules enforceable. Neither updates the skill.

### B3. Errors are typed in three places and plain `RangeError` elsewhere

Stable codes exist for receipts (`NatalEnvelopeErrorCode`,
`api/receipt.api.md:93`), for the DE440 entry (`De440ErrorCode`,
`api/de440.api.md:27`) and for calc refusals (`docs/calc.md:510-519`). The
root and malformed calc input throw `RangeError` with a message
(`README.md:345`, `docs/calc.md:38-40`). An assistant that must decide
between "ask the person again" and "report a fault" has to match message
text. There is no JSON Schema for any engine result (the only schema is
`atlas/schema/atlas.schema.json`), and no `llms.txt`.

### B4. The word `bounds` invites a wrong sentence

An assistant given `mars.bounds.position.value` will say "accurate to within
6.6 arcseconds". Review 1 (A1) shows committed evidence of 14.5″ for Mars in
declination. The `label` ("measured") and `basis` strings are correct, and
an assistant will not read them aloud. This is the assistant-facing side of
ZOD-65.

### B5. There is no committed evidence that an assistant uses any of this correctly

- The skill's record is four "forward-use checks" with "no production POSTs",
  which it calls "bounded contract/behavior checks, not a cross-model
  reliability score"
  (`docs/evidence/agent-skill-20261001/README.md:35-47`). No transcript is
  committed.
- The bot's grading (`bots/astrologer/grading/summary.md:1-4`: 4.34 of 5 on
  64 charts) has one model family write the readings and grade them
  (`grading/run.py:18`). The blind rating by astrologers that
  `bots/astrologer/RUBRIC.md` describes is unchecked in `PLAN.md`.
- `infra/evals` is unmerged, and its README says it does "not ... measure a
  real model's performance".
- `feat/agent-data-service-2026-10:docs/agents/GAP-REVIEW.md:104` says the
  same: "there is no committed check that agents use the tools correctly".

### B6. The bot's test expectations come from Swiss Ephemeris

`bots/astrologer/README.md:16`: "The test set's expected values come from
Swiss Ephemeris and are kept outside this repository, as `AGENTS.md`
requires." `AGENTS.md` does not allow that. Its rule is "no vector or test
expectation taken from it"; keeping the values elsewhere does not change
where they were taken from. `bot/astrologer-hosted-tools` reports "2,482 of
2,486 checks pass" on that basis (`.../testset/results/README.md:14`), and
`bot/personal-sky-calendar-scope:bots/astrologer/PERSONAL-SKY-CALENDAR.md:64`
turns it into a sentence for readers: "All 13 tools matched Swiss Ephemeris
(worst planet error 0.0055 degrees) ... can say 'checked against an
independent ephemeris' honestly." 0.0055° is 19.8″. That is a draft on an
unmerged branch, and it is the kind of sentence the house rules and ZOD-98
both rule out.

### B7. House-rule breaches in the agent-facing files

- Model names in committed files: `bots/astrologer/grading/run.py:18` and
  `grading/summary.md` name the writer and grader model. `AGENTS.md`: "Never
  put a model name ... in a commit, a pull request, or a file."
- `bots/astrologer/grading/summary.md:19` records en dashes in the writer's
  output.
- `skills/` and `bots/` have no licence file and `LICENSING.md` names
  neither (Review 3).

### B8. Three engine versions sit under three agent surfaces

The local MCP server pins `artifacts/zodiacs-engine-1.0.0.tgz`
(`infra/mcp-complete:mcp/package.json`), the Python wrapper 0.1.1-rc.14, the
offline CLI 1.0.0-rc.2 (`tools/cli/README.md:3`), and the bot's test run
1.1.0-rc.1 (`bot/astrologer-hosted-tools:.../testset/results/README.md:7`).
`bots/astrologer/PLAN.md:3` records the live connector at "version 0.5.0,
engine 1.0.0" on 2026-10-26. An assistant's answer therefore depends on
which door it came through, and only the receipt says which engine
answered.

## Second pass: the live connector

Every call below was made on 2026-11-11 between 14:53 and 15:02 UTC through
the connector, with synthetic input. Each result named
`@zodiacs/engine` 1.1.0-rc.2 and astronomy-engine 2.1.19.

### B9. Two answers for one event (ZOD-63): confirmed, and there is a third

| Source | Neptune enters Aries, 26 January 2026 |
| --- | --- |
| `get_upcoming_events` (bodies Neptune, kind ingress, 2026-01-20 to 2026-02-01) | `"at":"2026-01-26T14:31:41.087Z"` |
| `check_sky_fact` (kind ingress, Neptune, aries, date 2026-01-26) | `"ingresses":[{"at":"2026-01-26T14:31:41.084Z"...}]`, answer "depends" |
| `https://zodiacs.org/methodology/`, *How we check event times* | "By NASA, Neptune entered Aries at 17:35 UTC on January 26, 2026, about three hours later than the engine alone puts it." |
| The engine of `main` (1.1.0-rc.3), this job's run (`sign-changes/results/engine.json`) | `2026-01-26T14:31:41.082Z` |
| JPL Horizons, this job's query (Review 1, A10) | 17:35 UTC |

The two connector tools differ from each other in the third decimal of a
second (.087 and .084), and both differ from the page by 3 hours 4 minutes.
Each tool result links to the methodology page as "How we calculate", so an
assistant that follows the link finds the page contradicting the tool that
sent it there. Site pull request 975 (open, draft) says two more tools,
`search_sky_events` and `get_horoscope_period`, said 14:30:44; those were
not called here. The site's own table has both engine values for the row
(`src/data/nasa-event-instants.json` in the site repository: `"engine":
["2026-01-26T14:30:44.561Z", "2026-01-26T14:31:41.082Z"]`).

`check_sky_fact`'s answer is "depends" on the time zone, which is right for
either time on that date. Its description says it "answers yes, no, or that
it depends". For a question such as "did Neptune enter Aries before 15:00
UTC" the two sources give opposite answers.

### B10. Milliseconds and a day-first date (ZOD-64): confirmed live

`get_upcoming_events` returned `"at":"2026-01-26T14:31:41.087Z"` and
`"localAt":"26/01/2026, 14:31:41 GMT+0"`. `get_sky` with zone Asia/Bangkok
returned `"display":"11/11/2026, 22:01:43 GMT+7"`. The time is given to the
millisecond for an event the same site says is three hours later, and the
local form is day first. Site pull request 974 (open, draft) rounds event
times to the minute and gives ISO local times. It is not live.

### B11. The bare date (ZOD-64): silent in the engine, not in the connector

- Engine, `main` build (1.1.0-rc.3): `natalChart({ utc: "1990-05-03" })`
  returns a chart whose `flags` is `[]`. Nothing marks that a time was
  assumed. Pull request 88 (`ac2b453`, open, draft) refuses it.
- Connector: `get_natal_chart` with `birthDate` 1990-05-03 and nothing else
  returned `"timeKnown":false`, `"castFor":{"utc":"1990-05-03T12:00:00.000Z","basis":"utc-noon"}`,
  no rising sign, `"moon":{"sign":null,"possibleSigns":["leo","virgo"]}`, and
  an `unknown` list that says the chart "is cast for midday" and "for noon
  UTC". That is the behaviour the skill asks for, and the opposite default
  from the engine's (noon, declared, against midnight, undeclared).

So the defect ZOD-64 names is in the package, and an assistant using the
npm package directly still meets it on every published version.

### B12. Under 13 and "the chart for right now" (ZOD-62): confirmed live

`get_natal_chart` with `birthDate` 2026-11-11 was refused: "Zodiacs is not
directed at children under 13, so it makes no card, chart or reading from a
birth date less than 13 years ago, or a birthday card for a day in those
years." The site's code applies the refusal to every tool before it runs
(`src/ai-tools/server.ts:127-129` in the site repository), on any
`birthDate`. `get_sky` does answer for the present instant, with positions
and the Moon's phase and no houses or angles. So ZOD-62's description holds:
there is no way to ask the connector for a chart of a moment with houses,
because the only tool that casts houses reads its date as a birth.

The refusal is correct for a birth. It also tells the assistant "Do not
send a child's name, birth date or place to any Zodiacs tool", which an
assistant asking for an event chart did not do.

### B13. The capabilities answer undercounts its own tools

`get_capabilities` returns a `tools` array of 13 names and, in
`coverage.tools`, a string of 19. The site's code says why
(`src/ai-tools/tools.ts:404`): "The capabilities' tool list keeps the
thirteen names its published schema allows". An assistant that reads the
structured field, as the skill tells it to (`SKILL.md:13-14`), does not
learn that `get_natal_chart` exists. The master plan lists this (Phase 4).

### B14. The Moon's phase label (ZOD-64)

Engine, `main` build: `moonPhase(new Date("2026-11-10T08:35:46Z"))` returns
`"angle":12.04...,"name":"New Moon","waxing":true`. The label "New Moon" is
given 12° past new. ZOD-64 says 17°. The engine already returns `waxing`;
the connector's `get_sky` returned only `"moonPhase":{"name":"Waxing
Crescent","angle":26.127...}` with no times of the last or next new Moon.

### B15. What the live developer pages tell an assistant

- `https://zodiacs.org/developers/ai/`, the documentation address in the
  directory listing (Review 4), returned 200 and names none of the 19 tools.
- `https://zodiacs.org/developers/mcp/` describes the local eight-tool
  server (B1).
- `https://zodiacs.org/how-we-calculate/` does not exist; the connector
  titles its link to `/methodology/` "How we calculate".

## What is ready

- The declaration reports in `api/`, checked in CI, are a reliable contract
  for a coding assistant.
- Receipts carry the engine version, the ephemeris and convention ids, and
  `README.md:1066-1071` says plainly that an envelope is "a structurally
  checked claim, not an attestation".
- The skill's rules on time, privacy boundary and claims are the right
  rules. They need the right versions under them.

## Not checked

- `search_sky_events` and `get_horoscope_period` were not called; their
  14:30:44 is taken from site pull request 975.
- Whether the skill or the Python wrapper is published anywhere.
- Any behaviour of any assistant model given these tools. The calls above
  show what the tools return, not what an assistant then says.
