# Plan: Astrologer Grok Bot template for zodiacs.org

Step 2 of `BRIEF.md`. Written 2026-10-26. Sources: `TRIAGE.md` (step 1), `/workspace/astro-data-service/PLAN.md`, engine PRs #41, #49, #74 and the open PR list, the engine source on `origin/main` (`4771fa6`), and the live Zodiacs connector's `get_capabilities` (version 0.5.0, engine 1.0.0). Nothing was pushed or changed in another job's folder.

## 1. What the bot does

One thing, done carefully: it reads a person's natal chart and the transits of their next 90 days, with exact dates.

1. **Interview.** One question at a time: name to use, birth date, exact birth time and how the person knows it, birth place, then what they want to look at. It asks again when the time zone database reports a skipped or repeated local time.
2. **Profile.** A stored profile with the resolved UTC instant, coordinates, IANA zone, time source and the chart settings used. See `template/PROFILE.md`.
3. **Natal reading.** Facts first (positions, houses, angles, aspects, each linked to its zodiacs.org page), then interpretation, labelled as such, grounded in the texts in `template/SOURCES.md`.
4. **Coaching.** A 90-day transit calendar with exact dates, and check-ins at a fixed cadence. See `template/COACHING.md`.

Rules the bot keeps:

- Every calculated fact comes from the zodiacs.org MCP server and links to the matching zodiacs.org page. The bot never computes a position itself.
- Facts and interpretation sit under separate labels.
- It says when birth time uncertainty changes the answer (ascendant sign, house placements, Moon sign, exact dates of transits to the angles).
- Launch condition C1 (below) for Uranus, Neptune and Pluto dates.
- No predictions of health, money or outcomes. No scheduling.

## 2. Default house system and zodiac

**Tropical zodiac.** Reasons:

- It is the zodiac of Western astrology, classical (Ptolemy, Valens) and modern, which is the tradition `SOURCES.md` draws on.
- Every engine and MCP tool the bot uses is tropical (`get_capabilities` reports `"zodiac":"tropical"`; PR #49's `natal_chart` is described as tropical). The conformance and cross-check evidence in `TRIAGE.md` covers tropical positions.
- Sidereal would need an ayanamsa choice, and the bot would have to defend it. Out of scope for launch.

**Whole sign houses.** Reasons:

- It is the engine's default (`src/api.ts`: `houseSystem ?? "whole"`; README: "The default"). The bot then matches every zodiacs.org page without passing a setting.
- It is defined at every latitude. Placidus and Koch are undefined inside the polar circles (10 polar conformance cases), so a Placidus default would fail for some births in northern Norway, Finland, Alaska or Canada.
- It tolerates birth time uncertainty better. The houses change only when the ascendant changes sign, about every 2 hours on average, so a time known to 15 minutes usually gives the same houses.
- It is the oldest Western system and the one the Hellenistic texts in `SOURCES.md` use.

The bot states both defaults in its first reading. If a person asks for Placidus, the bot may show it as an alternative, labelled, and keeps whole sign as the reference. Placidus at a polar birthplace is reported as undefined, never silently replaced.

Other fixed settings: true lunar node (the engine's `North Node`), the engine's default aspect policy (major aspects; orbs 8 conjunction and opposition, 7 square and trine, 4 sextile, wider for the Sun and Moon; `src/aspects.ts`), geocentric apparent positions.

## 3. Blockers

| # | Blocker | Where it stands | Blocks launch? |
| --- | --- | --- | --- |
| B1 | No live MCP server with a natal chart with houses and transit-to-natal search. | The live connector (0.5.0) has sky, horoscope and occasion tools but no natal chart with houses and "no eclipse or aspect search". PR #49 (`zodiacs-astro`, draft, CI green) has `natal_chart`, `transits_at`, `transits_now` and bounded crossing search, over stdio and local HTTP only. #49's review fixes sit unpushed on local `infra/mcp` at `49fe406` in `/workspace/codex-infra/wt-mcp`; left untouched. Hosted `zodiacs.org/mcp` is Milestone 5 of the data service plan. | Yes |
| B2 | No civil time tool. | PR #74 (draft, green, stacked on #49) adds `resolve_civil_time` with `gap`, `fold` and local mean time flags. | Yes |
| B3 | No place lookup. The bot needs coordinates and an IANA zone from a place name. | PR #53 `geocode` (draft). Without it the bot must ask for coordinates, which most people cannot give. | Yes |
| B4 | Exact transit dates for 90 days need crossing search per natal point, stations and retrograde spans. | Crossing search is in #49 (bounded, completeness tested, not proven). Stations and exact aspects are in PR #43 `events` (draft). The live connector's 92-day window covers ingress, station, lunation only. | Yes |
| B5 | Launch condition C1. | `TRIAGE.md`: Uranus, Neptune and Pluto exact times can shift up to about 16 hours (days near a station). | Conditional: bot must show those as plus or minus 1 day with the in-orb range |
| B6 | Mars to Pluto have no large-sample cross-check. | #41 measured Sun, Moon, Mercury, Venus only (15,360 charts); Mars to Pluto rest on 24 conformance vectors each. | No, but the "how we check" page must say "not measured" for them |
| B7 | Keys and limits. | Proposed in data service plan section 5 (anonymous hosted 100 calls a day per IP, free key 10,000 a month). Not decided. | Yes |
| B8 | Pages on zodiacs.org for chart, transit window and "how we check". | `/methodology/` exists ("How we calculate"). A chart page and a 90-day transit page that accept the MCP `links.page` are not shipped. Another executor is building a developer demo page in `/workspace/astro-data-service`; not touched. | Yes |
| B9 | Server time zone data. After 1970 the engine reads zones from the host's `Intl`. | The hosted server's Node and tz version must be pinned and reported. | Yes (one line in deployment) |
| B10 | Chiron. | Not in #49's body list. PR #65 `minorbodies` (draft). | No. Launch without Chiron; the bot says it does not cover it |
| B11 | Marketplace listing. | Name, short description and shot list drafted in `template/LISTING.md`. Submission rules of the Grok Bot template marketplace not yet checked. | Yes |
| B12 | Blind rating by three astrologers. | Rubric in `RUBRIC.md`. Needs three recruited astrologers and professional readings of the same synthetic charts. | Yes, for the success criterion |

PR #41 (`infra/crosscheck`, draft, CI green, 22 checks) is the independent Swiss Ephemeris and JPL check. No other open engine branch has Swiss Ephemeris work.

## 4. Launch checklist

Accuracy (launch stays gated on the triage):

- [ ] Triage signed off: 0 real errors in `TRIAGE.md`; owner accepts the TOLERANCE and SCOPE classes.
- [ ] C1 enforced in the bot: no single exact day as fact for Uranus, Neptune or Pluto; plus or minus 1 day and the in-orb range, or a station note.
- [ ] Test set (`testset/charts.inputs.json`) passes against the live MCP server within `testset/tolerance.md`.
- [ ] Transit date checks (exact crossings, stations) pass against an independent arbiter, not only against positions.
- [ ] Three astrologers rate blind with `RUBRIC.md`; results recorded.

Service:

- [ ] Live remote MCP server at `zodiacs.org/mcp` with `natal_chart`, transits, crossing and station search, `resolve_civil_time`, place lookup.
- [ ] Keyless access for trying the bot, or a free key issued in under a minute, with stated limits and a 429 answer the bot explains.
- [ ] Server reports engine, ephemeris and tz versions in each result.
- [ ] No storage of birth data on the server beyond the call; privacy text on the site.

Pages on zodiacs.org (every fact the bot gives links to one):

- [ ] Chart page: one person's natal chart from the same inputs, same defaults (tropical, whole sign).
- [ ] Transit page: the 90-day window with exact dates and in-orb ranges, C1 applied.
- [ ] "How we check" page: conformance results, #41 cross-check, test set results, what is not measured (Mars to Pluto large sample, Chiron).

Grok Bot template marketplace listing (first astrology template):

- [ ] Name, short description and screenshots per `template/LISTING.md`.
- [ ] Screenshots made from synthetic charts only.
- [ ] Listing copy checked: no em or en dashes, no predictions, no financial or speculative language.
- [ ] Marketplace submission rules read and met. Nothing submitted without owner approval.

## 5. Effort estimate

Working days for one engineer with agent help, after owner decisions.

| Work | Days |
| --- | ---: |
| Merge path for #49 and #74 (owner review, push of #49's fixes by its own job) | 2 |
| Place lookup (#53) into the server | 2 |
| Station and exact aspect search (#43) into the server, C1 output fields | 3 |
| Hosted `zodiacs.org/mcp`, keys or keyless limits, tz pinning | 4 |
| Chart, transit and "how we check" pages on the site | 5 |
| Test set run against the live server, transit date checks | 2 |
| Bot template tuning on the test set and 10 synthetic conversations | 2 |
| Blind astrologer rating (recruit, run, record) | 10 calendar days, 2 working |
| Marketplace listing, screenshots, submission | 1 |
| **Total** | **about 23 working days, 4 to 5 weeks elapsed** |

## 6. Decisions for the owner

1. Approve tropical and whole sign as the bot's stated defaults.
2. C1 option: plus or minus 1 day with in-orb ranges now, or wait for the precise ephemeris backend.
3. Keyless access or free key for the marketplace bot.
4. Launch without Chiron.
5. Who recruits the three astrologers, and the fee.
