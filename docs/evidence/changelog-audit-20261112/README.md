# Changelog evidence audit, engine side (ZOD-152)

An audit of what the engine's release notes say against the evidence behind
them: commits, diffs, packed archives, recorded test and measurement output,
the registries and GitHub. Related: ZOD-96 (this audit does not build that
page). Done 12 and 13 November 2026 on branch
`audit/fable-job8-changelog-evidence`, from `origin/main` at `bc0b5a7`.

It adds this folder only. No changelog, release, tag, archive or other branch
was changed. Pull request 91 (`admin/engine-1.1.0-rc.6`) and pull request 92
(`admin/zod-65-engine-phase-1-replace-receipt-error-limits`) were read and not
touched; their heads were `ce4ba826` and `255b615b` before and after
(`raw/engine-refs-before.txt`, `raw/engine-refs-after.txt`).

## Files

| File | What it is | Test |
| --- | --- | --- |
| `INVENTORY.md` | Every release, tag, registry version, changelog heading, candidate branch and release-note file found, and how each was found | R1 |
| `LINES-CHANGELOG-main.md` | `CHANGELOG.md` on `origin/main`, all 23 entries, block by block | R2 |
| `LINES-pr91-1.1.0-rc.6.md` | Pull request 91's changelog entry and its text, read only | R2 |
| `LINES-branch-candidates.md` | The 1.1.0-rc.4, rc.5 and rc.7 entries on their unmerged branches, read only | R2 |
| `LINES-other-files.md` | `artifacts/README.md`, `README.md`, `CITATION.cff` and the GitHub release body | R2 |
| `UNSUPPORTED.md` | The single list of every line marked not supported | R3 |
| `raw/` | Registry, GitHub and Zenodo answers as captured | R1, R4 |

The site's half is in the site repository under
`docs/platform/evidence/changelog-audit-20261112/`.

## Result in numbers

| Text | Rows | Supported | Not supported | Unchecked |
| --- | ---: | ---: | ---: | ---: |
| `CHANGELOG.md` on main (2,052 lines, 23 entries) | 371 | 143 | 8 | 220 |
| Pull request 91, changelog entry for 1.1.0-rc.6 | 14 | 9 | 0 | 5 |
| Pull request 91, its text | 24 | 15 | 0 | 9 |
| rc.4, rc.5, rc.7 entries on their branches | 29 | 15 | 2 | 12 |
| Other release statements | 16 | 10 | 2 | 4 |
| **Total** | **454** | **192** | **12** | **250** |

## What was found, in short

1. **Three headings say "unreleased candidate" for versions that are on npm**:
   0.1.1-rc.14, 0.1.1-rc.15 and 0.1.1-rc.16. rc.15 is also the one GitHub
   release and the one Zenodo DOI. rc.17's *Corrections* admits it; the
   headings were never changed.
2. **Four older lines are contradicted by the project's own later evidence**
   and were left as written: rc.10's Vertex figure against Swiss (0.00001″; the
   F-89 record has a case at 0.000014″), rc.15's "deprecated" flags (withdrawn
   in 1.0.0-rc.1), rc.15's Placidus band (4e-9°, corrected to 1e-8° in rc.16),
   and rc.16's "rc.15's 95,273 bytes" (that is rc.15's first local cut; rc.15
   as carried is 97,704).
3. **Pull request 91's test release 1.1.0-rc.6 holds up.** Its archive digest,
   sizes, file counts, test total, commit list and CI runs match, and its New
   York example was reproduced by running the packed archive. It is
   unpublished and says so. The fault it reports in the withdrawn rc.5 draft
   is visible in rc.5's code, so the rc.4 and rc.5 drafts each have one line
   that is not true of the receipt record.
4. **Two release statements outside the changelog are out of date**:
   `artifacts/README.md` still calls 1.1.0-rc.3 "under review" though it is
   merged, and `CITATION.cff` says no DOI has been minted though one was on
   1 October 2026.
5. **More than half the rows are unchecked.** They are statements about code
   behaviour, measured accuracy and owner approvals that this audit did not
   re-run or look up. Each is listed with its reason.

## How the tests are met

- **R1.** `INVENTORY.md` lists the one tag and GitHub release, the four npm
  versions, the PyPI and Zenodo records, the empty JSR package, all 31 heading
  lines of `CHANGELOG.md`, the four candidate branches (pull request 91's
  among them), and the release-note files, with the command for each.
- **R2.** Every paragraph and bullet of every entry has at least one row with
  one of three marks and its evidence or reason. A script checks that no
  block is without a row.
- **R3.** `UNSUPPORTED.md` is built by script from the same rows.
- **R4.** Nothing was published, tagged, released, merged or moved. Only read
  commands were used against GitHub, npm, PyPI, JSR and Zenodo. Archives were
  unpacked, and one was run, in scratch space outside the repository.

## Limits of this audit

- Text search found most quoted figures inside the evidence folders, but a
  figure that only "appears" there is not counted as support unless the cited
  file was opened and read. The notes say which is which.
- Evidence READMEs are written by the same hand as the changelog. Where a row
  rests on one, the note says so.
- Local builds that were never pushed, owner approvals, and anything measured
  with Swiss Ephemeris cannot be checked from the repository.
- Open draft branches other than the four candidate branches were not searched
  for changelog edits.
