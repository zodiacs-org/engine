# Publication verification: @zodiacs/engine 2.0.0 (21 November 2026)

Read-only post-publish verification for `@zodiacs/engine` `2.0.0` (`ZOD-346`
Part B), run outside the checkout on Node `v22.22.2` against the public npm
registry (`https://registry.npmjs.org/@zodiacs/engine`).

## Workflow run and publication record

- **Workflow:** `.github/workflows/release.yml`
- **Run ID:** [44915599923](https://github.com/zodiacs-org/engine/actions/runs/44915599923)
  (triggered on `main` with `version=2.0.0`, `tag=latest` after the owner
  explicitly instructed "override ZOD-346 and trigger the release workflow
  yourself" at 2026-11-21 21:45 Asia/Bangkok under `AGENTS.md`)
- **Head commit (`github.sha`):** `b70645c3b8b1bd47f81e4b427b15c11b6c569bd0`
- **Verify the carried archive job:** `136880415942` (14:45:49 to 14:46:16 UTC, success)
- **Publish to npm job:** `136880545757` (14:46:21 to 14:46:35 UTC, success)
- **Registry publish timestamp (`time["2.0.0"]`):** `2026-11-21T14:48:09.646Z`
- **Registry dist-tags (checked 2026-11-21T14:49Z):** `{ latest: '2.0.0', next: '2.0.0-rc.3' }`
- **Sigstore transparency log:** `https://search.sigstore.dev/?logIndex=4033328100`

## Digest comparison (npm tarball vs carried archive)

`npm pack @zodiacs/engine@2.0.0` in a clean temporary directory downloaded
`zodiacs-engine-2.0.0.tgz` (2,788,540 bytes, 101 files, 4,782,240 bytes
unpacked). Every digest matches the carried archive and registry metadata
(`digests.log`, `view.json`):

| Digest | npm tarball / registry | Carried archive (`artifacts/zodiacs-engine-2.0.0.tgz`) | Match |
| --- | --- | --- | --- |
| SHA-256 | `6087d455276ba633eb0a2370c0a5f740ddd5b257c59b821f501c9b06d228a3e2` | `6087d455276ba633eb0a2370c0a5f740ddd5b257c59b821f501c9b06d228a3e2` | Exact (`OK`) |
| SHA-1 (`dist.shasum`) | `7364fedd67a01f9005d280b1b0c4c32183fb4968` | `7364fedd67a01f9005d280b1b0c4c32183fb4968` | Exact |
| SHA-512 (`dist.integrity`) | `sha512-CL7FCs8VsoiUu5CYVhWPvp1ZXnv7veuTDa1u19SxJKnGcuh8Tw7s0vFewKzRB+MdQwdRlGnT3fVyl8PmHgnmWw==` | `sha512-CL7FCs8VsoiUu5CYVhWPvp1ZXnv7veuTDa1u19SxJKnGcuh8Tw7s0vFewKzRB+MdQwdRlGnT3fVyl8PmHgnmWw==` | Exact |

Mutation check (`digests.log`): comparing npm's `2.0.0` tarball SHA-256
against `artifacts/zodiacs-engine-2.0.0-rc.6.sha256` (`59217e2b...`) and
`artifacts/zodiacs-engine-2.0.0-rc.4.sha256` (`6e334f19...`) both failed
(`false`), confirming the digest comparison detects mismatches.

## Consumer and provenance checks

- **Packed consumer (`packed-consumer.log`):**
  `node scripts/verify-packed-consumer.mjs` on npm's downloaded tarball on
  Node `v22.22.2` passed all runtime, fallback, `ERR_ZODIACS_ESM_ONLY` (20
  entries) and TypeScript `5.9.3` type checks.
- **Registry signatures and SLSA provenance (`audit-signatures.log`):**
  `npm audit signatures` in a fresh directory after `npm install @zodiacs/engine@2.0.0`
  reported `2 packages have verified registry signatures` and
  `1 package has a verified attestation`.
- **Attestation payload (`https://registry.npmjs.org/-/npm/v1/attestations/@zodiacs%2fengine@2.0.0`):**
  - `predicateType`: `https://slsa.dev/provenance/v1`
  - `subject`: `pkg:npm/%40zodiacs/engine@2.0.0` (`sha512`: `08bec50acf15b28894bb909856158fbe9d595e7bfbbdeb930dad6ed7d4b124a9c672e87c4f0eecd2f15ec0acd107e31d4307519469d3ddf57297c3e61e09e65b`)
  - `workflow`: `https://github.com/zodiacs-org/engine`, `.github/workflows/release.yml`, `refs/heads/main`
  - `resolvedDependencies[0].digest.gitCommit`: `b70645c3b8b1bd47f81e4b427b15c11b6c569bd0`

## Files in this folder

- `view.json`: `npm view @zodiacs/engine@2.0.0 --json`
- `digests.log`: dist-tags, SHA-256 / SHA-1 / SHA-512 comparisons and mutation checks
- `packed-consumer.log`: `verify-packed-consumer.mjs` run on npm's tarball
- `audit-signatures.log`: `npm audit signatures` output
- `github-releases-and-zenodo.json`: snapshot of remote tags, GitHub releases (`v1.0.0`, `v1.1.0`, `v2.0.0`) and Zenodo DOI records minted under concept DOI `10.5281/zenodo.23080133`

## Git tags, GitHub releases and Zenodo DOIs

Later on 2026-11-21, lightweight git tags and GitHub releases for `v1.0.0`,
`v1.1.0` and `v2.0.0` were published in version order under the owner's
delegation (`github-releases-and-zenodo.json`):

- `v1.0.0` (`f8992a4c`): GitHub release `453839576`, DOI `10.5281/zenodo.24423316`
- `v1.1.0` (`322f8551`): GitHub release `453839591`, DOI `10.5281/zenodo.24423325`
- `v2.0.0` (`01432be3`): GitHub release `453839610` (Latest), DOI `10.5281/zenodo.24423330`
