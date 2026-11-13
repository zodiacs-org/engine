# Draft: git tag and GitHub release for 1.0.0

**Status: a draft. Nothing here has been run.** There is no `v1.0.0` tag and
no GitHub release for 1.0.0. The owner approved preparing these on
13 November 2026 (ZOD-152); creating the tag and the release is a separate
step for a person to take.

1.0.0 was published to npm on 2026-10-11 (`latest`) by the Release workflow,
run 38144970198, from commit `f8992a4c1dfedd9e69c0783e2c185e22580460f7`. The
only tag and release the repository has is `v0.1.1-rc.15`.

## Files

- `v1.0.0-release-notes-DRAFT.md`: the release body. A short preface, then
  the 1.0.0 changelog entry copied unchanged from the target commit (36
  lines; `git show f8992a4c1:CHANGELOG.md`, from `## 1.0.0 — 2026-10-11` to
  the line before `## 1.0.0-rc.2`).

## Before running anything, know these three things

1. **A published GitHub release mints a permanent Zenodo DOI.** The Zenodo
   integration is on for this repository: publishing `v0.1.1-rc.15` created
   record 23080134 within seconds. Publishing `v1.0.0` will create a new
   version under the concept DOI 10.5281/zenodo.23080133, from `.zenodo.json`
   at the tagged commit. It cannot be withdrawn. A release saved as a
   **draft** does not do this.
2. **No workflow runs on a tag or a release.** Release, JSR and PyPI
   publishing start only by hand (`workflow_dispatch`). The tag publishes
   nothing to npm.
3. **A tag should not be moved once pushed.** Check the target first.

## Commands

Check the target (read only):

```sh
git fetch origin
git cat-file -t f8992a4c1dfedd9e69c0783e2c185e22580460f7        # commit
git show -s --format='%H %s' f8992a4c1dfedd9e69c0783e2c185e22580460f7
git show f8992a4c1dfedd9e69c0783e2c185e22580460f7:package.json | grep '"version"'   # "version": "1.0.0"
git show f8992a4c1dfedd9e69c0783e2c185e22580460f7:artifacts/zodiacs-engine-1.0.0.tgz | sha256sum
# c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6
npm view @zodiacs/engine@1.0.0 dist.shasum    # 72b7a0266f59a25a21f4c72f6a50f41e5784dc27
git ls-remote origin 'refs/tags/*'             # only v0.1.1-rc.15 before this
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

Step 3, publish it, which also mints the Zenodo DOI. `--latest` marks it as
the repository's latest release, as 1.0.0 is npm's `latest`:

```sh
gh release edit v1.0.0 --repo zodiacs-org/engine --draft=false --latest
```

Afterwards: record the release id, the publication time and the new DOI the
way the site's `docs/platform/evidence/engine-github-release-2026-10-01/`
recorded rc.15's, and add the DOI to `CITATION.cff` (its comment says to add
`version`, `date-released` and `doi` when a stable release is archived with
one).

To undo before step 3: `gh release delete v1.0.0 --repo zodiacs-org/engine`
and `git push origin :refs/tags/v1.0.0`. After step 3 the DOI stays.

## Choices left to the owner

- The target. `f8992a4c1` is the commit the package was published from and
  the merge of the release, which matches how `v0.1.1-rc.15` points at the
  rc.15 merge. The alternatives are the source commit `ca2c8ce` (what the
  archive was packed from) and the carrying commit `38d3185`.
- Whether to attach the archive as a release asset. `v0.1.1-rc.15` has none,
  and the notes link to `artifacts/` instead.
- Whether a release for a version one month old should be marked `--latest`,
  given that three 1.1.0 candidates follow it in the repository.
