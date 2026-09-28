# Carried archives

Each `zodiacs-engine-<version>.tgz` here is the exact `npm pack` output of one
candidate, with its SHA-256 receipt beside it. None is an npm publication.
Archives are immutable: once carried, an archive is never repacked, replaced or
removed.

**Rule: a version string names one byte sequence.** A change to anything the
package contains needs a new version before it is packed. `archives.json` is
the record: each archive's version, SHA-256, size, file count and the commit it
was packed from. CI enforces the rule with `npm run archive:binding`
(`scripts/verify-archive-binding.mjs`). The check reads git objects only, never
the working tree, and every commit reachable from HEAD, merged side branches
included, so it needs full history. It fails unless:

- in every commit, `artifacts/`, where present, is a real directory holding
  only regular files named `README.md`, `archives.json`,
  `zodiacs-engine-<version>.tgz` or `zodiacs-engine-<version>.sha256`: no
  symbolic link, subdirectory or other file;
- `archives.json` is append-only: every version of it committed anywhere in
  history is a prefix of HEAD's, entry for entry, and each commit's extends its
  parents'. Its superseded entries are exactly the ones pinned in the script:
  rc.11's first packing, allowed only in commit `00bdae7`, where it was
  committed;
- every archive in HEAD's tree has a carried entry whose digest, size and file
  count it matches, every carried entry's archive and receipt are in HEAD's
  tree with the receipt naming the recorded bytes, and this README lists every
  recorded digest;
- in every commit, each archive and receipt holds only its recorded bytes, and
  nothing ever committed under `artifacts/` is missing from HEAD;
- each archive's source commit is in the history of HEAD and names its
  version, the commit that introduces the archive is that source commit or a
  child of it, and the packed `package.json`, README, CHANGELOG, LICENSE,
  LICENSING.md and NOTICE are byte-identical to the source commit's;
- once the current version's archive is carried, a clean worktree of HEAD,
  built and packed, reproduces it byte for byte. With `--rebuild-all`, which a
  second CI job runs, every recorded archive is also rebuilt from its source
  commit and must match.

The check cannot detect history rewritten before CI sees it, and it relies on
merge commits. A squash or rebase merge rewrites the commits an archive's
`sourceCommit` names, and the check then fails; merge branches that carry
archives with a merge commit.

| Version | SHA-256 | Bytes | Files | Source commit | Carried in | Status |
| --- | --- | ---: | ---: | --- | --- | --- |
| 0.1.1-rc.7 | `49b2b03f50fea8a625d443d4fd0f6d03ffc22831e54009fd09c49d07c8698f90` | 39,252 | 23 | `6e14f3f7c5e3475fefce973a65ce4fc5d846ad85` | `f37dcdd` | Candidate, merged |
| 0.1.1-rc.8 | `3b934376fa53983cbdd7eb1a6ecf0eb0d50fbc49df01bc610b20c63bd5d12be6` | 51,748 | 30 | `352ea49d9e1d7b07975a050bb4877acc454f86f5` | `a5b7d1d` | Candidate, merged |
| 0.1.1-rc.9 | `bb5592302b1fa542cc745a9410b5a77faf49bbf4e205347ab771810efc300a20` | 55,576 | 30 | `82aad2fcc9b204a687e0b67f709681e62f9e889a` | `fa1050e` | Candidate, merged |
| 0.1.1-rc.10 | `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c` | 61,318 | 30 | `9c4f3fd77b5d6235288d9cdfc2ac1d183a5c4d6b` | `d0c5cd0` | Candidate, merged; the site's current pin |
| 0.1.1-rc.11 | `13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e` | 70,676 | 30 | `00bdae79a9256c2bba4294ed07af79e323c6cd66` | `00bdae7` | **Superseded before merge; never released.** Still reachable at that commit's raw URL. Not this file. |
| 0.1.1-rc.11 | `d88e0ff8db91e1183789763ad32feb2dac61716e35ad7676a943f7a1ad377862` | 70,989 | 30 | `be3585b3ebfeae1f69b56846b1cb6c31abf45735` | `be3585b` | Candidate, merged; the file `zodiacs-engine-0.1.1-rc.11.tgz` |
| 0.1.1-rc.12 | `c4cf150fe8fb0b37f5769993c2e63275b2e5ef47b97d8a118aff3be00ebaf7f0` | 73,398 | 30 | `a1d0f2c6cefb2e83df397195515fa0558cf31185` | `a1d0f2c` | Candidate, merged |
| 0.1.1-rc.13 | `12db9dce0f2c7551924b41caa5609f57bf31dfb9051a72901b94cdae29d3b840` | 79,092 | 30 | `f05ea02b3254ac5c00d203d64d2caf53e44c083a` | `4eee700` | Candidate, reviewed; its findings are addressed in rc.14 |

The two rc.11 rows are the one breach of the rule: the review repair in
`be3585b` replaced the archive first packed at `00bdae79` under the same
version. Only `d88e0ff8…` is rc.11; `13d637db…` must not be installed or cited
as rc.11. The check now allows those first bytes in `00bdae7` alone, and the
manifest cannot add another exception.

A first local build of rc.14, SHA-256
`5ed5ca1eebeb5a918ca0e37d80df78669a68c15af6cec6d33c9c8a590f683a02` (85,104
bytes, packed from `74a4471`), was never pushed or published and is not carried
here. Its review found ways past this check, a chart Sun flagged far from
J2000 and the ΔT attribution naming the wrong file, and it packed a
LICENSING.md that the merge of main then changed under the same version. rc.14
was rebuilt from the merged source with those fixes. See
`docs/evidence/rc14-20260928/`.

On 2026-09-28 every archive above was rebuilt from its source commit with
`--rebuild-all` and the locked toolchain (Node 22.22.2, npm 10.9.7) and matched
its recorded bytes. The record is in `docs/evidence/rc14-20260928/`.
