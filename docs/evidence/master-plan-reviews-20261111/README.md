# The four reviews behind the engine master plan, redone (ZOD-98)

Written on 2026-11-11 on this job's audit branch, from `origin/main` at
`bc0b5a7`. These files are a review record. They change no code, no packed
file and no existing document, and they propose no sentence for
publication.

| File | What it is |
| --- | --- |
| [01-accuracy.md](01-accuracy.md) | Review 1: accuracy |
| [02-ai-assistants.md](02-ai-assistants.md) | Review 2: readiness for AI assistants |
| [03-licences.md](03-licences.md) | Review 3: licences |
| [04-connector-listing.md](04-connector-listing.md) | Review 4: listing in an AI connector directory |
| [05-disagreements.md](05-disagreements.md) | Disagreements with the plan |
| [sign-changes/](sign-changes/) | This job's one measurement: the engine's Neptune and Pluto sign changes against JPL Horizons |

## Two passes

The reviews were written in two passes on the same day.

- **First pass.** The session could read only this repository. It wrote all
  four reviews from committed files and said what it could not open: the
  master plan, Linear, the site repository, the live service, any third
  party's page.
- **Second pass.** Those were opened, and the reviews were amended in
  place. A finding the second pass changed says so. Review 4 and the
  disagreements list were rewritten, because the first pass had neither the
  connector's records nor the plan's text. The first pass's wording
  survives in reviews 1 to 3 wherever it still holds.

## What these reviews are, and are not

The four original reviews the plan cites were not found in either
repository, in Linear or anywhere else, so these are not a comparison with
them and do not reconstruct them. Each review was made again from primary
sources. Where a review says "found", the file and line, the address, or
the call is given. Where something could not be opened, the review says so
and draws no conclusion from it.

## Sources opened

**This repository.** The working tree at `bc0b5a7`, and other branches read
with `git show` and `git grep` and never checked out or changed. Tips as
fetched on 2026-11-11: `admin/zod-65-...` `255b615` (pull request 92),
`admin/zod-64-...` `ac2b453` (88), `admin/zod-66-...` `3ea3e98` (87),
`admin/engine-1.1.0-rc.6` `ce4ba82` (91), and the `infra/*`, `feat/*` and
`bot/*` branches the reviews name. Pull request 92's body and checks were
read with `gh`.

**The master plan.** "Zodiacs engine master plan", artifact id
`814TqL6h6Nu3bjrD3FJBRy`, one tab, read in full through the documents
connector.

**Linear.** ZOD-98 (this job's tests, also from the copy in the job
folder), ZOD-58, ZOD-62, ZOD-63, ZOD-64, ZOD-65 and ZOD-66, with the
comments on ZOD-63 and ZOD-65.

**The site repository** (`zodiacs-org/site`) at `47fee79f`, a clone of one
commit, read and not changed: the connector's source (`src/ai-tools/`), the
listing records (`docs/platform/zodiacs-ai/`), the Horizons event table
(`src/data/nasa-event-instants.json`), the methodology page's source and
evidence, `LICENSE`, and the evidence folders the engine's documents cite.
Its pull requests 943, 968, 970, 971, 972, 974 and 975 were read with `gh`.

**The live service**, on 2026-11-11 between 14:53 and 15:02 UTC:

- `POST https://zodiacs.org/mcp`: `initialize` and `tools/list` (server
  `zodiacs` 0.6.6, 19 tools).
- Six tool calls through the connector, all with synthetic input:
  `get_capabilities`; `get_upcoming_events` (Neptune, ingress, 2026-01-20 to
  2026-02-01); `check_sky_fact` (ingress, Neptune, aries, 2026-01-26);
  `get_natal_chart` with `birthDate` 2026-11-11 (refused); `get_natal_chart`
  with `birthDate` 1990-05-03 and nothing else; `get_sky` (Sun, Moon,
  Neptune, zone Asia/Bangkok).
- Pages: `https://zodiacs.org/methodology/`, `/privacy/`, `/terms/`,
  `/developers/ai/`, `/developers/mcp/` (all 200), `/how-we-calculate/`
  (404).

**Third parties' own pages**, fetched on 2026-11-11. Review 3 gives each
address beside the text quoted: IERS and Paris Observatory, the US Naval
Observatory, NAIF, JPL Solar System Dynamics, ESA, Europe PMC, Crossref,
arXiv, the journal page for Reid and Brunthaler, GeoNames, IANA, and the
licence files of astronomy-engine and ERFA. Review 4 gives the directory
rules read: Anthropic's Software Directory Policy and connector pages,
OpenAI's plugin guidelines, and the MCP Registry's pages.

**JPL Horizons**, queried by this job for `sign-changes/`.

**npm**: `npm view` for `@zodiacs/engine` and `@zodiacs/sdk`.

## Sources not opened, or opened only in part

| Source | Consequence |
| --- | --- |
| The four original reviews | Not found anywhere. Figures the plan takes from them alone are marked unchecked. |
| The CDS's legal pages | Its site is down after a security incident; both pages return 404. Archive copies of 2026-09-09 and 2026-10-25 were read instead. |
| The Royal Society's article pages | Refused automated reading (403). The licence was read from the Europe PMC copy. |
| The directories' portals and the reviewers' messages | Not opened. Their state is taken from the site repository's records. |
| The site repository's history | The clone has one commit. |
| `de440.bsp` | Not used. Pull request 92's sweep was read, not rerun. |
| Production configuration | Whether production serves the site's `main` was not checked. |
| Job 1's worktree (ZOD-97) | Not read. The plan's edge cases are left to that job. |

## How the facts were gathered, and what was run

Review 1 and the live calls were made directly. For the site repository,
the third parties' terms and the directory rules, three read-only passes
collected quotations with file and line or address; the passages the
findings rest on were then opened again before they were cited, where a
second look was possible.

Run in this job: `npm ci` and `npm run build` on `bc0b5a7` (Node v22.23.3),
to produce the `dist/` that `sign-changes/tools/engine_ingresses.mjs` and
two one-line checks (Review 2, B11 and B14) call; and
`sign-changes/tools/horizons_check.py`. No test suite, no conformance run
and no sweep was run. Every figure in these files that this job did not
measure is copied from a committed file or a fetched page named beside it.
