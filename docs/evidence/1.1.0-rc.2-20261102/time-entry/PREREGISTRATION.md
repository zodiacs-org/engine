# Preregistration: `@zodiacs/engine/time` in 1.1.0-rc.2 (finding F-53)

Engine 1.1.0-rc.2. Written on 2026-11-02 (ICT), before any code of the entry
exists. It is committed in commit P of the cut, together with the four other
preregistrations of 1.1.0-rc.2 and nothing else, as "Zodiacs Admin"
<admin@zodiacs.org>, before any code of the cut. Commit P is pushed alone, as
the first head of the draft cut pull request, so that the pull request's
timeline dates it; no formal run happens before commit P is on GitHub. After
commit P this text is never edited in place: an owner answer, or any other
change, is a dated amendment appended to section 11.

- **Written from** the draft `notes/rc2-2026-11-01/drafts/time/PREREGISTRATION-time.md`
  and its design `DESIGN-time.md` beside it (programme notes, not in this
  repository), with the corrections of the cut's plan
  (`notes/rc2-2026-11-01/drafts/critic/RC2-PLAN.md`, section 1) that concern
  this text: K5 (T8), K10 (this header), K12 (sparse clones; archive rebuilds
  in CI only), K15 (T9), K16 (section 3 and T9), K22 (S0 runs inside SR) and
  K24 (owner questions), with OQ14 for the birth-data search. Where the draft
  pointed to its design for a list that a check depends on, the list is
  written out here.
- **Line references** are to engine main a253973
  (`a2539735f99fe38f9623cd1101de96b8c5cdf0f0`) and site main 9a67f761
  (`9a67f761bc231741c6571af2dfae65b798954e11`) unless a line names another
  commit.
- **Reports and owner questions.** "Report n" is entry n, counted from 0, of
  the scoping journal `notes/rc2-2026-11-01/rc2-scope-journal-results.json`:
  report 0 the cut, 1 prior work, 2 the site adoption, 3 ΔT and F-53, 4
  vargas and KP, 5 the lite entry, 6 the scoping critic. Owner questions are
  the cut's OQ1 to OQ14 (section 13); each place an answer would change this
  file is marked **[OQn]**.

**Scope declaration.** The owner's rule for the engine repository, kept for
this file and for every step it fixes: never open, read, run, import, grep,
search or inspect
`docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`; explicitly
exclude `docs/evidence/calc-sidereal-2026-10-05/` from every recursive scan,
copy or archive; never pass a revision to `git grep`; add
`-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'` to any git command
that walks a tree; run `git status` only as
`git status --porcelain -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`.

- **The draft.** Every engine file was read in the sparse clone `engine-rc2`
  at `a2539735f99fe38f9623cd1101de96b8c5cdf0f0`, without
  `docs/evidence/calc-sidereal-2026-10-05/`, which every scan excluded; its
  `tools/ayanamsa_rates.py` was never opened, read, run, imported, searched
  or inspected. The site was read with `git show origin/main:<path>` at site
  main `9a67f761bc231741c6571af2dfae65b798954e11`.
- **Commit P.** Made in the same clone, whose sparse checkout leaves
  `docs/evidence/calc-sidereal-2026-10-05/` off the disk. The clone's local
  identity, "Zodiacs Admin" <admin@zodiacs.org>, was set with
  `config user.name` and `config user.email` just before the writing began.
  Every git command run there that walks a tree carried the exclusion pathspec
  above; no `git grep`, `log -p` or `archive` ran; directories were listed by
  name, never recursively, and the excluded folder appears in none of the
  listings; no file inside it was opened or read. The commit was amended before
  any push, to correct these texts after two reviews.
- **The runs below.** They keep the rule: no tool here walks the repository;
  each reads named files only. Where a run must compare revisions, it uses
  `git rev-parse <revision>:<path>` on named paths, or `git diff --name-only
  <a> <b> -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`, never
  `git show`, `git log -p`, `git archive` or `git diff` of a revision without
  that pathspec. Every clone used for a build, a pack, a gate or a run is
  `engine-rc2` itself or a sparse clone made as `git clone --no-checkout
  --no-local <repository> <dir>`, then `git -C <dir> sparse-checkout set
  --no-cone '/*' '!/docs/evidence/calc-sidereal-2026-10-05/'`, then
  `git -C <dir> checkout --detach <commit>`; never a plain clone or a
  worktree. Archive rebuilds (`node scripts/verify-archive-binding.mjs
  --rebuild-all`, and the same check on the carrier commit, which writes
  every file of each rebuilt tree from git objects) run only in CI's jobs,
  whose run ids the gate record cites.
- **The private birth-data search.** It runs before every engine push, counts
  only, and the release state of section 9 needs those pushes. The scanner
  the owner approved excludes only the one file named above, not the folder,
  so on the engine it runs only with the whole folder excluded and only once
  the owner has answered OQ14 (section 13). Until then no engine push is
  made.

## 1. The gate as the ledger words it

There is none. F-53 is a finding, not an acceptance unit: the site's
`docs/platform/programme/acceptance-ledger.json` (site main 9a67f761) holds no
unit for it, and it carries no weight. Its closing condition is the finding's
own text. FINDINGS.md line 122 gives the disposition "open: an export in the
engine's next candidate", and leaves to the owner the line of the site's
instructions for coding agents that names the generated module; the section at
line 348 gives the fix plan "An export in the engine's next candidate, after
which the generated module goes". The update at line 462 adds that rc.16
"still lacks public time-basis, frame-of-date and nutation exports" and that
"A supported package export remains the remedy".

The export must not disturb three accepted units, whose gates the ledger words
so (each `accepted`, release `deployed`):

| unit | gate (verbatim) | ledger line |
| --- | --- | --- |
| P1.M3a | "UTC→TT through a leap-second table; tests at leap-second boundaries" | 474 |
| P1.M3b | "UT1−UTC from finals with predictions; ±0.9 s fallback band; sidereal time uses it" | 492 |
| P1.M3d | "receipt fields present and validated" | 523 |

P1.M3c ("per-body longitude uncertainty and event-time bands derived from
σ(ΔT)", line 510, `not-started`) has its own preregistration in this cut
(`docs/evidence/1.1.0-rc.2-20261102/time-bands/PREREGISTRATION.md`). If its
`timeBands` is exported from `./time`, this file checks only what it checks
for the whole entry (export list, closure, size).

The brief (ENGINE-AND-PLATFORM-BRIEF.md, §6 item 12 and §7 item 1) keeps
preregistration mandatory for claims of superiority, completeness, accuracy or
bound, and asks ordinary fixes for ordinary tests with named cases. F-53 is
the second kind. This file preregisters anyway, because prototypes of the entry
were built and measured during scoping (section 3) and because its checks
claim bit identity.

## 2. The reading this cut is judged by

- **R1, "an export in the engine's next candidate".** 1.1.0-rc.2's
  `package.json` exports `./time` **[OQ2]**, with a budget, an API report and
  documentation. Its runtime exports are exactly `DELTA_T_IERS_MODEL`,
  `EPHEMERIS_SPAN`, `TIME_SCALE_NAMES`, `eclipticFrame`, `eclipticOfDate`,
  `elapsedDays`, `meanEcliptic`, `tilt` and `timeBasis` (with P1.M3c's
  default, also `timeBands`). Its declarations are exactly these 18 names:
  the nine values above and the types `DeltaT`, `DeltaTSegment`,
  `EclipticFrame`, `LeapSeconds`, `Tilt`, `TimeBasis`, `TimeScale`,
  `TimeScaleName` and `Ut1MinusUtc`; with P1.M3c's default also `TimeBands`
  and `timeBands`, 20 in all. The seven names of the site's generated module
  are among them.
- **R2, "loads no ephemeris".** Statically, the entry's graph reaches no module
  that imports astronomy-engine and no specifier outside `dist/` (T2, T13); at
  run time, it loads and computes in a Node with no astronomy-engine installed
  and with module-syntax detection off (T3).
- **R3, "equals what the site carries today".** Value for value, with
  SameValue on every number (so bit for bit, with no tolerance), against the
  module the site commits (T4) and against the candidate's own `natalChart`
  (T5); byte for byte at the source (T6); and with compatible declarations
  (T12).
- **R4, "the functions the engine computes with".** The entry's graph holds
  one copy of the time basis, the UT1 table and the ΔT model, shared with the
  root (T8); every argument the wrappers accept gives the internal function's
  result (T4, T5); arguments they refuse throw `RangeError`, and the frame they
  return is a frozen copy (T10); the entry adds no module state (T11).
- **R5, "after which the generated module goes".** The site's adoption runs
  the parity checks with the old module still in place (S1, S1b), then deletes
  the module, its declarations, its generator and the CI step, with every
  site check passing (S2). The line of the site's instructions for coding
  agents that names the module is the owner's to remove **[OQ12]**.
- **R6, closed.** Production serves the site build that imports `./time` (S3),
  and FINDINGS records the merge commit and the deployment id **[OQ7]**.

The frame functions (`eclipticFrame`, `meanEcliptic`) are public, with no
`@experimental` tag, by default **[OQ2]**; marked experimental, they carry
the tag and T1's list is unchanged.

## 3. Runs made before this file, and ratification

Made during scoping on 2026-11-01 (journal
`notes/rc2-2026-11-01/rc2-scope-journal-results.json`): report 3 built the
variants M, MF, MF2 and A and measured their graphs (`./time` 18,931 bytes
for M and 40,240 for MF; per-graph changes; package growth); report 6's
combined build measured `./time` at 40,315 bytes in 7 files and found that
"./lite and ./time reach no astronomy-engine"; the real package-contents check
passed there with trial budgets. Report 3 also ran P1.M3c's band checks
(G1 to G4), which belong to that unit.

**Two size figures that do not reconcile.** Report 3 says P1.M3c's
`timeBands` compiles to a 398-byte chunk shared by `./calc` and `./time`, yet
report 6's `./time` with the bands (40,315) is only 75 bytes more than MF's
without them (40,240). The prototypes are gone, so the difference cannot be
traced. This file therefore fixes a measurement instead: at the P1.M3c
commits `./time` is measured with and without the `timeBands` re-export
(T9), and if `./time` measured with the re-export is over 42,400 bytes the
bands are exported from `./calc` only, the fallback that OQ5's item on the
home of `timeBands` names. That rule is fixed now, before any build, so it
is not a post hoc reading.

Not made: the journal records no run comparing an export with the site's
module or with `natalChart` (T4, T5); report 3 lists the `natalChart`
comparison only as a site gate to run later (its G8). T3, T6, T7 through the
entry, T10, T11 and T12 never ran. No seed was drawn for this entry.

Chosen after those runs: the layout MF, chosen after measuring M, MF, MF2 and
A; the ceiling 42,400, chosen after measuring 40,315; and the static half of
R2, whose prototype result was seen.

**Statement.** Any reading in this file that was chosen after those runs
counts as validated, not accepted, until the owner ratifies it **[OQ5]** (site
`docs/platform/programme/README.md`, *Status and release*, lines 92 to 94: "A
gate that passes only under an amendment adopted after its residual was seen
counts as `validated`, not `accepted`, until the owner ratifies the
amendment"; DECISIONS-2026-10-05 §4: the programme does not ratify its own
reading proposed after seeing the results, even under a general delegation).
F-53 has no unit, so until the owner ratifies, the programme records it as
"fixed in 1.1.0-rc.2 and deployed; readings awaiting ratification", not as
closed.

## 4. Fixed inputs

**Engine sources at a253973** (the tree that rebuilds 1.1.0-rc.1's carried
archive byte for byte, report 0):

| path | git blob | SHA-256 |
| --- | --- | --- |
| `src/time-scale.ts` | `f7db33bb6390ad5766cad33400c5001e30f4352f` | `6358ab9f119f55e367b7a8cb601c0ed2a6fa0a1b083a8e48b2aa59cd96c7b9d6` |
| `src/time-scale-data.ts` | `5615b94de7dd4f84c850e404ee7bff55a8c865ba` | `44c6b80db298e55a050b59cb75975ba2059abb775b16b849022ee5a5849280a0` |
| `src/deltat.ts` | `38192fa5dc4f1f947d6b18e2179b2418e6ce68cf` | `2ce7e227bdf0e75bc2401793b8b09ed4113d80d8845376fbec7d0129c12f8b27` |
| `src/reference-span.ts` | `9d607a3dcb5ceaabfe31d198681d75b857276c31` | `5bce5a05494448a5740027c078527ab4fb7b0c02f71ff83465c01fd085a4d996` |
| `src/nutation.ts` | `e25e9e2928d983fad78aa81c5cc4a84cbf419400` | `c11af594d4e8ad64e0a7ff1097505063c70812d2da84e14a6c0280d4841e62b0` |
| `src/frame.ts` | `6657c7ee2c399620bc3ed84bcf55f1a95b077b99` | `98d0bee44839b23d3ec64dac470e31ab8e366c6907d325a4259f8f37285a7c50` |

Two functions of other modules, as text: from the line that begins `export
function <name>` to the first line that is exactly `}`, each line ending with a
newline (`awk '/^export function <name>/,/^}/'`), SHA-256:
`meanObliquity` in `src/houses.ts`,
`34119d1f24d214feb94f6a5d401bbdfcc3e4662067250c3058af4c3bf2734777`;
`normalizeLongitude` in `src/signs.ts`,
`c515faf25565b74111049e7a2ab15c6a1019c81f4099212e5b832bb4d818e99e`.

**Build tools** (`package-lock.json` at a253973): tsup 8.5.1, esbuild 0.27.7,
TypeScript 5.9.3; astronomy-engine 2.1.19.

**Tables the records name:** UT1 table version 2026-09-24, digest
`064d98b4a531053a`; ΔT table version 2026-09-24, digest `6371988c510a1c6c`;
leap-second list SHA-256
`db5a895f16853b03bfc865e8d68f9fc8710ef1740e3400c701cd46a5bbbc3433`, expiring
2027-06-28. This cut refreshes none of them. **[OQ13: a refresh would change
the pins of `src/time-scale-data.ts` and `src/deltat.ts` and every value after
2026-09-24; this file is then amended before code, under section 11]**

**What the site carries** (site main 9a67f761):

| path | git blob | SHA-256 | bytes |
| --- | --- | --- | --- |
| `src/lib/engine/time-basis.mjs` | `60bdcb5e006d79ff53a5100a4f60084fecdda0e9` | `5857c888df07dd5a1695273797632ea8736f37a26aad2fe908b3d857d2333f40` | 26,217 |
| `src/lib/engine/time-basis.d.mts` | `1a3fa79a1f5ebd1522b89a4662d90465a5d7d27f` | `8cc3670eb2aae747a2e22e667633594b8d24f7f6982dfcee2c0ffc2a2cff6ff9` | 2,711 |

The module's header names the archive it was cut from,
`vendor/zodiacs-engine-1.1.0-rc.1.tgz`, SHA-256
`52352d3f8fde4a262483e4a5a6217e02d814aa53269b49c0333325e6c0d6a7b6`. Tools
take the site file's path as an argument, refuse it unless its SHA-256 is the
pin, and load it from a temporary copy, as the site's generator does; nothing
of the site is committed to the engine.

**Independent references, committed in the engine repository** (no download):

| file | what | SHA-256 |
| --- | --- | --- |
| `conformance/sources/l2/Leap_Second.dat` | IERS Bulletin C, through Bulletin 72 (July 2026) | `6cb6f5d4b819f2e568e25db4b0b26d89dedf031fdffb18bc94d40f4e94e268d7` |
| `scripts/time-scale-sources/finals2000A-20260924-ut1.csv.gz` | MJD, flag, UT1 - UTC and formal error of the 19,997 finals2000A.all rows of 2026-09-24 | `b741c4e051866897a60c54f870ef08f329b7f177655f46baa7c92a0a5badb6e1` |
| `scripts/time-scale-sources/eopc04-1972.txt` | the header and the 367 EOP 20 C04 days of 1972 and 1973-01-01 | `e85f6211d216b8dc1988fddef6da9c079c522e1e4830fda3ac9a4639fe317d55` |
| `src/fixtures/nutation-erfa.json` | pyerfa 2.0.1.5 (ERFA 2.0.1) at 101 TT instants from 1800 to 2200, tolerances fixed when the file was generated, before the engine was run against it (`docs/evidence/nutation-2026-09-29/tools/erfa_fixtures.py`) | `2719dd382310ca5514db0577fc4b3607e99edd941111f0f872957125b4713604` |

**Environment.** Node 22.22.2 from
`toolchain/node-v22.22.2-darwin-arm64/bin` for every run unless a check says
otherwise; Node 20.19.0 from `toolchain/node-v20.19.0-darwin-arm64` for T3's
second runtime; darwin-arm64. One heavy job at a time. Each bit comparison
runs both sides in one process, so it holds on any machine and claims nothing
about agreement across machines.

## 5. Corpora

- **K1, the site generator's instants** (`scripts/build-time-basis.mjs`
  `checkInstants`, site main): every tenth day at 12:00 UTC from
  1800-01-01T12:00Z while before 2200-01-01T00:00Z (14,610 instants), and 31
  edges at -1,000, -1, 0, +1 and +1,000 ms (155 instants): 1972-01-01,
  1973-01-02, 2027-10-02, 2027-06-28 and the first day of 1972-07, 1973-01,
  1974-01, 1975-01, 1976-01, 1977-01, 1978-01, 1979-01, 1980-01, 1981-07,
  1982-07, 1983-07, 1985-07, 1988-01, 1990-01, 1991-01, 1992-07, 1993-07,
  1994-07, 1996-01, 1997-07, 1999-01, 2006-01, 2009-01, 2012-07, 2015-07 and
  2017-01, each at 00:00 UTC. 14,765 instants.
- **K2, seeded instants.** mulberry32 with seed **531102** (fresh; not
  20261101, 424242 or 7), exactly:

  ```js
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ```

  From one stream, in this order: K2a, 50,000 instants `Math.floor(lo + u *
  (hi - lo))` with lo = -5,364,662,400,000 (1800-01-01T00:00Z) and hi =
  7,258,118,400,000 (2200-01-01T00:00Z); K2b, 50,000 instants the same way
  with lo = -8.64e15 and hi = 8.64e15 (the Date range); then V2, 10 unit
  vectors, each from three draws `2u - 1`, redrawn while the norm is under 0.1
  or over 1, then normalized.
- **K3, seams not in K1**, at -1,000, -1, 0, +1 and +1,000 ms: 2026-09-24T00:00Z
  (the UT1 table's last observed day and the ΔT table's `observedTo`);
  2027-10-02T00:00:00.148Z (the farthest a UT1 or TT instant's UTC reaches past
  the table, docs/time.md); -915,170,400,000 (1941.0 on UT1, where the ΔT
  spline gives way to its knots); -441,806,400,000 (1956.0); -84,889,944,000,000
  (year -720.0); -62,125,272,000,000 and 64,018,728,000,000 (the ends of
  `EPHEMERIS_SPAN`, read as TT); and the two ends of the Date range,
  -8.64e15 and 8.64e15, only at the offsets that stay inside it. 41 instants.
- **K4, the ERFA instants**: the 101 `epochs[].tt` of
  `src/fixtures/nutation-erfa.json`.
- **V, vectors**: the five directions of `src/nutation.test.ts` ([1, 0, 0],
  [0, 1, 0], [0, 0, 1], [0.36, -0.48, 0.8], [-0.6, 0.64, -0.48]) and V2.
- **Settings**: each instant on the scales `"utc"`, `"ut1"` and `"tt"`, each
  without a pin and with the pins 69.184 and -1.5 seconds.

## 6. Checks on the candidate

Each check runs on the source commit's build and again on the carried archive
(the carrier's gates, run locally in sparse clones; the archive rebuilds run
only in CI, section 0). Its outputs are committed under
`docs/evidence/1.1.0-rc.2-20261102/time-entry/results/`. A control is a run
that must fail; if a control passes, the check is broken and its result does
not count until it is fixed and both are run again.

| check | what passes | control that must fail | reference | download |
| --- | --- | --- | --- | --- |
| T1 export list | runtime keys of `@zodiacs/engine/time` equal R1's list; `api/time.api.md` declares exactly R1's 18 names (20 with P1.M3c); `npm run api:check` passes | the same comparison against R1's list less `elapsedDays`; and `api:check` on a scratch copy of `api/time.api.md` with one character changed | this file | none |
| T2 static closure | `checkSelfContained("time")` with no external allowed; the entry's `sources` (`staticGraph`) are exactly `src/time.ts`, `src/time-scale.ts`, `src/time-scale-data.ts`, `src/deltat.ts`, `src/reference-span.ts`, `src/nutation.ts`, `src/frame.ts`, `src/houses.ts`, `src/signs.ts` (and `src/time-bands.ts` with P1.M3c); its `held` and `marked` modules include neither `src/ephemeris.ts` nor `src/api.ts`, no module that imports astronomy-engine, and no `OPT_IN_SOURCE` module but `src/time.ts` and `src/time-bands.ts` | `checkSelfContained("index")` with no external allowed; and `checkSelfContained("time")` on a scratch copy of `dist/` whose `time.js` starts with `import "astronomy-engine";` | the build's module list and markers | none |
| T3 run-time closure | in a scratch consumer holding only the extracted package (no dependency installed), `node --no-experimental-detect-module` on 22.22.2 imports `@zodiacs/engine/time`; `timeBasis(Date.UTC(2017, 0, 1))` gives `timeScale.leapSeconds.taiMinusUtc` 37 and `deltaT.model` `"iers-utc/1"`; `eclipticOfDate(1, 0, 0, 0)` gives finite numbers. The same on 20.19.0, with the flag if that runtime accepts it, else without it, recorded | in the same consumer, `import("@zodiacs/engine")` rejects with `ERR_MODULE_NOT_FOUND` naming `astronomy-engine` | Node itself | none (toolchains on disk) |
| T4 site module, value for value | over K1, K2 and K3 on every scale and setting: `timeBasis` records `isDeepStrictEqual`; `elapsedDays` over ±86,400 ms and ±21,600,000 ms around each K1 and K3 instant on each scale (days 0.002 and 0.5), `Object.is`; at the TT of every unpinned UTC record and of K4: `tilt`, `eclipticFrame` (`tt`, `rows`, `tilt`), `meanEcliptic` and `eclipticOfDate` of every vector of V, equal number for number; `EPHEMERIS_SPAN` deep-equal. Zero differences | the same run (a) against a temporary copy of the site module without the last leap second (`[57754,37]` removed): it must report differences on UTC records from 2017-01-01 to 2027-10-02; (b) against a copy whose first nutation coefficient `-172064161` reads `-172064160`: frame differences at most TTs while every time-basis record still agrees; (c) comparing `timeBasis(ms)` with the module's `timeBasis(ms + 1)`: a difference at every instant | the site's committed module, 1.1.0-rc.1's own code: an identity (regression) check, not accuracy evidence | none |
| T5 `natalChart`, value for value | over K1 and the first 2,000 instants of K2a: `timeBasis(ms, "utc")` gives `natalChart({ utc, timeKnown: false })`'s `deltaT` and `timeScale`, `isDeepStrictEqual`; astronomy-engine's vectors taken as the site's generator takes them (its ΔT held at `basis.deltaT.seconds`, time made at `basis.ut1Days`, `GeoVector(body, time, true)` for the Sun and eight planets, `GeoMoon`, the node from `GeoMoonState` through `eclipticFrame` and `meanEcliptic`) and turned by the entry give each of the 12 bodies' longitudes, `Object.is`. Counts: 16,765 records, 201,180 longitudes | the same run (a) with astronomy-engine's own `Ecliptic()` (its five-term nutation) in place of `eclipticOfDate`: longitudes must differ at most instants; (b) with `natalChart` given `deltaT` 1 ms off the basis: every record must differ | the candidate's root, the same engine: identity, not accuracy | none |
| T6 source, byte for byte | at the source commit, `git rev-parse <commit>:<path>` gives the six blobs of section 4; the two function texts hash to their pins; tsup, esbuild and TypeScript in `package-lock.json` are the versions of section 4 | the same comparison for `src/types.ts`, which the version bump changes; and a scratch copy of `src/frame.ts` with one byte appended | a253973's tree | none |
| T7a leap seconds | for each of the 28 changes of `Leap_Second.dat`: `timeBasis` at 0h UTC gives the new TAI - UTC and, 1 ms before, the previous one; TT - UTC is TAI - UTC + 32.184 s within 1e-6 s; listed until 2027-06-28 and not from it. 58 checks (28, 27 and 3, as rc.15's `leap-seconds.mjs` counts) with 0 failures | the same run against a copy of `Leap_Second.dat` whose last value reads 36 | IERS Bulletin C 72 | none |
| T7b UT1 - UTC | `timeBasis(0h UTC of each row)`'s `ut1MinusUtc.seconds` is within 0.00079 s (`UT1_DATA.bound`) of each of the 19,997 finals2000A.all values and within 0.00066 s of each of the 367 C04 values, parsed as `src/time-scale.test.ts` lines 200 to 215 parse them | the same run with every reference value 1 ms larger | IERS finals2000A.all and EOP 20 C04 | none |
| T7c nutation and frame | at K4, `tilt`'s Δψ and Δε within 1e-10″ of the fixture, its mean obliquity within 1e-9″, its equation of the equinoxes within 5e-5″; `eclipticOfDate` turns the five directions of V within 5e-6″ of the fixture's matrix (the angle of `src/nutation.test.ts` lines 177 to 206) | the same run with `tilt(tt + 1)` (a day later): Δψ must miss its tolerance | ERFA 2.0.1, committed fixture | none (pyerfa not needed) |
| T8 one copy | `"zodiacs-deltat/1"`, `"064d98b4a531053a"` and `-172064161,` each occur in exactly one file of `dist/*.js`, JavaScript files only, as `scripts/verify-package-contents.mjs:328` counts them (in 1.1.0-rc.1's archive `zodiacs-deltat/1` is also on four lines of `dist/deltat.d.ts` and one of a shared declaration file, which a correct build keeps); under S the last occurs in two, the shared chunk and the frame file; each holder is in `dist/time.js`'s static graph; `time.EPHEMERIS_SPAN === engine.EPHEMERIS_SPAN`; `time.DELTA_T_IERS_MODEL === engine.DELTA_T_IERS_MODEL`; `TIME_SCALE_NAMES` frozen and equal to `["utc", "ut1", "tt"]` | a scratch copy of `dist/` whose `time.js` is an esbuild bundle of `src/time.ts` without splitting: two holders, and the span identity false | the build | none |
| T9 sizes | `npm run package:contents` passes with the `./time` budget at the owner's ceiling (the budget written is the ceiling; its comment gives the source commit's measured graph and headroom), every other budget and the cap; the cut's `sizes.json` records the `./time` graph and every graph's change from 1.1.0-rc.1's. At the P1.M3c commits, `./time` is also measured with and without the `timeBands` re-export (section 3) | the same script on a scratch copy with the `./time` budget set to the measured graph less one byte | the owner's approved ceilings **[OQ3]** | none |
| T10 public behaviour | each of these throws `RangeError`: `timeBasis(NaN)`, `timeBasis(Infinity)`, `timeBasis(8.64e15 + 1)`, `timeBasis(0, "UTC")`, `timeBasis(0, "utc", NaN)`, `timeBasis(0, "utc", 1e10 + 1)`, `elapsedDays(b, b, NaN)`, `tilt(NaN)`, `eclipticFrame(Infinity)`, `meanEcliptic(eclipticFrame(0), NaN, 0, 0)`, `eclipticOfDate(0, 0, 0, 0)`, `eclipticOfDate(1, 0, 0, NaN)`; none of these throws: `timeBasis(8.64e15)`, `timeBasis(-8.64e15, "tt")`, `timeBasis(0, "tt", -1e10)`, `timeBasis(0, undefined)`. `eclipticFrame(tt)`, its `rows` and its `tilt`, and `tilt(tt)`, are frozen; writing to a returned frame's `rows` throws `TypeError` in strict code and is ignored otherwise, and `eclipticOfDate` at that TT gives the same value after the write as before | the same calls on the site's module, the raw functions: by reading its code, `timeBasis(NaN)` returns a record with NaN fields and `eclipticOfDate(0, 0, 0, 0)` returns a NaN latitude, without throwing, and its `eclipticFrame(0)` is not frozen | docs/versioning.md lines 30 to 40 | none |
| T11 no module state | the TypeScript syntax tree of `src/time.ts` has no top-level `let` or `var`, no top-level binding to a mutable array, object, `Map` or `Set`, and no assignment to an imported binding | the scan on a scratch copy with `let cache = new Map();` at the top | the source | none |
| T12 declarations | with TypeScript 5.9.3 (`--strict`, `--noEmit`, NodeNext), a file that imports the site's `time-basis.d.mts` (path given at run time, digest checked) and `@zodiacs/engine/time` compiles, asserting both ways the assignability of the types of `timeBasis`, `elapsedDays`, `tilt`, `eclipticFrame`, `meanEcliptic`, `eclipticOfDate`, `TimeBasis`, `Tilt` and `EclipticFrame`, and the package's `EPHEMERIS_SPAN` to the site's | the same file against a copy of the `.d.mts` whose `TimeBasis` gains a required `extra: number` | the site's committed declarations | none |
| T13 root isolation | `npm run exports:smoke` passes with `src/time.ts` (and `src/time-bands.ts`) in `OPT_IN_SOURCE`, written as whole file names so that `src/time-scale.ts` and `src/time-scale-data.ts` stay the root's | the smoke test on a scratch copy of the tree whose `src/index.ts` re-exports `timeBasis` from `./time.js` | the build's module list and markers | none |

No check uses Swiss Ephemeris in any form. No check needs a download the owner
has not approved: every reference above is committed, the Node toolchains are
on disk, and the consumers install only the candidate's own dependencies from
its lock.

## 7. Before the source commit: the site measurement S0 and the layout rule

**S0, inside SR.** S0 runs in SR, the cut's one scratch site run: after all
five units of the cut and before the source commit, and again after any review
commit that changes packed text. In a scratch clone of site main, outside every
checkout, install the candidate's packed tarball in place of 1.1.0-rc.1, with
no other change; run `astro build` once with the default flags and once with
production's flags as the Site Check's production-flags job sets them, and
`npm run report:bundles` on each (SR's other steps, the engine reference build
and the claims extractor, serve the other units). Record every route, the
largest chunk and the engine chunk against their allowances, beside main's own
Site Check figures for 1.1.0-rc.1 (on 0d3ee795: engine chunk 33,267 of
33,380.4 bytes, 113.4 left, report 6), and say which engine files each grown
chunk holds. Pass: every allowance holds. Control: the same report with the
engine chunk's allowance set to its measured size less one byte must fail.
SR is one heavy job, run alone; nothing is committed to the site.

**Layout rule, fixed now.** MF stays if S0 passes on it. If S0 fails on MF
because the engine chunk, or a route that loads the engine's root or
`./internal` graph, exceeds its allowance, build S, run T1 to T13 on it (T8
with its S clause) and S0 again, and adopt S if all pass. S is the layout in
which `dist/time.js` re-exports the time basis from the split build's chunks,
as M does, and takes the frame of date from a file built by a second esbuild
pass without splitting, from a small source that imports `src/nutation.ts`
and `src/frame.ts` with their two helpers bundled in; the ephemeris chunk
keeps its own copy, so no existing graph moves. A failure in a chunk MF does
not touch belongs to the unit that grew it, not to this rule. If S fails a
check or S0, stop: the cut asks the owner to choose between a site allowance
raise, recorded with its measurement and reason (HANDOFF-2026-09-30 lines 336
to 338), and the time basis alone (M), which leaves F-53 open for the frame.
**[owner, only if this branch is reached; see OQ3]** A layout chosen by this
rule is not a post hoc reading.

## 8. In the site's adoption: F-53's closing evidence

Run in the isolated site clone of the rc.2 adoption, after vendoring and before
any import changes, and committed under
`docs/platform/evidence/site-engine-1-1-0-rc2/time-entry/`:

- **S1.** The site generator's own check, retargeted at the package: for K1,
  `timeBasis` from `@zodiacs/engine/time` against `natalChart`'s records and
  the entry's frame against `natalChart`'s 12 longitudes (14,765 instants,
  177,180 longitudes, bit for bit); and T4 against the committed module, run
  again with the vendored archive. Controls: T4's and T5's.
- **S1b.** The calendar function's adapter before and after: two temporary
  copies of `src/lib/engine/server-ephemeris.ts`, one importing the committed
  module and one importing `@zodiacs/engine/time`, give the same
  `bodyLongitude` and `longitudeSpeed` (`Object.is`) for the 12 bodies at the
  K1 instants. Control: a third copy importing the module with the nutation
  coefficient changed as in T4 (b) must differ.
- **S2.** After the switch and the deletions (the site's importers moved to
  `@zodiacs/engine/time`; the generated module, its declarations, its
  generator and the CI step deleted): the site's full list of checks before
  every push, including the compute bundle's private-state test,
  `npx vercel build` with the packaged calendar function imported under
  `node --no-experimental-detect-module`, `report-bundles` on both builds,
  the claims ledger with `--unlisted` and `--orphans`, and a search of
  `src/`, `scripts/`, `tests/`, `api/`, `plugins/`, `examples/`,
  `integrations/` and `docs/engine-validation/` that finds no import, path or
  inlined copy of `time-basis.mjs` (frozen tools under
  `docs/platform/evidence/` keep theirs and reproduce at their own commits).
  Control for the search: the same search on site main finds the 5 importers
  in `src/` and `scripts/`, the path in
  `tests/api/compute-api-private-state.test.ts`, the copies inlined in the
  five generated bundles and the import in
  `docs/engine-validation/independent-references/tools/engine-clock.ts`.
- **S3.** After the owner merges: the alias names a READY production
  deployment built from the merge commit (read before and after the checks);
  the adoption's production checks pass, among them one request to a
  production path that runs `server-ephemeris.ts` and one to the compute API
  path that calls `timeBasis`, each compared with the vendored package's own
  values, and each with a control request that must differ. The adoption names
  those requests in its record before the run. The post-merge Site Check
  passes. Control for the alias: the same read on the deployment that served
  the site before the adoption must fail, since its commit is not the merge
  commit.

## 9. The release state it needs

- **Engine.** 1.1.0-rc.2 carried: the archive, its SHA-256 receipt and its
  `artifacts/archives.json` entry, in a carrier commit that is a child of the
  source commit, with T1 to T13 committed at the source commit and rerun on the
  archive (the carrier's gates, in sparse clones; archive rebuilds in CI
  only); the cut pull request merged by the owner with a merge commit. No npm
  publication is needed.
- **Site.** The adoption pull request, opened only once site#862 (B3.c, open
  as a draft since 2026-11-01) is merged or closed, under "one programme PR per
  repository at a time"; until then the adoption branch is pushed without a
  pull request **[OQ8]**. S1 and S1b committed; the switch, the deletions, the
  regenerated bundles and the claims edits in it; merged by the owner; S3 in
  production. This is the state the programme README gives an engine
  capability: "an engine candidate the site vendors and production serves".
  **[OQ7: if "deployed" is read otherwise for this cut, R6 moves with it]**
- **Records.** F-53's row and section updated with the merge commit and the
  deployment id in the record pull request that follows the adoption, as
  "fixed and deployed; readings awaiting ratification" until the owner
  ratifies (section 3). The ledger has no unit for F-53: no figure moves.
- **Upstream of the adoption.** The site's adoption of any new engine rebuilds
  its independent references with pyerfa (HANDOFF-2026-09-30 lines 329 to 332),
  which waits on the owner's answer about scratch installs. F-53's own checks
  need none of it. **[OQ6]**

## 10. Outcomes

- **Pass.** T1 to T13 pass on the source commit and the archive, S0 passes or
  the layout rule resolves it, and S1 to S3 pass: F-53 is fixed and deployed,
  and closed once the owner ratifies the readings of section 3.
- **Fail.** Any check fails with its control behaving: F-53 stays open, and
  the failure, its run and its cause stay in the evidence. A code fix made
  before the source commit is not an amendment of a reading; the evidence
  records the failing run and the fix. If the entry cannot pass, it leaves the
  cut with the owner told, and the site keeps its generated module.
- **Not established.** Accuracy beyond T7's re-run of existing references
  through the new entry; agreement across machines; the site's generators
  that F-52 names; anything after a table refresh; the bands, which P1.M3c's
  file judges.

## 11. Amendments

Any change to a reading, a corpus, a pin, a pass condition or a control after
this file is committed is an amendment: dated, with its reason, in a section
appended here, never an edit in place, and made before the run it affects
wherever possible. An owner answer that arrives after commit P is such an
amendment, appended before any formal run it affects. An amendment adopted
after its result was seen makes the reading validated only, until the owner
ratifies it. Once a formal run has been seen, a change of rule is a new
version of this preregistration, which cites this one and its results.

None at commit P.

**2026-11-03, the owner's answers.** The answers to OQ1 to OQ14, given under
the owner's delegation of that day and before any formal run, are in
[`../OWNER-ANSWERS.md`](../OWNER-ANSWERS.md). For F-53: OQ2 yes, the frame
functions public; OQ3, `./time`'s ceiling 42,400; OQ6 yes; OQ12, the site's
CLAUDE.md line removed in the adoption pull request; OQ13, no table refresh.
OQ5 is not answered under that delegation (zodiacs.org
`DECISIONS-2026-10-05.md` §4). R1 to R6, the MF layout and its fixed S rule stay unratified, so
F-53 is recorded "fixed and deployed; readings awaiting ratification".

**2026-11-03, review 1: the controls' tool, T9 made late, and the refusals'
wording.** Adopted after review 1 (programme notes,
`notes/rc2-2026-11-01/review1/`), before any formal run. Review 1 ran none of
this file's corpora; every reading here stays `validated` at most under OQ5.

- `tools/controls.sh` did not work on the cut's build (review 1): T1's list
  control compared the entry's names with R1 without P1.M3c's `timeBands`, so
  it exited as "not behaving"; and the copy of the build that T1's API control
  and both T2 controls make lacked `scripts/lite-entry.mjs`, which the export
  smoke test imports, and `scripts/refuse-ephemeris.mjs`, which it starts Node
  with, so T2's controls failed with `ERR_MODULE_NOT_FOUND` rather than the
  message they look for. R1's list in the tool now has `timeBands` (20
  declared names, 10 runtime ones, as R1 says with P1.M3c's default), and
  the copy has both scripts. Run on this commit's build, T1's two controls
  and T2's two fail as required; with b11c5e8's `controls.sh` three of the
  four did not. The tool's other controls were not run (T4's and T5's read
  K2).
- T9's measurement at the P1.M3c commits, `./time` with and without the
  `timeBands` re-export (section 3), was not made then. Made now, late, on
  this commit's tree, whose changes do not reach `./time`'s graph: 42,306
  bytes in 7 files with the re-export and 41,420 in 6 without
  (`npm run package:contents`, Node 22.22.2, darwin-arm64), both under
  42,400, so `timeBands` stays in `./time`. P1.M3c's file records the same
  (its amendment of this date).
- `docs/time.md` said every argument of the entry that is not a finite
  number throws `RangeError`. It now says what the functions check: `ms`,
  `scale`, `pin`, and `days`, `tt`, `x`, `y` and `z` as finite numbers, and a
  vector with a direction; `elapsedDays`' records and `meanEcliptic`'s frame
  are taken as given (another object can throw `TypeError` or give NaN); and a
  finite `tt` far from the series' years is not refused. No check is added
  (`./time` has 94 bytes of headroom). T10's calls and their outcomes do not
  change.
- `@zodiacs/engine/calc` now also exports the type `TimeBands`, which its
  bands use: `api/calc.api.md` lists it among its exported declarations;
  `api/time.api.md` does not change, having no block of declarations
  referenced and not exported. T1's names do not change.

## 12. Tools and order (to be written on the cut branch)

Under `docs/evidence/1.1.0-rc.2-20261102/time-entry/tools/`, each reading only
the files it names and the packed tarball installed in a scratch consumer
outside the checkout: `corpora.mjs` (K1 to K4, V; writes their SHA-256),
`site-module.mjs` (T4, with the site path as argument), `natal-parity.mjs`
(T5), `source-pins.mjs` (T6), `independent.mjs` (T7a to T7c),
`one-copy.mjs` (T8), `behaviour.mjs` (T10), `state-scan.mjs` (T11),
`declarations.mts` (T12), `no-ephemeris.sh` (T3), `controls.sh` (every
control). T1, T2, T9 and T13 live in the repository's own scripts and tests:
`src/time.test.ts`, `scripts/module-resolution-smoke.mjs` (`npm run
exports:smoke`), `scripts/root-isolation.mjs`, `npm run api:check` and
`scripts/verify-package-contents.mjs` (`npm run package:contents`). Order:
T6 and T11 first (no build), then one build, then T1, T2, T8, T9, T13, then
T3, T4, T7, T10, T12, then T5 (the heaviest), each alone; S0 inside SR
before the source commit; S1 to S3 in the adoption.

## 13. Owner questions that bear on this file

Numbered as the cut's plan numbers them, OQ1 to OQ14 (OQ14, for the private
birth-data search, was added last). None was answered at commit P, so each
default below is what this file is written to. An answer given later is a dated
amendment (section 11), made before any formal run it affects.

| OQ | Question | Default written here | If answered otherwise |
| --- | --- | --- | --- |
| OQ1 | The cut's scope: the four P2.E units through `./lite`, F-53 through `./time` with the frame of date, the nine F-89 fixes, P1.M3c and P2.B.vargas; P2.B.kp waits for Krishnamurti's own text with pages | as listed | If F-53 leaves the cut, this file is withdrawn by a dated amendment, not run, and F-53 stays open |
| OQ2 | Two new public entries, making fifteen: `./lite` and `./time` (the time basis and the frame of date); the frame functions public, not `@experimental` | `./time` approved; the frame functions public | Without `./time` F-53 stays open; experimental frame functions carry the tag (R1's names unchanged) |
| OQ3 | Sizes, approved once as ceilings: cap 1,100,000; `./calc` 156,000; `./vedic` 143,000; `./lite` 29,000; `./time` 42,400; or the CHANGELOG's 0.x history (91,551 bytes) moved out instead of the cap raise; (c) the budget written is the ceiling | the ceilings; the CHANGELOG whole; (c) the ceiling | A ceiling under the measured graph means a smaller entry or a layout change (S, or the frame left out); MF alone puts `./calc` 114 and `./vedic` 126 bytes over their rc.1 budgets, so those raises matter here too |
| OQ5 | Ratify, before the formal runs, the readings chosen after the scoping runs: here F-53's R1 to R6 with the MF layout and its fixed S rule, and (for P1.M3c) `timeBands` exported from `./time` | asked now; unanswered, F-53 is recorded "fixed and deployed; readings awaiting ratification" | Another reading is a dated amendment before the formal run; after a run, a new version |
| OQ6 | Scratch installs outside the repositories: pyerfa 2.0.1.5 with numpy 2.4.6 (Python 3.11 if needed); pyswisseph 2.10.3.2 | none installed until approved; F-53's own checks need neither | Without them the site's adoption of rc.2 cannot pass its tests (independent references, the Swiss refresh), so F-53 cannot reach production with rc.2 |
| OQ7 | What "deployed" means: F-53 closes when production serves the site build that imports `./time` | yes | R6 moves with the reading the owner gives |
| OQ8 | Site order: site#862 (B3.c) is an open programme PR | the adoption branch is pushed without a PR until #862 is merged or closed | The owner may allow a second programme PR on the site |
| OQ12 | The line of the site's instructions for coding agents that names the generated time-basis module, once the module goes | the owner removes it | The line stays, naming a deleted file |
| OQ13 | An IERS or ΔT table refresh in rc.2 | none | The pins of `src/time-scale-data.ts` and `src/deltat.ts` (section 4), σ after 2026-09-24 and every value there change; this file is amended before code |
| OQ14 | The owner-approved birth-data scanner excludes only `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, not the whole folder; should it exclude the whole folder for engine pushes (a copy of the scanner kept outside the repositories whose pathspec and archive-member skip cover `:(exclude,top)docs/evidence/calc-sidereal-2026-10-05`, its output naming the exclusion)? | ask before any engine push: the search does not run on the engine, and nothing is pushed, until the owner answers | Another rule for the search is written into the scope declaration as a dated amendment before the first push |
