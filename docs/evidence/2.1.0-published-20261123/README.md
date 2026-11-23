# `@zodiacs/engine` 2.1.0 npm publication, GitHub release and Zenodo DOI evidence

Recorded on 2026-11-23 after publishing carried archive `artifacts/zodiacs-engine-2.1.0.tgz` via `.github/workflows/release.yml` (run `45205449248`) on `main` (`566f858dde594439d5f78724f1d2e2df595da2c6`).

## Publication summary

- **Package:** `@zodiacs/engine@2.1.0` (`latest` dist-tag on npm)
- **Release workflow run:** `https://github.com/zodiacs-org/engine/actions/runs/45205449248`
- **Sigstore transparency log:** `https://search.sigstore.dev/?logIndex=4053381011`
- **Git tag & GitHub release:** `v2.1.0` on `566f858dde594439d5f78724f1d2e2df595da2c6` (release ID `455617544`, published `2026-11-23T15:32:37Z`)
- **Zenodo DOI:** `10.5281/zenodo.24470679` (record `24470679`, under concept DOI `10.5281/zenodo.23080133`)

## Digest comparison (`digests.log`, `view.json`)

| Digest | npm tarball / registry | Carried archive (`artifacts/zodiacs-engine-2.1.0.tgz`) | Match |
| --- | --- | --- | --- |
| SHA-256 | `272bf36f705d033a19a5ad87e0e17113d6e53f96a02331cddefe7b41597b4afc` | `272bf36f705d033a19a5ad87e0e17113d6e53f96a02331cddefe7b41597b4afc` | Exact (`cmp: byte-for-byte identical`) |
| SHA-1 (`dist.shasum`) | `6e1e9ff0b67b09c1f02e7f217b7325049e62bb70` | `6e1e9ff0b67b09c1f02e7f217b7325049e62bb70` | Exact |

## Files in this directory

- `view.json`: `npm view @zodiacs/engine@2.1.0 --json`
- `digests.log`: `npm pack @zodiacs/engine@2.1.0` compared via `shasum -a 256`, `shasum -a 1`, and `cmp -s` against `artifacts/zodiacs-engine-2.1.0.tgz`
- `audit-signatures.log`: `npm audit signatures` on a clean install of `@zodiacs/engine@2.1.0` (2 verified registry signatures, 1 verified attestation)
- `github-releases-and-zenodo.json`: live Zenodo API record `24470679` paired with GitHub release `v2.1.0` (`455617544`)
