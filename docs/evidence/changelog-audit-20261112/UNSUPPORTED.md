# Engine: every line marked not supported or contradicted (ZOD-152, R3)

This is the single list for the engine repository. It holds every row marked **not supported** in `LINES-CHANGELOG-main.md`, `LINES-pr91-1.1.0-rc.6.md`, `LINES-branch-candidates.md` and `LINES-other-files.md`: 12 rows. A script builds it from the same rows, so a row cannot be marked not supported there and be missing here. The site repository's list is in the site worktree, `docs/platform/evidence/changelog-audit-20261112/UNSUPPORTED.md`.

Nothing was changed in any changelog, release, tag or branch. These are findings for the owner to decide on.

**Pull request 91 (test release 1.1.0-rc.6): no line of its changelog entry and no statement in its text was found unsupported.** It is unpublished, and both texts say so. 9 of its 14 changelog rows and 15 of its 24 text rows are supported; the rest are unchecked, with reasons, in `LINES-pr91-1.1.0-rc.6.md`.


## Headings and sentences that say "unreleased" or "not published" for versions that are published

| # | ID | Release | Where | The line says | What the evidence shows |
| ---: | --- | --- | --- | --- | --- |
| 1 | E-0.1.1-rc.16-01 | 0.1.1-rc.16 | CHANGELOG.md on main, line 762 | "## 0.1.1-rc.16 — unreleased candidate" | Contradicted today: 0.1.1-rc.16 has been on npm since 1 October 2026. The heading was true when written (source commit `ddbbaa0` and carrying commit `ef44477` are dated 2026-09-30; pull request #22 merged 2026-09-30T15:46:00Z). rc.17's *Corrections* (line 757) and `README.md` say it was published later; the heading itself was never changed. No git tag or GitHub release exists for it. Evidence: `raw/npm-view-engine.json`: `"0.1.1-rc.16": "2026-10-01T12:02:05.117Z"`, dist-tag `next`; `raw/npm-dist.json` shasum `f57e312b...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.16.tgz`, `fileCount` 69, `unpackedSize` 923282 |
| 2 | E-0.1.1-rc.16-02b | 0.1.1-rc.16 | CHANGELOG.md on main, lines 764 to 784 | "Nothing was pushed or published." | True on 30 September 2026 when written; rc.16 was published to npm the next day. Listed as out of date, not as an error at the time. Evidence: npm registry as in 01 |
| 3 | E-0.1.1-rc.15-01 | 0.1.1-rc.15 | CHANGELOG.md on main, line 1195 | "## 0.1.1-rc.15 — unreleased candidate" | Contradicted today: rc.15 is on npm (30 September 2026) and is the one GitHub release. True when written (source commit `104bd5a` dated 2026-09-29; pull request #20 merged 2026-09-30T06:12:54Z, before the npm publish at 11:53Z). The GitHub release body says the heading "describes when those notes were written"; rc.17's *Corrections* says the same. Evidence: `raw/npm-view-engine.json`: `"0.1.1-rc.15": "2026-09-30T11:53:41.415Z"`; `raw/npm-dist.json` shasum `e4a49148...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.15.tgz`, 54 files, 668,343 bytes; `raw/github-releases.json`: tag `v0.1.1-rc.15`, prerelease, published 2026-10-01T10:13:53Z |
| 4 | E-0.1.1-rc.14-01 | 0.1.1-rc.14 | CHANGELOG.md on main, line 1553 | "## 0.1.1-rc.14 — unreleased candidate" | Contradicted today: rc.14 has been on npm since 30 September 2026. True when written (carried 2026-09-28; pull request #10 merged 2026-09-29T05:35:58Z). rc.17's *Corrections* says so; the heading was never changed. No tag or GitHub release. Evidence: `raw/npm-view-engine.json`: `"0.1.1-rc.14": "2026-09-30T11:45:36.308Z"`; `raw/npm-dist.json` shasum `30498f08...` equals `sha1sum artifacts/zodiacs-engine-0.1.1-rc.14.tgz`, 30 files, 282,469 bytes |

## Figures or statements that the project's own later evidence or correction contradicts, left standing in the older entry

| # | ID | Release | Where | The line says | What the evidence shows |
| ---: | --- | --- | --- | --- | --- |
| 5 | E-0.1.1-rc.16-11d | 0.1.1-rc.16 | CHANGELOG.md on main, lines 872 to 903 | "the root's graph was to stay at rc.15's 95,273 bytes" (also in 12 and 14: "rc.15's 95,273 bytes") | 95,273 is the root of rc.15's first local cut, which the feature branches were built on, not of rc.15 as carried and published (97,704). The three sentences call it "rc.15's". The gate verdicts (failed) do not depend on which figure is used, since 103,537 exceeds both. Evidence: this entry's own table (line 1140) and `docs/evidence/rc16-20260930/sizes.json` (`rc15`): the root of rc.15 as carried is 97,704 bytes; rc.15's entry, line 1486: "The first cut's root was 95,273" |
| 6 | E-0.1.1-rc.15-14 | 0.1.1-rc.15 | CHANGELOG.md on main, lines 1302 to 1304 | "The flag names `dst-gap` and `dst-fold` are kept, deprecated" | The project later withdrew "deprecated" for these flags in the documentation. This changelog line still says it. `jump.cause` was not run. Evidence: CHANGELOG line 641 (1.0.0-rc.1, *Corrections*): "`docs/time.md` called the flags `dst-gap` and `dst-fold` deprecated. They are permanent"; `git show 77a16c2:docs/time.md` lines 346 to 347 |
| 7 | E-0.1.1-rc.15-17a | 0.1.1-rc.15 | CHANGELOG.md on main, lines 1340 to 1348 | "Within about 4e-9° of the polar limit ... the 64-step iteration could fail to settle" | The figure was corrected by a later entry; this line still gives 4e-9°. The later measurement itself was not re-run. Evidence: CHANGELOG lines 1189 to 1193 (0.1.1-rc.16, *Corrections*): the window branch's review "measured the band at about 1e-8°; `src/houses.ts` says so" |
| 8 | E-0.1.1-rc.10-14b | 0.1.1-rc.10 | CHANGELOG.md on main, lines 1811 to 1813 | "Given the same sidereal time, latitude and obliquity they agree with Swiss's to within 0.00001″" | The project's own F-89 record has a case at 0.000014″, above the 0.00001″ stated. The README was corrected in 1.1.0-rc.2; this rc.10 changelog line was left as written. Evidence: `docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md` line 231: the "Vertex differs by 0.000014″ at the near-degenerate case 1852-03-19T05:35:26.734Z"; line 309: "the old bound fails on it"; CHANGELOG lines 83 to 87 (1.1.0-rc.2): the README "no longer says" this |

## Unmerged candidates (never published)

| # | ID | Release | Where | The line says | What the evidence shows |
| ---: | --- | --- | --- | --- | --- |
| 9 | B-1.1.0-rc.4-04b | 1.1.0-rc.4 | CHANGELOG.md on the branch `admin/engine-1.1.0-rc.4`, lines 28 to 38 | "The option changes nothing for a time the clock showed once" | Same fault as rc.5: the record says `"later"` for a time that was not repeated. Evidence: rc.4 branch `src/geo/timezone.ts:372`: `policy: { fold, gap: "shift-forward" }` |
| 10 | B-1.1.0-rc.5-04b | 1.1.0-rc.5 | CHANGELOG.md on the branch `admin/engine-1.1.0-rc.5`, lines 16 to 26 | "The option changes nothing for a time the clock showed once" | For an ordinary or skipped time asked for `"later"`, the resolved instant is the same but the record kept for a receipt says `"later"`, which earlier engines refuse. The sentence is true of the result and false of the record. This is the fault that led to rc.6. Evidence: rc.5 branch `src/geo/timezone.ts:372`: `policy: { fold, gap: "shift-forward" }`; fix in `444666f`; pull request 91's text |

## Release statements outside CHANGELOG.md

| # | ID | Release | Where | The line says | What the evidence shows |
| ---: | --- | --- | --- | --- | --- |
| 11 | O-art-03 | other files | artifacts/README.md on main | the 1.1.0-rc.3 row: carried in "Carry the packed 1.1.0-rc.3 tarball", status "Candidate under review" | The row was written before the merge and not updated: every other merged candidate's row gives a commit id and says "Candidate, merged". On `main` today the candidate is merged, and the row names a commit by its subject, not its id. Evidence: `git log`: the archive was added by `d2794d2` ("Carry the packed 1.1.0-rc.3 tarball", 2026-11-10); `gh pr view 84`: merged 2026-11-10T02:37:52Z as `bc0b5a7`, which is `origin/main` |
| 12 | O-cff-01 | other files | other files | `CITATION.cff` lines 1 to 4: "version, date-released and doi are left out on purpose. No DOI has been minted" | A DOI was minted for the tagged rc.15 source on 1 October 2026. The comment was true when written and has not been updated. The file's choice to carry no version is unaffected. Evidence: `raw/zenodo-record-23080134.json` (Zenodo's public API, 13 November 2026): record 23080134, DOI `10.5281/zenodo.23080134`, concept DOI `10.5281/zenodo.23080133`, version `v0.1.1-rc.15`, created 2026-10-01T10:13:57Z, status published; the site's record `docs/platform/evidence/engine-github-release-2026-10-01/README.md` says the same; `git log -- CITATION.cff`: last changed 2026-09-30 (`ddbbaa0`), before the DOI |

## Lines the changelog has already corrected in place (not counted above)

These are accurate as they stand today, because the changelog itself carries the correction. They are named so that a reader of the list sees them.

- 0.1.1-rc.13, lines 1690 to 1701: the entry first said "the Sun defines the bound and so never passes it"; a bracket added in rc.14 withdraws that and gives the measured figures (row E-0.1.1-rc.13-04a, supported).
- 0.1.1-rc.13, line 1734: "wording corrected in rc.14" on the size of orb differences (row E-0.1.1-rc.13-10, unchecked).
- 0.1.1-rc.12, line 1748: "wording corrected in rc.13" on the progression mapping (row E-0.1.1-rc.12-02).
- 0.1.1-rc.17, lines 757 to 760 (*Corrections*): states that the rc.14, rc.15 and rc.16 headings are out of date. The headings themselves were not changed, so they stay in the list above.

## Observations that are not line findings

1. Headings 0.1.1-rc.7 to 0.1.1-rc.11 have no "unreleased candidate" suffix, though none was published. They claim no publication, so they are marked supported; the style differs from every other candidate heading.
2. 1.0.0 is on npm with no git tag and no GitHub release. The changelog does not claim either.
3. `artifacts/README.md` says in its opening paragraph that rc.14, rc.15 and rc.16 were later published, but their table rows say only "Candidate, merged" (row O-art-04).
4. The test logs recorded for 1.0.0, 1.1.0-rc.2 and 1.1.0-rc.3 on darwin-arm64 each show 4 failed tests. The 1.0.0 entry says so (lines 324 to 338). The 1.1.0-rc.2 and 1.1.0-rc.3 entries state no test totals, so there is no line to mark; their evidence READMEs describe the same four failures.
5. Pull request 91's text ends with a "Generated by" line naming the tool that wrote it (row P91-body-24). The house rules ask that pull request text carry no such line. Nothing was edited.
6. Pull request 91's text says "I closed none of them" of pull requests 89 and 90; both are closed now (row P91-body-22). That is a later event, not an error in the text.

## What this list does not cover

250 rows are **unchecked** across the engine files (220 on main's changelog). An unchecked line is not a finding and is not a pass. The largest groups are behaviour of the code that was not run, accuracy figures measured against ERFA, JPL or Swiss Ephemeris that were not re-measured, and owner approvals that were not looked up. See the method note in `LINES-CHANGELOG-main.md`.
