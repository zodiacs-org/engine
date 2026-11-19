# Breaker review of the changelog evidence audit, engine side (ZOD-152)

A second session tried to break the audit in this folder against the issue's
four tests. Done 13 November 2026 on branch
`audit/fable-job8-changelog-evidence` at `4223f1c`, with `origin/main` at
`bc0b5a7`. It adds this file only. Nothing was pushed, published, tagged,
merged or moved, and no pull request was edited. The site's half is in the
site repository, `docs/platform/evidence/changelog-audit-20261112/BREAKER.md`.

## Verdict

**No blocker. The R1 to R4 table survives**, with the should-fix items below.

| Test | Result | Why |
| --- | --- | --- |
| R1, inventory | holds | Every tag, GitHub release, registry version and every heading of `CHANGELOG.md` on `origin/main` is listed, and pull request 91's test release is there. One unmerged draft entry was missed (S1) and three release statements outside the changelog (S2); neither is on the issue's fail list. |
| R2, every line marked | holds | The counts add up. No "supported" row cites only the changelog. About 25 supported rows were opened again and none failed. Two rows break the audit's own method in wording (S3) and several unchecked rows can be settled in one command (S4). |
| R3, one list | holds | No line marked not supported is missing, and no listed line turned out to be supported. Two lines found in S2 would belong on it by the audit's own standard. |
| R4, nothing published or moved | holds | Refs, registries and pull request states read again, see below. |

## What was checked again, and how

**R4.** `git ls-remote origin` on 13 November 2026: `main` `bc0b5a7`,
`admin/engine-1.1.0-rc.6` and `refs/pull/91/head`
`ce4ba826cbb1a74206c679ff9fb0bb10da60d4ca`,
`admin/zod-65-engine-phase-1-replace-receipt-error-limits` and
`refs/pull/92/head` `255b615b03fd7e6530f7d33e63fd331aed297e29`, one tag
`v0.1.1-rc.15` at `93ebae9`. **Pull requests 91 and 92 were not moved.** Both
are open drafts, last updated 2026-11-11T12:09:49Z and 2026-11-11T14:48:24Z,
before the audit began. GitHub lists one release (`v0.1.1-rc.15`, prerelease,
2026-10-01T10:13:53Z). npm lists `0.1.1-rc.14`, `0.1.1-rc.15`, `0.1.1-rc.16`
and `1.0.0`, `latest` 1.0.0, `next` 0.1.1-rc.16, last modified 2026-10-11.
PyPI lists `zodiacs` 0.1.0a1 only. JSR lists no version. Pull request 97 is
an open draft at `4223f1c`. The audit's commit changes only files under
`docs/evidence/changelog-audit-20261112/`, is authored by Zodiacs Admin, and
neither it nor the pull request's text names a tool or a model.

**Counts.** Rows recounted from the tables by script: main changelog 371
(143, 8, 220), pull request 91 38 (24, 0, 14), branch candidates 29
(15, 2, 12), other files 16 (10, 2, 4). Total 454: 192 supported, 12 not
supported, 250 unchecked, as claimed. No row id is used twice.
`grep -c '^#'` on main's `CHANGELOG.md` gives 31.

**The handoff's 13-line summary agrees with `UNSUPPORTED.md`**: its eight
engine items cover 12 rows (4, 1, 1, 1, 1, 2, 1, 1) and its ninth is the
site's one row.

**Pull request 91, test release 1.1.0-rc.6.** All read only.

- The archive on the branch hashes to
  `648714ca7485c7381f338286b84a211752ddd425035f50f6e24267e80de6abde`, is
  333,982 bytes, and unpacks to 94 files and 1,148,327 bytes.
- `carrier/gates-7210037.log` line 9: "Tests 4203 passed | 3 skipped (4206)".
- GitHub reports 28 check runs, 28 successful, on the source commit `c3efe91`
  and again on the head `ce4ba82`. They are 28 jobs in six workflow runs
  (CI, Conformance, Atlas, Python package, CodeQL, Offline CLI consumer). The
  handoff's "CI runs (28 of 28)" should read "check runs".
- The New York example was run again on the unpacked archive's `dist/geo.js`:
  2021-11-07 01:30 gives 05:30Z by default and 06:30Z with `fold: "later"`,
  both flagged `dst-fold` with the same `jump` and `transition`. An ordinary
  time (2021-06-07 01:30) and a skipped one (2021-03-14 02:30) give the same
  result and `policy.fold: "earlier"` whichever pass is asked for.
- `later-receipt-on-rc3.json` was read past the part the audit printed: its
  ordinary entry has `policy.fold` `"earlier"` and `readerReadsAsWritten`
  `"ok"` for both passes asked. Rows P91-cl-05a and P91-body-20 hold for it.
- It is unpublished: no npm version, no tag, no GitHub release.

**The withdrawn rc.4 and rc.5 drafts (list rows 9 and 10).** Both archives
were unpacked from their branches and run. For the ordinary and the skipped
time asked for `"later"`, each records `policy.fold: "later"`. The two not
supported rows reproduce. The New York example also reproduces on both
archives, which rows B-1.1.0-rc.4-04a and B-1.1.0-rc.5-04a had marked
supported from rc.6's run alone.

**Headings against npm.** rc.14, rc.15 and rc.16 are on npm with the times
the audit gives. No other heading's version is on npm.

**`CITATION.cff` against Zenodo.** The file on main says "No DOI has been
minted". Zenodo's public API on 13 November 2026 returns record 23080134, DOI
10.5281/zenodo.23080134, concept DOI 10.5281/zenodo.23080133, version
`v0.1.1-rc.15`, created 2026-10-01T10:13:57.901413Z, published, one file of
3,151,916 bytes with MD5 `f993fcd18500064ef8ad51155451fe9e`. Row O-cff-01
holds.

**Other supported rows opened again, all of which hold.** Conformance totals
at `03db4bb`, `104bd5a`, `ddbbaa0`, `aae419c`, `ca2c8ce`, `806f76b` and
`cc910b3`; the three darwin test logs of 1.0.0 (4 failed of 3,853 each); the
rc.14 CI matrix; the sixteen public entries of 1.1.0-rc.3; the figures of
`pack-accuracy.json` (Moon 0.001504, Venus 0.000797, node 0.8397, 20,001
instants); `93ebae9` as the merge of pull request 20; the four equal digests
of `rebuilt/dist-digest.log`, the re-cut's line among them; all fourteen
archive entries of `earlier-readers.json` from 0.1.1-rc.7 to 1.0.0
(`unsupported_feature`, then `invalid_shape`), where row E-1.1.0-rc.1-04a
had read four.

## Findings

### Blockers

None.

### Should fix

**S1. One unmerged changelog candidate is missing from the inventory (R1).**
Branch `feat/fixed-stars-hipparcos` (pull request 80, open draft, head
`253b3e7`) adds a heading that is not on main:
`## Unreleased: fixed stars (feat/fixed-stars-hipparcos)`, twelve lines, with
figures (411 stars, 1,644 cases against ERFA, worst 0.0020 arcsec, a size cap
proposed up from 1,020,000 to 1,060,000). `INVENTORY.md` lists four candidate
entries and says the other draft branches "were not searched". The search is
one loop over the 82 remote branches: five have a `## ` heading that main
lacks, the four listed and this one. The gap was stated, and the entry is
neither on main nor published, so this is not one of R1's fail conditions.
It has no row and its figures are unchecked. Two things in it look out of
date and were not traced: main's cap is already 1,145,000, so "up from
1,020,000" describes an older main.

**S2. Three release statements outside `CHANGELOG.md` are not inventoried
(R1, R3).** Found with a search of main for "published", "npm" and "latest"
outside the evidence folders:

| File on main | The line says | What the evidence shows |
| --- | --- | --- |
| `SECURITY.md` lines 55 to 59 | "Only the latest release candidate is supported, and fixes ship in a new candidate." | Written while every release was a candidate. npm's `latest` has been the stable 1.0.0 since 2026-10-11, and the sentence does not say whether it is supported. Out of date in the same way as the three headings. |
| `tools/cli/README.md` lines 3 and 9 | Review "against the carried `@zodiacs/engine@1.0.0-rc.2` archive"; "Do not replace the candidate with npm's older latest." | Last changed 2026-10-09, when `latest` was 0.1.1-rc.15. Since 2026-10-11 `latest` is 1.0.0, which is newer than 1.0.0-rc.2. True when written, out of date now. |
| `skills/zodiacs-compute/references/tools.md` lines 76 to 78 | "On 2026-10-01 the verified rc.16 release workflow published engine `0.1.1-rc.16` under `next`; `latest` remained rc.15." | Dated, and agrees with npm's time for rc.16 (2026-10-01T12:02:05Z) and today's `next`. The run it links was not opened. |

By the audit's own standard (a line true when written and contradicted
today is listed), the first two belong in `UNSUPPORTED.md` or need a stated
reason for leaving them out.

**S3. Two rows are marked supported on a text search, against the audit's
own method (R2).** The method note says a figure that only "appears" in a
folder is not counted as support. Row E-0.1.1-rc.16-09a says it is "marked
supported on the figure match only", and row E-0.1.1-rc.15-15a says "keys not
read". Both files were opened here and both rows hold:
`docs/evidence/calc-api/RESULTS.md` line 76 gives "3.00 / 15.5 / 24.6" for
geocentric apparent places and lines 29 and 35 give the two 0.200 arcsec
failures; `recut/receipt-replay.json` has `receipts: 16218`, `mc` 12.85 at
60 degrees, `cusps` 12.94 at the equator, 40.55 at 60 and 129.1 at 65. The
marks can stay; the notes should say the files were read.

**S4. Unchecked rows that one command settles (R2).** None changes the
unsupported list.

| Row | What settles it | Result |
| --- | --- | --- |
| E-0.1.1-rc.16-40 | `src/houses.ts` line 168 on main: "settles to 1e-9 degrees within 64 steps except within about 1e-8 degrees of the polar" | Supported. It is also the only evidence outside the changelog for the not supported row E-0.1.1-rc.15-17a, which at present cites changelog lines alone. |
| E-1.0.0-rc.2-03 | The tables the audit opened in `docs/evidence/1.0.0-rc.2-20261006/README.md`: 66 tables; 43, 11, 42 kept alone; 43, 20, 42 kept in a program; 3 for this candidate | The counts match the line. The fourth column the note worries about is esbuild minified, which the line does not quote. |
| E-0.1.1-rc.17-08b | `src/fixtures/calc-roundtrip.json` has 25 cases at `ddbbaa0` and 37 at `aae419c` | "gains twelve cases" and "25 earlier cases" hold. The count of 15 was not checked. |
| E-1.0.0-rc.1-19 | the 0.1.1-rc.16 archive's `dist/*.js` hold `zodiacs.calc-receipt.draft-v1` only | The rc.16 half, which the row left open, holds. |

The audit marks some rows supported on the author's evidence README
(E-0.1.1-rc.14-06a, E-1.0.0-rc.1-06a) and leaves others unchecked on the same
kind of source (E-1.0.0-rc.2-03, E-1.1.0-rc.1-07). The line between the two
is not stated.

### Notes

- N1. `INVENTORY.md` names `lines-pr91-1.1.0-rc.6.md` twice in lower case; the
  file is `LINES-pr91-1.1.0-rc.6.md`.
- N2. The figure "226,717 events" (line 946) occurs nowhere on main outside
  the changelog (`git grep`). Unchecked is the right mark for row
  E-0.1.1-rc.16-14b.
- N3. The 1.1.0-rc.7 draft says the engine "went past ten of the eleven
  apparent position limits" that rc.16 introduced. That does not contradict
  rc.16's entry on main, which calls its bounds "sample maxima, not limits"
  (line 842). No row to add.
- N4. The F-89 corrections in 1.1.0-rc.2 were searched for older changelog
  lines that still carry a corrected statement. Only the Vertex figure of
  rc.10 does, and it is on the list (row 8). The crossing-scan figures, the
  Munkasey sentence and the Placidus step count were never in a changelog
  entry.
- N5. No sentence in the rc.14 or rc.15 entry other than the heading says the
  version itself is unpublished; rc.16's one such sentence is on the list.

## Limits of this review

It sampled. Of the 192 supported rows about 25 were opened again; the 250
unchecked rows are still unchecked apart from the four in S4. No test suite
was run, and nothing was measured against ERFA, JPL or Swiss Ephemeris. The
owner approvals the audit could not look up were not looked up here either.
The audit's row-building scripts are not in the folder and were not seen.
