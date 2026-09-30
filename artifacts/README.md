# Carried archives

Each `zodiacs-engine-<version>.tgz` here is the exact `npm pack` output of one
candidate, with its SHA-256 receipt beside it. None is an npm publication.
Archives are immutable: once carried, an archive is never repacked, replaced or
removed.

**Rule: a version string names one byte sequence.** A change to anything the
package contains needs a new version before it is packed. `archives.json` is
the record: each archive's version, SHA-256, size, file count and the commit it
was packed from. CI enforces the rule with
`node scripts/verify-archive-binding.mjs`. On a clean checkout with full
history, such as CI's, the check establishes that every archive ever carried
here holds only its recorded bytes and is what its recorded source commit
builds. It reads every commit reachable from HEAD, merged side branches
included, and fails unless:

- in every commit, `artifacts/`, where present, is a real directory holding
  only regular files named `README.md`, `archives.json`,
  `zodiacs-engine-<version>.tgz` or `zodiacs-engine-<version>.sha256`: no
  symbolic link, subdirectory or other file. No two names in it, and no other
  top-level name and `artifacts`, are one name once default-ignorable
  characters are removed and the rest is NFKC-normalized and case-folded, as a
  case-insensitive or normalizing file system could take them;
- `archives.json` is append-only: every version of it committed anywhere in
  history is a prefix of HEAD's, entry for entry, and each commit's extends its
  parents'. Its superseded entries are exactly the ones pinned in the script:
  rc.11's first packing, allowed only in commit `00bdae7`, where it was
  committed;
- every recorded version, every `<version>` in a file name here, and
  `package.json`'s version at HEAD is a strict semantic version: SemVer 2.0.0
  with no `v` prefix, no build metadata and no numeric identifier above
  9007199254740991 (`Number.MAX_SAFE_INTEGER`), beyond which npm compares
  distinct numbers as one. No two carried versions, and no carried version and
  HEAD's under another spelling, are equal as npm compares them (`semver.eq`);
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
- once the current version's archive is carried, HEAD, built and packed,
  reproduces it byte for byte. With `--rebuild-all`, which a second CI job
  runs, every recorded archive is also rebuilt from its source commit and must
  match.

**What it protects against:** commits that repack, replace, remove or
re-version a carried archive, rewrite the manifest, hide such a change on a
merged side branch, carry a second archive under a version npm takes for an
existing one, or change a packed file under a version already carried. When it
runs in a working checkout, nothing in that checkout beyond its git objects
decides the verdict: not its files or `node_modules`, not the tools `npm run`
puts on `PATH` from it, not a `TMPDIR` inside it, and not hooks, grafts,
replace refs or a commit-graph file in its `.git`.

**How:** it reads git objects only, with git's hooks off and grafts, replace
refs and the commit-graph file ignored. Each rebuild writes the commit's tree from git objects into a new
temporary directory outside the checkout, with no `node_modules` or
`package.json` at or above it, installs that commit's locked dependencies
there with `npm ci` (the npm cache may supply them), then builds and packs.
git and npm are the first found on `PATH` outside the checkout and never in a
`node_modules/.bin`, and every process the check starts runs with that `PATH`
and without `NODE_OPTIONS`, `NODE_PATH` or any `npm_*` variable. When
`NODE_OPTIONS` is set, the check first restarts itself in a new Node process
without it.

**What it does not protect against:** history rewritten before CI sees it; a
squash or rebase merge, which rewrites the commits an archive's `sourceCommit`
names and makes the check fail, so merge branches that carry archives with a
merge commit; a change to the check or to CI's workflow, which review must
catch; and whoever controls the machine that runs it (its git, Node and npm,
their system and user configuration, the git object store, the environment),
who can defeat any local check. `npm run archive:binding` reads the checkout's
`.npmrc` before the check starts, and that file can replace the command npm
runs, so CI starts the check with node directly.

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
| 0.1.1-rc.14 | `adc9805e22cd2468fa3340a864d9c53b36ff91e8f1592fdb35d8da8b69f4476e` | 87,415 | 30 | `03db4bb602377896283775920519b26d1f19a890` | `b221534` | Candidate, merged |
| 0.1.1-rc.15 | `24eeb597b0157598c0faa26bb615c0cb5dfaaeac0393d62c73fbd37c5da4d348` | 190,974 | 54 | `104bd5a56ee00356eecc75f15f0aa946f5a39f41` | `cbad72c` | Candidate, merged |
| 0.1.1-rc.16 | `43a72d30e483d8ff22024e403c4bd0d86d81bb6e1d0ad138f857cd001ab015d8` | 266,934 | 69 | `ddbbaa0b1d21e16834722f81e8708816849c6726` | "Carry the packed 0.1.1-rc.16 tarball" | Candidate under review |

The two rc.11 rows are the one breach of the rule: the review repair in
`be3585b` replaced the archive first packed at `00bdae79` under the same
version. Only `d88e0ff8…` is rc.11; `13d637db…` must not be installed or cited
as rc.11. The check now allows those first bytes in `00bdae7` alone, and the
manifest cannot add another exception.

Two local builds of rc.14 were superseded before publication. Neither was
pushed or published, and neither is carried here:

- the first, SHA-256
  `5ed5ca1eebeb5a918ca0e37d80df78669a68c15af6cec6d33c9c8a590f683a02` (85,104
  bytes), packed from `74a4471` and carried locally in `cca9f44`. Its review
  found ways past this check, a chart Sun flagged far from J2000 and the ΔT
  attribution naming the wrong file, and it packed a LICENSING.md that the
  merge of main then changed under the same version;
- the second, SHA-256
  `d3106eb39fcad0b0cee1ad9010c5b44c01acb8fc3a1bac28a84abf66bacee5e4` (86,867
  bytes), packed from `90d6cdb` and carried locally in `a4ee426`. Its review
  found three more ways past this check (a version that npm reads as an
  existing one, a rebuild decided by the checkout's `node_modules`, and a case
  variant of `artifacts/`) and wording errors in its packed README and
  CHANGELOG.

rc.14 was rebuilt with those fixes each time. See
`docs/evidence/rc14-20260928/`.

On 2026-09-28 every archive above through rc.13 was rebuilt from its source
commit with `--rebuild-all` and the locked toolchain (Node 22.22.2, npm 10.9.7)
and matched its recorded bytes; rc.14's source packed to the same bytes on Node
20.19.0, 22.22.2 and 24.21.0 before its archive was committed. After rc.14 was
carried, commits that change no packed file corrected the check as described
above; with it, `--rebuild-all` rebuilt all nine archives, rc.14's included,
byte for byte. The record is in `docs/evidence/rc14-20260928/`.

Three local builds of rc.15 were superseded before publication. None was
pushed or published, none is carried here, and the commits named in this
list are local commits that are not in this repository:

- the first, SHA-256
  `3651c525e98ff83e20a46bded84ede5ad1465dde22674830347bceed87c31309` (177,715
  bytes), packed from `d90a00a` and carried locally in `cc98060`. A review of
  its records found a Gregorian adoption table taken from Wikipedia (CC BY-SA)
  and GeoNames, living people's birth data in its tests, a root-isolation
  check that missed modules under other file extensions, receipts in rc.14's
  local-resolution shape refused, dashas dated on a TT chart's scale, and
  figures, size statements and breaking changes understated. A review of its
  time basis found UT1 read one second early inside leap seconds, 1972 taken
  as UT1 − UTC = 0, speeds divided by the wrong interval across steps of the
  time basis, 30 zone-line ends placed late, an order-dependent
  `zoneOffsetAt`, an expired leap-second list, birth keys differing only in
  letter case ignored, and receipt version gates that missed spellings such as
  0.1.1-rc.14.1;
- the second, SHA-256
  `554ed7eaeec6c6ca833a127f965a95959541e00679e282598cfa399e6bf6967e` (189,485
  bytes), packed from `8345003` and carried locally in `a1a9e95`, with those
  fixes. It was dropped before review for four wrong sentences in its packed
  CHANGELOG, README and LICENSING.md;
- the third, the re-cut, SHA-256
  `bddfb3b708076c2ccf592779c38f3e1bd7f840221f257dbbac01ce1d87459637` (189,575
  bytes), packed from `51f567e` and carried locally in `7daf832`, with those
  fixes and corrections. A re-check of it confirmed its archive and gates,
  and found living people's birth data in commits of its history that later
  commits had removed from the tree, a real person's birth still in three
  evidence files, a test title in a log that dated a birthday, two refusals
  missing from its changelog's breaking changes, a licensing status that did
  not name its open questions, and three statements that the code or its
  evidence contradicts.

The history was then rebuilt before the first push, so that no commit carries
that birth data. rc.15's source commit here holds the re-cut's code with the
re-check's corrections, and its archive differs from the re-cut's in
`CHANGELOG.md`, `LICENSING.md` and `NOTICE` alone. The ΔT model's step at
1941.0 stays, as a known limitation, because changing the model's values would
make valid rc.8 to rc.14 receipts fail validation. rc.15 adds opt-in entry
points and zone histories, so its archive is a little over twice rc.14's
(190,974 bytes, 668,343 unpacked); the package gate now budgets each entry
point and caps the whole (CHANGELOG.md). Before its archive was committed,
clean copies of its source commit's tree packed the same bytes on Node
20.19.0, 22.22.2 (twice) and 24.21.0, and clean clones of that commit packed
them on Node 22.22.2, 20.19.0 and 24.21.0. The record is in
`docs/evidence/rc15-20260929/`.

One local build of rc.16 was superseded before publication. It was neither
pushed nor published, it is not carried here, and the commits named here are
local commits that are not in this repository: SHA-256
`f73e55929d5b2daf64e781c078645839e1e83f0ce492989e09b0b569e59fe0bd` (262,109
bytes), packed from `b3c34d4` and carried locally in `6815110`. Its review
found preregistered size and scope gates that fail described as not
applying, and budgets raised after the results without saying so; three
figures in its packed CHANGELOG given for samples too sparse or for the
wrong band of latitude; the new entries' sources missing from its packed
LICENSING.md and NOTICE; a module of the sky entry missing from the root's
isolation check; a packed-consumer check that did not load two of the new
entry points; and smaller points.

rc.16 was rebuilt with those fixes before its first push. It brings five
opt-in entry points (`/calc`, `/window`, `/techniques`, `/houses` and
`/sky`), planetary returns in `/timing` and the engine's own full IAU 2000B
nutation onto rc.15; the sky branch's Chinese-calendar entry is held back.
Its source commit holds the local build's code with the review's fixes, and
its archive differs from that build's in `CHANGELOG.md`, `LICENSING.md` and
`NOTICE` alone. The archive is 266,934 bytes, 923,282 unpacked in 69 files,
under the package cap of 950,000 (CHANGELOG.md). It was packed once, after
the gates on its source commit's tree had passed: clean clones of that
commit, each installed with `npm ci`, packed the same bytes on Node 22.22.2,
20.19.0 and 24.21.0, and the carried file is the Node 22.22.2 one. The
record is in `docs/evidence/rc16-20260930/`.
