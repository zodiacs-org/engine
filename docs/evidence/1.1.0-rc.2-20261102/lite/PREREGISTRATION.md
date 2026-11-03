# Preregistration: `@zodiacs/engine/lite` and P2.E declinations, sect, composite and dignities

Engine 1.1.0-rc.2. Written on 2026-11-02 (ICT), before any code of the entry
exists. It is committed in commit P of the cut, together with the four other
preregistrations of 1.1.0-rc.2 and nothing else, before any code of the cut.
Commit P is pushed alone, as the first head of the draft cut pull request, so
that GitHub dates it; no formal run happens before commit P is on GitHub. The
site adoption pull request commits the same text beside its parity tool before
that tool first runs. After commit P this text is never edited in place: an
owner answer, or any other change, is a dated amendment appended to
section 11. Gates are not loosened after results are seen. A gate that fails
is recorded as failed, with its numbers.

- **Written from** the draft `notes/rc2-2026-11-01/drafts/lite/PREREGISTRATION-lite.md`
  and its design `DESIGN-lite.md` beside it (programme notes, not in this
  repository), with the corrections of the cut's plan
  (`notes/rc2-2026-11-01/drafts/critic/RC2-PLAN.md`, section 1) that concern
  this text: K1 (sections 6 and 8), K2 (L9), K8 (D1 and D3), K10 (this
  header), K13 with OQ14 (the birth-data search), K15 (L11), K22 (B1 and B5
  in SR) and K24 (owner questions). Where the draft pointed to its design for
  a list that a check depends on, the list is written out here.
- **Line references** are to engine main a253973
  (`a2539735f99fe38f9623cd1101de96b8c5cdf0f0`) and site main 9a67f761
  (`9a67f761bc231741c6571af2dfae65b798954e11`) unless a line names another
  commit.
- **Reports and owner questions.** "Report n" is entry n, counted from 0, of
  the scoping journal `notes/rc2-2026-11-01/rc2-scope-journal-results.json`:
  report 0 the cut, 1 prior work, 2 the site adoption, 3 ΔT and F-53, 4
  vargas and KP, 5 the lite entry, 6 the scoping critic. Owner questions are
  the cut's OQ1 to OQ14 (section 8); each place an answer would change this
  file is marked **[OQn]**.

## 0. Sources, scope limitation and earlier runs

Read for the draft:

- the engine clone `engine-rc2` at `a2539735f99fe38f9623cd1101de96b8c5cdf0f0`
  (branch `rc2/main-first`), read only, no build and no test run;
- site main through `git -C site-b3c show origin/main:<path>`, at `9a67f761`
  (the merge of #860, 2026-11-01). The four site modules, `ecliptic3d.ts`,
  `EclipticView.tsx`, `budgets.json` and `report-bundles.mjs` are unchanged
  since `0d3ee795`, where scoping measured them; between the two commits the
  ledger and FINDINGS changed only for P4.5 (F-99 to F-103), and the P2.E
  entries kept their lines;
- the scoping journal, reports 0, 2, 5 and 6.

**Scope limitation, declared.** The owner's rule for the engine repository,
kept for this file and for every step it fixes: never open, read, run,
import, grep, search or inspect
`docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`; explicitly
exclude `docs/evidence/calc-sidereal-2026-10-05/` from every recursive scan,
copy or archive; never pass a revision to `git grep`; add
`-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'` to any git command
that walks a tree; run `git status` only as
`git status --porcelain -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`.

- **The draft.** Written in the isolated, blobless clone `engine-rc2`, whose
  sparse checkout (`/*` and `!/docs/evidence/calc-sidereal-2026-10-05/`, as
  `git sparse-checkout list` prints it) leaves that folder out. Every search
  named its files or folders (README.md and single files of `docs/`,
  `docs/jsr/`, two evidence folders of techniques and of 1.1.0-rc.1, the file
  list of the carried rc.1 archive) or ran under `src/`, `scripts/` or
  `api/`; one listing of `docs/evidence/`, by folder name and not recursive,
  showed the excluded folder absent. In the engine clone git ran only as
  `rev-parse`, `branch --show-current`, `sparse-checkout list` and the
  `git status` form above; no `git grep`, `show`, `log -p`, `archive` or
  `diff`. Report 6 (finding 26) records an earlier breach during scoping:
  nine scratch copies of the engine held that folder, and nothing in it was
  opened. Those copies are gone: on 2026-11-02 the scratchpad's top level had
  no `rc2/` folder (listed by name, nothing opened).
- **Commit P.** Made in the same clone, whose sparse checkout leaves
  `docs/evidence/calc-sidereal-2026-10-05/` off the disk. The clone's local
  identity, "Zodiacs Admin" <admin@zodiacs.org>, was set with
  `config user.name` and `config user.email` just before the writing began.
  Every git command run there that walks a tree carried the exclusion pathspec
  above; no `git grep`, `log -p` or `archive` ran; directories were listed by
  name, never recursively, and the excluded folder appears in none of the
  listings; no file inside it was opened or read. The commit was amended before
  any push, to correct these texts after two reviews.
- **Every later step.** Each check this file fixes leaves that folder out of
  its traversal. Every clone used for a build, a pack, a gate or a run is
  `engine-rc2` itself or a sparse clone made as `git clone --no-checkout
  --no-local <repository> <dir>`, then `git -C <dir> sparse-checkout set
  --no-cone '/*' '!/docs/evidence/calc-sidereal-2026-10-05/'`, then
  `git -C <dir> checkout --detach <commit>`; never a plain clone or a
  worktree. A copy of an engine tree is made only with `git archive <commit>
  -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`. Archive rebuilds
  (`node scripts/verify-archive-binding.mjs --rebuild-all`, and the same
  check on the carrier commit, which writes every file of each rebuilt tree
  from git objects) run only in CI's jobs, whose run ids the gate record
  cites.
- **The private birth-data search.** It runs before every engine push, counts
  only, and is relied on here (this section's rule, and the release state of
  section 6). The scanner the owner approved excludes only the one file named
  above, not the folder, so on the engine it runs only with the whole folder
  excluded and only once the owner has answered OQ14 (section 8). Until then
  no engine push is made.

**Earlier runs, disclosed.** Scoping built and ran the design this file
preregisters (report 5):

- five engine prototypes on `a253973` (A, D, E, F, G), measured in the engine
  and in a byte-exact local rebuild of site `0d3ee795`;
- parity of the package with the site on 4,000 synthetic charts (declinations
  and sect), 2,000 composite cases and the 144 dignity pairs;
- the closure test `check-lite-entry-g.mjs` on G and on three broken builds.

The prototypes, the closure test and the parity harnesses are no longer on
disk (same listing). Every figure quoted from them below is report 5's or
report 6's, not measured again.

**What follows from that.** A gate that passes only under a reading adopted
after its residuals were seen counts as `validated`, not `accepted`, until the
owner ratifies the reading (site `docs/platform/programme/README.md`, *Status
and release*, lines 92 to 94; DECISIONS-2026-10-05 §4, lines 52 to 65, which
keep that judgement with the owner even under a general delegation). So every
reading in this file chosen after the scoping prototypes counts as
`validated` until the owner ratifies it **[OQ5]**. Section 2 marks every such
reading. The formal runs use new seed texts (section 4.2) and a corpus drawn
afresh. The seeds scoping used, `20261101`, `424242` and `7` (report 6,
finding 17), and the rc.16 text `site-engine-rc16` are not used.

**Why a preregistration at all.** The brief makes preregistration mandatory for
claims of superiority, completeness, accuracy or error bound, and asks named
tests of ordinary work (ENGINE-AND-PLATFORM-BRIEF.md lines 72 to 74 and 859 to
861). The P2.E gates ask for product parity: the site gets the same answers
from the package as from its own code. No check here supports an accuracy
claim, and no result here may be quoted as one. This file exists because
prototypes have already run and because the cut's plan asks for it before any
code (report 6, plan step 3).

## 1. The units and their gate

| Unit | Weight | Title in the ledger | Status, release at `9a67f761` | Line |
| --- | ---: | --- | --- | ---: |
| P2.E.declinations | 0.5 | Site imports declination parallels from the package | merged, merged ("engine rc.11") | 1486 |
| P2.E.composite | 0.5 | Site imports composite charts from the package | not-started, none | 1524 |
| P2.E.dignities | 0.5 | Site imports dignities (triplicity, terms, faces, reception) from the package | not-started, none | 1537 |
| P2.E.sect | 0.5 | Site imports sect from the package | merged, merged ("engine rc.10 sectOf") | 1550 |

The gate, the same for all four, word for word as
`docs/platform/programme/acceptance-ledger.json` gives it (lines 1492, 1530,
1543 and 1556):

> package function released; the site imports it and its own implementation is removed; parity recorded; deployed

Site main accepts 83.95 of 182.45 (46.013 per cent); with all four accepted it
would be 85.95 (47.109 per cent), both computed from the ledger at `9a67f761`.

Recorded decisions this cut acts on: DECISIONS-2026-09-30 §4 (the site keeps
its declinations and sect until an entry that loads no ephemeris exports them,
and the sect convention is named as an option);
DECISIONS-2026-10-01-rc16-composite (composite waits for a lightweight
published entry, with no route budget increase); FINDINGS F-54 with its two
additions of 2026-10-01 (FINDINGS lines 355 to 361, 430 to 446 and 473 to
483); F-67, an acceptance that missed a second copy of a technique (lines 536
to 543).

## 2. The reading this cut is judged by

**R1. "package function released".** The function is exported by a public entry
point, `@zodiacs/engine/lite`, of an engine candidate whose archive is carried
in the engine's `artifacts/` with its receipt, merged to engine main by the
owner, and vendored by the site. npm is not needed: publication is its own
unit, P3.1a (programme README line 74), and P2.E.progressions was accepted on
a vendored candidate. Prior practice, not chosen after the runs. **[OQ2]**
Without the new entry no package function serves these four units without
loading the ephemeris, and they stay as they are.

**R2. "the site imports it".** The production code that computes each unit calls
the `./lite` functions through four adapter modules (`src/lib/declination.ts`,
`sect.ts`, `composite.ts`, `dignities.ts`), which are the only importers of
`@zodiacs/engine/lite` under `src/` and `api/` (check B3). Prior practice: the
rc.16 adapters keep the site's shapes.

**R3. "its own implementation is removed".** No production path in `src/`
computes the unit with site code, the rule F-67 applied. Per unit:

- declinations: the parallels and contraparallels, the second `declinationOf`
  (`src/lib/wheel/ecliptic3d.ts` lines 248 to 258), and the out-of-bounds rule
  (`src/islands/chart3d/EclipticView.tsx` lines 402 and 421) all come from the
  package. The obliquity stays a value the site passes;
- sect: the day or night rule, Mercury's orientality, the sect light and the
  in-sect and out-of-sect lists come from the package. The Sun's altitude stays
  an input that the view's own geometry computes (`altitudeOf`,
  `ecliptic3d.ts` lines 278 to 287, from the frame the view draws its horizon
  with, EclipticView line 538);
- composite: the midpoint arithmetic and the aspect matching come from the
  package. The rule that leaves the Moon out of an untimed person's picture
  (`pictureBodies`, `src/lib/share-positions-noon.ts` lines 123 to 137, F-45)
  and the provisional Moon mark stay: they choose which bodies the site draws,
  not how a composite is computed;
- dignities: the four-condition table and its precedence come from the
  package. `DIGNITY_GLOSS`, site copy, stays. So does the People pilot's own
  frozen copy of the table (`docs/phase5/people-pilot/tools/compute-astro.mjs`
  lines 63 to 77, F-70), which check 16 then compares with the package (B6);
- an adapter that renames fields, copies frozen rows into mutable ones, or
  turns the package's `RangeError` into the site's neutral answer (null, an
  empty list, false) is not an implementation.

Chosen after the runs (the altitude-as-input and pilot-copy readings above
all), so `validated` until ratified. **[OQ5]** If the Sun's altitude is
read as part of the sect implementation, the package must compute it from the
instant and the place, which this cut does not design. If the pilot's frozen
table is read as a site implementation, P2.E.dignities waits for the pilot's
next unfreezing.

**R4. "parity recorded".** One committed record per adoption, made in one process
on one engine: the site's own code at the adoption's base commit, read from git
objects, against the site's adapters at the adoption's head and against the
package entry. Every value compared exactly (`Object.is` on every leaf, list
order and length included); every difference given one cause from the closed
list of section 4.3, whose predicates are fixed here; none unexplained. Prior
practice is the rc.16 record
(`docs/platform/evidence/site-engine-rc16/tools/compare-techniques.mjs`, whose
`compare` sits at lines 262 to 285); the new causes and their thresholds were
chosen after report 5's residuals were seen, so `validated` until ratified.
**[OQ5]**

**R5. "deployed".** Production serves the adoption: the zodiacs.org alias names a
READY deployment built from the owner's merge commit, the chunks that hold the
four adapters equal a local build of that commit byte for byte and hold the
package's code, and the post-merge Site Check passes (section 6). Prior
practice, as P2.E.returns' evidence records it.

**R6. The dignities title, "(triplicity, terms, faces, reception)".** Read as
what the package releases: `./lite` exports the triplicity lords, the Egyptian
terms, the Chaldean faces, `essentialDignities` and `mutualReceptions` beside
the four-condition functions, and the site replaces its four-condition table.
The site is not required to show the other dignities. Chosen after the runs,
so `validated` until ratified. **[OQ4]** **[OQ5]** If the site must show
them, P2.E.dignities needs new site pages and copy, outside this cut, and
stays unaccepted.

Conventions this cut is written to, each the recommended answer to **[OQ4]**:

- **C1. Sect by the Sun's altitude, named:**
  `sectReading({ convention: "altitude", ... })`, day when the altitude is 0
  or more (site `src/lib/sect.ts` line 69). The ecliptic rule is the other
  named convention; the root's `sectOf` does not change. If the owner picks
  the ecliptic rule for the site, the site's sect changes in polar charts (in
  233 of the 800 polar prototype charts, report 5), the 3D page's copy that
  defines sect by the horizon (`src/pages/birth-chart/three-dimensions/index.astro`
  lines 77 to 78 and 228 to 236) must change, and S2-A and S2-B become
  recorded sections with cause `sect-convention`.
- **C2. Declinations with the site's mean obliquity of date, passed
  explicitly:** the IAU 2006 mean obliquity at the site's UTC Julian centuries,
  or 23.4392911° without an instant (EclipticView lines 227 to 230). If the
  owner picks the true obliquity, the site needs it from a source that loads
  no ephemeris (for example `./time`'s `tilt`, whose cost in the site's lazy
  view chunk was not measured), the pair set changes in 4 of 4,000 prototype
  charts (report 5), and D2-O becomes the parity basis.
- **C3. The Sun is not flagged out of bounds while its ecliptic latitude is
  within 0.001°** (`SUN_BOUND_LATITUDE`, `src/declination.ts` lines 47 and
  272), as the package already does. The site's own code flags it, and did in
  8 of 4,000 prototype charts, at margins of +0.16″ to +0.62″ (report 5). The
  site's published copy says the Sun "never can" (three-dimensions/index.astro
  line 70). Keeping the site's flag would need a new named option in the
  package (docs/versioning.md lines 110 to 113), outside this cut.
- **C4. Dignities: the four-condition table, under R6.**

## 3. Engine checks, in the cut PR

The unit's engine commits, in order (the cut's plan, section 5.5): **L-a**
moves composite to `src/techniques/composite.ts` and the name helpers to
`src/techniques/names.ts`, with re-exports left behind (no new entry;
`api:check` unchanged; `./techniques` +60 bytes in report 5); **L-b** adds
`sectReading` (`src/sect.ts`, `src/sect.test.ts`), not yet exported; **L-c**
adds the entry.

Each check runs on the cut's build. A control is a deliberately broken input the
check must fail on; a check whose control passes is itself failed. No engine
check needs a download the owner has not approved.

| Id | Check | Pass | Control that must fail | Reference | Download not approved |
| --- | --- | --- | --- | --- | --- |
| L1 | Static closure of the built entry | From `dist/lite.js` every specifier is relative and under `dist/`; no `import(` in any file; `dist/lite.js` imports exactly the four parts; the parts contain no import or export-from statement | Unit test on synthetic files: a part importing a chunk, a dynamic import, a fifth file. Evidence run on three real broken builds: `lite.js` also re-exporting `compositeChart` (esbuild then inlines astronomy-engine, a 131,138-byte file in report 5), a part built with astronomy-engine external, the parts built with splitting on | The built files | none |
| L2 | Module list and markers | `dist/metafile-lite.json` merged with `dist/metafile-esm.json` describes every `dist/*.js` byte for byte (`scripts/root-isolation.mjs` lines 62 to 71, on the merged list); the entry's import closure over sources equals the pinned list below (`src/lite.ts` and 15 modules); each part's held and marked modules lie inside its own pinned list; nothing under `node_modules/` | A `lite-composite.js` built from `src/techniques/relationship.ts` (its sources then include `src/api.ts`); a module list one byte stale | esbuild's metafile and the `// src/` markers, read both ways | none |
| L3 | Fingerprints | No file of the entry holds `astronomy-engine`, the two markers the site checks (`Value is not boolean:`, `Light-travel time solver did not converge`; site `scripts/report-bundles.mjs` line 349) or the ΔT model id `zodiacs-deltat/1` | A copy of a part with one marker appended | astronomy-engine 2.1.19's own strings | none |
| L4 | Loads without the ephemeris | In a Node process whose resolve hook throws on `astronomy-engine`, `import("@zodiacs/engine/lite")` succeeds and every export is defined; on Node 20.19.0, 22 and 24 | The root entry under the same hook fails with the hook's error | Node's module loader | none |
| L5 | Same answers as the root and `./techniques` | On the corpus below, every lite function's result deep-equals (`Object.is` on every leaf) the same function's from the root (declinations) or `./techniques` (composite, dignities), and the same inputs are refused with the same error class; `sectReading` under the ecliptic convention gives the root's `sectOf`. Identity is asserted to differ | A lite build from a source copy with the luminary orb changed from 1.5 to 1.4 | The same build's root and `./techniques`: a consistency check, not an independent one | none |
| L6 | The engine's site-parity corpora on lite | `checkComposite` and `checkDignities` (`scripts/techniques-parity-check.mjs`) pass on the fixtures from site commit `67cccac5` (`src/techniques/fixtures/site-parity/`) with lite's functions, as with `./techniques`'s | A fixture copy with one composite longitude changed in its last bit | The site's outputs those fixtures hold | none |
| L7 | Sect fixtures not taken from the engine | The site's 11 cases (`src/lib/sect.test.ts` at site main: three of orientality, eight of sect), ported unchanged; altitude 0 and -0 give day; under the ecliptic convention the Sun exactly on the ascendant gives night and on the descendant day (`src/points.ts` lines 72 to 80); Mercury on the Sun is occidental and opposite it oriental; longitudes outside [0, 360); the two charts at 78.2° N of `docs/timing-hellenistic.md` lines 360 to 365, where the ecliptic convention gives day with the Sun 11.0° below the horizon and night with it 12.1° above, and the altitude convention the opposite | A `sectReading` with the altitude test written `> 0`, and one with orientality's test written `>= 0` | The site's tests and the definitions. For the two polar charts, margins of 11.0° and 12.1° exceed the README's largest declination error (21.6″, README lines 443 to 452) by more than a thousand times, so no arbiter is needed for the sign | none |
| L8 | One set of names | The runtime names of `dist/lite.js`, the names `dist/lite.d.ts` declares (read with the TypeScript checker as `scripts/api-report.mjs` reads them) and the names `src/lite.ts` exports are the same 51, listed below, none lost to two parts exporting it | A `lite.d.ts` missing one name; two parts exporting one name | The TypeScript checker | none |
| L9 | API report | `npm run api:check` passes with a new `api/lite.api.md`, and every other file in `api/` is byte-identical to its state at the commit before L-c: the lite unit changes no other report | `api:check` without `api/lite.api.md` ("is missing") | `scripts/api-report.mjs` | none |
| L10 | Root isolation and the table check | `OPT_IN_SOURCE` names `src/lite.ts`, `src/lite/` and `src/sect.ts`; the root's static graph reaches none of them; the pure-tables check passes on every lite file | The synthetic root build of `scripts/root-isolation.test.mjs` importing `src/lite/declinations.ts`, and one importing `src/sect.ts` | `scripts/root-isolation.mjs`, `scripts/pure-tables.mjs` | none |
| L11 | Sizes | `npm run package:contents` passes with `"./lite"` in `ENTRY_BUDGETS` at the owner's ceiling and the entry's six files in `required`. Between builds of the commit before L-a and of L-c, every other entry's graph keeps its files and bytes, except `./techniques` (+60 bytes in report 5) | The same check with the `./lite` budget one byte under its measured graph | `npm pack --dry-run --json` and the script's own count | none |
| L12 | Packed consumer | `scripts/verify-packed-consumer.mjs` imports `./lite` with a typed use and a runtime block, on Node 20.19.0, 22.7.0, 22 and 24 | An archive whose `exports` lack `./lite` (run once, at the evidence run) | The packed archive | none |

**L9, why not main's `api/`.** Byte identity with main's `api/` cannot hold
in this cut: `./time` exports `TimeScale`, `TimeScaleName`, `Ut1MinusUtc`,
`LeapSeconds`, `DeltaT`, `DeltaTSegment` and `EPHEMERIS_SPAN`, which
`api/calc`, `geo`, `receipt`, `techniques`, `timing` and `vedic.api.md` list
under "Referenced, not exported here", so their `// exported by` lines gain
`@zodiacs/engine/time (...)`; P1.M3c changes `api/calc.api.md` and
`api/time.api.md`, and P2.B.vargas `api/vedic.api.md`. L9 therefore compares
with the commit before L-c, and holds that `./lite` changes no report but its
own.

**L2's pinned list.** The entry's closure over sources, from engine main's
imports (type-only imports such as `src/types.ts` and `src/deltat.ts` are
erased and are not listed; report 5's prototype held 15 allowed sources):

| File | Sources |
| --- | --- |
| `lite.js` | `src/lite.ts` |
| `lite-declinations.js` | `src/lite/declinations.ts`, `src/declination.ts`, `src/exact.ts`, `src/body-label.ts` |
| `lite-sect.js` | `src/lite/sect.ts`, `src/sect.ts`, `src/points.ts`, `src/signs.ts`, `src/read-options.ts` |
| `lite-composite.js` | `src/lite/composite.ts`, `src/techniques/composite.ts`, `src/techniques/names.ts`, `src/read-options.ts`, `src/aspects.ts`, `src/points.ts`, `src/signs.ts` |
| `lite-dignities.js` | `src/lite/dignities.ts`, `src/techniques/dignities.ts`, `src/techniques/names.ts`, `src/read-options.ts`, `src/signs.ts` |

`src/lite.ts` and 15 modules in all. `src/declination.ts` and `src/points.ts`
are root modules, so `OPT_IN_SOURCE` cannot name them; the pin guards them
instead (report 0, finding 7). If the cut's build gives another list, the
difference is explained and the pin changed by a dated amendment before any
formal run, never after.

**L8's 51 names** (27 values and 24 types):

| Part (`dist/`) | Source the part re-exports | Values | Types |
| --- | --- | --- | --- |
| `lite-declinations.js` | `src/declination.ts` (unchanged) | `DEFAULT_DECLINATION_ORB_POLICY`, `RA_POLE_TOLERANCE`, `SUN_BOUND_LATITUDE`, `declinationOf`, `declinationOrb`, `declinationsForBodies`, `eclipticToEquatorial`, `findDeclinationAspects` (8) | `DeclinationAspect`, `DeclinationAspectType`, `DeclinationBody`, `DeclinationOrbPolicy`, `DeclinationRow`, `Declinations`, `EquatorialCoordinates` (7) |
| `lite-sect.js` | `src/sect.ts` (new) | `DIURNAL_PLANETS`, `NOCTURNAL_PLANETS`, `SECT_CONVENTIONS`, `orientality`, `sectReading` (5) | `AltitudeSectInput`, `EclipticSectInput`, `Orientality`, `SectConvention`, `SectInput`, `SectReading` (6) |
| `lite-composite.js` | `src/techniques/composite.ts` (moved) | `compositeAspects`, `compositeMidpoints` (2) | `CompositeAspect`, `CompositePosition` (2) |
| `lite-dignities.js` | `src/techniques/dignities.ts` (import line changed) | `CHALDEAN_FACES`, `CLASSICAL_PLANETS`, `DOMICILE_RULERS`, `EGYPTIAN_TERMS`, `EXALTATIONS`, `TRIPLICITY_LORDS`, `dignitiesFor`, `dignityFor`, `dignityRulersAt`, `essentialDignities`, `hasClassicalDignities`, `mutualReceptions` (12) | `ClassicalPlanet`, `Debility`, `DignityRulers`, `DignitySpan`, `EssentialDignity`, `MutualReception`, `PlanetDignities`, `ReceptionOptions`, `SignDignity` (9) |

L5's corpus, seeded by the 32-bit FNV-1a of `engine-1-1-0-rc2-lite:<part>`
(mulberry32): 1,000 declination body sets (3 to 12 bodies, longitudes in
[0, 360), latitudes in [-10, 10], obliquities in [23.43, 23.45], the default
and two other orb policies); 1,000 composite list pairs with exact
coincidences and exact oppositions; the 144 body and sign pairs; 1,000
longitudes for `dignityRulersAt`; 500 `essentialDignities` and 300
`mutualReceptions` inputs; 2,000 ecliptic sect cases, the Sun exactly on the
ascendant and on the descendant among them.

L11's budget value is **[OQ3]**: 29,000 bytes is proposed for the measured
27,458 of design G (report 5), together with a package cap of 1,100,000 or the
move of the CHANGELOG's 0.x history out of the package. The budget written is
the owner's ceiling, and its comment gives the source commit's measured graph
and headroom (OQ3 (c)); it lands in L-c with the `exports` entry, because the
budget keys must equal the `exports` keys. L12 installs the archive's public
dependencies and TypeScript 5.9.3, as the packed consumer does for every
candidate (README line 57); nothing new.

## 4. Site parity, in the adoption PR

### 4.1 How it runs

A tool in the site,
`docs/platform/evidence/site-engine-1-1-0-rc2/lite/tools/compare-lite.mjs`,
written from the rc.16 tool. Three sides:

- **S**, the base commit's site code read from git objects and bundled by the
  site's esbuild for Node, with `@zodiacs/engine` and `astronomy-engine`
  external, as the rc.16 tool bundles it;
- **A**, the adoption head's four adapters, bundled the same way;
- **P**, the installed package's `@zodiacs/engine/lite`.

All three resolve the one installed rc.2, so the charts the site casts through
its `src/lib/engine/full.ts` use the same ephemeris and clock on every side. The
record names the base and head commits, the SHA-256 of every site file read,
the package version, the digest of each lite file, Node's version, the seed
text and the causes. Where the package names a thing differently, the mapping
is written in the record: S against P leaves out P's extra fields
(`maximumOrb`, `convention`); A has the site's shapes. The tool is committed
before its first run. A rerun after any change to the tool or to the code is a
new attempt with a new seed text, and cites the earlier one.

References, and what they need. The reference for every parity value is the
site's own code at the base commit: the gate asks for parity with it, not for
accuracy. The referee of section 4.3 is the one independent arithmetic, written
in the tool. The arbiter of S2-P is astronomy-engine 2.1.19, installed with the
package: separate from the site's and the package's sect code, not independent
of the package's ephemeris, and used only in a recorded section. ERFA through
pyerfa would be independent; it is not needed, because S2-P has no pass
condition and can change no decision unless the arbiter and the site's
altitude disagree in sign beyond 0.01°, in which case the owner is asked
before anything else is done. The dignity tables' agreement with their
published sources stays the engine's existing fixture tests, transcribed from
Ptolemy, Dorotheus, al-Bīrūnī and Lilly
(`docs/evidence/techniques-2026-09-29/PREREGISTRATION.md`, *Fixtures that are
not measurements*). Nothing here needs a download.

### 4.2 Corpus

Seed: mulberry32 seeded by the 32-bit FNV-1a of
`site-engine-1-1-0-rc2-lite:<section>`. Births are invented: 3,000 instants
uniform from 1800-01-02 to 2199-12-30; 2,400 places with latitude uniform in
[-66, 66] and 600 with latitude north or south, its size uniform in [66.6,
88.6] (report 5's prototype held 800 polar charts in 4,000, the same share);
longitude uniform in [-180, 180]. Each chart is the site's own, cast by the
base commit's adapter; the obliquity is the base commit's
`meanObliquity(julianCenturies(utcMs))`; the Sun's altitude is the base
commit's, from the view's frame at scrub zero and `altitudeOf` (EclipticView
line 538); the bodies are the ten the view draws (`GLYPH`, EclipticView lines
115 to 118).

### 4.3 Causes

Causes are tried in the order of the table, and a difference gets the first
whose predicate holds, or `unexplained`. Thresholds are in degrees.

| Cause | Predicate | Why the two differ |
| --- | --- | --- |
| `ecliptic-clamp` | a row with latitude exactly 0 is out of bounds on S only, its declination's size exceeding the obliquity by at most 1e-12 | the package clamps a point on the ecliptic to plus or minus the obliquity (`src/declination.ts` lines 209 to 211) |
| `sun-bound-exemption` | a row labelled `Sun`, out of bounds on S and not on A or P, with latitude of size at most 0.001 | convention C3 (lines 47 and 272) |
| `bound-boundary` | a row's out-of-bounds flag differs and its declination's size is within 1e-12 of the obliquity | the package compares its own double, the site its asin value |
| `orb-boundary` | a pair is in one result only, and where it is present its orb is within 1e-12 of its maximum orb | the package decides the inclusive test exactly on the declination doubles (lines 294 to 321), the site on the float difference |
| `type-tie` | a pair's type differs and one of its declinations is within 1e-12 of 0 | on the equator the two distances are equal; both give the tie to the parallel, the package exactly, the site on floats |
| `order-tie` | the same pairs in another order, every pair that moves having an orb within 1e-12 of the pair it changes place with | an exact sort against a float sort; both stable |
| `declination-formula` | a declination, orb, `decA` or `decB` differs by at most 1e-12, every declination involved being at most 60° in size, with the pair set, types and order equal | the site takes asin of a sine (`ecliptic3d.ts` lines 248 to 258); the package takes atan2 of the rotated vector after reducing the longitude into [0, 360) (`src/declination.ts` lines 190 to 217) |
| `separation-exact` | `separation` differs by at most 1e-12 | the package reduces the difference exactly modulo 360 and rounds once (lines 287 to 292); the site subtracts normalized doubles (`ecliptic3d.ts` lines 151 to 154) |
| `declination-validation` | an input S takes and the package refuses with `RangeError`: a label that is not a trimmed string of 1 to 80 characters without control characters, a body named twice, more than 256 bodies, a number that is not finite or is out of range, an obliquity outside [0, 90] | the package checks its input (lines 136 to 182 and 246 to 268) |
| `sect-validation` | an input S takes and the package refuses: an altitude that is not finite or is outside [-90, 90], a longitude that is not finite, an unknown convention or key | the package checks its input; the site's `sectOf` reads a non-finite Mercury as occidental |
| `sect-convention` | recorded sections only: the two conventions name different sects | convention C1 |
| `composite-validation` | a name that is not one of the twelve bodies, or a body twice | as rc.16 |
| `site-prototype-lookup` | a name `Object.prototype` carries (`toString`, `constructor`, `valueOf`, `hasOwnProperty`, `__proto__`): S's `hasClassicalDignities` answers true (`planet in TABLE`, `src/lib/dignities.ts` line 54) and its `dignityFor` throws `TypeError`; A answers false and null | a site defect the adoption removes |
| `dignity-validation` | a name outside the twelve bodies, or a sign that is not a lowercase slug: S answers null, [] or false, P throws `RangeError` | as rc.16 |

**Referee.** For every pair P gives in D2-A and D2-T, a rational evaluation in
BigInt of the size of `decA - decB` and of `decA + decB`, from P's own
declination doubles, written in the tool and not taken from the package's
`src/exact.ts`, gives the same type, the same inclusion under the maximum orb
and the same order as P. A disagreement is a failure, not a cause. Control: the
referee with its inclusive test written strict must disagree on the fixture
whose declinations are exactly 1° apart.

**The thresholds are post hoc.** Report 5 measured the largest differences on
4,000 charts: declinations 1.4e-14, orbs 1.8e-14, separations 1.1e-13. The
argument for 1e-12 is made without those figures: each side evaluates its
formula in doubles with a handful of roundings, and for a declination of at
most 60° asin is at worst twice as sensitive as its argument, so each side is
within a few units in the last place of the angle; one unit in the last place
at 360° is 2^-44, about 5.7e-14, and 1e-12 is about 17 of them. The
thresholds were nonetheless chosen after the figures were seen, so they count
as `validated` until ratified. **[OQ5]**

### 4.4 Sections and what each must show

Declinations:

- **D2-A.** `findDeclinationAspects` on the 3,000 charts' ten bodies at C2's
  obliquity. S against A: no difference but by `orb-boundary`, `type-tie`,
  `order-tie`, `declination-formula` or `separation-exact`. S against P:
  recorded with the same causes.
- **D2-R.** Each body's declination and flag: S's `declinationOf` and
  `Math.abs(dec) > obliquity` (EclipticView lines 396 and 402) against A's
  rows. No difference but by `ecliptic-clamp`, `sun-bound-exemption`,
  `bound-boundary` or `declination-formula`.
- **D2-P.** As D2-R for a second chart's bodies as the view passes them
  (lines 412 to 428): 500 charts, half of them with every latitude exactly 0,
  as a longitude-only side has.
- **D2-T.** Named fixtures, same rules as D2-A and D2-R: at obliquity 0
  (where the package's declination is the latitude itself, line 208),
  declinations 13.3 and 12.3 (exactly 1° apart, a parallel at orb 1), 8.3 and
  7.3, and 1.1 and 0.1 (README lines 484 to 486); two bodies on the equator; a
  luminary pair at orb 1.5; the Sun at 90° and 270° with latitude 0 and
  ±0.0005°; a node at longitude 90° with latitude 0.
- **D2-X**, recorded, no pass condition: inputs the package refuses; cause
  `declination-validation`.
- **D2-O**, recorded, no pass condition: the charts with the package's true
  obliquity of date (the root's `chartDeclinations`) against C2's, counting the
  pair sets and flags that change. It informs OQ4 only.

Sect:

- **S2-A.** The site's `sectOf` against A's on the 3,000 charts: every field
  equal, no cause allowed. S against P: sect, light, Mercury, the two lists and
  the altitude equal (P's `convention` left out).
- **S2-B.** Constructed: altitude 0, -0, ±`Number.MIN_VALUE` and ±1e-12;
  Mercury on the Sun, opposite it, absent as null and as undefined; longitudes
  -10, 370 and 720. No cause allowed.
- **S2-E.** P's ecliptic convention against the root's
  `sectOf(ascendant, sun)` on the 3,000 charts and with the Sun exactly on each
  angle. No cause allowed.
- **S2-P**, recorded, no pass condition: the altitude rule against the
  ecliptic rule on the 3,000 charts; each disagreement judged by the Sun's
  geometric altitude from astronomy-engine 2.1.19 (`Equator` of date with
  aberration, `Horizon` without refraction) where that altitude exceeds 0.01°
  in size; counts for each rule and the unjudged. It informs OQ4 only.
- **S2-X**, recorded: cause `sect-validation`.

Composite:

- **C2-M.** 500 pairs of body lists with exact coincidences, exact oppositions
  and near-oppositions, as rc.16's C-M: S, A and P agree, no cause allowed.
- **C2-R.** 500 pairs of the site's own charts: no cause allowed.
- **C2-P.** 300 pairs as the relationship page passes them, through the base
  commit's `pictureBodies` (timed and untimed persons; the untimed lose the
  Moon) and `buildCompositeTabData` (`relationshipData.ts` lines 114 to 126):
  S against A, no cause allowed, and `compositeDataKey` equal.
- **C2-X**, recorded: rc.16's three lists, a body twice in the second list, a
  non-finite longitude; cause `composite-validation`.

Dignities:

- **DG-X.** `dignityFor`, `dignitiesFor` and `hasClassicalDignities` for every
  body in every sign (144): S, A and P agree, no cause allowed.
- **DG-N.** rc.16's seven (Chiron and aries, Ascendant and leo, an empty name
  and leo, sun and leo, Sun and Leo, Sun and an empty sign, Mars and
  ophiuchus) and five names `Object.prototype` carries, each with leo. S
  against A: no difference but `site-prototype-lookup`. S against P: recorded,
  with `dignity-validation` or `site-prototype-lookup`.

### 4.5 Controls for the tool

Run by the tool's own test, `compare-lite.test.mjs`, not in the record:

1. a base bundle with one site rule changed (the luminary orb 1.5 to 1.4999)
   must give unexplained differences in D2-A;
2. for each cause, a constructed difference just outside its predicate (twice
   its threshold; a Sun row at latitude 0.002°; a pair outside the boundary
   band) must stay unexplained;
3. an adapter whose altitude test is written `> 0` must fail S2-B;
4. an adapter that lets `RangeError` escape must fail DG-N;
5. a base bundle whose `declinationOf` drops the ecliptic latitude must give
   unexplained differences in D2-R, D2-P and D2-T;
6. an adapter that gives the Moon as the sect light by day must fail S2-A,
   and a lite build that counts the Sun exactly on the ascendant as day under
   the ecliptic convention must fail S2-E;
7. an adapter whose composite midpoint takes the longer arc must fail C2-M,
   C2-R and C2-P;
8. a package build from a source copy with Mercury exalted in Gemini must
   fail DG-X.

### 4.6 What the record must show

For each unit, its sections' cases, values, agreements and differences by
cause; `unexplained` empty; no difference at all in the sections that allow no
cause. A unit whose record fails is recorded as failed, and the record is kept.

## 5. Site bundles, isolation and tests, in the adoption PR

- **B1. Route budgets on both builds.** `node scripts/report-bundles.mjs --fail`
  passes on the default build and with production flags, `budgets.json`
  unchanged: `/birth-chart/` 71 KB (72,704 bytes), `/compatibility/` 36 KB
  (36,864), `chunk-max` 60 KB (61,440), `engine-chunk` 32.598046875 KB
  (33,380.4). Report 5 measured design G on site `0d3ee795`: `/birth-chart/`
  70,593 bytes with production flags (+441, 2,111 left) and 67,404 by default
  (+442, 5,300 left); `/compatibility/` +0 (default +1); the engine chunk and
  `chunk-max` unchanged. Those are expectations: before the source commit SR
  (below) reports them on the candidate with every unit of the cut in it,
  where lite's adapters are not yet written, so SR measures the engine's own
  effect; B1 itself is judged in the adoption, which measures every unit
  together. Control: the same run with `/birth-chart/` lowered to 1 KB below
  the measured value fails. No route budget may rise
  (DECISIONS-2026-10-01-rc16-composite). Engine-chunk growth past its 113.4
  bytes of headroom (report 5) needs its own recorded decision
  (DECISIONS-2026-09-30 §2) and is not this unit's to take. **[owner, a
  decision of its own outside OQ1 to OQ14, only if a measured route or the
  engine chunk exceeds its headroom]**
- **B2. No ephemeris in the lazy closures.** The static closures of the
  `EclipticView`, `RelationshipWheel` and `ChartCalculator` chunks hold neither
  marker of `report-bundles.mjs` line 349, checked by a new block beside the
  homepage's (lines 398 to 400). Control: a build whose composite adapter
  imports `@zodiacs/engine/techniques`, rc.16's regression, which took the
  wheel's closure from 52,000 to 96,188 gzip bytes
  (DECISIONS-2026-10-01-rc16-composite).
- **B3. Importers.** Only the four adapters import `@zodiacs/engine/lite` under
  `src/` and `api/`, by a list in `report-bundles.mjs` like the one for
  `./internal/math` (lines 334 to 345); `scripts/engine-entry-imports.test.mjs`
  still finds no importer of `./calc` or `./vedic` (lines 48 to 54). Control:
  a fifth importer.
- **B4. The site's tests, against the adapters, unchanged:**
  `src/lib/sect.test.ts` (11 cases), `src/lib/declination.test.ts`,
  `src/lib/composite.test.ts`, `src/lib/dignities.test.ts`,
  `src/lib/chart-context.test.ts` and the synastry tests that use composite.
  The `declinationOf` cases of `src/lib/wheel/ecliptic3d.test.ts` (lines 199
  to 207) move with the function. Control: each suite against an adapter with
  one rule changed (the sect suite against `> 0`; the dignity suite against
  Mercury exalted in Gemini; the declination suite against `declinationOf`
  with the latitude dropped; the composite suite against the midpoint on the
  longer arc; the chart-context suite, which calls `dignitiesFor`, against
  Mercury exalted in Gemini; the synastry tests that use composite against
  the midpoint on the longer arc).
- **B5. Prebuild, reference and claims.** `validate-people-pilot` passes with
  check 16 retargeted (B6); the site's engine reference builds from the rc.2
  archive with its export-coverage assertion (`scripts/engine-reference/build.mjs`);
  the claims ledger's rules pass with `product.engine-analyses` restated (it
  says the site's charts do not use the declinations). The reference build and
  the claims extractor run first in SR, before the source commit. Control: the
  claims extractor must list a sentence planted in a scratch copy of the
  reference (as time-bands C8's control does), and the reference build with
  one `./lite` name left out of its documented names must fail its
  export-coverage assertion.
- **B6. Check 16.** `docs/phase5/people-pilot/tools/validate-pilot.mjs` lines
  337 to 346 compare the pilot's table with the package's `dignitiesFor`, the
  seven planets in the twelve signs, all four conditions, instead of with the
  site table's text. Control: a copy of the pilot table with Mercury's
  exaltation changed. **[OQ11]** If the pilot's freeze (F-70) covers its
  validator, whether check 16 may change is the owner's call.

**SR, the cut's one scratch site run.** After all five units of the cut and
before the source commit, and again after any review commit that changes
packed text, one heavy job, nothing committed to the site: in a scratch clone
of site main outside every checkout, the candidate's packed tarball installed
in place of 1.1.0-rc.1; the default build and the production-flags build, each
with `npm run report:bundles` (B1's expectations reported, every grown chunk
named with the engine files it holds); the engine reference build with its
export-coverage assertion, which shows whether the re-exported declarations of
OQ3 (a) pass (if they do not, the bundled `lite.d.ts` is the fallback); and
the claims extractor with `--unlisted` over the regenerated reference, so that
every new sentence of `src/sect.ts`, `src/lite.ts`, the README and the
CHANGELOG is backed or reworded before the archive is carried.

## 6. Release state and the production check

The gate needs "deployed" (R5):

- engine: 1.1.0-rc.2 carried (archive, receipt, `archives.json` entry), its
  gates recorded, merged by the owner with a merge commit;
- site: the adoption vendors that archive and passes the full site checks on
  both builds and the Phase 1 captures. Its pull request is opened only once
  site#862 (B3.c, a programme pull request open as a draft since 2026-11-01)
  is merged or closed, under "one programme PR per repository at a time"; until
  then the adoption branch is pushed without a pull request **[OQ8]**. The
  owner merges it;
- production: D1 to D3 pass on the deployment the alias names, and again on
  the next one.

- **D1.** The alias, read before and after the checks, names a READY deployment
  built from the merge commit.
- **D2.** Production's chunks holding the four adapters (`EclipticView` for
  declinations and sect, `RelationshipWheel` for composite, the
  `ChartCalculator` closure for dignities) equal a local build of the merge
  commit byte for byte; each closure holds its lite part's refusal text and
  neither ephemeris marker. The refusal texts, as the built parts give them:
  for declinations `declination bodies must be a standard array.`
  (`src/declination.ts` line 249); for composite
  ` must be an array of { body, lon }.` (the template of `relationship.ts`
  line 45, moved); for dignities `sign must be a lowercase zodiac sign name.`
  (`src/techniques/dignities.ts` line 94); for sect one of `src/sect.ts`'s own
  messages, named in the adoption's record before the run. Each is checked in
  the named closure, which excludes the engine chunk (a dynamic import), so
  the root chunk's copies of the same texts do not count.
- **D3.** The engine chunk names `1.1.0-rc.2`.

Controls: D1, D2 and D3 are each run also on the deployment that served the
site before the adoption, and each must fail there: its commit is not the
merge commit (D1), its chunks hold the site's own code and no lite text (D2),
and its engine chunk names `1.1.0-rc.1` (D3).

A unit with its record passing and its PR merged is `validated`, release
`merged`. With D1 to D3 passing and R3, R4 and R6 ratified it is `accepted`,
release `deployed`; without the ratification, `validated`, release
`deployed`.

## 7. Downloads

No check in this file needs pyerfa, numpy or pyswisseph. L12 installs only
what the packed consumer installs for every candidate. The four units still
hang on **[OQ6]**: they reach production only with the whole rc.2 adoption,
and a new engine needs the Swiss accuracy refresh, which
`scripts/methodology-accuracy-claim.test.mjs` requires to name the installed
version (lines 214 to 215 and 401 to 403), and the rebuild of the independent
references with pyerfa (report 2, gates 4 and 7). Without those approvals the
adoption PR cannot pass as the site's tests stand, and none of these units
reaches "deployed" with rc.2.

## 8. Owner questions that bear on this file

Numbered as the cut's plan numbers them, OQ1 to OQ14 (OQ14, for the private
birth-data search, was added last). None was answered at commit P, so each
default below is what this file is written to. An answer given later is a dated
amendment (section 11), made before any formal run it affects.

| OQ | Question | Default written here | If answered otherwise |
| --- | --- | --- | --- |
| OQ1 | The cut's scope: the four P2.E units through `./lite`, F-53 through `./time` with the frame of date, the nine F-89 fixes, P1.M3c and P2.B.vargas; P2.B.kp waits for Krishnamurti's own text with pages | as listed | If the P2.E units leave the cut, this file is withdrawn by a dated amendment, not run |
| OQ2 | A new public entry `./lite` (four self-contained files whose functions are copies of the root's and `./techniques`'s, not the same objects), beside `./time`, making fifteen | approved, name `./lite` | No entry serves the four units without the ephemeris; they stay as they are (R1) |
| OQ3 | Sizes, approved once as ceilings: cap 1,100,000, `./lite` 29,000 (and `./calc` 156,000, `./vedic` 143,000, `./time` 42,400), or the CHANGELOG's 0.x history (91,551 bytes) moved out instead of the cap raise; (a) `./lite`'s declarations by re-export; (b) the pure-table exemption; (c) the budget written is the ceiling | the ceilings, the CHANGELOG whole; (a) re-export; (b) the exemption stays, its reason rewritten; (c) the ceiling | L11's value; bundled declarations add about 12,500 bytes (estimate); a ceiling under the measured graph means a smaller entry and a different R6; (b) retired adds up to 608 bytes per graph; the CHANGELOG move needs nine site claims re-pointed |
| OQ4 | Conventions: sect by the Sun's altitude as a named option; declinations with the site's mean obliquity of date passed explicitly; the package's Sun exemption; dignities as R6 reads them | C1 to C4, R6 | Sections D2, S2, DG and the record change as section 2 says |
| OQ5 | Ratify, before the formal runs, the readings adopted after the scoping runs | R3, R4's causes and 1e-12 thresholds, R6: asked before the formal runs | The units stay `validated`; another reading is a dated amendment before the formal run |
| OQ6 | Scratch installs outside the repositories: pyerfa 2.0.1.5 with numpy 2.4.6 (Python 3.11 if needed), pyswisseph 2.10.3.2 | none installed until approved; none of this file's checks needs them | Without them the rc.2 adoption cannot pass the site's version-bound tests, so these units cannot deploy (section 7) |
| OQ8 | Site order: site#862 (B3.c) is an open programme PR | the adoption branch is pushed without a PR until #862 is merged or closed | The owner may allow a second programme PR on the site |
| OQ11 | Check 16 of the People pilot's validator retargeted to the package | retargeted (B6) | If the pilot's freeze (F-70) covers the validator, P2.E.dignities waits for the pilot's unfreezing |
| OQ14 | The owner-approved birth-data scanner excludes only `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, not the whole folder; should it exclude the whole folder for engine pushes (a copy of the scanner kept outside the repositories whose pathspec and archive-member skip cover `:(exclude,top)docs/evidence/calc-sidereal-2026-10-05`, its output naming the exclusion)? | ask before any engine push: the search does not run on the engine, and nothing is pushed, until the owner answers | Another rule for the search is written into section 0 as a dated amendment before the first push |

## 9. Recording

Engine: `docs/evidence/1.1.0-rc.2-20261102/lite/` holds L1 to L12's outputs, the
controls' outputs and the sizes. Site:
`docs/platform/evidence/site-engine-1-1-0-rc2/lite/` holds the parity record,
its controls, the bundle reports of both builds and the production checks.
Each unit's ledger note takes the form of the accepted P2.E units' notes:
cases, agreements, differences by cause, the source commit, the archive
digest, the deployment. The P2.E.declinations note is corrected at the same
time: the site took the mean obliquity of date whenever it had an instant, not
a fixed obliquity (report 2, finding 18; EclipticView lines 227 to 230).

## 10. Outcomes

- **Pass.** L1 to L12 pass with their controls failing, the parity record
  passes, B1 to B6 pass, and D1 to D3 pass in production: each unit is
  `validated`, release `deployed`, and `accepted` once R3, R4 and R6 are
  ratified (OQ5).
- **Fail.** A check fails with its control behaving: the failure, its run and
  its cause stay in the evidence. A code fix before the source commit is not
  an amendment of a reading; the evidence records the failing run and the
  fix. A parity record that fails is kept, and a rerun is a new attempt with a
  new seed text that cites it.
- **Not established.** Any accuracy of these values; anything about the
  site's pages beyond the four adapters; the other dignities shown on the
  site (R6).

## 11. Amendments

Any change after commit P to a reading, a corpus, a seed text, a pin, a pass
condition, a cause, a threshold or a control is an amendment: dated, with its
reason, appended to this section, never an edit in place. An owner answer
that arrives after commit P is such an amendment, made before any formal run
it affects. An amendment adopted after its result was seen makes the reading
`validated` only, until the owner ratifies it. Once a formal run has been
seen, a change of rule is a new version of this preregistration, which cites
this one and its results.

None at commit P.

**2026-11-03, the owner's answers.** The answers to OQ1 to OQ14, given under
the owner's delegation of that day and before any formal run, are in
[`../OWNER-ANSWERS.md`](../OWNER-ANSWERS.md). For these four units: OQ2 yes; OQ3,
`./lite`'s ceiling 29,000 with its declarations by re-export; OQ4 yes to
each convention; OQ6 yes; OQ11, check 16 retargeted to the package.
OQ5 is not answered under that delegation (zodiacs.org
`DECISIONS-2026-10-05.md` §4). R3, R4's causes and 1e-12 thresholds, and R6 stay unratified,
so each of the four units is `validated` at most until the owner ratifies
them.

**2026-11-03, review 1: L9 and L11 on L-c's build.** Review 1 of 1.1.0-rc.2
(programme notes, `notes/rc2-2026-11-01/review1/`, outside this repository)
ran `tools/api-reports.mjs --before 874077e` on b11c5e8's build: L9 failed,
`api/vedic.api.md` differing from 874077e's, because P2.B.vargas (da193bf,
after L-c) adds its names there; its control behaved. Since then review 1's
batch A (a5c1a38) changes `api/calc.api.md` too (`./calc` re-exports
`TimeBands`). L11 measured on the cut's build fails the same way: `./vedic`'s
and `./calc`'s graphs grow for their own units. Section 3 asks L9 for the
commit before L-c and L11 for the builds of the commit before L-a and of L-c,
but it says each check runs on the cut's build, and the tools did not say
which build is "after". Adopted after review 1, before any formal run; since
review 1 had seen L9 fail on b11c5e8, the readings of L9 and L11 count as
`validated` only until the owner ratifies them (each unit is `validated` at
most anyway under OQ5):

- *L9* is judged on L-c's build, 16ad4fe: the reports `scripts/api-report.mjs`
  writes from 16ad4fe's build equal 16ad4fe's `api/`, `api/lite.api.md` is
  new there, and every other file of 16ad4fe's `api/` equals 874077e's byte
  for byte; its control is the same comparison with `api/lite.api.md` left
  out. On the cut's build `npm run api:check` stays CI's gate (`gates.sh`).
- *L11*'s comparison of graphs is between the builds of 1deb29e, the commit
  before L-a, and of 16ad4fe. The rest of L11, `npm run package:contents`
  with `./lite`'s budget and six files, and its control, stays on the cut's
  build, as do L1 to L8, L10 and L12.
- *The builds* are made in a scratch copy of each commit outside every
  checkout: a sparse, blobless clone of the repository checked out at the
  commit, made as section 0 says and as `carrier/pack-source.sh`'s
  `sparse_clone` makes it, never a plain clone or a worktree; then `npm ci`
  and `npm run build` on Node 22.22.2. `tools/api-reports.mjs` (`--package
  <dir>`, reading the files at `--before` with `git cat-file` in this
  repository) and `tools/graphs.mjs` (`--measure <dir>`) say so. A copy made
  with `git archive <commit> -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`
  does not serve in the clone the cut is made in: it is blobless, and there
  `git archive` asks its promisor remote for a blob that is not on disk even
  when the pathspec names `src/` alone (git 2.50.1; with lazy fetching turned
  off it stopped there, and nothing was fetched); with lazy fetching on and
  the network up, it would fetch that blob from the remote.
- *Tried once, not the formal run.* On such clones of 16ad4fe and 1deb29e,
  made from `engine-rc2` and built with `npm ci --offline` and `npm run build`
  (Node 22.22.2, darwin-arm64), L9 passed with its control behaving, and
  L11's graphs differed only in `./lite`, new, and `./techniques`; on this
  commit's tree L9 differed in `api/calc.api.md` and `api/vedic.api.md` and
  L11 in `./calc` and `./vedic`. The outputs are in the programme notes.

**2026-11-03, review 1: L7's controls get a tool.** L7's two preregistered
controls, a `sectReading` with the altitude test written `> 0` and one with
orientality's test written `>= 0`, had no committed tool (one manual run is
recorded in 874077e's message). `tools/sect-controls.mjs` now runs them, as
the varga sensitivity's `tools/test-controls.mjs` runs its own: first
`src/sect.test.ts` on the checkout as it stands, which must pass; then, for
each control, one exact replacement in `src/sect.ts` (it must match once),
`src/sect.test.ts` run with vitest's JSON reporter and its failing tests
recorded, and `src/sect.ts` restored and checked against its SHA-256. A
control behaves when at least one of L7's tests fails. Tried once on this
commit's tree, not the formal run: the tests passed as they stand, and each
control failed as it must, among its failing tests the ones `src/sect.test.ts`
names for it. No pass condition or control changes.

**2026-11-03, the site run (SR) on b11c5e8: B5's planted sentence.** SR, the
cut's scratch site run (programme notes, `notes/rc2-2026-11-01/sr/`), ran
B5's two controls on b11c5e8's candidate. The engine reference build with
`sectReading` left out of `./lite`'s documented names failed its
export-coverage assertion, as it must. The claims extractor's control took
the sentence time-bands' C8 plants, "The band bounds the error of every
position.", as B5 says ("as time-bands C8's control does"), planted in a
scratch copy of the rc.2 reference as a paragraph of `release/README.txt` and
as the first paragraph of the comment of `functions/time.timeBands.html`. The
extractor did not list it: none of its words is a trigger of lexicon 2. With
", in arcseconds" added it was listed in both places, so the plants were in
text the extractor reads. So B5's claims-extractor control did not behave in
SR on b11c5e8, and B5, as run there, cannot show that the extractor sees the
new sentences of `./lite`. Its version 2 is due in the site's adoption, with a
planted sentence the extractor's lexicon selects, citing this result; no
other sentence is chosen now. This commit rewords packed text (README.md's
sentence on `./lite`'s copies, among others), so SR runs again on the
candidate after it, as section 5 says.

**2026-11-04, review 2: L1's control (a) is the case it names.** Review 2 of
1.1.0-rc.2 (programme notes, `notes/rc2-2026-11-01/review2/`, outside this
repository) found that `tools/broken-builds.mjs` did not build L1's control
(a) as section 3 names it, "`lite.js` also re-exporting `compositeChart`":
it built the composite part re-exporting `compositeChart` instead, which L1
passes (esbuild inlines astronomy-engine's ESM, which has no import lines),
and counted that control as behaving when L3 and L2 failed. No amendment
recorded the departure, and as built, one of L1's preregistered controls
would have passed, voiding L1. Adopted after review 2, before any formal run:
the tool now builds the case section 3 names, this checkout's four parts as
the build makes them and `dist/lite.js` with a fifth export line, `export {
compositeChart } from "./lite-composite-chart.js";`, whose file esbuild
bundles from `src/techniques/relationship.ts` with astronomy-engine inlined,
and L1 must fail it ("dist/lite.js must import exactly the four lite parts");
L2 fails it too, and L3 passes, since that file is not one of the entry's
five. The composite-part build stays, under a name of its own, as an extra
control that L3 and L2 must fail. Run on this commit's build, not the formal
run: the build passes L1, L2 and L3, and each of the seven controls fails as
it must (output in the programme notes). No pass condition changes.

**2026-11-04, review 2: orientality takes each longitude modulo 360 first.**
Review 2 found that `orientality` (`src/sect.ts`), whose doc comment says it
takes longitudes "of any size", subtracted before reducing:
`orientality(175, 3.6e17)` gave "oriental", while `orientality(175, 0)` gives
"occidental" and 3.6e17 is 360 × 10^15. Adopted after review 2, before any
formal run: each longitude is reduced modulo 360, which is exact, before the
difference; `./lite`'s graph stays within its 29,000 bytes
(`npm run package:contents`). L7 gains a case in `src/sect.test.ts`, from the
definition: `orientality(175, 3.6e17)` and `orientality(-3.6e17, 10)` must
give what `orientality(175, 0)` and `orientality(0, 10)` give. L7's controls
and `tools/sect-controls.mjs` do not change (the line the second control
edits is the same). L5 does not reach `orientality`, which is the lite
entry's own. `docs/lite.md` now also says what review 2 found missing there:
for a Sun exactly on the ascendant, whose altitude taken on the ecliptic is 0,
the two conventions disagree, the altitude rule giving the day and the
ecliptic rule the night.
