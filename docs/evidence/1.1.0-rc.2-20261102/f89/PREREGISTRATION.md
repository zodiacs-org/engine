# Preregistration: F-89's nine corrections in 1.1.0-rc.2 (P1.14, its F-89 part)

Engine 1.1.0-rc.2. Written on 2026-11-02 (ICT), before any code of the cut.
It covers what rc.2 does for P1.14, which is the F-89 corrections only. It is
committed in commit P of the cut, together with the four other
preregistrations of 1.1.0-rc.2 and nothing else, as "Zodiacs Admin"
<admin@zodiacs.org>, before any code of the cut. Commit P is pushed alone, as
the first head of the draft cut pull request, so that GitHub dates it; no
formal run happens before commit P is on GitHub. After commit P this text is
never edited in place: an owner answer, or any other change, is a dated
amendment appended to section 12.

- **Written from** section 5 of the draft
  `notes/rc2-2026-11-01/drafts/f89/F89-FIXES.md` (programme notes, not in
  this repository), the draft's own preregistration of its readings and
  checks, with its section 1's table, the checks and controls of its
  section 3, and the phrase lists of its companion `f89_edits.py`
  (`OLD_PHRASES`, `NEW_PHRASES`, `PACKAGE_ONLY_NEW`) written out here, so that
  E1 and E2's patterns are fixed before any code. The corrections of the
  cut's plan (`notes/rc2-2026-11-01/drafts/critic/RC2-PLAN.md`, section 1)
  that concern this text are applied: K4 (E6), K10 (this header), K12
  (sparse clones; archive rebuilds in CI only), K14 (the ratchet), K19
  (item 1 as OQ9, with E10 and E11 for its options), K20 (the record of
  `bounds.py`), K22 (S1 inside SR), K24 (owner questions) and K27 (the
  blind-band path), with OQ14 for the birth-data search.
- **Line references** are to engine main a253973
  (`a2539735f99fe38f9623cd1101de96b8c5cdf0f0`) and site main 9a67f761
  (`9a67f761bc231741c6571af2dfae65b798954e11`) unless a line names another
  commit.
- **Reports and owner questions.** "Report n" is entry n, counted from 0, of
  the scoping journal `notes/rc2-2026-11-01/rc2-scope-journal-results.json`:
  report 0 the cut, 1 prior work, 2 the site adoption, 3 ΔT and F-53, 4
  vargas and KP, 5 the lite entry, 6 the scoping critic. Owner questions are
  the cut's OQ1 to OQ14 (section 10); the draft's own first question is OQ9,
  and its second to fifth are OQ10's four parts. Each place an answer would
  change this file is marked **[OQn]**.

**Scope limitation, declared.** The owner's rule for the engine repository,
kept for this file and for every step it fixes: never open, read, run,
import, grep, search or inspect
`docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`; explicitly
exclude `docs/evidence/calc-sidereal-2026-10-05/` from every recursive scan,
copy or archive; never pass a revision to `git grep`; add
`-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'` to any git command
that walks a tree; run `git status` only as
`git status --porcelain -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`.

- **The draft.** Read in the isolated, blobless clone `engine-rc2` at
  a253973, where that folder is not checked out (sparse checkout
  `!/docs/evidence/calc-sidereal-2026-10-05/`). Every `git grep` ran on the
  working tree, with no revision, and with the pathspec
  `-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`. No `git show`,
  `git log -p`, `git archive` or `git diff` of an engine revision was run.
  Two files read name the folder as text (`LICENSING.md`, and the
  `AYANAMSA_BASIS` string in the 1.1.0-rc.1 archive's `dist/calc.js`);
  nothing in the folder was read. The two release archives unpacked in a
  scratch folder for the draft (0.1.1-rc.10 and 1.1.0-rc.1) hold no such
  folder (checked by directory name only). `f89_edits.py` reads only the
  files its edits name.
- **Commit P.** Made in the same clone, whose sparse checkout leaves
  `docs/evidence/calc-sidereal-2026-10-05/` off the disk. The clone's local
  identity, "Zodiacs Admin" <admin@zodiacs.org>, was set with
  `config user.name` and `config user.email` just before the writing began.
  Every git command run there that walks a tree carried the exclusion pathspec
  above; no `git grep`, `log -p` or `archive` ran; directories were listed by
  name, never recursively, and the excluded folder appears in none of the
  listings; no file inside it was opened or read. The commit was amended before
  any push, to correct these texts after two reviews.
- **Every later step.** E1 and E2 read only README.md, NOTICE, LICENSING.md
  and `dist/` of an unpacked package; no check here walks the repository.
  Every clone used for a build, a pack, a gate or a run is `engine-rc2`
  itself or a sparse clone made as `git clone --no-checkout --no-local
  <repository> <dir>`, then `git -C <dir> sparse-checkout set --no-cone '/*'
  '!/docs/evidence/calc-sidereal-2026-10-05/'`, then `git -C <dir> checkout
  --detach <commit>`; never a plain clone or a worktree. Archive rebuilds
  (`node scripts/verify-archive-binding.mjs --rebuild-all`, and the same
  check on the carrier commit) run only in CI's jobs, whose run ids the gate
  record cites.
- **The private birth-data search.** It runs before every engine push, counts
  only, and the release state of section 7 needs those pushes. The scanner
  the owner approved excludes only the one file named above, not the folder,
  so on the engine it runs only with the whole folder excluded and only once
  the owner has answered OQ14 (section 10). Until then no engine push is
  made.

## 1. The unit, its gate and the finding

**The unit as the ledger words it** (site
`docs/platform/programme/acceptance-ledger.json`, lines 431 to 446 on
`9a67f761`): P1.14, "1.14 Claims ledger enforced over every
accuracy/time/privacy sentence", weight 1, status `partial`, release
`deployed`. Its gate, word for word (line 437):

> every such sentence (site, llms files, receipts, developer docs) has an evidence path; enforced by test

Its note ends "still partial because claims that use no trigger word escape
the extractor".

**The step behind it.** The brief's step 1.14
(`docs/platform/ENGINE-AND-PLATFORM-BRIEF.md:271`) asks to "Fix every
overstatement the audit and the fact-check found (R2, R9)", with the gate
"every such sentence has an evidence path; any sentence without one is
removed". The preregistration's rule
(`docs/platform/evidence/engine-beyond-swiss/PREREGISTRATION.md` §1.14,
version 2) is the same, and its 2026-09-23 verdict was "PASS for sentences",
with "A sentence that uses none of the trigger words is outside the ledger."

**The finding.** FINDINGS F-89 (site `docs/platform/programme/FINDINGS.md:84`)
records nine statements in engine 1.0.0's README, NOTICE, LICENSING and doc
comments that the claims ledger found inaccurate once it read the engine
references (F-23). Its disposition: "open: each is an overstated claim in
`docs/claims/ledger.json` with this resolution; the engine's next release
corrects them, and the reference served here follows when it is regenerated
for it". In `docs/claims/ledger.json` each is a claim with status
`overstated` and resolution step `engine-next-release`; twelve sentence
records state them. 1.1.0-rc.1 still carries all nine, and all nine are still
on engine main a253973: `f89_edits.py validate` found each of its 29 edits'
current text exactly once there. The ledger has no unit for F-89, and P1.14's
status does not move in this cut (R-P1.14), so no ledger figure moves.

## 2. The nine items and the edits

| item | claim | engine file on `a253973` | download | in rc.2 without the owner | closes on vendoring |
| --- | --- | --- | --- | --- | --- |
| 1 | `eng.points-vertex-given` | `README.md:565-566` | text: none; a rerun needs pyswisseph (not approved) | yes, as OQ9 decides (section 4) | under OQ9 (a) with E9 passing, (b) or (c); not under (d) |
| 2 | `eng.crossings-blind-band` | `README.md:673-675`; `src/crossings.ts:366-368` | none (a light run on rc.2's build) | yes | yes |
| 3 | `eng.geo-resolution-names` | `README.md:897-899` | none | yes | yes |
| 4 | `eng.gregorian-table-location` | `NOTICE:180-182`; `LICENSING.md:292-294` | none | yes | yes |
| 5 | `eng.calc-bounds-basis` | `LICENSING.md:368-370`; `src/calc-bounds.ts:13` (generated); `src/calc.ts` | none | yes | yes |
| 6 | `eng.api-placidus-steps` | `src/houses.ts:168-171` | none | yes | yes |
| 7 | `eng.api-coascendant-west` | `src/houses-extra.ts:344-346` | none | yes | yes |
| 8 | `eng.api-deltat-absent` | `src/types.ts:110` | none | yes | yes |
| 9 | `eng.receipt-ephemeris-from` | `src/receipt.ts:271` | none | yes | yes |

Two more shipped sentences say what item 5 corrects, in the README and in the
NOTICE (which the site serves twice), and the site marks their claims
(`eng.calc-bounds`, `eng.calc-bounds-measured`) supported; they are fixed in
the same edits (5i, 5j) so that the record is consistent. `CHANGELOG.md`
repeats two of the statements in its 0.1.1-rc.10 and 0.1.1-rc.15 entries;
those are history, are not served by the site, and are not rewritten.

The edits, as `f89_edits.py` holds them (each an exact pair of current and new
text, the current text found exactly once on a253973):

| edit | item | claim | file | packed | set |
| --- | ---: | --- | --- | --- | --- |
| 1 | 1 | eng.points-vertex-given | `README.md` | yes | recommended |
| 1-V3 | 1 | eng.points-vertex-given | `README.md` | yes | OQ9 (c) instead of 1 |
| 2a | 2 | eng.crossings-blind-band | `README.md` | yes | recommended |
| 2a-B | 2 | eng.crossings-blind-band | `README.md` | yes | variant B, not applied |
| 2b | 2 | eng.crossings-blind-band | `src/crossings.ts` | yes | recommended |
| 2b-B | 2 | eng.crossings-blind-band | `src/crossings.ts` | yes | variant B, not applied |
| 3 | 3 | eng.geo-resolution-names | `README.md` | yes | recommended |
| 4a | 4 | eng.gregorian-table-location | `NOTICE` | yes | recommended |
| 4b | 4 | eng.gregorian-table-location | `LICENSING.md` | yes | recommended |
| 4c | 4 | eng.gregorian-table-location | `scripts/verify-package-contents.mjs` | no | recommended |
| 5a | 5 | eng.calc-bounds-basis | `LICENSING.md` | yes | recommended |
| 5b | 5 | eng.calc-bounds-basis | `docs/evidence/calc-api/tools/bounds.py` | no | recommended |
| 5c | 5 | eng.calc-bounds-basis | `docs/evidence/calc-api/tools/bounds.py` | no | recommended |
| 5d | 5 | eng.calc-bounds-basis | `src/calc.ts` | yes | recommended |
| 5e | 5 | eng.calc-bounds-basis | `src/calc.ts` | yes | recommended |
| 5f | 5 | eng.calc-bounds-basis | `src/calc.ts` | yes | recommended |
| 5g | 5 | eng.calc-bounds-basis | `src/calc.ts` | yes | recommended |
| 5h | 5 | eng.calc-bounds-basis | `src/calc.ts` | yes | recommended |
| 5i | 5 | eng.calc-bounds (supported on the site; same defect) | `README.md` | yes | recommended |
| 5j | 5 | eng.calc-bounds-measured (supported on the site; same defect) | `NOTICE` | yes | recommended |
| 5k | 5 | none (engine guide, not packed, not read by the site) | `docs/calc.md` | no | recommended |
| 6 | 6 | eng.api-placidus-steps | `src/houses.ts` | yes | recommended |
| 7a | 7 | eng.api-coascendant-west | `src/houses-extra.ts` | yes | recommended |
| 7b | 7 | none (engine guide, not packed, not read by the site) | `docs/houses.md` | no | recommended |
| 8 | 8 | eng.api-deltat-absent | `src/types.ts` | yes | recommended |
| 9a | 9 | eng.receipt-ephemeris-from | `src/receipt.ts` | yes | recommended |
| 9b | 9 | none (inline comment) | `src/receipt.ts` | yes | optional, not applied |
| X1 | 0 | none listed (no trigger word; the 1.14h gap) | `README.md` | yes | optional, not applied |
| X2 | 0 | none listed (no trigger word; the 1.14h gap) | `src/houses.ts` | yes | optional, not applied |

The cut applies the recommended set, item 1 as OQ9 decides (section 4) and
item 2 in its variant A (the rule and the figures, with the blind-band run of
E3). Edits 2a-B, 2b-B, 9b, X1 and X2 are not applied unless a dated amendment
before code says so. Each edit replaces exactly its current text, and "the
paragraph around it may be rewrapped at the cut without changing its words"
(the draft's section 3): E1 and E2 compare text with its whitespace
collapsed, so a rewrap does not change their result.

`MEAN_POINTS_BASIS`, item 5's new constant, is this 311-byte string, rendered
from `docs/evidence/calc-api/rc16/summary.json` by the edited
`docs/evidence/calc-api/tools/bounds.py` (the same rendering reproduces the
committed `MEASURED_BASIS` line exactly):

```text
largest difference from the same definition evaluated with ERFA's fundamental arguments (faom03, faf03, fal03) and nut06a's nutation in longitude, over 32 instants from JD 2379457.498125 to 2520522.646618 (TT), in all eight frames: a check of the implementation, not of an ephemeris; docs/evidence/calc-api/rc16
```

## 3. The reading this cut is judged by

- **R-F89, for F-89.** "Corrected in rc.2" means:
  1. in rc.2's packed files (README.md, NOTICE, LICENSING.md, `dist/*.d.ts`,
     `dist/*.js`; never CHANGELOG.md) none of the overstated phrases of the
     claims fixed in rc.2 appears (E1), and each replacement does (E2);
  2. every number in a replacement has a committed test or committed
     evidence output in the engine repository. The one exception the owner
     may choose is item 1's text under OQ9 (b) or (d), which names the site's
     0.1.1-rc.10 record; engine `AGENTS.md` otherwise forbids reusing a
     figure measured on another build;
  3. after the site vendors rc.2 and regenerates its reference, the claims
     ledger passes R1 to R10, with the claims of items 2 to 9 (and the two
     companion claims of item 5) stated as supported on rc.2's text, and
     `maxOpenOverstated` equal to the open count. The site's claims ledger at
     9a67f761 has 254 claims, 11 of them overstated: the nine F-89 claims,
     `eng.conformance-sources` (F-90) and `eng.rc1-footer`. So the ratchet
     goes from 11 to **3** while the Vertex claim stays open (OQ9 (d), or (a)
     with E9 failing), and to **2** when item 1's text closes it, as OQ9's
     default (c) does ((a) with E9 passing, (b), or (c), which retires the
     Swiss claim).
- **R-P1.14, for P1.14.** This cut does not change P1.14's status. It stays
  `partial` while any of these holds: an overstated claim is open (F-90's,
  the footer's, and the Vertex's unless OQ9 closes it); the trigger-word gap
  (step 1.14h) is open; translated sentences without a neutral trigger are
  unselected. Whether the F-89 fixes count toward P1.14 at all is OQ10.

## 4. Item 1, the Vertex, under OQ9

The current text (`README.md:565-566`):

```text
  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,
  they agree with its `swe_houses_armc` to within 0.00001″.
```

What the ledger found: given Swiss's own sidereal time and obliquity, the
Vertex differs by 0.000014″ at the near-degenerate case 1852-03-19T05:35:26.734Z
at 23.38° N, where the zenith is 0.075° from the ecliptic (the site's points
record of 0.1.1-rc.10, `docs/platform/evidence/points-2026-09-26/`,
`results/worst-vertex.json`). The engine repository holds no record of its own
for the figure. Which text ships is **[OQ9]**, default (a) if OQ6 approves
pyswisseph, else (c):

- **(c), the default without pyswisseph: the ERFA figure, no Swiss claim.**
  Edit 1-V3's text:

  ```text
  supplied chart's angles. On the conformance suite's ten L2 vectors for them,
  at latitudes from 60° S to 60° N, whose arbiter is ERFA's sidereal time and
  obliquity with each point's published definition, they are within 0.013″
  and 0.007″ (`conformance/RESULTS.md`).
  ```

  Its figures are the engine's own `conformance/RESULTS.md` (suite 0.2.0,
  `angles.vertex-east-point`, 10 L2 vectors: Vertex 0.003″, 0.013″ and 0.013″,
  East Point 0.003″, 0.007″ and 0.007″ as median, 95th percentile and
  maximum), whose L2 arbiter is ERFA's sidereal time and obliquity with each
  point's published definition, as regenerated for rc.2 in the cut's commit
  X (E10). It needs no download. The site retires `eng.points-vertex-given`
  and maps the new sentence to a claim on `conformance/RESULTS.md`.
- **(a), with OQ6's pyswisseph: a rerun on rc.2.** The site's points
  comparison (`docs/platform/evidence/points-2026-09-26/tools/`, its
  `dump-given.mjs` with `compare-given.py`, and `dump-end-to-end.mjs`,
  `worst-vertex.py` and `worst-vertex.mjs`) is run on the candidate's pack
  before the source commit, one heavy job, and its aggregates (no Swiss value
  per case) are committed under `docs/evidence/1.1.0-rc.2-20261102/f89/`
  (E9). The text then gives rc.2's own figure and names that output, not the
  0.1.1-rc.10 record. Its exact words and its E2 phrase are fixed by a dated
  amendment once OQ6 and OQ9 are answered, before any formal run. If E9
  fails, the failure is recorded and the owner is asked before the source
  commit.
- **(b), the record and code identity.** Edit 1's text (below), closed on the
  0.1.1-rc.10 record together with E11, a committed check that the Vertex
  code path in rc.2's build is textually the 0.1.1-rc.10 build's. Code
  identity is not a rerun and is never presented as one.
- **(d), the drafted text, claim open.** Edit 1's text; the claim stays
  `overstated`, the ratchet stays at 3, and the README carries a figure from
  another build.

Edit 1's text, for (b) and (d):

```text
  supplied chart's angles. Given Swiss's sidereal time, latitude and obliquity,
  they agree with its `swe_houses_armc` to within 0.00002″ on zodiacs.org's
  points record of 0.1.1-rc.10 (2026-09-26). The largest difference there,
  0.000014″, is the Vertex's at a near-degenerate case, 1852-03-19 at
  23.38° N, where the zenith is 0.075° from the ecliptic.
```

E1's old phrase for item 1 applies under every option. E2's new phrase for
item 1 is `NEW_PHRASES`' item 1 under (b) and (d), this one under (c), in the
same form as the lists of section 5:

```json
[1, "eng.points-vertex-given (OQ9 c)", "On the conformance suite's ten L2 vectors for them, at latitudes from 60° S to 60° N, whose arbiter is ERFA's sidereal time and obliquity with each point's published definition, they are within 0.013″ and 0.007″"]
```

and, under (a), the phrase the amendment fixes.

## 5. Checks, each with a control that must fail

A control is a deliberately wrong input or variant that the check must fail
on; a check whose control passes is void until both are fixed and run again.

| id | check | control that must fail |
| --- | --- | --- |
| E1 | `f89_edits.py package <unpacked rc.2 package> --expect new`: no overstated phrase of `OLD_PHRASES` (twelve, counting the companions) in the packed files | the same check on the 1.1.0-rc.1 archive must fail. Run on rc.1 with `--expect old`, the draft's scan gave 0 failures (all twelve found, no replacement found), so the patterns do see the old text |
| E2 | the same scan: every phrase of `NEW_PHRASES`, with item 1's as section 4 sets it, and of `PACKAGE_ONLY_NEW` (the mean points' basis in `dist/calc.js`) present | as E1 |
| E3 | item 2: (a) a unit test on an exact synthetic parabola, no ephemeris: at the phase that centres the station in a cell, a pair at depth just under f″h²/8 is missed and just over it is found; (b) variant A's station run, `docs/evidence/1.1.0-rc.2-20261102/f89/blind-band.mjs` and its output `blind-band.json` (a port of the site's `tools/blind-band.mjs`, f″ from the engine's own longitudes at the 12 Saturn and 11 Jupiter stations from 2019 to 2024, the 5-day grid at 100 phases), run on the build of the unit's first commit and again at the source commit, where it must give the same bytes: at each station no phase misses a pair as deep as the README's figure | (a) an assertion that the pair is missed at 1.5 times the band (what the old figures imply) must fail; (b) at 0.9 times each station's band, at least one phase must miss |
| E4 | item 3: a new test removes `process.versions.tz` for the call and expects `zone.tzdbVersion` null for a 2020 time | the same expectation with `tz` set to `2025c` must fail |
| E5 | item 4: the assertions inserted before `scripts/verify-package-contents.mjs:349`: exactly one file, a `dist/chunk-*.js`, holds `var GREGORIAN_ADOPTION =`; exactly `dist/geo.js` and `dist/techniques.js` import that chunk; NOTICE holds "in a shared chunk under dist/ that dist/geo.js and dist/techniques.js import" and LICENSING.md "shared chunk under `dist/` that `dist/geo.js` and `dist/techniques.js` import"; every phrase the existing assertions require stays | rc.1's NOTICE and LICENSING must fail the two phrase assertions; a holder in `dist/geo.js` must fail the holder assertion |
| E6 | item 5: a new case in `src/calc-bounds.test.ts`: for the Mean Node, the Mean South Node and Black Moon Lilith, `bounds.position.basis` and `bounds.speed.basis` equal `MEAN_POINTS_BASIS` (section 2), which names ERFA and not Horizons, and the North Node keeps `MEASURED_BASIS`; `CALC_API_RESULTS=docs/evidence/calc-api/rc16 python3 -I docs/evidence/calc-api/tools/bounds.py --check` passes after the regeneration of `src/calc-bounds.ts`; and the round-trip fixture rule below | the same assertion on rc.1's build must fail, since the Mean Node's basis there is the Horizons text (`dist/calc.js` of the rc.1 archive); for the fixture, a copy of the regenerated fixture with one longitude changed in its last place and one key added must be reported |
| E7 | item 7: a new exact-geometry test: on a 1° grid of RAMC, Munkasey's co-ascendant lies west of the meridian (its longitude less the MC, taken in [0°, 360°), is 180° or more) for some RAMC at absolute latitudes of 0°, 10° and ε less 0.5°, and for none at ε plus 0.5°, 30°, 45° and 60° | the old wording allows west points up to 90° minus ε (about 66.56°), so its prediction of a west point at 30° to 60° must fail: the test finds none there |
| E8 | item 9: the rc.8-set fixture `RC14` (`src/receipt-time-basis.test.ts`) with `engine.ephemeris` deleted is refused `invalid_shape` (beside the existing `src/reference-span.test.ts` case, "puts it in every receipt and refuses a current receipt without it") | the rc.7 receipt without the field parses, as `src/receipt-conventions.test.ts` already shows (and naming an ephemeris there is refused) |
| E9 | item 1, only under OQ9 (a): the rerun's worst given-inputs Vertex difference on rc.2 is at most 0.00002″ | the same rerun must reproduce the 1852 case above 0.00001″, so the old bound fails on it |
| E10 | item 1, only under OQ9 (c): the text's 0.013″ and 0.007″ equal the `angles.vertex-east-point` maxima of the Vertex and of the East Point in rc.2's regenerated `conformance/RESULTS.md` | the same comparison against a copy of that file with the Vertex maximum changed in its last digit must fail |
| E11 | item 1, only under OQ9 (b): `vertexOf`, `eastPointOf`, `obliqueLongitude`, `ramcOf`, `normalizeLongitude` and their chunk's `DEG` and `RAD` are textually identical in rc.2's built chunk and in the 0.1.1-rc.10 archive's `dist/chunk-N4WHSUFK.js` (as they are in 1.1.0-rc.1's `dist/chunk-VDVUUMY2.js`) | a copy of rc.2's chunk with one character of `vertexOf` changed must fail |
| S1 | inside SR, the cut's one scratch site run, made after all five units of the cut and before the source commit (and again after any review commit that changes packed text): in a scratch clone of site main outside every checkout, the reference built from the candidate pack and `node scripts/claims-ledger.mjs --unlisted` run; every new sentence gets a record and a claim before the archive is carried, since a wording slip found after the carrier costs an rc.3 | the same run on the rc.1 reference lists none of the new sentences, and R2 flags the fifteen replaced records only on the candidate |
| S2 | after vendoring: `build-engine-reference --check`, claims-ledger R1 to R10, the ratchet equal to the open count (R-F89, point 3: 2 under OQ9's default (c), or (a) with E9 passing, or (b); 3 under (d), or (a) with E9 failing) | the ratchet left at 11 must fail R5 |
| S3 | `node scripts/programme-ledger.mjs` regenerates LEDGER.md with P1.14 unchanged | the same regeneration from a scratch copy of the acceptance ledger with P1.14's status set to `accepted` must give a LEDGER.md whose P1.14 row differs, so the check fails |

Items 6 and 8 need no figure: E1 and E2 cover their text (the old clause
absent and the new one present; on rc.1 the reverse). Item 8's behaviour is
the existing `src/deltat-chart.test.ts` case "computes a chart in the
leap-second era from the leap seconds and IERS UT1 − UTC, and says so", and
the new `./time` documentation must not repeat the old wording.

**E1 and E2, exactly.** The scan is `f89_edits.py`'s `package` command,
committed unchanged in method under `docs/evidence/1.1.0-rc.2-20261102/f89/tools/`
before E1 and E2 run, with item 1's phrase as section 4 sets it. It reads
README.md, NOTICE, LICENSING.md and every file directly under `dist/` whose
name ends in `.d.ts`, `.js`, `.ts`, `.md`, `.py` or `.mjs`, of an unpacked
package, never CHANGELOG.md. It normalizes each file's text: in a file whose
name ends in `.ts` (declarations included) it first drops each line's leading
comment star (`^\s*\*\s?`), then it collapses every run of whitespace to one
space. A phrase is found in a file when it is a substring of that file's
normalized text. E1 passes when no phrase of `OLD_PHRASES` is found in any
file; E2 when every phrase of `NEW_PHRASES` and `PACKAGE_ONLY_NEW` is found in
at least one file. Each entry is `[item, claim, phrase]`:

`OLD_PHRASES`:

```json
[
  [1, "eng.points-vertex-given", "`swe_houses_armc` to within 0.00001″."],
  [2, "eng.crossings-blind-band", "a Saturn station within 0.0103° of it, or a Jupiter station within 0.0205°"],
  [3, "eng.geo-resolution-names", "Each resolution names the tzdb version, the transition behind the offset and its cause"],
  [4, "eng.gregorian-table-location", "(GREGORIAN_ADOPTION, in dist/geo.js)"],
  [4, "eng.gregorian-table-location", "built into `dist/geo.js`)"],
  [5, "eng.calc-bounds-basis", "responses at 32 preregistered instants, rounded up, and the largest distance"],
  [5, "eng.calc-bounds (companion)", "A measured bound is the largest difference from JPL Horizons on 32 instants from 1802 to 2188: a sample maximum"],
  [5, "eng.calc-bounds-measured (companion)", "responses at 32 instants, and of astronomy-engine's barycentre"],
  [6, "eng.api-placidus-steps", "it needs up to 63 steps there"],
  [7, "eng.api-coascendant-west", "for Munkasey's co-ascendant, within 90° − ε of the equator"],
  [8, "eng.api-deltat-absent", "the engine's model when absent"],
  [9, "eng.receipt-ephemeris-from", "From the current conventions set on"]
]
```

`NEW_PHRASES`:

```json
[
  [1, "eng.points-vertex-given", "to within 0.00002″ on zodiacs.org's points record of 0.1.1-rc.10"],
  [2, "eng.crossings-blind-band (README)", "can lose both crossings when a station takes the body less than f″h²/8 past the target, f″ being"],
  [2, "eng.crossings-blind-band (doc comment)", "can lose both crossings when a station takes the body less than f″h²/8 past the target (f″ the"],
  [3, "eng.geo-resolution-names", "the jump's in a gap or fold, or, where the shipped history answered, the last change it records before the time"],
  [4, "eng.gregorian-table-location (NOTICE)", "in a shared chunk under dist/ that dist/geo.js and dist/techniques.js import"],
  [4, "eng.gregorian-table-location (LICENSING)", "shared chunk under `dist/` that `dist/geo.js` and `dist/techniques.js` import"],
  [5, "eng.calc-bounds-basis (LICENSING)", "evaluated with ERFA's fundamental arguments at those instants"],
  [5, "eng.calc-bounds (companion)", "from their definitions evaluated with ERFA on the same instants"],
  [5, "eng.calc-bounds-measured (companion)", "from their definitions evaluated with ERFA at those instants"],
  [6, "eng.api-placidus-steps", "where the rounding of asin near ±1 can keep it from settling"],
  [7, "eng.api-coascendant-west", "for Munkasey's co-ascendant, within ε of the equator"],
  [8, "eng.api-deltat-absent", "A caller's fixed ΔT (TT − UT1) in seconds, as BirthInput.deltaT; the engine's time basis when absent"],
  [9, "eng.receipt-ephemeris-from", "From the rc.8 conventions set on"]
]
```

`PACKAGE_ONLY_NEW` (the basis string reaches `dist/calc.js`; at the source
level it is in `bounds.py`'s template, so only the package scan looks for it):

```json
[
  [5, "eng.calc-bounds-basis (dist/calc.js)", "evaluated with ERFA's fundamental arguments (faom03, faf03, fal03)"]
]
```

If the cut's build changes which files import the chunk that holds the
Gregorian adoption table, item 4's text and its E2 phrases follow the build by
a dated amendment before the formal run, never the other way round. If E3's
run gives other figures than 0.0056° for Saturn and 0.011° for Jupiter, item
2's text takes the run's largest bands rounded up to two significant figures
before the source commit; its E2 phrases do not hold the figures.

**The round-trip fixture (E6), one rule with P1.M3c.**
`src/fixtures/calc-roundtrip.json` pins whole results, and three of its 38
cases are the mean points with bounds. It is regenerated once, on x86-64, in
the cut's commit X, after every code change of the cut, for the version bump,
item 5 and P1.M3c's bands together. The parsed difference from a253973's
fixture holds only (i) the added `band` keys, (ii) `time-band:first-order` in
`conventions` arrays, (iii) the 30 engine version strings (27 `version` and 3
`engineVersion`), and (iv) the `basis` of the position and speed bounds of
the three mean-point cases (Black Moon Lilith 1850, Mean South Node 1987,
Mean Node 2077 sidereal), now `MEAN_POINTS_BASIS`; nothing else. P1.M3c's
preregistration (`docs/evidence/1.1.0-rc.2-20261102/time-bands/PREREGISTRATION.md`,
check C6) states the same rule. No bound's value changes; calc receipts do not
record bounds and do not change.

## 6. Independent reference for each numeric check

| check | reference | download the owner has not approved |
| --- | --- | --- |
| item 1 under OQ9 (c), E10 | the conformance suite's L2 vectors: ERFA (pyerfa 2.0.1.5) with the published definitions, committed, regenerated for rc.2 by the harness | none |
| item 1 under OQ9 (a), E9 | Swiss Ephemeris 2.10.03 as an instrument through pyswisseph 2.10.3.2, with Swiss's `sepl_18.se1` and `semo_18.se1` (already on disk in the programme folder's `swiss-ephe/`, checked against the digests the refresh script pins before use); aggregates only committed | **yes: pyswisseph 2.10.3.2 from PyPI, in a scratch environment outside every repository [OQ6]** |
| item 1 under OQ9 (b) or (d) | the site's points record of 0.1.1-rc.10, Swiss Ephemeris 2.10.03 as an instrument; under (b) also E11's code identity | none to write the text |
| item 2, E3 | exact arithmetic of a parabola; the station curvatures from the engine's own longitudes, the motion the solver scans (they describe the scan, not the sky) | none |
| item 4, E5 | the build's own files | none |
| item 5, E6 | the committed rc16 comparison (pyerfa 2.0.1.5, already run): no value is recomputed | none |
| item 7, E7 | exact geometry (the colatitude inside the polar circle) | none |
| items 3, 6, 8, 9 | the code and its tests; no new figure | none |

## 7. The release state it needs

The corrections count only in a carried candidate: rc.2's archive in
`artifacts/` with its receipt and manifest entry, on the owner's merge of the
cut PR with a merge commit. The claims are restated when the site's vendoring
PR regenerates `public/developers/engine/reference/` from rc.2, is merged by
the owner, and production serves it (P1.14's release state is `deployed`).
That PR is opened only once site#862 (B3.c, a programme pull request open as
a draft since 2026-11-01) is merged or closed, and the adoption branch is
pushed without one until then **[OQ8]**. The site's adoption of rc.2 also
needs the downloads of OQ6 to pass its version-bound tests. npm publication
is not needed.

## 8. Readings chosen after runs

Prototype runs were made during scoping, and for F-89 two measurements came
first: the site's blind-band run of 2026-10-12 and the draft's comparison of
the 0.1.1-rc.10 and 1.1.0-rc.1 Vertex code. Any reading here chosen after
those runs, including the figures of item 2, the code-identity route of OQ9
(b), the choice of the ERFA figure under OQ9 (c), and the claim of R-F89 that
the fixes are "corrected", counts as `validated`, not `accepted`, until the
owner ratifies it **[OQ5]** (site `docs/platform/programme/README.md`,
*Status and release*, lines 92 to 94; DECISIONS-2026-10-05 §4).

## 9. The site side, and the record

After the site vendors rc.2 (the #840 pattern, in the site's one programme
PR):

1. Regenerate the reference and its `release/` copies, the MCP adapter's
   NOTICE (which carries the engine's NOTICE unchanged) and the compute
   banner (which copies the NOTICE, so the compute bundle's privacy review
   runs again, as for any new engine version).
2. Replace the twelve F-89 sentence records and the three companion records
   (the README's "A measured bound ...", and "Its bounds ..." in the served
   NOTICE and the MCP adapter's NOTICE), and list every new sentence S1
   found.
3. Restate the claims of items 2 to 9 as supported on rc.2's text, with
   evidence at rc.2's source commit; reword `eng.calc-bounds` and
   `eng.calc-bounds-measured` to name ERFA for the mean points; item 1 as
   OQ9 decides.
4. Set `maxOpenOverstated` to the open count (R-F89, point 3: 2 under OQ9's
   default (c), or (a) with E9 passing, or (b); 3 under (d), or (a) with E9
   failing).
5. Correct the site comment that repeats item 2's figures,
   `src/lib/engine/returns.ts:31-33`.
6. Append to F-89's disposition in FINDINGS (entries are appended, never
   rewritten): which statements rc.2 corrected, item 1's state under OQ9, and
   the three companion sentences found with the same defect.

In the engine, rc.2's evidence README states that
`docs/evidence/calc-api/tools/bounds.py` gained `MEAN_POINTS_BASIS` and that
no value changed; the calc-api record's other files are not rewritten.
`docs/evidence/1.1.0-rc.2-20261102/f89/` holds E1 to E11's outputs as they
apply, `blind-band.mjs` and `blind-band.json`, and the scan tool.

**Record wording that does not overclaim.**

- With item 1 open, say "F-89: eight of nine statements corrected in
  1.1.0-rc.2; the Vertex wording corrected, its claim open"; do not say
  "F-89 closed" while item 1 is open.
- Do not change P1.14's status, weight or release for this cut; its note may
  say the F-89 corrections reached the reference.
- Do not call item 2's figures accuracy: they describe a fixed-step scan of
  the engine's own motion.
- Do not present code identity as a rerun, or a rerun on rc.1 as one on rc.2.
- Name the ratchet's three (or two) remaining claims and what resolves each.

## 10. Owner questions that bear on this file

Numbered as the cut's plan numbers them, OQ1 to OQ14 (OQ14, for the private
birth-data search, was added last). None was answered at commit P, so each
default below is what this file is written to. An answer given later is a dated
amendment (section 12), made before any formal run it affects.

| OQ | Question | Default written here | What another answer changes |
| --- | --- | --- | --- |
| OQ1 | The cut's scope, the nine F-89 fixes among its units | as listed | If F-89 leaves the cut, this file is withdrawn by a dated amendment, not run |
| OQ3 | Sizes, approved once as ceilings (cap 1,100,000; `./calc` 156,000; the others), or the CHANGELOG's 0.x history moved out instead of the cap raise; (c) the budget written is the ceiling | the ceilings; (c) the ceiling | F-89 adds about 1.9 KB of packed bytes (README +816, NOTICE +167, LICENSING +261, declarations about +127, `dist/calc.js` about 0.5 KB; the draft's section 9). `./calc` had 239 bytes left at 1.1.0-rc.1, so from this unit on it is over 145,500, and `package:contents` needs the size commit S, or an uncommitted trial edit, until the owner answers |
| OQ5 | Ratify the readings chosen after the runs (section 8), here R-F89 | asked before the formal runs | Unratified, the readings stay `validated` |
| OQ6 | Scratch installs outside the repositories: pyswisseph 2.10.3.2 (and pyerfa 2.0.1.5 with numpy 2.4.6) | none installed until approved | With pyswisseph, OQ9's default is (a), and E9 runs; without either, the site's adoption of rc.2 cannot pass its tests, so the claims cannot be restated in production with rc.2 |
| OQ8 | Site order: site#862 (B3.c) is an open programme PR | the vendoring branch is pushed without a PR until #862 is merged or closed | The owner may allow a second programme PR on the site |
| OQ9 | Item 1, the Vertex: (a) rerun with pyswisseph on rc.2; (b) close on the 0.1.1-rc.10 record and code identity; (c) the ERFA-arbitrated figure from the engine's own `conformance/RESULTS.md`, retiring the Swiss claim; (d) the drafted text, claim open | (a) if OQ6 approves pyswisseph, else (c) | (d) leaves the ratchet at 3 and a README figure from another build; (b) and (c) give 2, and so does (a) if the rerun stays within 0.00002″ (section 4) |
| OQ10 | F-89 beside P1.14: (i) whether the F-89 fixes count toward P1.14; (ii) F-90's corpus values, keep and say so in LICENSING.md, or replace; (iii) the footer allowance for `public/sdk/engine/`; (iv) step 1.14h, the trigger-word and translation gaps | F-89 closes F-89 only and P1.14 stays partial; F-90 is not in rc.2 unless answered before the source commit; the footer and 1.14h are site-side, later | "keep" answered before the source commit adds two LICENSING.md sentences to rc.2 (amended into this file first), and the F-90 claim can close on vendoring; the footer claim can close with the allowance; whether P1.14 can ever be accepted without new site work |
| OQ14 | The owner-approved birth-data scanner excludes only `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, not the whole folder; should it exclude the whole folder for engine pushes (a copy of the scanner kept outside the repositories whose pathspec and archive-member skip cover `:(exclude,top)docs/evidence/calc-sidereal-2026-10-05`, its output naming the exclusion)? | ask before any engine push: the search does not run on the engine, and nothing is pushed, until the owner answers | Another rule for the search is written into the scope limitation as a dated amendment before the first push |

## 11. Not established

The physical accuracy of anything item 2's figures describe (they describe a
fixed-step scan of the engine's own motion); a Swiss figure for rc.2 without
E9; P1.14's acceptance; F-90's and the footer's claims; the trigger-word gap.

## 12. Amendments

Any change after commit P to a reading, a phrase, a pin, a pass condition or a
control is an amendment: dated, with its reason, appended to this section,
never an edit in place. An owner answer that arrives after commit P is such an
amendment, made before any formal run it affects. An amendment adopted after
its result was seen makes the reading `validated` only, until the owner
ratifies it. Once a formal run has been seen, a change of rule is a new
version of this preregistration, which cites this one and its results.

None at commit P.

**2026-11-03, the owner's answers.** The answers to OQ1 to OQ14, given under
the owner's delegation of that day and before any formal run, are in
[`../OWNER-ANSWERS.md`](../OWNER-ANSWERS.md). For this unit: item 1 under OQ9 (c),
as commit 48e4e76 applied it, so E10 runs and E9 and E11 do not; OQ10's Q2,
the fixes close F-89 only and P1.14 stays partial; Q3, F-90 is not in rc.2;
Q4, the footer allowance is site work after rc.2. OQ5 is not answered under that delegation (zodiacs.org
`DECISIONS-2026-10-05.md` §4). R-F89 stays
unratified, and so does OQ10's Q5, which is not answered either.
