# Agent data service: what exists and what is missing

Review of 2026-10-24, made on `origin/main` at `4771fa6` (engine 1.0.0),
with the open branches named below read but not changed. It lists what an
AI agent can use from this repository today, what it cannot, and which gaps
this change closes.

## What agents can use today

### The engine package, `@zodiacs/engine` 1.0.0

An agent that can run JavaScript can import the published package. Every
entry point takes resolved instants and makes no network requests.

| Entry | What it calculates | Guide |
| --- | --- | --- |
| root | Tropical natal charts, aspects, inter-chart aspects and pair summaries, house systems, points and lots, secondary progressions, Saturn returns, longitude crossings, Delta T, receipts | `README.md` |
| `/calc` | One calculation API with bounds and receipts, sidereal frames | `docs/calc.md` |
| `/window` | Birth-time windows: what stays fixed across an uncertain birth time | `README.md`, *Birth-time windows* |
| `/techniques` | Solar and lunar returns, relationship charts, void-of-course Moon, aspect patterns, dignities, Moon signs for an unknown birth time | `docs/techniques.md` |
| `/houses` | House positions and cusp speeds | `docs/houses.md` |
| `/sky` | Rise, set and transit times, planetary hours | `docs/sky.md` |
| `/timing` | Profections, firdaria, zodiacal releasing, solar arc, planetary returns | `docs/timing-hellenistic.md` |
| `/vedic` | Sidereal zodiac and Jyotish techniques | `docs/vedic.md` |
| `/geo` | Civil time to an instant, with historical zones and ambiguity flags | `docs/time.md` |

`api/*.api.md` lists every exported declaration per entry, which an agent
can read to find a function without loading the source.

### Hosted Compute API

`https://zodiacs.org/api/v1/` serves `chart`, `positions`, `houses`,
`events`, `time`, `sky-fact` and `elections` as JSON POST operations.
`clients/typescript/` and `clients/python/` are private client preparations
generated from its OpenAPI document. Calculation happens on the site, so
personal birth data leaves the agent's machine.

### MCP servers

- **Engine MCP server, not merged.** Branch `infra/mcp` (pull request #49)
  adds `mcp/`, server `zodiacs-astro`, with eight tools: `natal_chart`,
  `transits_at`, `transits_now`, `synastry`, `solar_return`, `lunar_return`,
  `moon_phase` and `event_search`, over stdio and HTTP, each result carrying
  engine receipts. On `main` there is no MCP server.
- **Site stdio adapter.** `skills/zodiacs-compute/references/tools.md`
  (checked 2026-10-01) describes the site repository's local adapter with
  `get_capabilities`, `calculate_natal_chart` and
  `compare_calculation_records`. Its source is in the site repository.
- **Hosted Zodiacs connector.** A client connected to zodiacs.org on
  2026-10-24 listed `get_capabilities`, `get_sky`, `get_sky_calendar`,
  `get_upcoming_events`, `check_sky_fact`, `get_horoscope`,
  `get_compatibility`, `get_birthday`, `get_occasion_sky`,
  `get_life_milestones`, `get_famous_chart`, `find_chart_twins` and
  `open_chart_studio`. Its source is not in this repository, and this
  review did not call it.

### Other agent-facing pieces

- `skills/zodiacs-compute/`: an agent skill on choosing tools, keeping
  birth-time uncertainty, and citing receipts.
- `tools/cli/`: a private offline CLI (`chart`, `positions`, `events`,
  `verify`, `conformance`) that reads requests from files.
- `tools/wheel/`: a private SVG and DOM chart wheel.
- `tools/solar-terms/`: a private scanner for the 24 solar terms over a
  supplied engine; its own README marks accuracy unvalidated.
- `conformance/` and `atlas/`: independent test vectors and a historical
  time atlas, which an agent can cite when asked how accurate a result is.

## Gaps

Ordered by value to an agent answering everyday questions.

1. **No Chinese zodiac data anywhere.** Nothing on `main` gives the animal,
   element or yin and yang of a birth date, or the traditional groupings.
   An earlier `@zodiacs/engine/chinese` entry was held back from rc.16
   because its apparent Sun was a series fitted to JPL DE430
   (`docs/evidence/sky-chinese-2026-09-29/README.md`). Agents asked for a
   Chinese zodiac sign have to rely on remembered tables, which may use
   either year boundary (Li Chun or the Lunar New Year) without saying
   which, and cannot say when a birth near the boundary is undecided. **Closed by this change** (below).
2. **No MCP server on `main`, and the one in review covers part of the
   engine.** The `mcp/` tools take resolved instants only and expose the
   root and some techniques. Nothing exposes `/geo` (civil time to an
   instant), `/sky`, `/vedic`, `/timing`, `/window` or `/houses`. The most
   useful next tool is a civil-time resolver over `/geo` that returns the
   gap, fold and local-mean-time flags, because every birth question
   starts with a local date and place.
3. **No agent documentation index.** Tool descriptions, schemas and example
   calls were spread across `mcp/README.md` (unmerged), the skill and the
   site. **Partly closed**: `docs/agents/` now holds this review and the
   Chinese zodiac guide; the engine MCP tools should get the same kind of
   guide when `mcp/` merges.
4. **The skill's tool reference is dated.** It was checked against rc.15
   on 2026-10-01 and does not mention 1.0.0, the `mcp/` tools or the
   hosted connector's current tool list. A docs-only update, separate from
   this change.
5. **The rest of the Chinese calendar.** The Lunar New Year boundary, the
   month, day and hour pillars, the six harms and the punishments are not
   implemented. The solar-term scanner exists but is unvalidated and needs
   a supplied engine. The C1 to C4 gates preregistered in
   `docs/evidence/sky-chinese-2026-09-29/PREREGISTRATION.md` describe how
   pillars could be checked.
6. **No agent evaluations.** Branch `infra/evals` (pull request #46) stopped
   before green CI, so there is no committed check that agents use the
   tools correctly (for example, that they keep a `depends` result instead
   of picking one side).
7. **Many feature branches are not merged.** `infra/events`,
   `infra/calendar`, `infra/numerology`, `infra/panchang`, `infra/mansions`,
   `infra/fixedstars` and others exist locally; this review did not assess
   them.

## What this change adds

`tools/chinese-zodiac/`, a private package with no dependencies, outside
the engine's packed files:

- Library functions `chineseZodiac`, `chineseZodiacRelation`,
  `chineseZodiacGroups`, `sexagenaryYear` and `liChun`, with type
  declarations.
- Three MCP tools with JSON Schemas for input and output:
  `chinese_zodiac_sign`, `chinese_zodiac_relation` and
  `chinese_zodiac_reference`, served by a stdio MCP server
  (`mcp-server.mjs`) that needs only Node.
- The year boundary is Li Chun (solar longitude 315 degrees), computed from
  a published solar series that is not derived from a JPL ephemeris, and
  checked against JPL Horizons for 1900 to 2100 and against the Hong Kong
  Observatory for 2019 to 2028
  (`docs/evidence/chinese-zodiac-2026-10-24/`). Inputs that could fall on
  either side of Li Chun return `depends` with both candidate years.
- The agent guide [`CHINESE-ZODIAC.md`](CHINESE-ZODIAC.md), whose example
  results are checked against real output by the tests.
- Workflow `.github/workflows/chinese-zodiac.yml`, which runs the tests on
  Node 22.22.2 and 24.

Nothing in `src/`, `dist/`, `package.json`, `README.md`, `CHANGELOG.md`,
`artifacts/`, `conformance/` or `atlas/` changes, so no new candidate is
needed.

## Joining the engine MCP server later

`mcp/` belongs to another job and is not changed here. When it merges, the
smallest hook is to register the three definitions from
`tools/chinese-zodiac/mcp-tools.mjs` (each has a name, title, description,
JSON Schema input and output, annotations, and a handler through
`callTool`). The `mcp/` server builds its schemas with zod, so the hook
either converts these JSON Schemas or registers them through the SDK's
low-level `tools/list` and `tools/call` handlers. Until then the separate
stdio server works on its own.
