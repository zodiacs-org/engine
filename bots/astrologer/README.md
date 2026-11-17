# Astrologer bot template (draft)

Planning and template files for an Astrologer bot on the Grok Bot template marketplace: a person's natal chart and their next 90 days of transits, with exact dates, every calculated fact from the zodiacs.org MCP server. Nothing here is live, and nothing here ships in the npm package (`files` in `package.json` does not include `bots/`).

**Status, 8 November 2026.** The bot that goes to the marketplace first is built on the live `zodiacs.org/mcp` tools instead: zodiacs-org/site#919, `integrations/grok-bot/`. The engine tools this plan relies on (place lookup, `resolve_civil_time`, `reading_facts`, `natal_chart`, `transits_at`, `event_search`) are not hosted anywhere, so a bot built from these files cannot calculate anything yet. Since this plan was written, the live server has gained a place lookup, a natal chart with whole sign houses and dated personal transits, which cover its blockers B3 and B7, most of B2 and B4, and the links in B8 (`PLAN.md`). This plan stays the path for what the live tools do not have: Placidus houses, Chiron, station and eclipse search, the facts sheet with its checks, and the blind rating. The live template keeps no profile and no check-in routine, because it stores no birth details.

| File | What it is |
| --- | --- |
| `TRIAGE.md`, `triage.csv` | The 192 failing and 41 unsupported conformance cases (suite 0.2.0, PR #76), sorted into real error, tolerance and scope, and which block launch |
| `PLAN.md` | Plan, default house system and zodiac, blockers, launch checklist, effort estimate |
| `testset/charts.inputs.json` | Inputs of 64 synthetic test charts: midnight, clock change gaps and repeats, high latitude, before 1970, unknown time |
| `testset/tolerance.md` | What is compared, against what, within what tolerance |
| `RUBRIC.md` | Blind rating rubric for three astrologers |
| `template/` | The bot: system instructions, interview, profile schema, 90-day coaching cadence, interpretation sources, marketplace listing |
| `facts/` | The reading facts builder: every number a reading states (age at the window start, placements, sect and sect team, essential dignities, aspects ranked by orb, points near a sign edge, transits, stations and their natal contacts), computed by the engine's own code, each line with an ID; and the reading checker that flags any aspect or contact a reading names differently from the sheet; see `facts/README.md` |
| `grading/` | Model grading harness and results; sheets come from `facts/`, and each reading is checked (and revised at most twice) before grading |

The test set's expected values come from Swiss Ephemeris and are kept outside this repository, as `AGENTS.md` requires. All birth data here is synthetic.
