# Draft: git tags and GitHub releases for 1.0.0 and 1.1.0

**Status: a draft, nothing here has been run.** The owner approved preparing
the 1.0.0 draft on 13 November 2026 (ZOD-152). Creating tags and releases is
a separate step for the owner.

Both versions were published to npm by the Release workflow. The repository
has one tag and one GitHub release, both named `v0.1.1-rc.15`.

## Files

- [1.0.0 release notes draft](v1.0.0-release-notes-DRAFT.md)
- [1.1.0 release notes draft](v1.1.0-release-notes-DRAFT.md)

## Before tagging or publishing a GitHub release

1. **A published GitHub release mints a permanent Zenodo DOI.** The Zenodo
   integration is on for this repository: publishing `v0.1.1-rc.15` created
   record 23080134 within seconds. Publishing `v1.0.0` or `v1.1.0` will
   create a new version under the concept DOI 10.5281/zenodo.23080133, from
   `.zenodo.json` at the tagged commit. It cannot be withdrawn. A release
   saved as a **draft** does not do this.
2. **No workflow runs on a tag or a release.** Release, JSR and PyPI
   publishing start only by hand (`workflow_dispatch`). The tag publishes
   nothing to npm.
3. **A tag should not be moved once pushed.** Check the target first. If the
   tag name already exists on `origin`, stop. The first check lists the
   remote tags.
4. **`.zenodo.json` gives the licence as MIT alone.** It says
   `"license": "mit"` at both tag targets. Zenodo records one licence in
   that field, so the DOI record for either release would list MIT alone.
   The package as distributed is `MIT AND CC-BY-4.0` (`LICENSING.md`).
   `CITATION.cff` explains why both licences apply. The owner can review
   this field before publishing. The release metadata comes from the
   tagged commit.

## Order

Tag `v1.0.0` before `v1.1.0`, with the checks for each version first. Read
each draft release on GitHub before deciding whether to publish it. If
you don't want a DOI, stop after the tag or draft-release step.

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
