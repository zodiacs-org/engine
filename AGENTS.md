# Instructions for coding agents

This repository holds `@zodiacs/engine`, a TypeScript astrology calculation
package (MIT; `MIT AND CC-BY-4.0` as distributed, because it ships CC BY 4.0
ΔT values), a conformance suite for astrology computation under
`conformance/` (CC0 1.0), and a historical time atlas under `atlas/` (data
and documentation CC BY 4.0, tools and schema MIT). Read `README.md`,
`CONTRIBUTING.md`, `LICENSING.md`, `artifacts/README.md`,
`conformance/README.md` and `atlas/README.md` before changing behaviour.

## Where things are

- Source and unit tests: `src/`, with tests beside the code as `*.test.ts`,
  and tests of the scripts as `scripts/*.test.mjs` (Vitest). Build output
  goes to `dist/`, which is not committed. The opt-in entry points live in
  `src/geo/`, `src/timing/`, `src/vedic/`, `src/techniques/`, `src/sky/`
  and `src/lite/`, and in the flat files `src/calc.ts` and `src/calc-*.ts`,
  `src/window.ts` and `src/window-*.ts`, `src/houses-extra.ts` (the houses
  entry), `src/equator.ts` (shared by calc and sky),
  `src/first-millisecond.ts` (the sky entry's), `src/time.ts` and
  `src/time-bands.ts` (the time entry's), `src/lite.ts` and
  `src/sect.ts` (the lite entry's); `OPT_IN_SOURCE` in
  `scripts/root-isolation.mjs` names them all. `src/de440.ts` with
  `src/de440/` (the DE440 entry's), `src/de440-pack.ts` (the entry that gives
  out the shipped pack, with `useDe440()`) and, from 3.0.0, `src/minor-bodies.ts`
  with `src/minor-bodies/` are opt-in too: from 3.0.0 the root computes on
  astronomy-engine by default and loads none of them (from 1.1.0-rc.9 to
  2.1.0 it computed on the pack by default; `docs/de440.md`);
  `src/test-setup.ts` runs the suite on astronomy-engine and says why. The
  lite entry is built apart: `npm run build` runs `scripts/build-lite.mjs`
  after tsup, which bundles each of its four parts into a file of its own
  that imports nothing. The core entry (`src/core.ts`) re-exports the root
  from 3.0.0, and tsup builds it with the other entries (until 2.1.0
  `scripts/build-core.mjs` bundled a copy of the root's graph into
  `dist/core.js` without the pack). Their guides are `docs/time.md`,
  `docs/timing-hellenistic.md`, `docs/vedic.md`, `docs/techniques.md`,
  `docs/calc.md`, `docs/houses.md`, `docs/sky.md`, `docs/lite.md` and
  `docs/de440.md`, and `docs/guide.md` (the README's detailed sections, from
  3.0.0), whose *Birth-time windows* and *Minor bodies* cover the window and
  minor-bodies entries.
- Package and release scripts: `scripts/` (export smoke test, package
  contents and size budgets, packed consumer, archive binding, release
  archive check, compatibility checks), and the generators of the time data:
  `scripts/build-tz-shards.mjs` writes `src/tzdb/` and
  `scripts/build-time-scales.mjs` writes `src/time-scale-data.ts`; and the
  writer of the shipped DE440 pack, `scripts/build-de440-pack.mjs`, which
  writes `src/de440/pack-data.ts` from the sealed pack. Regenerate
  those files; never edit them by hand.
- Release candidates: `artifacts/` (packed archives, SHA-256 receipts,
  `archives.json`), `CHANGELOG.md`, and each candidate's evidence in
  `docs/evidence/`.
- Conformance suite: vectors in `conformance/vectors/`, their generators in
  `conformance/arbiters/`, the harness in `conformance/harness/`, adapters in
  `conformance/adapters/`, committed results in `conformance/results/`.
- Time atlas: data in `atlas/data/`, schema in `atlas/schema/`, tools in
  `atlas/tools/`, the tzdb comparison in `atlas/tzdb/` and
  `atlas/TZDB-DIFFERENCES.md`.
- Gates: `.github/workflows/ci.yml`, `conformance.yml` and `atlas.yml`. They
  are the authority on what must pass. `release.yml` publishes to npm and is
  run by hand.

## Commands

```sh
# ci.yml, engine job (Node 20, 22 and 24; full history)
npm ci
npm run typecheck
npm test
npm run build
npm run exports:smoke
npm run api:check
npm run package:contents
npm run pack:dry-run
node scripts/verify-archive-binding.mjs

# ci.yml, archives job (Node 22; full history)
node scripts/verify-archive-binding.mjs --rebuild-all

# ci.yml, pack job (Node 22), then packed-consumer job (Node 20.19.0, 22.12.0,
# 22 and 24); DIR is an absolute path, and DIR and TMPDIR are outside the
# checkout
npm run build
npm pack --ignore-scripts --pack-destination DIR
node scripts/verify-packed-consumer.mjs DIR/zodiacs-engine-<version>.tgz

# conformance.yml (Node 22.22.2, after the build)
node --test conformance/harness/selftest.mjs
node conformance/harness/validate.mjs --expect-total 640
node conformance/harness/run.mjs --adapter "node conformance/adapters/zodiacs-engine.mjs" \
  --check conformance/results/zodiacs-engine.json
node conformance/harness/report.mjs --check

# atlas.yml (Node 22.22.2, nothing installed)
node atlas/tools/check.mjs
node --test atlas/tools/selftest.mjs
```

Run the archive-binding check with `node`, not `npm run archive:binding`,
from a clone with full history, and with `TMPDIR` outside the checkout and
below no `package.json` or `node_modules`. The package supports Node
`^20.19.0 || >=22.12.0` (`engines`), the versions that load its ES modules
through `require()` too, which from 3.0.0 has no blocker.

## Rules

- Packed files change only with a new candidate. The package holds
  `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `LICENSING.md`,
  `NOTICE`, `dist/` and, from 3.0.0, `docs/calc.md` and
  `skills/zodiacs-compute/SKILL.md`. While the current version's archive is
  carried, CI fails any pull request that changes one of them, or anything
  that reaches `dist/` (code, doc comments, dependency updates that change the
  build), unless it cuts a new candidate. Do not edit them in an ordinary
  change; corrections to the README, the CHANGELOG and the two packed
  documents wait for the next candidate.
  `artifacts/README.md` has the rules and the check's threat model.
- `artifacts/` holds immutable release archives. Never rewrite, repack,
  replace, rename or delete an archive, its receipt, or an entry of
  `archives.json`. Do not change `version` in `package.json` or pack an
  archive unless you were asked to cut a candidate.
- Pull requests are merged with a merge commit, never squashed or rebased:
  `archives.json` records source commits, which a squash or rebase would
  rewrite.
- Do not run the release workflow or publish to any registry unless the
  owner asks. The release workflow publishes only a carried archive, from
  `main`.
- Numbers in documentation need committed evidence. Every tolerance,
  agreement figure, count or size you write in `README.md`, `CHANGELOG.md`
  or `docs/` must be backed by a test that enforces it or by a committed
  script and its output under `docs/evidence/`. Name the reference and the
  span it was measured over. Do not round in the engine's favour, extend a
  claim past what was checked, or reuse a figure measured on another build.
- Accuracy expectations come from independent arbiters (JPL Horizons, ERFA,
  the IANA time zone database, IERS data, published definitions, separately
  implemented exact arithmetic), never from this engine's own output. A test
  that pins the engine's output is a regression test; do not present it as
  accuracy evidence.
- No Swiss Ephemeris code, binaries, ephemeris files, tables, fixtures or
  per-case output in the repository, and no vector or test expectation taken
  from it. It may be run as an instrument through
  `conformance/adapters/pyswisseph.py`, recording verdicts and summary
  statistics only (`--values none`).
- Birth data is synthetic by default, in tests, fixtures, vectors, examples
  and documentation. A worked example from a published source about a person
  who has died may be used, cited where it is used with author, title, year
  and page. Never a living person's birth data.
- Released conformance vectors never change. A wrong vector is withdrawn and
  replaced under a new id and logged in `conformance/DISCREPANCIES.md`.
  Change a generator, never the vector JSON by hand. Regenerate this
  engine's results (`conformance/results/zodiacs-engine.json`),
  `conformance/RESULTS.md` and `conformance/results/summary.json` with the
  harness (`run.mjs --out` on Node 22.22.2, then `report.mjs`) rather than
  editing them.
- Atlas rules change only as `atlas/CORRECTIONS.md` describes: a primary
  source that was fetched and read, cited with a URL, a locator and a
  verbatim excerpt of at most 40 words; a new rule version with the change
  recorded, never an edit in place; the atlas checks passing; and
  `node atlas/tools/compare-tzdb.mjs` rerun. Secondary works and tzdb
  comments are leads, not citations. Consult no proprietary atlas.
- `astronomy-engine` is pinned to one exact version recorded in receipts
  (`EPHEMERIS`). Do not update it as a routine dependency bump.
- Keep new files at the repository root out of the npm package unless they
  are meant to ship. `files` in `package.json` decides what is packed; npm
  also packs `package.json` and any README, LICENSE, LICENCE or COPYING file
  by default. Run `npm run package:contents` after adding files.
- Keep the core entry point free of network requests and import-time side
  effects, and keep `@zodiacs/engine/crossings`, `@zodiacs/engine/deltat`,
  `@zodiacs/engine/time` and `@zodiacs/engine/lite` free of the ephemeris.
  The root must not import `@zodiacs/engine/timing`, `/vedic`, `/geo`,
  `/calc`, `/window`, `/techniques`, `/houses`, `/sky`, `/time` or `/lite`,
  which are opt-in; `npm run exports:smoke` checks it. From 3.0.0 the root
  computes on astronomy-engine by default and imports neither the DE440 files
  nor the pack (from 1.1.0-rc.9 to 2.1.0 it did); `useDe440()` from
  `/de440/pack` makes the pack the default. The pack is held once, in
  `dist/de440-pack.js`, and only `./de440/pack`'s graph may load it;
  `npm run package:contents` checks that and the pack's digest.
- Never a silent fallback. From 1.1.0-rc.10 the calc and window entries
  follow the default source too, and a result that astronomy-engine computed
  where the pack was the default says so itself: it names astronomy-engine
  and carries `"de440-unavailable"` or `"outside-de440-span"`
  (`EphemerisFallback`; `docs/de440.md`, *The default source*). A new
  function that reads positions must do the same, and one that returns a
  bare value (a `Date`, a number, a list) needs a labelled form beside it,
  as the techniques entry's `…Detailed` functions are (from 1.1.0-rc.11);
  `src/ephemeris-fallback.test.ts`, `src/ephemeris-fallback-techniques.test.ts`,
  `src/ephemeris-fallback-root.test.ts` (from 1.1.0-rc.12) and the
  packed-consumer check hold it.
- Every entry point in `package.json` `exports` has a budget for its import
  graph in `scripts/verify-package-contents.mjs`, the zone histories have
  their own (200,000 bytes, 16 files) and the package a total cap. Add a
  budget with a new entry point. Raise a budget or the cap only when cutting
  a candidate, and say why in `CHANGELOG.md`.
- Write documentation plainly: what the code does, with units, and what was
  measured against what.

## House rules for every coding agent

Both coding agents that work on this repository (Claude Code and the Codex
CLI) follow these rules alongside the ones above. A coordinator hands out the
jobs and keeps the shared task board. `CLAUDE.md` imports this file, so the
rules live here once.

- Commit as `admin@zodiacs.org` (name "Zodiacs Admin"). Never put a model
  name or a personal email address in a commit, a pull request, or a file.
- Open pull requests as drafts. Never push to `main`.
- A check that fails "as expected" is still failing, and so is a check that
  passes but says it skipped its work, including the archive-binding check
  when it skips the rebuild of HEAD. A candidate merges only when its head
  commit has its archive in its tree and that check rebuilt it. Tests that a
  job skips by design do not block (the kernel tests outside the tier-B job,
  which runs them with nothing skipped; tests that need `dist/` before the
  Build step; the tzdata 2025c test on hosts without it). Any other skipped
  test blocks, and so does skipping or disabling a test to get green.
- No OpenAI API calls or keys in scripts or tools.
- Post nothing publicly: no comments on other projects, no messages to
  people. Anything public waits for Dias's yes.
- Never read, print, log or commit credentials, tokens or `.env` values,
  and never write them into a brief, a log, a status file or a pull request.
- Never modify the `market-lens-paper` repository or its files.
- Never log birth data or put it in a URL, in examples as anywhere else.
  If documentation mentions children, children means under 13, and nothing
  about a child is collected or used as an example.
- No predictions in documentation or examples: the engine computes facts.
  No token, market or crypto language.
- No em dashes or en dashes in prose you write. Use commas, colons, full
  stops or parentheses.
- One git worktree per job, branched from `origin/main`. Never edit another
  job's worktree.
- Before editing, read the shared task board at `/workspace/orchestra/BOARD.md`
  (`/workspace/orchestra/board.sh overlaps` lists files that other open
  branches already change). If your files overlap another job's, say so in
  your `STATUS.md` and keep your change to the smallest hook you can.
- Keep your own row on the board current
  (`/workspace/orchestra/board.sh set <job-id> <field> <value>`), and append a
  timestamped line (ICT) to your worktree's `STATUS.md` at each step.
- "Done" means CI is green on the pull request, not an agent saying so.

### Merge rule (the same in zodiacs-org/site and zodiacs-org/engine)

Set by the owner, Dias, on 23 November 2026. It replaces the earlier
approved-lanes wording in both repositories.

- Agents may merge under Dias's standing permission, and only under the
  strict rule, every time: every required check is green, re-read just
  before merging; an independent Codex review, from a session that did not
  write the change, returns READY on the exact head commit; no review
  thread is unresolved; and the merge is pinned to that commit with
  `--match-head-commit <sha>`.
- Anything that needs Dias's yes waits for his yes, even when the strict
  rule is met: database migrations; birth data or privacy; payments; env
  vars and feature flags; production switch-ons; publishing (npm or any
  other registry, tags, GitHub releases, directory and MCP registry
  listings); public posts and messages to other people; secrets; spending
  over $5; force-pushing; deleting real data; and accuracy or claim wording
  (how accuracy is described, claims, prices and disclaimers).
- An agent's say-so is never Dias's yes. Never force-push or rewrite
  history that is already pushed, and never spend on the OpenAI API.

In this repository: merges use a merge commit, never squash or rebase
(`gh pr merge --merge --match-head-commit <sha>`), because `archives.json`
records source commits; the Codex READY verdict is recorded on the pull
request; merging a candidate does not release it; and after each merge,
report one line saying what went in. The archive-binding and skipped-test
rule above applies to every merge.
