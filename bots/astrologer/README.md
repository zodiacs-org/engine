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

The test set's expected values come from Swiss Ephemeris and are kept outside this repository, as `AGENTS.md` requires. All birth data here is synthetic.
