# Corrections to the changelog and release statements

`CHANGELOG.md` is packed into every archive, and an archive is never changed.
`README.md` and `CHANGELOG.md` at the head of `main` must also pack to the
bytes of the current version's carried archive (`artifacts/README.md`), so
neither file can take a note until the next version is cut. This file is not
packed. It holds the corrections in the meantime, and the next candidate's
`### Corrections` section should carry them into the changelog.

Each entry names the line as it stands, what the evidence shows, and where the
evidence is. In entries 1 to 8, line numbers are those of `CHANGELOG.md` at
1.1.0 (`322f855`); the audit counted them before 1.1.0's entries, 719 lines earlier. The
lines themselves are left as written. Source: the changelog
evidence audit of 12 and 13 November 2026,
`docs/evidence/changelog-audit-20261112/` (ZOD-152).

## Published versions whose entries say they are unpublished

1. **0.1.1-rc.14, heading (line 2272): "unreleased candidate".** It was
   published to npm on 2026-09-30. True when written.
2. **0.1.1-rc.15, heading (line 1914): "unreleased candidate".** It was
   published to npm on 2026-09-30, is the GitHub release `v0.1.1-rc.15` of
   2026-10-01, and its tagged source has the Zenodo DOI
   10.5281/zenodo.23080134. True when written.
3. **0.1.1-rc.16, heading (line 1481): "unreleased candidate".** It was
   published to npm on 2026-10-01 under `next`. True when written.
4. **0.1.1-rc.16, lines 1493 to 1494: "Nothing was pushed or published."** True on
   2026-09-30; the candidate was published the next day.

npm's tarballs of the three are the bytes carried in `artifacts/`. The
0.1.1-rc.17 entry's *Corrections* already says this; the headings were not
changed because their archives hold them.

## Figures and statements that later evidence corrected

5. **0.1.1-rc.10, lines 2530 to 2532: the Vertex and East Point "agree with
   Swiss's to within 0.00001″".** The F-89 record has a case at 0.000014″
   (1852-03-19T05:35:26.734Z, a near-degenerate case), so the figure does not
   hold as a bound. 1.1.0-rc.2 took it out of the README and gave the
   conformance suite's figures instead
   (`docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md`).
6. **0.1.1-rc.15, lines 2021 to 2023: the flag names `dst-gap` and `dst-fold`
   "are kept, deprecated".** They are permanent, not deprecated: stored
   receipts carry them and no other name replaces them (1.0.0-rc.1,
   *Corrections*; `docs/time.md`).
7. **0.1.1-rc.15, lines 2059 to 2067: "Within about 4e-9° of the polar
   limit".** The band is about 1e-8° (0.1.1-rc.16, *Corrections*;
   `src/houses.ts`).
8. **0.1.1-rc.16, lines 1616, 1642 and 1673: "rc.15's 95,273 bytes"** (three times, in
   the techniques, houses and sky paragraphs). 95,273 bytes was the root's
   import graph in rc.15's first local cut, which those branches were built
   on. In rc.15 as carried and published it is 97,704 bytes (this entry's own
   size table). The gates named there fail on either figure, since the root
   is 103,537 bytes in rc.16.

## Drafts that were never merged or published

9. **1.1.0-rc.4 (pull request 89, closed) and 1.1.0-rc.5 (pull request 90,
   closed): "The option changes nothing for a time the clock showed once."**
   True of the resolved instant, not of the record: both drafts recorded
   `policy.fold: "later"` for an ordinary or a skipped time asked for its
   later pass, which earlier engines refuse. Neither draft is on `main` and
   neither archive is carried. The 1.1.0-rc.6 draft (pull request 91) reports
   and fixes this.

## Release statements outside the changelog

10. **`artifacts/README.md`, the 1.1.0-rc.3 row: "Candidate under review".**
    The candidate was merged on 2026-11-10 (pull request 84). Corrected in
    the file on 2026-11-13: the row now names the carrying commit `d2794d2`
    and says "Candidate, merged".
11. **`CITATION.cff`: "No DOI has been minted".** One was, on 2026-10-01, for
    the tagged source of 0.1.1-rc.15. Corrected in the file on 2026-11-13.
12. **`SECURITY.md`, line 57: "Only the latest release candidate is
    supported".** Written before 1.0.0. npm's `latest` is the stable 1.0.0
    since 2026-10-11. Nothing newer is published: 1.1.0 was merged on
    2026-11-16 (pull request 104) and is not on npm (checked 2026-11-16).
    Which versions are supported now is the owner's decision; the file is not
    changed here.
13. **`tools/cli/README.md`, line 9: "Do not replace the candidate with npm's
    older latest."** Written when npm's `latest` was 0.1.1-rc.15. It is now
    1.0.0, which is newer than the 1.0.0-rc.2 archive the instructions
    install. The file is not changed here.
14. **`artifacts/README.md`, four status cells left from before 1.1.0.**
    1.1.0-rc.6 "Draft candidate, awaiting the owner's review": merged in
    pull request 91. 1.1.0-rc.7 "awaiting the
    owner's review": merged in pull request 95. 1.1.0-rc.11 "Draft candidate
    for 1.1.0": superseded by 1.1.0-rc.12 on pull request 101, as the text
    under the table says. 1.1.0 "Release, under review": merged in pull
    request 104, not on npm. Each source commit is an ancestor of `main` at
    `322f855`; npm's versions are 0.1.1-rc.14 to 0.1.1-rc.16 and 1.0.0
    (`npm view @zodiacs/engine versions`, 2026-11-16). Corrected in the file
    on 2026-11-16.

## 2.0.0-rc.3

Line numbers below are those of `README.md`, `CHANGELOG.md` and
`artifacts/README.md` at `709bc81`.

15. **`README.md`, 2.0.0-rc.3, lines 20 to 21: "is a draft for the owner's
    review and is not published to npm".** It was published to npm on
    17 November 2026 UTC under `next`, with 1.1.0 still under `latest`.
    The registry output, checksum and successful release workflow run are
    recorded in [the publication evidence](evidence/changelog-corrections-20261118/records.md#publication).
    True when written.
16. **`CHANGELOG.md`, 2.0.0-rc.3, pull request 121 (`@zodiacs/engine/core`),
    line 64: "the root is unchanged".** The root's results, names and types
    are unchanged. Its import graph grows by 109 bytes because the shared
    ephemeris chunk grows by that amount. The same entry's size table
    credits pull request 121 with 109 bytes on `.`, `./calc`, `./internal`,
    `./sky`, `./timing`, `./vedic` and `./window`. See
    [the table rows and pull request evidence](evidence/changelog-corrections-20261118/records.md#source-lines-and-import-graph-attribution).
17. **2.0.0-rc.3, other statements that it is unpublished.** It was
    published to npm on 2026-11-17 under `next`, with 1.1.0 still under
    `latest`; it has no git tag and no GitHub release
    ([the publication evidence](evidence/changelog-corrections-20261118/records.md#publication)).
    True when written.
    - `CHANGELOG.md`, line 3, the heading "2.0.0-rc.3 (unreleased
      candidate)", and lines 6 to 7: "It is a draft for the owner's review
      and is not to be published on npm until the owner approves it." The
      owner approved the test publication on 2026-11-17.
    - `artifacts/README.md`, line 120, the 2.0.0-rc.3 status cell: "Draft
      candidate for 2.0.0, awaiting the owner's review; never tagged or
      published". Published on npm under `next`; not tagged.

## Not a correction, for the record

1.0.0 was published to npm on 2026-10-11 without a git tag or a GitHub
release. Draft release notes and the commands to create both are in
`docs/releases/`. Nothing has been tagged or released for 1.0.0 (the only
tag and GitHub release are `v0.1.1-rc.15`'s, item 11 above).

2.0.0-rc.3 was published to npm on 2026-11-17 under `next` without a git tag
or a GitHub release.
