# Draft: git tags and GitHub releases for 1.0.0, 1.1.0 and 2.0.0

**Status: a draft, nothing here has been run.** The owner approved preparing
the 1.0.0 draft on 13 November 2026 (ZOD-152). Creating tags and releases is
a separate step for the owner.

1.0.0, 1.1.0 and 2.0.0 were published to npm by the Release workflow (2.0.0
on 2026-11-21 as `latest`, Release run 44915599923; verified in
`docs/evidence/2.0.0-published-20261121/`). The repository has one tag and
one GitHub release, both named `v0.1.1-rc.15`.

## Files

- [1.0.0 release notes draft](v1.0.0-release-notes-DRAFT.md)
- [1.1.0 release notes draft](v1.1.0-release-notes-DRAFT.md)
- [2.0.0 release notes draft](v2.0.0-release-notes-DRAFT.md)
- [2.0.0 npm publish runbook](PUBLISH-2.0.0.md)

## Before tagging or publishing a GitHub release

1. **A published GitHub release mints a permanent Zenodo DOI.** The Zenodo
   integration is on for this repository: publishing `v0.1.1-rc.15` created
   record 23080134 within seconds. Publishing `v1.0.0`, `v1.1.0` or `v2.0.0`
   will create a new version under the concept DOI 10.5281/zenodo.23080133,
   from `.zenodo.json` at the tagged commit. It cannot be withdrawn. A release
   saved as a **draft** does not do this.
2. **No workflow runs on a tag or a release.** Release, JSR and PyPI
   publishing start only by hand (`workflow_dispatch`). The tag publishes
   nothing to npm.
3. **A tag should not be moved once pushed.** Check the target first. If the
   tag name already exists on `origin`, stop. The first check lists the
   remote tags.
4. **`.zenodo.json` gives the licence as MIT alone.** It says
   `"license": "mit"` at all three tag targets. Zenodo records one licence in
   that field, so the DOI record for any of these releases would list MIT
   alone. The package as distributed is `MIT AND CC-BY-4.0` (`LICENSING.md`).
   `CITATION.cff` explains why both licences apply. The owner can review
   this field before publishing. The release metadata comes from the
   tagged commit.

## Order

Publish 2.0.0 to npm first ([PUBLISH-2.0.0.md](PUBLISH-2.0.0.md)). Then tag
`v1.0.0`, `v1.1.0` and `v2.0.0` in version order, running the read-only
checks for each version first. Create each GitHub release as a draft and read
it on GitHub before deciding whether to publish it. If you don't want a DOI,
stop after the tag or draft-release step.

Run the commands from a checkout of `main` that holds this directory.
`--notes-file` reads from the working tree.

## v1.0.0

1.0.0 was published to npm on 2026-10-11 (`latest`) by the Release workflow,
run 38144970198, from commit `f8992a4c1dfedd9e69c0783e2c185e22580460f7`.

The release body starts with a short preface, then the 36-line changelog
entry copied unchanged from `git show f8992a4c1:CHANGELOG.md`. It runs from
the 1.0.0 heading dated 2026-10-11 to the line before `## 1.0.0-rc.2`.

### Commands

Check the target (read only):

```sh
git ls-remote origin 'refs/tags/*'             # stop if v1.0.0 exists
git fetch origin
git cat-file -t f8992a4c1dfedd9e69c0783e2c185e22580460f7        # commit
git show -s --format='%H %s' f8992a4c1dfedd9e69c0783e2c185e22580460f7
git show f8992a4c1dfedd9e69c0783e2c185e22580460f7:package.json | grep '"version"'   # "version": "1.0.0"
git show f8992a4c1dfedd9e69c0783e2c185e22580460f7:artifacts/zodiacs-engine-1.0.0.tgz | sha256sum
# c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6
npm view @zodiacs/engine@1.0.0 dist.shasum    # 72b7a0266f59a25a21f4c72f6a50f41e5784dc27
```

Step 1, the tag (lightweight, as `v0.1.1-rc.15` is):

```sh
git tag v1.0.0 f8992a4c1dfedd9e69c0783e2c185e22580460f7
git push origin v1.0.0
```

Step 2, the release, saved as a draft so that it can be read on GitHub first
(no Zenodo record is made by a draft):

```sh
gh release create v1.0.0 \
  --repo zodiacs-org/engine \
  --verify-tag \
  --draft \
  --title "1.0.0" \
  --notes-file docs/releases/v1.0.0-release-notes-DRAFT.md
```

Step 3, publish it to mint the Zenodo DOI. Use `--latest=false` for this
historical release.

```sh
gh release edit v1.0.0 --repo zodiacs-org/engine --draft=false --latest=false
```

Afterwards: record the release id, the publication time and the new DOI the
way the site's `docs/platform/evidence/engine-github-release-2026-10-01/`
recorded rc.15's, and add the DOI to `CITATION.cff` (its comment says to add
`version`, `date-released` and `doi` when a stable release is archived with
one).

To undo before step 3: `gh release delete v1.0.0 --repo zodiacs-org/engine`
and `git push origin :refs/tags/v1.0.0`. After step 3 the DOI stays.

### Choices left to the owner

- The target. `f8992a4c1` is the commit the package was published from and
  the merge of the release, which matches how `v0.1.1-rc.15` points at the
  rc.15 merge. The alternatives are the source commit `ca2c8ce` (what the
  archive was packed from) and the carrying commit `38d3185`.
- Whether to attach the archive as a release asset. `v0.1.1-rc.15` has none,
  and the notes link to `artifacts/` instead.

## v1.1.0

The Release workflow published 1.1.0 to npm on 2026-11-16 from
`322f8551bb6c4d37e8e6be8faa9bbaa14eee4081`, the merge commit for pull
request 104 on `main`. GitHub records that commit as the head of
[Release run 43865254867](https://github.com/zodiacs-org/engine/actions/runs/43865254867).
Its verification job rebuilt the carried archive byte for byte.

`package.json` at the target reads 1.1.0. The carried tarball matches the
SHA-256 in `artifacts/archives.json`. That manifest records the earlier
source commit `2496c28f273e1e99526490e857332fae44473367` used to pack the
archive. `artifacts/README.md` records that the archive's SHA-1 matches
npm's.

The release body in [v1.1.0-release-notes-DRAFT.md](v1.1.0-release-notes-DRAFT.md)
starts with a three-line preface. The changelog entry is copied verbatim
from the target commit and spans 47 lines, including the final blank
line. Run this comparison in Bash. A match produces no output.

```sh
diff <(sed -n '/^## 1\.1\.0 (2026-11-16)$/,/^## 1\.1\.0-rc\.13 /p' <(git show 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081:CHANGELOG.md) | sed '$d') \
     <(sed -n '/^## 1\.1\.0 (2026-11-16)$/,$p' docs/releases/v1.1.0-release-notes-DRAFT.md)
```

### Commands

Check the target (read only):

```sh
git ls-remote origin 'refs/tags/*'             # stop if v1.1.0 exists
git fetch origin
git cat-file -t 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081        # commit
git show -s --format='%H %s' 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081
# 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081 Merge pull request #104: Release 1.1.0
git merge-base --is-ancestor 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081 origin/main && echo ancestor
git show 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081:package.json | grep '"version"'   # "version": "1.1.0",
git show 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081:artifacts/zodiacs-engine-1.1.0.tgz | sha256sum
# 4e53cda9bd6ccb5f5581c2a9af2f2ae4010af2599f411ac5220425e0932e41ac
git show 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081:artifacts/zodiacs-engine-1.1.0.tgz | sha1sum
# 525acb8669983d1849ce5101f51667ec2ed962b4
npm view @zodiacs/engine@1.1.0 dist.shasum    # 525acb8669983d1849ce5101f51667ec2ed962b4
gh run view 43865254867 --repo zodiacs-org/engine \
  --json headBranch,headSha,conclusion
# main, 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081, success
```

Step 1, the tag (lightweight, as `v0.1.1-rc.15` is):

```sh
git tag v1.1.0 322f8551bb6c4d37e8e6be8faa9bbaa14eee4081
git push origin v1.1.0
```

Step 2, the release, saved as a draft so that it can be read on GitHub first
(no Zenodo record is made by a draft):

```sh
gh release create v1.1.0 \
  --repo zodiacs-org/engine \
  --verify-tag \
  --draft \
  --title "1.1.0" \
  --notes-file docs/releases/v1.1.0-release-notes-DRAFT.md
```

Step 3, publish the release if you want the DOI. This command marks GitHub's
1.1.0 release as latest. Check npm's current `latest` with
`npm view @zodiacs/engine dist-tags.latest` first. If npm lists a newer
version, use `--latest=false`.

```sh
gh release edit v1.1.0 --repo zodiacs-org/engine --draft=false --latest
```

If you publish it, record the release ID, publication time and DOI, then
update `version`, `date-released` and `doi` in `CITATION.cff` on `main`.

## v2.0.0

2.0.0 was merged to `main` on 2026-11-21 at
`01432be354d219dbc2d5609e05a9dd0bcfd313e0`, the merge commit for pull request
143 (`ZOD-345`), and published to npm on 2026-11-21 (`2026-11-21T14:48:09.646Z`,
`latest`) by [Release run 44915599923](https://github.com/zodiacs-org/engine/actions/runs/44915599923)
from commit `b70645c3b8b1bd47f81e4b427b15c11b6c569bd0` (verified in
`docs/evidence/2.0.0-published-20261121/`). Its archive
`artifacts/zodiacs-engine-2.0.0.tgz` (2,788,540 bytes, 101 files) was packed
from source commit `174437a534f4bf92ce5d5d1c99df0774d8855f13` and carried in
commit `fbcde2cbdb962baa1d0e5d60f6e45cc0b76c7e4f`.

`package.json` at both `01432be354d219dbc2d5609e05a9dd0bcfd313e0` and
`b70645c3b8b1bd47f81e4b427b15c11b6c569bd0` reads `2.0.0`, and the carried
tarball matches npm's bytes and the SHA-256 recorded in
`artifacts/archives.json`
(`6087d455276ba633eb0a2370c0a5f740ddd5b257c59b821f501c9b06d228a3e2`, SHA-1
`7364fedd67a01f9005d280b1b0c4c32183fb4968`). If you prefer to tag the exact
publishing commit `b70645c3b8b1bd47f81e4b427b15c11b6c569bd0` instead of the
PR 143 merge commit `01432be354d219dbc2d5609e05a9dd0bcfd313e0`, both carry
identical `package.json`, `CHANGELOG.md` and `artifacts/zodiacs-engine-2.0.0.tgz`.

The release body in [v2.0.0-release-notes-DRAFT.md](v2.0.0-release-notes-DRAFT.md)
starts with a three-line preface, followed by the 77-line changelog entry
(including the final blank line) copied verbatim from the target commit, and
one closing line pointing to `docs/migrating-to-2.md` at that commit. Run
this comparison in Bash. A match produces no output.

```sh
diff <(sed -n '/^## 2\.0\.0 (cut 2026-11-21)$/,/^## 2\.0\.0-rc\.6 /p' <(git show 01432be354d219dbc2d5609e05a9dd0bcfd313e0:CHANGELOG.md) | sed '$d') \
     <(sed -n '/^## 2\.0\.0 (cut 2026-11-21)$/,/^Migration guide for callers moving from 1\.1\.0:/p' docs/releases/v2.0.0-release-notes-DRAFT.md | sed '$d')
```

### Recommended order

1. Publish 2.0.0 to npm first using [PUBLISH-2.0.0.md](PUBLISH-2.0.0.md)
   (`version: 2.0.0`, `tag: latest`).
2. Run the read-only checks below.
3. Create and push the `v2.0.0` tag (Step 1).
4. Create the draft GitHub release (Step 2) and read it on GitHub.
5. Publish the GitHub release (Step 3) only if you want a Zenodo DOI minted
   (note item 4 at the top of this file regarding `.zenodo.json`).

### Commands

Check the target (read only):

```sh
git ls-remote origin 'refs/tags/*'             # stop if v2.0.0 exists
git fetch origin
git cat-file -t 01432be354d219dbc2d5609e05a9dd0bcfd313e0        # commit
git show -s --format='%H %s' 01432be354d219dbc2d5609e05a9dd0bcfd313e0
# 01432be354d219dbc2d5609e05a9dd0bcfd313e0 Merge pull request #143 from zodiacs-org/admin/engine-2.0.0
git merge-base --is-ancestor 01432be354d219dbc2d5609e05a9dd0bcfd313e0 origin/main && echo ancestor
git show 01432be354d219dbc2d5609e05a9dd0bcfd313e0:package.json | grep '"version"'   # "version": "2.0.0",
git show 01432be354d219dbc2d5609e05a9dd0bcfd313e0:artifacts/zodiacs-engine-2.0.0.tgz | sha256sum
# 6087d455276ba633eb0a2370c0a5f740ddd5b257c59b821f501c9b06d228a3e2
git show 01432be354d219dbc2d5609e05a9dd0bcfd313e0:artifacts/zodiacs-engine-2.0.0.tgz | sha1sum
# 7364fedd67a01f9005d280b1b0c4c32183fb4968
# After publishing to npm via PUBLISH-2.0.0.md:
npm view @zodiacs/engine@2.0.0 dist.shasum    # 7364fedd67a01f9005d280b1b0c4c32183fb4968
```

Step 1, the tag (lightweight, as `v0.1.1-rc.15` is):

```sh
git tag v2.0.0 01432be354d219dbc2d5609e05a9dd0bcfd313e0
git push origin v2.0.0
```

Step 2, the release, saved as a draft so that it can be read on GitHub first
(no Zenodo record is made by a draft):

```sh
gh release create v2.0.0 \
  --repo zodiacs-org/engine \
  --verify-tag \
  --draft \
  --title "2.0.0" \
  --notes-file docs/releases/v2.0.0-release-notes-DRAFT.md
```

Step 3, publish the release only if you want the Zenodo DOI:

```sh
gh release edit v2.0.0 --repo zodiacs-org/engine --draft=false --latest
```

To undo before Step 3: `gh release delete v2.0.0 --repo zodiacs-org/engine`
and `git push origin :refs/tags/v2.0.0`. After Step 3 the DOI stays.

### Follow-up edits if the v2.0.0 GitHub release is published

Publishing the `v2.0.0` GitHub release makes two repository edits due on
`main`:

1. `CITATION.cff`: add `version: "2.0.0"`, `date-released` (ISO date) and
   `doi` (the minted Zenodo DOI).
2. `docs/changelog-corrections.md`: add a "Not a correction, for the record"
   paragraph noting the `v2.0.0` tag, GitHub release ID, publication date and
   Zenodo DOI.
