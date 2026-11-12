# Engine inventory: releases, tags, changelogs and release-note files (ZOD-152, R1)

Built 12 November 2026 (ICT) on branch `audit/fable-job8-changelog-evidence`,
from `origin/main` at `bc0b5a769ad2cfb17e1f853b94d94eb271fdd56d`. Related: ZOD-96.
The registries and remote refs were read on 12 November and read again on 13 November 2026
with the same answers (`raw/engine-refs-before.txt`, `raw/engine-refs-after.txt`).
Nothing in this folder changes a release, a tag, a published changelog or
another branch. It is an audit record.

## How the inventory was built

Each source was queried directly. The raw answers are in `raw/`.

| Source | Command | Raw record |
| --- | --- | --- |
| Git tags on the remote | `git ls-remote origin 'refs/tags/*'` | `raw/engine-refs-before.txt` |
| GitHub releases | `gh api repos/zodiacs-org/engine/releases` | `raw/github-releases.json` |
| GitHub tags | `gh api repos/zodiacs-org/engine/tags` | `raw/github-tags.json` |
| npm registry | `npm view @zodiacs/engine versions dist-tags time --json`, and `dist.shasum` per version | `raw/npm-view-engine.json`, `raw/npm-dist.json` |
| JSR | `curl https://jsr.io/@zodiacs/engine/meta.json` | `raw/jsr-meta.json` |
| PyPI | `curl https://pypi.org/pypi/zodiacs/json` (reduced to names, times, digests) | `raw/pypi-zodiacs.json` |
| Zenodo | `curl https://zenodo.org/api/records/23080134` and a search of the concept record for other versions (reduced) | `raw/zenodo-record-23080134.json` |
| CHANGELOG headings on `origin/main` | `grep -n '^#' CHANGELOG.md` | listed below |
| Changelog-like files in the tree | `git ls-files \| grep -iE 'changelog\|release[-_ ]?notes\|HISTORY\|NEWS'` | only `CHANGELOG.md` is a changelog; the other hits are `history-check` logs and `zone-history` source |
| Carried archives | `artifacts/archives.json`, with every file's SHA-256 and size recomputed | table below |
| Evidence folders | `ls docs/evidence` | listed below |
| Pull requests | `gh pr list --state all -L 100` (95 pull requests, all read) | named per release below |
| Unmerged candidate branches | `git ls-remote origin 'refs/heads/admin/*'` and the `## ` headings of each branch's `CHANGELOG.md` | section "Candidates on unmerged branches" |
| Other packages in the repository | `git ls-files \| grep -E '(package\.json\|pyproject\.toml\|jsr\.json\|deno\.json)$'` | section "Other packages" |

## Published releases and tags (everything that exists outside the repository)

| What | Where | Version | When (UTC) | Notes |
| --- | --- | --- | --- | --- |
| Git tag | GitHub | `v0.1.1-rc.15` | target `93ebae9fa54597aeaafbb346873f7f51e3cc6cb6` | The only tag. |
| GitHub release | GitHub | `v0.1.1-rc.15`, name "0.1.1-rc.15", prerelease, not a draft | 2026-10-01T10:13:53Z | The only GitHub release. No assets. Its body copies the changelog entry. |
| npm | registry | `0.1.1-rc.14` | 2026-09-30T11:45:36Z | shasum `30498f08…` equals the SHA-1 of `artifacts/zodiacs-engine-0.1.1-rc.14.tgz` |
| npm | registry | `0.1.1-rc.15` | 2026-09-30T11:53:41Z | shasum `e4a49148…` equals the carried archive's |
| npm | registry | `0.1.1-rc.16` | 2026-10-01T12:02:05Z | dist-tag `next`; shasum `f57e312b…` equals the carried archive's |
| npm | registry | `1.0.0` | 2026-10-11T13:54:56Z | dist-tag `latest`; shasum `72b7a026…` equals the carried archive's |
| PyPI | `zodiacs` | `0.1.0a1` (wheel and sdist) | 2026-09-30T10:14:10Z | The Python preview package in `python/`. It has no changelog or release-note file of its own; see "Other packages". |
| JSR | `@zodiacs/engine` | none | | The scope and package exist with no version (`"versions": {}`). |
| Zenodo | record 23080134 | `v0.1.1-rc.15`, DOI `10.5281/zenodo.23080134` (concept DOI `10.5281/zenodo.23080133`) | created 2026-10-01T10:13:57Z | The archived source ZIP of the tagged commit, 3,151,916 bytes. The only version under the concept DOI. Found through the site's record `docs/platform/evidence/engine-github-release-2026-10-01/`; confirmed on Zenodo's public API (`raw/zenodo-record-23080134.json`). `CITATION.cff` still says no DOI has been minted (row O-cff-01). |

There is no git tag and no GitHub release for 1.0.0, 0.1.1-rc.14, 0.1.1-rc.16
or any other version. Only npm records those publications.

## CHANGELOG.md headings on `origin/main` (31 heading lines: the title, 23 release headings, 7 subheadings)

`CHANGELOG.md` is 2,052 lines. Line 1 is the title `# Engine changelog`. Every
`## ` heading is listed, with the `### ` headings under it. "Archive" is the
entry in `artifacts/archives.json`; every carried file's SHA-256 and size were
recomputed and match the manifest.

| Line | Heading as written | Archive carried (source commit, carried on) | Published? | Pull request | Evidence folder | Line check |
| ---: | --- | --- | --- | --- | --- | --- |
| 3 | `## 1.1.0-rc.3 (unreleased candidate)` | yes (`cc910b3`, 2026-11-10) | no | #84 merged | `de440-20261110` | `LINES-CHANGELOG-main.md` |
| 66 | `## 1.1.0-rc.2 (unreleased candidate)` | yes (`806f76b`, 2026-11-04) | no | #82 merged | `1.1.0-rc.2-20261102` | same file |
| 225 | `## 1.1.0-rc.1 — unreleased candidate` | yes (`c417062`, 2026-10-26) | no | #75 merged | `1.1.0-rc.1-20261026` | `LINES-CHANGELOG-main.md` |
| 304 | `## 1.0.0 — 2026-10-11` | yes (`ca2c8ce`, 2026-10-11) | npm `latest`, 2026-10-11. No tag, no GitHub release | #39, #40 merged | `1.0.0-20261011` | same file |
| 340 | `## 1.0.0-rc.2 — unreleased candidate` | yes (`7fa964d`, 2026-10-07) | no | #31 merged | `1.0.0-rc.2-20261006`, `checkpoint22-rc2-20261009` | same file |
| 427 | `## 1.0.0-rc.1 — unreleased candidate` (with `### Corrections`, 639) | yes (`77a16c2`, 2026-10-06) | no | #30 merged | `1.0.0-rc.1-20261006`, `calc-epochs-2026-10-06` | `LINES-CHANGELOG-main.md` |
| 650 | `## 0.1.1-rc.17 — unreleased candidate` (with `### Corrections`, 755) | yes (`aae419c`, 2026-10-06) | no | #26 merged | `rc17-20261005`, `calc-sidereal-2026-10-05` | same file |
| 762 | `## 0.1.1-rc.16 — unreleased candidate` (with `### New entry points` 822, `### The nutation` 962, `### Receipts` 1115, `### Sizes and budgets` 1130, `### Corrections` 1187) | yes (`ddbbaa0`, 2026-09-30) | npm, 2026-10-01, dist-tag `next`. The heading still says unreleased | #22 merged | `rc16-20260930` and the per-piece folders | `LINES-CHANGELOG-main.md` |
| 1195 | `## 0.1.1-rc.15 — unreleased candidate` | yes (`104bd5a`, 2026-09-29) | npm, 2026-09-30; GitHub tag and prerelease `v0.1.1-rc.15`, 2026-10-01. The heading still says unreleased | #20 merged | `rc15-20260929`, `time-2026-09-28`, `timing-hellenistic-2026-09-28`, `vedic-2026-09-28` | `LINES-CHANGELOG-main.md` |
| 1553 | `## 0.1.1-rc.14 — unreleased candidate` | yes (`03db4bb`, 2026-09-28) | npm, 2026-09-30. The heading still says unreleased | #10 merged | `rc14-20260928` | `LINES-CHANGELOG-main.md` |
| 1672 | `## 0.1.1-rc.13 — unreleased candidate` | yes (`f05ea02`, 2026-09-28) | no | see the line check | `rc13-20260928` | same file |
| 1743 | `## 0.1.1-rc.12 — unreleased candidate` | yes (`a1d0f2c`, 2026-09-28) | no | #8 merged | `rc12-20260928` | same file |
| 1764 | `## 0.1.1-rc.11` | yes (`be3585b`, 2026-09-28); a first packing at `00bdae7` is recorded as superseded | no | #7 merged | `rc11-20260928` | `LINES-CHANGELOG-main.md` |
| 1794 | `## 0.1.1-rc.10` | yes (`9c4f3fd`, 2026-09-26) | no | #5 merged | none of its own in this repository | same file |
| 1825 | `## 0.1.1-rc.9` | yes (`82aad2f`, 2026-09-26) | no | #4 merged | none of its own | same file |
| 1861 | `## 0.1.1-rc.8` | yes (`352ea49`, 2026-09-25) | no | #3 merged | none of its own | same file |
| 1905 | `## 0.1.1-rc.7` | yes (`6e14f3f`, 2026-09-24) | no | #1, #2 merged | none of its own | same file |
| 1936 | `## 0.1.1-rc.6 — unreleased candidate` | not in `artifacts/`; the site vendors it | no | predates this repository's pull requests | site: `docs/platform/evidence/site-engine-rc6` | same file |
| 1955 | `## 0.1.1-rc.5 — unreleased candidate` | not in `artifacts/`; the site vendors it | no | predates | site: `site-engine-rc5` | same file |
| 1979 | `## 0.1.1-rc.4 — unreleased candidate` | no archive found in either repository | no | predates | none found | same file |
| 2001 | `## 0.1.1-rc.3 — unreleased candidate` | no archive found | no | predates | none found | same file |
| 2015 | `## 0.1.1-rc.2 — unreleased candidate` | no archive found | no | predates | none found | same file |
| 2029 | `## 0.1.1-rc.1 — unreleased candidate` | not in `artifacts/`; the site vendors it | no | predates | site: `engine-rc1-pack.json`, `engine-release` | same file |

Headings not listed above as rows: none. The 31 `#`-level lines are the title,
the 23 `## ` release headings in the table and the 7 `### ` headings named
inside it. (Count check: `grep -c '^#' CHANGELOG.md` gives 31,
`grep -c '^## [0-9]'` gives 23 and `grep -c '^### '` gives 7.)

Observations from the inventory itself (also in `UNSUPPORTED.md` where a line
is contradicted):

1. Three headings say "unreleased candidate" for versions npm has carried
   since 30 September and 1 October 2026: 0.1.1-rc.14, 0.1.1-rc.15 and
   0.1.1-rc.16. `artifacts/README.md` and `README.md` on `main` do say they
   were published later. The GitHub release for rc.15 says the heading
   "describes when those notes were written".
2. Five headings (0.1.1-rc.7 to rc.11) carry no "unreleased candidate" suffix,
   yet none of the five was published anywhere.
3. 1.0.0 is on npm with no git tag and no GitHub release.
4. Versions that exist as archives but have no changelog heading:
   `0.1.0` and `0.1.1-rc.0` (vendored by the site only, `vendor/` there).
   Reason they are not line-checked: there is no changelog text for them.

## Candidates on unmerged branches (not on `main`, nothing published)

Each branch's `CHANGELOG.md` only adds lines to `main`'s
(`git diff origin/main origin/<branch> -- CHANGELOG.md` has no removed line).

| Branch | Head when read | Pull request | Entry it adds | Published? | Line check |
| --- | --- | --- | --- | --- | --- |
| `admin/engine-1.1.0-rc.6` | `ce4ba826cbb1a74206c679ff9fb0bb10da60d4ca` | #91, open, draft. **PR 91's test release** | `## 1.1.0-rc.6 (unreleased candidate)` | no: not on npm, no tag, no GitHub release | `lines-pr91-1.1.0-rc.6.md` |
| `admin/engine-1.1.0-rc.4` | `95f00e928ee2c36d962f6a4220e490ca8cc3f906` | #89, closed without merging, draft | `## 1.1.0-rc.4 (unreleased candidate)` | no | `LINES-branch-candidates.md` |
| `admin/engine-1.1.0-rc.5` | `a09110e51dfba1cfc8e06e522d73c57d147b7f0b` | #90, closed without merging, draft | `## 1.1.0-rc.5 (unreleased candidate)` | no | same file |
| `admin/engine-1.1.0-rc.7` | `406240c1975cbc6eb5a132315d6760d472f3ebd4` | #95, open, draft | `## 1.1.0-rc.7 (unreleased candidate)` (and it carries rc.6's entry) | no | same file |
| `admin/zod-65-engine-phase-1-replace-receipt-error-limits` | `255b615b03fd7e6530f7d33e63fd331aed297e29` | #92, open, draft (ZOD-65) | none: its `CHANGELOG.md` is identical to `main`'s | no | nothing to check; read only |

Older branches whose changelogs are earlier states of `main`'s and add no
heading of their own (`rc7-phase1`, `r44/conformance-0.2.0`,
`claude/record-1.0.0-publication`, `claude/release-1.0.0`, `rc2/main-first`,
`p41/de440`) were read for their headings only and are not line-checked
separately: every heading on them is on `main`.

The other open draft branches (`infra/*`, `bot/*`, `feat/*`, `codex/*`,
`audit/fable-job1-*`, `audit/fable-job2-*`, dependabot) were not searched for
changelog edits one by one. Reason: none is a release branch and none is named
in a release's pull request. This is a stated gap, not a finding.

## Release-note files other than CHANGELOG.md

| File | What it states about releases | Checked |
| --- | --- | --- |
| `artifacts/README.md` | One row per archive: digest, bytes, files, source commit, carrying commit, status; and prose on superseded local builds | The table's digests, sizes, file counts and source commits: `LINES-other-files.md`. The prose on superseded local builds overlaps the rc.14 and rc.15 changelog entries and is checked there where the changelog repeats it. |
| `artifacts/archives.json` | Machine record of the same | Used as evidence, and itself checked against the files (`LINES-other-files.md`). |
| `README.md`, lines 19 to 49 and 94 to 130 | Which version this is, what npm carries, which candidates were never published | `LINES-other-files.md` |
| `CITATION.cff` | States no version and no release date, on purpose, and that no DOI has been minted | `LINES-other-files.md`, row O-cff-01 (the DOI statement is out of date). |
| GitHub release `v0.1.1-rc.15` body | A copy of the rc.15 changelog entry with a preface | Compared with the changelog in `LINES-other-files.md` (rows O-rel-01 to 06). |
| Pull request 91's body | Describes test release 1.1.0-rc.6 | `lines-pr91-1.1.0-rc.6.md` |

## Other packages in the repository

| Path | Name and version | Published | Changelog or release note |
| --- | --- | --- | --- |
| `python/` | `zodiacs` 0.1.0a1 | PyPI, 2026-09-30 | None found. Not line-checked: no text to check. |
| `clients/python/` | `zodiacs-compute-client` 0.0.0 | no | none |
| `clients/typescript/`, `tools/cli/`, `tools/solar-terms/`, `tools/wheel/` | 0.0.0, private | no | none |
| `conformance/` | suite "0.2.0" (pull request #76) | not a package release | `conformance/RESULTS.md` and `DISCREPANCIES.md` are results, not release notes. Not line-checked. |
| `atlas/` | time atlas | not a package release | `atlas/CORRECTIONS.md` is a corrections log for the data, not a release changelog. Not line-checked; named here so the omission is explicit. |

## Evidence folders under `docs/evidence/` (29)

`1.0.0-20261011`, `1.0.0-rc.1-20261006`, `1.0.0-rc.2-20261006`,
`1.1.0-rc.1-20261026`, `1.1.0-rc.2-20261102`, `accessible-wheel-20261009`,
`agent-skill-20261001`, `birth-window`, `calc-api`, `calc-epochs-2026-10-06`,
`calc-sidereal-2026-10-05`, `checkpoint22-rc2-20261009`, `de440-20261110`,
`houses-extra-2026-09-29`, `nutation-2026-09-29`, `offline-cli-20261009`,
`rc11-20260928`, `rc12-20260928`, `rc13-20260928`, `rc14-20260928`,
`rc15-20260929`, `rc16-20260930`, `rc17-20261005`, `sky-chinese-2026-09-29`,
`solar-terms-20261009`, `techniques-2026-09-29`, `time-2026-09-28`,
`timing-hellenistic-2026-09-28`, `vedic-2026-09-28`. There is no folder named
for 1.1.0-rc.3: its evidence is `de440-20261110`. The folder for 1.1.0-rc.6,
`docs/evidence/1.1.0-rc.6-20261111/`, exists only on pull request 91's branch.
