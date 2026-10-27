# Astrologer bot template (draft)

Planning and template files for an Astrologer bot on the Grok Bot template marketplace: a person's natal chart and their next 90 days of transits, with exact dates, every calculated fact from the zodiacs.org MCP server. Nothing here is live, and nothing here ships in the npm package (`files` in `package.json` does not include `bots/`).

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
