# Publish runbook: @zodiacs/engine 2.0.0

This runbook is for the owner to publish `@zodiacs/engine` `2.0.0` to npm as
`latest`. Publishing is irreversible: npm never allows a version number to be
used twice. No agent runs the release workflow, moves a dist-tag, creates a
git tag or creates a GitHub release.

The Release workflow (`.github/workflows/release.yml`) defaults its `tag`
input to `next`. Set `tag` to `latest` explicitly when publishing `2.0.0`.

## 1. Before anything

Confirm on a clean checkout of `main` that:

- `main` is at the merge commit of ticket 11 (`ZOD-345`, carrying
  `artifacts/zodiacs-engine-2.0.0.tgz`), and every workflow check on that
  commit is green on GitHub;
- `node scripts/verify-release-archive.mjs 2.0.0` passes locally on that
  commit:

```sh
git fetch origin
git checkout main
git pull --ff-only origin main
git show -s --format='%H %s' HEAD
gh run list --repo zodiacs-org/engine --commit "$(git rev-parse HEAD)"
node scripts/verify-release-archive.mjs 2.0.0
```

Read-only check of the current registry dist-tags before publishing (expect
`latest: '1.1.0'` and `next: '2.0.0-rc.3'`):

```sh
npm view @zodiacs/engine dist-tags
```

The zodiacs.org site pins `1.1.0`, so moving `latest` to `2.0.0` does not
change the live site.

## 2. Settings to check once

Verify these three settings in GitHub and npm before starting the workflow
(described in [CONTRIBUTING.md](../../CONTRIBUTING.md#releases)):

1. **GitHub environment `npm`**: exists before the run, allows deployments
   from `main` only, and keeps any configured required reviewers.
2. **npm trusted publisher for `@zodiacs/engine`**: names repository
   `zodiacs-org/engine`, workflow `release.yml`, environment `npm`, and allows
   `npm publish` (direct publishing, not only `npm stage publish`).
3. **Branch protection on `main`**: enabled and requiring status checks.

## 3. Run the Release workflow

Both options below run `.github/workflows/release.yml` on `main` with
**version `2.0.0`, tag `latest`**.

**Option A (GitHub Actions UI):** open **Actions**, select **Release**, click
**Run workflow**, keep branch `main`, and enter **version `2.0.0`, tag `latest`**
(change the `tag` field from its default `next` to `latest`).

**Option B (GitHub CLI):** trigger the same run for **version `2.0.0`, tag `latest`**:

```sh
gh workflow run release.yml \
  --repo zodiacs-org/engine \
  --ref main \
  -f version=2.0.0 \
  -f tag=latest
```

Watch the run with `gh run list --repo zodiacs-org/engine --workflow release.yml --limit 3`
and `gh run view <run-id> --repo zodiacs-org/engine`.

## 4. What a good run looks like

Both jobs in `release.yml` must succeed:

1. **Verify the carried archive**: checks `GITHUB_REF == refs/heads/main`,
   runs `node scripts/verify-release-archive.mjs 2.0.0`, installs with
   `npm ci`, and runs `node scripts/verify-archive-binding.mjs` to rebuild
   and verify `HEAD`.
2. **Publish to npm**: runs in environment `npm` with `id-token: write`,
   confirms npm is at least 11.5.1 and Node.js is at least 22.14.0, re-checks
   the carried archive, confirms `@zodiacs/engine@2.0.0` is not yet on npm
   (`E404`), and runs
   `npm publish "$GITHUB_WORKSPACE/artifacts/zodiacs-engine-2.0.0.tgz" --access public --tag latest --provenance`.
   The publish step prints `@zodiacs/engine@2.0.0` and a provenance statement.

If the run fails:

- **Verify fails archive-binding**: do not publish. Something changed on
  `main` after `ZOD-345`. Identify the commit before retrying.
- **Publish fails at "The version is not on npm yet" with a network error**:
  the step refuses to guess when the error code is not `E404`. Rerun the
  workflow once npm responds.

## 5. Straight after the run

Check the live dist-tags:

```sh
npm view @zodiacs/engine dist-tags
```

Expect `latest: '2.0.0'`. Note that npm's registry can lag for about a minute
after publish and return 404 briefly; wait and retry before assuming a
failure.

If `latest` is still `1.1.0` and `next` became `2.0.0` (because `tag` stayed
at its default `next`), fix it immediately by running:

```sh
npm dist-tag add @zodiacs/engine@2.0.0 latest
```

## 6. Optional: move the `next` dist-tag

After publishing under `latest`, `next` still points to `2.0.0-rc.3`, which
means `npm install @zodiacs/engine@next` would install an older build than
`latest`. Moving `next` is optional and the owner's choice:

```sh
npm dist-tag add @zodiacs/engine@2.0.0 next
```

## 7. Git tags and GitHub releases

After npm serves `2.0.0` under `latest`, follow
[docs/releases/README.md](README.md) to tag and create draft GitHub releases
in version order (`v1.0.0`, `v1.1.0`, then `v2.0.0` once its draft is merged
in `ZOD-343` Part B), keeping every release as a `--draft` until you have
read it on GitHub.

Zenodo warning: publishing a GitHub release permanently mints a Zenodo DOI
from `.zenodo.json` at the tagged commit (which lists `"license": "mit"` alone
even though the distributed package is `MIT AND CC-BY-4.0`); a draft release
mints nothing.

## 8. If something is wrong after publishing

Do not unpublish `2.0.0` (npm never allows re-using a version number). Run
these three steps yourself instead:

1. Point `latest` back to `1.1.0` (takes effect in seconds):

   ```sh
   npm dist-tag add @zodiacs/engine@1.1.0 latest
   ```

2. Warn installers with a deprecation notice:

   ```sh
   npm deprecate @zodiacs/engine@2.0.0 "<reason>"
   ```

3. Ship the fix as `2.0.1` through the normal candidate and release process.

## 9. You should not need a token

The Release workflow uses npm trusted publishing (OIDC via `id-token: write`
in the `npm` environment). No npm token is stored in the repository and no
step in `release.yml` should ask for one. If a workflow step asks for an npm
token, stop and inspect the npm trusted publisher configuration before
continuing.

## After publishing (Part B verification)

Once you report the workflow run ID and confirm `2.0.0` is live on npm, the
Part B post-publish check (`ZOD-346`) will run read-only verification in a
scratch directory outside the checkout (`npm view`, `npm pack`, SHA-256 and
SHA-1 digest comparisons against `artifacts/zodiacs-engine-2.0.0.sha256`,
`node scripts/verify-packed-consumer.mjs`, and `npm audit signatures`) and
open a small documentation pull request updating `artifacts/README.md`,
`docs/changelog-corrections.md`, `SECURITY.md` (with the exact date six months
after publication for `1.1.x` security fixes), and `docs/releases/README.md`.
