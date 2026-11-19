# Fix round after the second session's review (ZOD-152)

13 November 2026. The second session's review is `BREAKER.md`: no blocker,
six should-fix items and some notes. The owner approved one fix round at
10:48 ICT. This file records what it changed. The first pass's tables in the
`LINES-*.md` files are left as written; where a row's mark changes, it changes
here.

Nothing was published, tagged, released or merged. Pull request 91
(`ce4ba826`) and pull request 92 (`255b615b`) were not touched; both heads
were read again and are unchanged.

## 1. Missed inventory items, now in `INVENTORY.md`

| ID | Where | Claim | Status | Evidence opened | What it shows |
| --- | --- | --- | --- | --- | --- |
| F-pr80-01 | `CHANGELOG.md` on `feat/fixed-stars-hipparcos` (pull request 80, open draft, head `253b3e773`), line 3 | `## Unreleased: fixed stars (feat/fixed-stars-hipparcos)` | supported | `gh pr view 80`: OPEN, draft; npm lists no version with a `./stars` entry; no tag or release | Unreleased, as the heading says. A fifth unmerged candidate entry; the first pass listed four and said other drafts were not searched. |
| F-pr80-02 | same, lines 5 to 13 | the new entry point `@zodiacs/engine/stars`; 411 stars; "1,644 cases, worst 0.0020 arcsec" against ERFA | unchecked | none | Not run and not opened beyond the heading. Read only. |
| F-pr80-03 | same, lines 13 to 14 | "The package's total size cap is proposed up from 1,020,000 to 1,060,000 bytes" | unchecked | `scripts/verify-package-contents.mjs` on `main`: `TOTAL_CAP = 1_145_000` | True of the branch's base (1.1.0-rc.1, whose cap was 1,020,000). `main` has since raised the cap twice, so the proposal is behind `main`; it is a draft's proposal, not a release statement, and is not put on the unsupported list. |
| F-sec-01 | `SECURITY.md` on `main`, line 57 | "Only the latest release candidate is supported, and fixes ship in a new candidate." | not supported | `raw/npm-view-engine.json`: `latest` is 1.0.0 since 2026-10-11; `git log -- SECURITY.md`: written 2026-09-28 | Out of date in the same way as the three "unreleased candidate" headings: it predates the stable release. On the unsupported list as row 13. |
| F-cli-01 | `tools/cli/README.md` on `main`, line 9 | "Do not replace the candidate with npm's older latest." | not supported | `raw/npm-view-engine.json`; `docs/evidence/1.0.0-20261011/npm-view.txt` (2026-10-10: `latest` 0.1.1-rc.15) | True when written on 2026-10-09. npm's `latest` is now 1.0.0, newer than the 1.0.0-rc.2 archive the instructions install. On the unsupported list as row 14. |
| F-skill-01 | `skills/zodiacs-compute/references/tools.md`, lines 3 to 5 and 74 to 80 | "On 2026-10-01 the verified rc.16 release workflow published engine `0.1.1-rc.16` under `next`; `latest` remained rc.15." | supported | `raw/npm-view-engine.json`: rc.16 published 2026-10-01T12:02:05Z, dist-tag `next`; `docs/evidence/rc17-20261005/npm-view.txt`: `latest` rc.15 on 2026-10-05 | Dated, and right for its date. |

## 2. Rows the second session settled, confirmed here

Each was reopened in this round from the file named.

| Row | First pass | Now | Evidence opened |
| --- | --- | --- | --- |
| E-0.1.1-rc.16-09a | supported, on a text search | supported | `docs/evidence/calc-api/RESULTS.md` line 76: "geocentric, apparent \| 3.00 / 15.5 / 24.6 ..." (median, 95th percentile, maximum). The note now rests on the line read, not on a search. |
| E-0.1.1-rc.15-15a | supported, on a text search | supported | `docs/evidence/rc15-20260929/recut/receipt-replay.json`: `receipts` 16218; `asUtc.byLatitude`: latitude 0 cusps 12.94, 60 `mc` 12.85 and `asc` 40.55, 65 `asc` 129.1. |
| E-0.1.1-rc.16-40 | unchecked | supported | `src/houses.ts` line 168: "settles to 1e-9° within 64 steps except within about 1e-8° of the polar". This is also evidence outside the changelog for the not supported row E-0.1.1-rc.15-17a. |
| E-1.0.0-rc.2-03 | unchecked | supported for the counts | `docs/evidence/1.0.0-rc.2-20261006/README.md` lines 308 to 309 and 330 to 332, as the first pass's note already quoted: 66 tables; 43, 11 and 42 kept alone; 43, 20 and 42 in a program; 3 for this candidate. The bundling runs were not repeated. |
| E-0.1.1-rc.17-08b | unchecked | supported for the count | `src/fixtures/calc-roundtrip.json` has 25 cases at `ddbbaa0` (rc.16) and 37 at `aae419c` (rc.17): twelve more. Which cases changed was not read. |
| E-1.0.0-rc.1-19 | supported for rc.17 and 1.0.0-rc.1 | supported for rc.16 too | the 0.1.1-rc.16 archive's `dist/*.js` hold only `zodiacs.calc-receipt.draft-v1`. |

Counts after this round. `CHANGELOG.md` on main: 371 rows, 146 supported, 8
not supported, 217 unchecked (three rows moved from unchecked to supported).
With the six rows of section 1 the engine total is 460 rows: 197 supported,
14 not supported, 249 unchecked. The owner asked that the other unchecked
rows be left alone; no deeper measurement pass was started.

## 3. Smaller notes folded in

- `INVENTORY.md` named the pull request 91 lines file in lower case. It is
  `LINES-pr91-1.1.0-rc.6.md`; the inventory on `main` already carries the fix.
- "CI runs" for pull request 91: the 28 are **28 check runs** (jobs), all
  successful on `c3efe91` and on `ce4ba82`. They belong to several workflow
  runs, not 28 runs: the three runs the pull request names hold 13 of them
  (row P91-body-13 says so). `README.md` here now says "check runs".
- The times in the first handoff ran ahead of the machine's clock.

## 4. Correction notes (the owner's approved fix 1)

- `docs/changelog-corrections.md` (new, not packed): one entry for each line
  on the unsupported list, with what the evidence shows.
- **`CHANGELOG.md` was not edited.** It and `README.md` are packed, and the
  archive check requires the head of `main` to pack to the carried
  1.1.0-rc.3 bytes, so a note there would fail CI until the next version is
  cut. The published entries stay as written in their archives in any case.
  The next candidate's `### Corrections` should carry the notes; the file
  says so.
- `artifacts/README.md`: the 1.1.0-rc.3 row now names the carrying commit
  `d2794d2` and says "Candidate, merged" (row O-art-03). No digest changed.
- `CITATION.cff`: the comment now says that one DOI exists, for the tagged
  source of 0.1.1-rc.15, and that no stable release has one (row O-cff-01).
  No field was added.
- `SECURITY.md` and `tools/cli/README.md` were not edited. They are in the
  corrections file; what they should say is the owner's decision.
- The rc.4 and rc.5 drafts (rows 9 and 10) are closed, unmerged branches and
  were not touched; the corrections file records them.

## 5. Draft tag and GitHub release for 1.0.0 (the owner's approved fix 2)

`docs/releases/README.md` (the commands, with what each one does) and
`docs/releases/v1.0.0-release-notes-DRAFT.md` (the body). **Nothing was
run.** No tag was created or pushed and no release, draft or published, was
created. The target proposed is `f8992a4c1dfedd9e69c0783e2c185e22580460f7`,
the commit the Release workflow published 1.0.0 from
(`docs/evidence/1.0.0-20261011/publication/release-run.json`). The commands
file warns that publishing a GitHub release mints a permanent Zenodo DOI.

## 6. Left as they are, on the owner's instruction

- The unchecked rows.
- Pull request 91's "Generated by" line, which is for the owner's engine
  session.
- The ZOD-96 status page.
