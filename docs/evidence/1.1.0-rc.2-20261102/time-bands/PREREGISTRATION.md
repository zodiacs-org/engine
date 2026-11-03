# P1.M3c preregistration, version 1

The time basis's bands carried into longitude and event-time bands, for
`@zodiacs/engine` 1.1.0-rc.2.

- **Status of this text.** Written on 2026-11-02 (ICT), before any band code
  exists and before any formal run. Nothing in it has been run. It is
  committed, with its rules as written here, as
  `docs/evidence/1.1.0-rc.2-20261102/time-bands/PREREGISTRATION.md` in commit
  P of the cut, together with the four other preregistrations of 1.1.0-rc.2
  and nothing else, before any code of the cut; that commit dates it. Commit P
  is pushed alone, as the first head of the draft cut pull request, and no
  formal run happens before it is on GitHub. After commit P this text is never
  edited in place: an owner answer, or any other change, is a dated amendment
  appended to section 10. The design it tests is `DESIGN-m3c.md` (programme
  notes, not in this repository); where this text depends on it for a rule,
  the rule is written out here. Places where an owner answer would change a
  rule are marked **[OQn]** and listed in section 4.
- **Written from** the draft `notes/rc2-2026-11-01/drafts/deltat/PREREGISTRATION-m3c.md`
  and `DESIGN-m3c.md` beside it, with the corrections of the cut's plan
  (`notes/rc2-2026-11-01/drafts/critic/RC2-PLAN.md`, section 1) that concern
  this text: K3 (C7), K4 (C6), K9 (the named tests and their controls), K10
  (this status), K12 (sparse clones; archive rebuilds in CI only), K16 (the
  measurement of `./time` at the band commits), K21 (R5 and the reading in
  one sentence), K22 (C8 inside SR), K23 (section 4's preamble and section
  10) and K24 (owner questions), with OQ14 for the birth-data search.
- **Candidate.** 1.1.0-rc.2, cut from engine main a253973, under the owner's
  choice of 2026-11-01 to cut the candidates that do not wait on IMCCE from
  main first.
- **Line references** are to engine main a253973
  (`a2539735f99fe38f9623cd1101de96b8c5cdf0f0`) and site main 9a67f761
  (`9a67f761bc231741c6571af2dfae65b798954e11`) unless a line names another
  commit.
- **Reports and owner questions.** "Report n" is entry n, counted from 0, of
  the scoping journal `notes/rc2-2026-11-01/rc2-scope-journal-results.json`:
  report 0 the cut, 1 prior work, 2 the site adoption, 3 ΔT and F-53, 4
  vargas and KP, 5 the lite entry, 6 the scoping critic. Owner questions are
  the cut's OQ1 to OQ14 (section 4).
- **Scope limitation, declared.** The owner's rule for the engine repository:
  never open, read, run, import, grep, search or inspect
  `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`;
  explicitly exclude `docs/evidence/calc-sidereal-2026-10-05/` from every
  recursive scan, copy or archive; never pass a revision to `git grep`; add
  `-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'` to any git
  command that walks a tree; run `git status` only as
  `git status --porcelain -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`.
  - *The draft* was written from the isolated engine clone `engine-rc2`
    (branch `rc2/main-first` at a253973), whose sparse checkout leaves that
    folder out; no scan, copy or command touched it, and nothing in this unit
    reads it or depends on it.
  - *Commit P* was made in the same clone, whose sparse checkout leaves
    `docs/evidence/calc-sidereal-2026-10-05/` off the disk. The clone's local
    identity, "Zodiacs Admin" <admin@zodiacs.org>, was set with
    `config user.name` and `config user.email` just before the writing began.
    Every git command run there that walks a tree carried the exclusion
    pathspec above; no `git grep`, `log -p` or `archive` ran; directories were
    listed by name, never recursively, and the excluded folder appears in none
    of the listings; no file inside it was opened or read. The commit was
    amended before any push, to correct these texts after two reviews.
  - *Every tool and step named below* keeps the folder out of every
    traversal: copies of the engine tree are made only with
    `git archive <commit> -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`;
    every clone used for a build, a pack, a gate or a run is `engine-rc2`
    itself or a sparse clone made as `git clone --no-checkout --no-local
    <repository> <dir>`, then `git -C <dir> sparse-checkout set --no-cone
    '/*' '!/docs/evidence/calc-sidereal-2026-10-05/'`, then `git -C <dir>
    checkout --detach <commit>`, never a plain clone or a worktree; archive
    rebuilds (`node scripts/verify-archive-binding.mjs --rebuild-all`, and the
    same check on the carrier commit) run only in CI's jobs, whose run ids
    the gate record cites.
  - *The private birth-data search* runs before every engine push, counts
    only, and the release state of section 7 needs those pushes. The scanner
    the owner approved excludes only the one file named above, not the
    folder, so on the engine it runs only with the whole folder excluded and
    only once the owner has answered OQ14 (section 4). Until then no engine
    push is made.

## 1. The gate, as the ledger words it

Site `docs/platform/programme/acceptance-ledger.json` on main 9a67f761,
lines 503 to 515:

| field | value |
| --- | --- |
| id | `P1.M3c` |
| title | "M3 remainder: ΔT band propagated into longitude and event-time bands" |
| source | `docs/platform/evidence/engine-audit-2026-09-22/BRIEF-v1.md` M3 scope 3 |
| scope, weight | required, 0.75 |
| gate | **"per-body longitude uncertainty and event-time bands derived from σ(ΔT)"** |
| dependsOn | none |
| status, release, evidence | `not-started`, `none`, none |

Version 1 of the brief words the requirement as "ΔT band propagated into
per-body longitude uncertainty and event-time bands" (BRIEF-v1.md:103), and
the programme's README keeps version 1's remaining M3 time rules as units
(README.md:42-44). Version 1 was written when a chart read its civil instant
as UT1, so σ(ΔT) could move only TT, and with it the planets. Engine rc.15
changed that (P1.M3a and P1.M3b, both accepted): from 1972-01-01 to
2027-10-02 TT comes from UTC through the leap seconds exactly, and on that
basis the recorded ΔT band is the band of UT1 − UTC (engine
`src/time-scale.ts:229-262`, the band at line 252). The gate's words
therefore need a reading. Section 3 gives the one this cut is judged by.

The brief makes preregistration mandatory for any claim of accuracy or bound
(ENGINE-AND-PLATFORM-BRIEF.md:72-74 and :859-861). A band is a bound-like
uncertainty, so this unit is preregistered.

## 2. Earlier attempts, and the runs made while scoping

**No earlier attempt.** No engine branch, site branch, owner bundle or
research branch carries band propagation (report 1; site
`HANDOFF-2026-09-30.md:135-147` lists the bundles, and none is about M3c).
This is the unit's first preregistered version, version 1.

**Prototype runs during scoping, 2026-11-01.** The rc.2 scoping workflow
built a prototype of the bands on scratch copies of a253973 and ran checks on
it. Its figures, as report 3 records them (findings 10 and 12):

| prototype check | records | figure reported |
| --- | --- | --- |
| band table recomputed in Python from receipt fields | calc-api's 32 TT instants × 10 bodies × 5 input forms, 1,600 | 1,600 of 1,600 agree; 830 zero bands exactly 0 |
| bands against JPL Horizons DE441 rates, frame `equatorial-icrs` | the same | all within σTT × the speed bound / 86,400; largest difference 2.33 % relative, 0.00069″ |
| ascendant and midheaven bands against analytic rates | 126 | at most 1.5e-8 relative |
| linearity under a pinned ΔT of d ± σ (a regression check) | 36 | at most 7.45e-5 relative |
| the engine's tests | `npm test` | only the calc round-trip fixtures failed (52 tests), pending their regeneration |

The prototype's sizes (report 3, findings 7 and 8; report 6, finding 6):
`./calc` 148,153 bytes with the default band scope and the time basis
exported without the frame, 148,506 with F-53's frame of date in `./time`
(report 6's combined build), and 147,104 for bodies and events only, with the
frame; the `timeBands` chunk 398 bytes, shared with `./time`. Its code and
outputs were in the session scratchpad, which a restart wiped on 2026-11-01 at
about 21:55 ICT (`notes/state-2026-11-01.md`, line 42). Only the journal's
figures remain. They are a disclosure, not evidence, and the formal run uses
tools written anew from this text.

**What this means for acceptance, stated plainly.** Every reading in
section 3, every tolerance in section 6 and the reuse of corpus T1 were
chosen after those prototype runs had been seen. The programme's rule
(site `docs/platform/programme/README.md`, "Status and release", lines 92 to
94) is that "a gate that passes only under an amendment adopted after its
residual was seen counts as `validated`, not `accepted`, until the owner
ratifies the amendment", and DECISIONS-2026-10-05 §4 records that the
programme does not ratify its own readings, even under a general delegation.
So **any reading chosen after those runs, which is every reading in this
file, counts as validated until the owner ratifies it**, whatever the formal
run shows. Ratification is asked for before the formal run **[OQ5]**; one
given afterwards is recorded as given after the results were seen.

Not seen by any run, and fixed here first: corpora T2, T3 and E; checks
C1b, C3 (against the L2 arbiter's geometry), C4b to C4d and C5 to C9; the
final form of the topocentric bound; the named tests' controls; and every
control.

## 3. The reading this cut is judged by (R-M3c)

**R1. The two time bands.** Every instant the engine computes records two
bands: d = `deltaT.sigma` (null for a pin, read as 0) and
u = `timeScale.ut1MinusUtc.sigma` (null where the record has none, read as 0)
(engine `src/deltat.ts:51-62`, `src/time-scale.ts:42-63`). From them and the
record's `timeScale.input` and `timeScale.basis`, the 1-σ bands of the TT
and of the UT1 that the engine used, in seconds, are:

| input | basis | σTT | σUT1 |
| --- | --- | --- | --- |
| `tt` | any | 0 | d |
| `ut1` | any | d | 0 |
| `utc` | `iers` (1972-01-01 to 2027-10-02) | 0 | u |
| `utc` | `pinned` | u | u |
| `utc` | `delta-t` | √(u² + d²) **[OQ5: combination]** | u |

The last row holds in both of its eras: before 1972 u is 0 (civil time is
read as UT1 by definition), so σTT = d and σUT1 = 0; after 2027-10-02 u is
the 0.9 s fallback (`src/time-scale.ts:85-86`), so σTT = √(0.81 + d²). A pin
on TT or UT1 input has d = 0 and gives 0 for both. `timeBands()`, in
`src/time-bands.ts`, is this table as a pure function of a record's `deltaT`
and `timeScale`: it reads recorded fields only and recomputes no σ.

**R2. Propagation, to first order.** The band of a result Q is
|∂Q/∂TT|·σTT + |∂Q/∂UT1|·σUT1: arcseconds for angles, au for distances,
seconds for times.

- (a) Geocentric, heliocentric and barycentric positions, the nodes and
  Black Moon Lilith depend on TT alone: band = |speed| × σTT, for `lon`,
  `lat` and `dist` each from its own speed (arcseconds = degrees a day ×
  σTT / 24; au = au a day × σTT / 86,400).
- (b) Topocentric positions: band = (|speed| + w)·σTT + w·σUT1, where w is
  at least the rate at which the observer's turn moves the direction
  **[OQ5: topocentric bound]**. Written out, with speeds in degrees a day
  turned to arcseconds a second (÷ 24) and in au a day turned to au a second
  (÷ 86,400): `lon` band = (|speed| + w / cos lat)·σTT + (w / cos lat)·σUT1;
  `lat` band = (|speed| + w)·σTT + w·σUT1; `dist` band =
  (|speed| + v)·σTT + v·σUT1. Here w = ω·(a + h⁺) / (dist × (1 − 10⁻³)), in
  radians a second turned to arcseconds a second, and v = ω·(a + h⁺), in km
  a second turned to au a second, with ω = 7.292115e-5 rad/s and
  a = 6,378.1366 km, the constants of the engine's observer
  (`src/calc-reduce.ts:68-74`), h⁺ = max(height, 0) with the height up to
  100,000 m (`src/calc.ts:105-113`), and dist the reported distance in km
  (au × astronomy-engine's `KM_PER_AU`). a + h⁺ is at least the site's
  distance from the Earth's axis at any latitude, and the 10⁻³ covers the
  difference between the reported light path and the apparent vector's
  length.
- (c) The ascendant, midheaven, Vertex, East Point and cusps: ∂Q/∂TT is
  neglected (it is below 1e-6 of ∂Q/∂UT1 in the tropical zodiac; check
  C4c); band = |∂Q/∂UT1| × σUT1, with ∂Q/∂UT1 the central difference over
  ±1 s of UT1 (the sidereal time moved by ±1.00273781191135448 / 3,600
  hour, `src/ephemeris.ts:106-121`), each difference wrapped into
  (−180°, 180°] and divided by 2 s, latitude and obliquity held fixed.
  Whole-sign cusps, and the cusps where Placidus or Koch falls back to whole
  signs, have band 0 **[OQ5: scope]**.
- (d) An event the crossing search finds is fixed in TT by the ephemeris:
  `band.utc` = σTT of a UTC-input instant at the event, `band.ut1` = d at
  the event; its TT carries no band.

In (b) the two terms are summed, which is at least their root sum of
squares whatever the correlation between the TT and UT1 errors.

**R3. Where a band is zero, and so must read exactly 0.**

- σTT = 0: TT input; UTC input on the IERS basis, 1972-01-01 to 2027-10-02,
  including from 2027-06-28, where the leap-second list's last value is
  carried (no band is added for a leap second not announced); a pin on UT1
  or TT input; a pin on UTC input before 1972.
- σUT1 = 0: UT1 input; UTC input before 1972; a pin on UT1 or TT input; a
  pin on UTC input before 1972.
- `calc()` without speeds gives `band: null`.

The consequence the gate's words do not show, named here: **on UTC input
from 1972-01-01 to 2027-10-02, every body's band is 0**, and the time
basis's band appears only in the angles and cusps (through UT1) and in each
event's UT1 band.

**R4. What a band is not.** It is not a bound and not an error. It leaves
out the ephemeris's error (`bounds` give that), the input time's own
uncertainty, the difference between a civil time before 1972 and UT1 (read
as UT1 by definition), and terms of second order. It inherits σ's nature
(site `docs/platform/evidence/deltat-2026-09-25/README.md`): the IERS formal
error plus the table's 0.79 ms on the IERS basis, optimistic in the
predicted segment from 2026-09-25 to 2027-10-02 **[OQ5: predicted
segment]**; on the ΔT model, 0.03 s from 1956 to the last observed day
(83.0 % of IERS days from 1962 within ±σ) and after it a band at least the
hindcast's p68; a floor built from measured indicators from 1620 to 1956; and
for UT1 − UTC after the table a ±0.9 s range taken as a 1-σ.

**R5. Which results carry a band.** In `@zodiacs/engine/calc`: `calc()`
(null without speeds), `houses()`, every event of `events()`, and `chart()`
(its bodies, ascendant and midheaven). The receipt of each result that
carries a band names the convention id `time-band:first-order` **[OQ5:
id]**. Natal envelopes, the root's `positions()` and `natalChart()`, and
every other entry's results are unchanged **[OQ5: natal envelopes]**; their
bands follow from fields they already record, through `timeBands()` (R1),
which `./calc` uses and `./time` re-exports **[OQ5: home of `timeBands`]**.
**This confines the bands to `./calc`.** Root charts, natal envelopes and the
events of `./sky`, `./timing` and the root's crossing search carry none. That
narrows the gate's "per-body longitude uncertainty and event-time bands", and
the narrowing is put to the owner knowingly, as part of R-M3c, in OQ5.

**R6. Release state.** As an engine capability, the unit is released when
the site vendors 1.1.0-rc.2 and production serves it (README "Status and
release", lines 70 to 74), with no site code beyond the conventions
registry's entry for the new id, as at rc.15 for the opt-in entries the
site does not import **[OQ7]**.

**The reading in one sentence, for the owner to ratify.** "P1.M3c's gate
is met when every position, angle and event that `@zodiacs/engine/calc`
returns carries a first-order 1-σ band, derived by its input scale and time
basis from the ΔT band and the UT1 − UTC band the instant records, with body
bands exactly 0 on UTC input from 1972-01-01 to 2027-10-02 where TT is
exact, the two bands combined by root sum of squares after the IERS table,
topocentric positions taking a conservative bound for the observer's turn,
no band on root charts, natal envelopes or the events of `./sky`, `./timing`
and the root's crossing search, and the unit counted as deployed when
production serves the vendored candidate."

## 4. Owner questions that bear on this file

Numbered as the cut's plan numbers them, OQ1 to OQ14 (OQ14, for the private
birth-data search, was added last). Each default is the cut plan's, and none
was answered at commit P. An answer given before commit P would have been
written in; an answer that arrives after commit P is a dated amendment appended
to section 10 before the formal run it affects. A new version of this
preregistration is made only after a formal run has been seen.

| | question | default here | if answered otherwise |
| --- | --- | --- | --- |
| OQ1 | the cut's scope: the four P2.E units through `./lite`, F-53 through `./time` with the frame of date, the nine F-89 fixes, P1.M3c and P2.B.vargas; P2.B.kp waits | as listed | if P1.M3c leaves the cut, this file is withdrawn by a dated amendment, not run |
| OQ2 | two new public entries, `./lite` and `./time` | `./time` exists, so `timeBands()` is re-exported there | without `./time`, `timeBands()` is exported from `./calc`, or not at all; C1 checks it wherever it is |
| OQ3 | sizes: `./calc` ceiling 156,000; package cap 1,100,000, or the CHANGELOG's 0.x history moved out instead; (b) the pure-table marks; (c) the budget written is the ceiling | the ceilings; (b) the exemption stays; (c) the ceiling | with no `./calc` raise the bands cannot go in `./calc` (the fallback would be functions in `./time` over a root chart and an instant, not designed or measured); (b) retired: `src/calc.ts` has 3 `Object.freeze` calls, and marking them adds up to 16 bytes each to `./calc` |
| OQ5: scope | which results carry bands | bodies, events, angles, Vertex, East Point and cusps | the gate's minimum (bodies and events): `houses()` and `chart()`'s angles carry none; C3, C4b and C4c are dropped; on UTC input from 1972 to 2027-10-02 every band the cut gives is then 0 except the events' UT1 band |
| OQ5: combination | after the IERS table, on UTC input | root sum of squares, √(u² + d²) | linear sum, u + d: R1's last row and C1's control (b) trade places |
| OQ5: topocentric bound | topocentric positions | the conservative observer-turn bound of R2 (b) | exact partials from pinned evaluations: C4d becomes an equality within max(1e-4 relative, 1e-6″); more evaluations per call; size not measured |
| OQ5: natal envelopes | natal envelopes | unchanged | a new natal conventions set recording bands: a new required feature (`docs/versioning.md:126-134`), a larger `./receipt`, a site schema change; not designed here |
| OQ5: home of `timeBands` | where `timeBands()` is exported | `./time` (F-53's new entry); `./calc` uses it. If, at the band commits, `./time` measured with the re-export is over 42,400 bytes, the bands are exported from `./calc` only (section 8, step 3) | without `./time`, exported from `./calc`, or not at all; C1 checks it wherever it is |
| OQ5: id | the convention id | `time-band:first-order` | another name: C1, C6 and the site's registry entry follow it |
| OQ5: confinement | bands confined to `./calc` (R5): none on root charts, natal envelopes or the events of `./sky`, `./timing` and the root's crossing search | ratified knowingly as part of R-M3c | a band on any of those results needs its own design, outside this cut; unratified, the unit stays `validated` |
| OQ5: predicted segment | the optimistic UT1 band of the IERS predicted segment | stated as a limit | a later table version (it changes recorded σ, which the receipt codec recomputes: `src/receipt.ts:745-751`) |
| OQ5 | ratify R-M3c | asked before the formal run | not ratified: the unit stays `validated` |
| OQ6 | scratch installs | none: the machine's system Python 3.9.6, no pyerfa, no new Horizons request | pyerfa 2.0.1.5 with numpy 2.4.6, as calc-api used: C2 adds `ecliptic-true-of-date` and C3 imports the arbiter unmodified; Python 3.11 if 3.9.6 cannot load the arbiter; new Horizons requests for unseen instants in C2, whose decision value is low (C2 below). Without pyerfa the site cannot rebuild its independent references for rc.2, so the unit cannot reach production with it |
| OQ7 | what "deployed" means here | production serves the vendored 1.1.0-rc.2 with the registry entry; no site code | a production surface (the compute API or the calculator) needs an engine function for root charts, or it becomes a second code path (ENGINE-AND-PLATFORM-BRIEF.md:862-864); not designed here |
| OQ8 | site order: site#862 (B3.c) is an open programme PR | the adoption branch is pushed without a PR until #862 is merged or closed | the owner may allow a second programme PR on the site |
| OQ13 | an IERS or ΔT table refresh in rc.2 | none | σ after 2026-09-24, the seams of T3 and every band there change; this file is amended before code |
| OQ14 | the owner-approved birth-data scanner excludes only `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, not the whole folder; should it exclude the whole folder for engine pushes (a copy of the scanner kept outside the repositories whose pathspec and archive-member skip cover `:(exclude,top)docs/evidence/calc-sidereal-2026-10-05`, its output naming the exclusion)? | ask before any engine push: the search does not run on the engine, and nothing is pushed, until the owner answers | another rule for the search is written into the scope limitation as a dated amendment before the first push |

## 5. Corpora, sites and input forms

No random numbers are drawn. T1 is reused because the Horizons vectors exist
only there; T2, T3 and E are new.

- **T0, smoke only, never judged:** 1999-06-15T06:00:00Z at S1, for trying
  the tools.
- **T1, calc-api's corpus, seen by the prototype:** the 32 TT Julian dates
  `jd_tt(k) = round(2378496.5 + 146097 × frac(0.5 + k × 0.6180339887498949), 6)`,
  k = 0 to 31, from 1802-08-19 to 2188-11-08 (engine
  `docs/evidence/calc-api/PREREGISTRATION.md:27-30`). Anchor form: F1.
- **T2, new:** 64 UT1 Julian dates
  `jd_ut1(k) = round(2378497.5 + 146094 × frac(0.3 + k × 0.7548776662466927), 6)`,
  k = 0 to 63, from 1800-01-02 to 2199-12-30 (UT1), inside calc's span on
  both scales. The multiplier, the reciprocal of the plastic number, is not
  calc-api's. Anchor form: F2.
- **T3, the seams, new:** each at the instant and 1 ms either side, on UTC
  (anchor F3): 1940-12-31T18:00:00Z (the model's year 1941.0, where ΔT
  steps 13.95 ms and σ does not); 1956-01-01T12:00:00Z (year 1956.0, σ
  from 0.46 s to 0.03 s); 1972-01-01T00:00:00Z (the IERS basis begins);
  2017-01-01T00:00:00Z (after the leap second of 2016-12-31);
  2026-09-24T00:00:00Z (the last observed day, then predicted);
  2027-06-28T00:00:00Z (the leap-second list expires); 2027-10-02T00:00:00Z
  (the table's last instant, then the fallback). The years are the model's,
  y = 2000 + (days since 2000-01-01T12:00 UT1) / 365.25 (`src/deltat.ts:4-7`).
- **Input forms,** all derived from the anchor's own record: F1 TT input
  (`{ jd, scale: "tt" }`); F2 UT1 input at the anchor's `jdUt1`; F3 UTC input
  at its `utc` (ISO, to the millisecond); F4 UT1 input with `deltaT` pinned
  at the anchor's `deltaT.seconds`; F5 UTC input with the same pin.
- **Sites (synthetic):** S1 45° N 10° E 0 m and S2 35° S 60° W 1,500 m
  (calc-api's two); S3 60° N 25° E; S4 0.5° N 100° E; S5 66° N 20° W;
  S6 10° N 30° E at 100,000 m, the greatest height calc accepts
  (`src/calc.ts:105-113`), for topocentric positions only; S7 70° S 140° E,
  where Placidus and Koch fall back.
- **E, events (new):** `events()` for the Sun at 0° (tropical) in
  (YYYY-03-01T00:00Z, YYYY-04-01T00:00Z] for YYYY = 1801, 1900, 1950, 2000,
  2050 and 2150; the Moon at 0° and at 90° in (1971-12-01T00:00Z,
  1972-02-01T00:00Z] and in (2027-09-01T00:00Z, 2027-11-01T00:00Z]; the Sun
  at 0° in the sidereal zodiac (Lahiri) in (2050-04-01T00:00Z,
  2050-05-01T00:00Z]. Every event found is judged.

## 6. The checks

Each check states its records, its reference and how independent that is,
its pass rule, its controls, and any download. A **control** is a
deliberately wrong variant, run through the same check, that must make the
check fail; a control that passes voids its check (section 9). Unless a
check says otherwise, controls are applied to a copy of the engine's own
dump, so no broken build is needed. Every record is judged; none is
excluded except where a rule names the exclusion and the excluded records
are counted and reported.

### C1. The band table, reimplemented

- **Records:** T1, T2 and T3, in F1 to F5: `calc()` for every body it
  accepts at the geocentric center (apparent, in `ecliptic-true-of-date` and
  `equatorial-icrs`), Mars and Jupiter heliocentric (astrometric) and
  barycentric (geometric), and the Sun, the Moon, Mars, Jupiter and Pluto
  topocentric (apparent) at S1, S2 and S6; `houses()` at S1 (its
  `band.time`); `chart()` at S1 and without a place; every event of E.
- **Reference:** a Python implementation of R1 to R3, written for this check
  with the standard library only, reading only each result's own fields
  (`speeds`, `lat`, `dist`) and its receipt instant's `deltaT` and
  `timeScale`. It imports nothing from the engine. Independent of the
  engine's band code.
- **Rule:** time bands equal within 1e-12 s; `lon`, `lat` and `dist` bands
  within 1e-12 of their size (1e-12 × max(1, |x|), as
  `src/calc-fixtures.test.ts:27-40` compares numbers); a band that R3 makes
  zero is exactly 0 in the result's JSON; `band` is null exactly where
  `speeds` is null; every `houses()` result, event and `chart()` result
  carries a band.
- **Controls:** (a) the pre-rc.15 reading, σTT = d on every UTC input;
  (b) the linear sum u + d after the table **[OQ5: combination]**; (c) every
  zero band replaced by 5e-324; (d) the topocentric bands without w.
- **Downloads:** none.

### C1b. The recorded σ, against their sources (an input check)

- **Records:** every `zodiacs-deltat/1` and every `iers-utc/1` instant of
  C1, and T3.
- **Reference:** d from the site's Python twin of the model
  (`docs/platform/evidence/deltat-2026-09-25/tools/lib.py`, the model's
  `sigma` at line 346, with that folder's `table.json`), read from site
  main's git objects, at y = 2000 + (jdUt1 − 2451545) / 365.25. u by the
  rule `docs/time.md:109-113` and `src/time-scale-data.ts` state, computed
  from the IERS rows the engine commits (`scripts/time-scale-sources/`:
  `eopc04-1972.txt`, `finals2000A-20260924-ut1.csv.gz`): before 1973-01-02
  C04's largest 1972 formal error; through 2026-09-24 the largest formal
  error, among the rows flagged I, of the instant's UTC year; after it the
  formal errors of the rows flagged P on 2026-09-25, on every tenth day
  after it and on 2027-10-02, interpolated linearly; then 0.79 ms added; and
  0.9 s, source `fallback`, outside the table. On the IERS basis
  `deltaT.sigma` must equal u.
- **Rule:** each within 1e-9 s, the receipt codec's own tolerance
  (`src/receipt.ts:688-697`).
- **Controls:** (a) u without the 0.79 ms; (b) d evaluated at the year of
  jdTt instead of jdUt1, which must fail after the table.
- **Downloads:** none. The σ checked here belong to units already accepted
  (P1.M3b, and the ΔT model's evidence); the check shows the bands inherit
  the documented values.

### C2. Propagation against JPL Horizons (the rate times σ)

- **Records:** T1 × the Sun, the Moon, Mercury, Venus, Mars, Jupiter,
  Saturn, Uranus, Neptune and Pluto × geocentric apparent and geocentric
  geometric × frames `equatorial-icrs` and `ecliptic-icrs` × the input forms
  whose σTT is not 0 (F2 at every instant, F3 before 1972 and after the
  table, F5 from 1972).
- **Reference:** the Horizons DE441 vectors committed in engine
  `docs/evidence/calc-api/horizons/`: `geo-LTS-*` (and `.2`) at t and
  t ± 0.0001 day for the apparent case, `geo-NONE-*` with velocities for the
  geometric case, read in plain Python; `ecliptic-icrs` is R1(84381.406″)
  applied to the ICRF vector (calc-api `PREREGISTRATION.md:51-56`); rates as
  calc-api defines them (`PREREGISTRATION.md:58-61`; `tools/compare.py:177-190`):
  central differences over t ± 0.0001 day for LT+S, Horizons's velocity for
  NONE. Expected band = |Horizons rate| × σTT / 24, with σTT from C1's
  reference. Independent of the engine's ephemeris, speeds and band code.
- **Rule:** for `lon`, |band − expected| ≤ σTT × B / 86,400 / cos(lat) +
  1e-9″; for `lat` the same without the cosine; B is the engine's measured
  speed bound for that body, center and correction (`src/calc-bounds.ts`,
  measured on this same corpus, `docs/evidence/calc-api/rc16/`). The rule
  holds by construction whenever band = |engine speed| × σTT; it fails when
  the band uses the wrong σ, unit, frame or body. Reported, not judged: the
  `dist` bands against |Horizons distance rate| × σTT.
- **Controls:** (a) bands × 1.05; (b) σUT1 in place of σTT; (c) each body's
  band against the next body's expected value (the body list rotated by
  one).
- **Downloads:** none. `ecliptic-true-of-date` needs ERFA (pyerfa, not
  installed) and is added only with the owner's approval **[OQ6]**. Unseen
  instants would need new Horizons requests **[OQ6]**; their decision value
  is low, because B is the largest rate difference seen on T1, "not limits"
  (`docs/calc.md:291-292`), so a failure off T1 would speak about the rate
  bound, not about the propagation.
- **Not run for topocentric positions:** a topocentric rate depends on UT1,
  and at one TT the engine and Horizons turn the Earth by different UT1
  unless ΔT is pinned; calc-api pinned it on TT input (its
  `PREREGISTRATION.md:42-45`), where the band is 0. The topocentric rate's
  accuracy is that pinned comparison; the topocentric band is checked by C1
  (the formula) and C4d (the bound against the engine's exact partials).

### C3. Angles and cusps against independent geometry

- **Records:** `houses()` on T2 at S1 to S5 × the 13 house systems × the
  input forms whose σUT1 is not 0 (F1; F3 and F5 from 1972); T3 at S1; a
  sidereal (Lahiri) copy of the S1 records; and S7, inside the polar circle,
  for its Placidus and Koch fallbacks only. S1 to S5 lie within
  90° − ε, where the arbiter's ascendant is defined (build.py:422-427); at
  S7 the other systems are reported, not judged.
- **Reference:** the geometry of the conformance suite's L2 arbiter (engine
  `conformance/arbiters/l2/build.py`: `Sky`, `ascendant`, `midheaven`,
  `vertex`, `east_point`, `house_cusps`, written from Holden, Munkasey and
  Smart and checked by two routes, lines 1-34 and 337-449), driven by each
  result's `armc`, `obliquity` and latitude, at θ ± one UT1 second of the
  Earth's rotation, 15 × 1.00273781191135448 = 15.04106717867032″
  (`src/ephemeris.ts:109`). Rate = the difference over the 2 s, wrapped into
  (−180°, 180°]; expected band = |rate| × σUT1 (C1's reference).
  Independent of the engine's house code. The module imports pyerfa at its
  head (line 49), but none of these functions calls it (ERFA is called only
  at lines 156, 277, 327-329, 932-946 and 1437-1438), so the check loads it
  with a stub `erfa` module that raises if called.
- **Rule:** |band − expected| ≤ 1e-6 × expected + 1e-9″; for Placidus cusps
  also + 3.6e-6″ a second × σUT1, because its iteration settles to 1e-9°
  (`src/houses.ts:167-168`: twice 1e-9° over 2 s). Whole-sign cusps, and
  cusps where Placidus or Koch falls back, exactly 0. A case where the
  arbiter raises (circumpolar or degenerate) is counted and reported, not
  judged. The Lahiri copies equal the tropical bands exactly.
- **Controls:** (a) the solar-time rate, 15″ a second, in place of the
  sidereal; (b) σTT in place of σUT1.
- **Downloads:** none, if Python 3.9.6 loads the module (its docstring names
  Python 3.11; to be found on T0 before the run). If it does not
  **[OQ6]**: with approval, Python 3.11 and pyerfa; without, C3 falls back
  to the closed forms (ascendant, midheaven and East Point from
  `asc_formula`, and the equal, equal-MC, Vehlow, whole-sign and Porphyry
  cusps from the angles), and the other systems' cusp bands rest on C4b
  alone, which RESULTS.md must then say.

### C4. The engine's own response to a pinned ΔT (consistency, not accuracy)

These compare the band with the engine's own full calculation at shifted
times. They test the first-order propagation and the neglected terms; they
are not accuracy evidence (engine `AGENTS.md`, "Accuracy expectations come
from independent arbiters").

- **C4a, positions.** T2 in F2 with pins d0 ± σTT (d0 the unpinned record's
  `deltaT.seconds`; TT moves, UT1 does not); every body `calc()` accepts at
  the geocentric center but the true nodes, apparent, in
  `ecliptic-true-of-date` and `equatorial-icrs`, and Mars heliocentric.
  Rule: half the wrapped difference of `lon`, `lat` and `dist` equals the
  band's TT term within max(1e-4 × band, 1e-6″) (`dist`: max(1e-4 × band,
  1e-15 au)). The true nodes are reported, not judged: their speed is a
  difference over ±0.25 day (`docs/calc.md:266-268`).
- **C4b, angles.** T2 in F1 at S1 to S5 and S7, all 13 systems, UT1 moved
  by pins while TT stays. Whole-sign cusps and fallback cusps are left out
  here (their band is 0 by R2 and C1 checks it), since a change of the
  ascendant's sign inside a shift moves them by 30°.
  (i) The turn rate: pins d0 ± 1 s; half the difference over 1 s equals
  band ÷ σUT1 within 1e-6 relative (Placidus: plus 3.6e-6″ a second), at
  every site. (ii) First order over the band: pins d0 ± σUT1; half the
  difference equals the band within max(1e-3 × band, 1e-6″), judged at S1
  to S4 (|latitude| up to 60°) and reported at S5 and S7, where an angle can
  be far from linear over ±σ when σUT1 is tens of seconds.
- **C4c, the angles' neglected TT term.** T2 in F2, the same sites and
  systems less the whole-sign and fallback cusps, with pins d0 ± 100 s.
  Rule: |half the difference| ≤ 1e-6 × |∂Q/∂UT1| × 100 s for every angle and
  cusp, in the tropical zodiac and in Lahiri's, with ∂Q/∂UT1 = band ÷ σUT1
  of the F1 record at the same instant and site. The expected ratio is
  about 9.7e-8: GAST's TT term, 4612.156534″ a Julian century
  (`src/ephemeris.ts:116`), is 1.4615e-6″ a second, against
  15.04106717867032″ a second for the Earth's rotation; the threshold leaves
  room for the equation of the equinoxes and the obliquity's rate
  (46.836769″ a century, `src/houses.ts:52-53`).
- **C4d, the topocentric bound.** Sun, Moon, Mars, Jupiter and Pluto at S1,
  S2 and S6, T2: per-second partials P_TT (F2 with pins d0 ± 10 s, so TT
  moves) and P_UT1 (F1 with pins d0 ± 10 s, so UT1 moves), each half the
  absolute difference divided by 10 s. Rule: for each of F1 to F5 at that
  instant, band ≥ P_TT·σTT + P_UT1·σUT1 − 1e-9″ for `lon` and `lat`
  (`dist` in au). Reported: band / (P_TT·σTT + P_UT1·σUT1).
- **Controls:** C4a, bands × 1.001; C4b, the angle bands from the solar-time
  rate, 0.27 % off, which must fail both (i) and (ii); C4c, the same probe
  in F1 (UT1 moves), whose ratio must exceed 0.5; C4d, the bands without w,
  which must fail on F1 records (σTT = 0).
- **Downloads:** none.

### C5. Event bands

- **Records:** every event of corpus E.
- **Reference:** R1 for a UTC-input instant at the event's own `at`, with d
  and u from C1b's sources at that instant.
- **Rule:** `band.utc` and `band.ut1` equal the reference within 1e-9 s;
  zero bands exactly 0; every event carries a band.
- **Controls:** (a) `band.utc` = d, which must fail on IERS-basis events;
  (b) the bands of the search window's first instant in place of the
  event's, which must fail in the 2150 window and the two seam windows.
- **Downloads:** none.

### C6. No value moves

- **What:** `src/fixtures/calc-roundtrip.json` regenerated from the
  candidate's build on x86-64, as 1.1.0-rc.1's was
  (`docs/evidence/1.1.0-rc.1-20261026/tools/x86-64-regeneration.sh`),
  compared with a253973's. It is regenerated once, in the cut's commit X,
  after every code change of the cut, for the version bump, F-89's item 5 and
  the bands together.
- **Rule:** the parsed difference from a253973's fixture holds only (i) the
  added `band` keys, (ii) `time-band:first-order` added to `conventions`
  arrays, (iii) the 30 engine version strings (27 `version` and 3
  `engineVersion`), and (iv) the `basis` of the position and speed bounds of
  the three mean-point cases (Black Moon Lilith 1850, Mean South Node 1987,
  Mean Node 2077 sidereal), now `MEAN_POINTS_BASIS`; nothing else. F-89's
  preregistration (`docs/evidence/1.1.0-rc.2-20261102/f89/PREREGISTRATION.md`,
  check E6) states the same rule. The conformance results regenerate
  identical apart from version fields. `npm test` fails nothing beyond the 4
  tests that fail on darwin arm64 at a253973 (3,982 of 3,986 pass there,
  report 0).
- **Control:** in a copy of the regenerated fixture, one longitude changed
  in its last place and one extra key added: the comparison must report
  both.
- **Downloads:** none: colima's x86-64 profile `visual-amd64` (stopped, on
  this machine) and `toolchain/linux/node-v22.22.2-linux-x64`. The tree the
  virtual machine sees is `engine-rc2` itself or a copy made with the
  exclusion above, never a plain recursive copy.

### C7. The API only grows

- **What:** `api/*.api.md` regenerated (`npm run api:report`), compared with
  a253973's `api/` and with the `api/` of the commit before the band
  commits.
- **Rule:** declaration lines are only added (the band types and fields,
  `timeBands`, and the `./time` entry if it is approved); a `// exported by`
  line may only gain entry points, as the six reports that `./time` extends
  do; nothing else changes.
- **Control:** a copy with one existing declaration line removed must be
  reported, and so must a copy whose `// exported by` line loses an entry
  point.
- **Downloads:** none.

### C8. The new sentences against the site's claims ledger

- **What:** inside SR, the cut's one scratch site run, made after all five
  units of the cut and before the source commit, and again after any review
  commit that changes packed text: in a scratch clone of site main outside
  every checkout, install the candidate's packed archive, rebuild the engine
  reference, and run the claims extractor (`--unlisted`). Every new sentence
  about bands either cites this evidence or is reworded before the source
  commit. Nothing is committed to the site.
- **Control:** the sentence "The band bounds the error of every position."
  planted in a scratch copy of the reference must be listed.
- **Downloads:** only the site's own npm dependencies, as every site check
  installs them; nothing else.

### C9. The release state, in production

- **What:** after the owner merges the site's adoption pull request:
  production's alias names a READY deployment built from the merge commit;
  its conventions registry (`/developers/conventions/registry.json`) names
  `time-band:first-order`; its engine chunk carries `1.1.0-rc.2`; the
  post-merge Site Check passes.
- **Control:** the same checks against the deployment before the merge must
  fail.
- **Downloads:** none; it reads the production site.

### Named regression tests, in `npm test`, and their controls

These are ordinary tests with named cases, listed so that the record is
whole:

- `src/time-bands.test.ts`: every row of R1; each T3 seam ±1 ms; the same
  bands from a `TimeBasis`, a `Chart`, a calc instant and a natal result;
  exact zeros; a `RangeError` for a record without a time scale.
- In `src/calc.test.ts`: `band` null without speeds and present otherwise;
  arcseconds under `units: "radians"`; whole-sign zeros; sidereal angle
  bands equal to the tropical ones; a topocentric case at or above the
  pinned partials; events' and charts' bands; the id where a band exists.

Controls. Every new named test is run once against a deliberately wrong
`timeBands` (σTT = d on every UTC input, C1's control a) and once against
bands without the topocentric w (C1's control d). The tests those two
variants reach must fail under them: the rows of R1, the seams, the exact
zeros and the events' and charts' bands under the first, and the
topocentric case under the second. The tests that neither variant can
reach must fail under their own control, fixed here: the same-bands test
with the calc instant's record given `timeScale.input` `"tt"`; the
`RangeError` test with a `timeBands` that returns zeros for a record without
a time scale; the null-band test with a `calc()` that gives a zero band
without speeds; the radians test with bands left in radians; the whole-sign
test with whole-sign cusp bands set to the ascendant's; the sidereal test
with sidereal angle bands that add the ayanamsa's rate × σTT on a record
whose σTT is not 0; and the id test with the id left out of `events()`'s
receipt. Each outcome is recorded in `RESULTS.md`.

## 7. The release state the unit needs

- **Engine:** 1.1.0-rc.2 carried (archive, SHA-256 receipt, `archives.json`
  entry and README row, as rc.1's carrier was), CI green on its source
  commit, the package gates passing with the owner's approved budgets
  **[OQ3]**, and this evidence committed under
  `docs/evidence/1.1.0-rc.2-20261102/time-bands/`.
- **Site:** the adoption pull request on the site#840 pattern, merged by the
  owner: the vendored archive, the registry entry for
  `time-band:first-order` (its registry test requires every id calc receipts
  write: `tests/conventions-registry.test.ts:182-190`), the regenerated
  engine reference and the restated claims. The site may not import
  `./calc` (`scripts/engine-entry-imports.test.mjs:48-53`), so no site code
  computes a band **[OQ7]**. One programme pull request per repository at a
  time: the adoption pull request is opened only once site#862 (B3.c) is
  merged or closed, and the adoption branch is pushed without one until then
  **[OQ8]**.
- **Production:** C9.
- **Ledger:** P1.M3c moves to `accepted` with release `deployed` only when
  C1 to C9 pass, every control fails, and the owner has ratified R-M3c;
  otherwise to `validated`, naming what is missing.

## 8. Procedure

1. The owner's answers to section 4, above all OQ5's ratification, asked
   before the formal run. An answer after commit P is a dated amendment
   (section 10), appended before the formal run it affects.
2. This file committed in commit P with the four other preregistrations,
   before any band code; pushed as commit P alone, the first head of the
   draft cut pull request, once the owner allows the first push (OQ3 and
   OQ14).
3. The design built (DESIGN-m3c.md): `src/time-bands.ts`, then the bands in
   `./calc`. At those commits `./time` is measured with and without the
   `timeBands` re-export: report 3 gives the shared chunk as 398 bytes, yet
   report 6's `./time` with the bands is only 75 bytes over MF's 40,240, and
   the prototypes are gone, so the figures do not reconcile. If `./time`
   measured with the re-export is over 42,400 bytes, the bands are exported
   from `./calc` only (OQ5: home of `timeBands`). The x86-64 outputs are
   regenerated once, after every code change of the cut (C6).
4. The check tools written from this file (Node for the dumps, Python 3.9.6
   with `-I` and the standard library for the references) and tried on T0
   only.
5. C1 to C7 run once each on the source commit's build, with Node 22.22.2
   from `toolchain/node-v22.22.2-darwin-arm64`, one heavy job at a time,
   in `engine-rc2` or a sparse clone; C8 inside SR before the source commit;
   C9 after the merge. Each output is committed as written, with the
   machine, Node, Python and commit recorded.
6. `RESULTS.md` beside this file: each check's verdict, each control's
   outcome (the named tests' included), and every deviation from this file
   with its reason.

## 9. Verdicts and what follows

- **Every check passes and every control fails:** the evidence meets R-M3c.
  The unit is `validated`, and `accepted` once C9 passes with R-M3c
  ratified.
- **A check fails:** recorded as failed, with its figures, and kept. No
  rerun under this version: a fix is version 2, with its own
  preregistration that cites this one and these results.
- **A control passes:** its check could not fail, so that check is void.
  Recorded; that check needs a version 2.
- **An arbiter cannot run** (C3 with no Python that loads it and no approved
  install): recorded as not run, with the reason; the unit is then
  `validated` at most.

## 10. Amendments

Any change after commit P to a reading, a corpus, a pin, a pass rule, a
tolerance or a control is an amendment: dated, with its reason, appended to
this section, never an edit in place. An owner answer that arrives after
commit P is such an amendment, appended before the formal run it affects. An
amendment adopted after its result was seen makes the reading `validated`
only, until the owner ratifies it. A new version is made only after a formal
run has been seen (section 9).

None at commit P.

**2026-11-03, the owner's answers.** The answers to OQ1 to OQ14, given under
the owner's delegation of that day and before any formal run, are in
[`../OWNER-ANSWERS.md`](../OWNER-ANSWERS.md). For P1.M3c: OQ3, `./calc`'s
ceiling 156,000 and `./time`'s 42,400; OQ7 yes; OQ13, no table refresh.
OQ5 is not answered under that delegation (zodiacs.org
`DECISIONS-2026-10-05.md` §4). R-M3c, with the bands confined to `./calc`, and `timeBands`
exported from `./time` stay unratified, so P1.M3c is `validated` at most
until the owner ratifies them.

**2026-11-03, review 1: what the independent review ran before the formal
run.** Review 1 of 1.1.0-rc.2 (programme notes,
`notes/rc2-2026-11-01/review1/`, outside this repository) ran, on the build
of b11c5e8 and before any formal run, `tools/pinned.mjs` (check C4) and a
replica of C4c's rule on corpus T2, and `calc events()` on corpus E's Moon
windows of 1971 to 1972 and of 2027. Nothing of it was committed; its outputs
are in those notes. So T2 and those windows of E are no longer unseen
(section 2). The amendments below that touch C4 (C4a's floor; C4c, with
R2 (c)) or C5 (the IERS table's end in `tools/bands.py`) were adopted after
those results were seen, so every reading they touch counts as `validated`
only, until the owner ratifies it (section 10's preamble); under OQ5 the unit
is `validated` at most anyway. The formal run still runs T2 and E as section
5 fixes them.

**2026-11-03, review 1: the angles' rate on TT (R2 (c), C3, C4c, the named
tests).** Review 1 found C4c failing as preregistered, on T0 among others: at
slow or near-degenerate angles (the Vertex near the equator, Regiomontanus
cusps inside the polar circle) the obliquity's rate dominates, and in a
sidereal zodiac the ayanamsa's, so R2 (c)'s premise, a TT term below 1e-6 of
∂Q/∂UT1, is false there. The coordinator chose to make the angle bands
complete to first order rather than to weaken C4c. Adopted after review 1,
before any formal run:

- *R2 (c) now reads:* the ascendant, midheaven, Vertex, East Point and cusps:
  band = |∂Q/∂UT1| × σUT1 + |∂Q/∂TT| × σTT. ∂Q/∂UT1 is as before: the central
  difference over ±1 s of UT1 (the sidereal time moved by
  ±1.00273781191135448 / 3,600 hour), latitude and obliquity held fixed.
  ∂Q/∂TT is the central difference over ±600 s of TT with UT1 held: the
  sidereal time on the moved TT (its precession and its equation of the
  equinoxes; `gastHours` with UT1 held and TT moved), the true obliquity on
  the moved TT, and in the sidereal zodiac the true ayanamsa there, which the
  sidereal longitude subtracts. Each difference is wrapped into
  (−180°, 180°] and divided by its 2 s or 1,200 s. Where σTT = 0 the TT term
  is not computed and is 0, so there the band is the one b11c5e8 gave, to the
  bit. Whole-sign cusps, and the cusps where Placidus or Koch falls back,
  keep band 0. `chart()`'s ascendant and midheaven take the tropical
  zodiac's, as `houses()` gives them. The code is in `./calc`'s own module
  (`src/calc.ts`, `movedOnTt` and `angleBands`), calling the root's
  `gastHours` and `tilt` and `./vedic`'s `ayanamsaAt` with the moved TT; no
  root module changes, and the built chunks of the root modules that the
  site's engine chunk carries are b11c5e8's byte for byte.
- *The step, 600 s, and why it is sound.* The step must be long against the
  rounding of an angle (a few units in the last place of up to 360°) and
  Placidus's settling to 1e-9°, and short against the nutation's periods, the
  obliquity's and a star ayanamsa's motion (a star's deflection grows fast
  near the Sun). `tools/tt-step.mjs` measures it, a development run on
  synthetic inputs and none of section 5's corpora: 24 UT1 instants from 1800
  to 2199, 15 latitudes from 69° S to 66.4° N, the 13 systems in the tropical
  zodiac and whole sign and Placidus in Lahiri's, True Chitra's and True
  Pushya's, 90,720 quantities; for each it takes the rate over ±h for h from
  1 s to a day by pinning ΔT at d0 ± h on the instant's UT1, the engine's own
  difference by another road. Its output, `tt-step.json` (this commit's build,
  Node 22.22.2, darwin-arm64): over ±600 s the rate differs from the rate over
  ±60 s by at most 2.3e-10″ a second, and by at most 4.9e-4 of it where it is
  at least 1e-8″ a second (True Pushya's near the Sun included, 6.0e-5); over
  ±3,600 s by up to 1.4 per cent (Koch's cusps at 66° N), and over ±1 s by up
  to 5.9e-9″ a second, the rounding. The bands the engine gives equal the
  pinned rate over ±600 s within 3.5e-13″ a second.
- *C3* is judged only on the records whose σTT is 0: F1 at every instant, and
  F3 from 1972-01-01 to the end of the IERS table. The arbiter's geometry gives
  the rate on UT1 only; the rate on TT would need the arbiter's sidereal time
  and obliquity on TT from ERFA, which the standard-library tool does not load.
  The records with σTT not 0 (F3 after the table, F5 from 1972) are counted
  and not judged; the Lahiri copies must equal the tropical bands exactly
  where σTT is 0, and only there. `tools/angles.py` does this. The TT term
  rests on C4c, a consistency check, and on the engine's nutation, obliquity
  and ayanamsas, which their own units compare with ERFA.
- *C4c* becomes a first-order check of the TT term, as C4b (ii) is of the
  UT1 term: T2 in F2 (σUT1 = 0, so the band is the TT term alone) at S1 to S5
  and S7, the 13 systems less the whole-sign and fallback cusps, in the
  tropical zodiac and in Lahiri's, with pins d0 ± σTT on the record's UT1
  (TT moves, UT1 holds), d0 the F2 record's own `deltaT.seconds`. Rule: half
  the wrapped difference equals the band within max(1e-3 × band, 1e-6″), and
  for Placidus cusps 3.6e-6″ more (its settling to 1e-9°), at every site: the
  TT shifts move the angles' inputs by at most milliarcseconds, so no site is
  left out for nonlinearity. Controls, each of which must fail: b11c5e8's
  bands, which leave the TT term out (0 in F2); and the bands times 1.1.
  `tools/pinned.mjs` does this; C4c's old probe at d0 ± 100 s and its control
  in F1 are withdrawn.
- *The named tests* (section 6). In `src/calc.test.ts`, a new test, "add each
  angle's and cusp's rate on TT, UT1 held, times the TT band": on UT1 input
  each band equals the rate over ±600 s from pins at d0 ± 600 s on the same
  UT1, times σTT, within 1e-6 of itself plus 1e-10″, in whole sign, Placidus,
  Regiomontanus and Morinus, tropical and Lahiri. "give sidereal angles and
  cusps the tropical ones' bands" becomes "give sidereal angles and cusps the
  tropical ones' rate on UT1, and on TT the sidereal longitude's": on UTC
  input on the IERS basis, where σTT = 0, the two zodiacs' bands are equal;
  after the table each sidereal angle's and cusp's differs from the tropical
  one's. In "carry the events' and the charts' bands", the chart on UT1 input
  carries its angles' rate on TT times the ΔT band, as `houses()` gives them,
  in place of 0. Controls: "the angle bands without their rate on TT
  (b11c5e8's)" must fail the new test, the sidereal test and the events' and
  charts' test; "sidereal angle bands whose rate on TT leaves out the
  ayanamsa's (the tropical ones')" must fail the new test and the sidereal
  test, in place of the control that added 50.29″ a year to the tropical
  bands, which no longer describes a wrong rule. `tools/named-controls.mjs`
  holds them.
- *The documents:* `docs/calc.md`, *Bands*, says what an angle's band holds
  and why the step is 600 s, and drops the figures of the term it left out;
  README.md says what an angle's band contains; the doc comments of
  `HousesResult.band` and `ChartResult.band` say the same.

**2026-11-03, review 1: C4a's floor for distances.** Review 1 found C4a's
`dist` floor, max(1e-4 × band, 1e-15 au), below a distance's own numerical
noise where σTT is under a millisecond. The floor is now derived from how a
distance is computed, not from the failures the review saw:
`tools/distance-floor.mjs` reads astronomy-engine 2.1.19's source and bounds,
from 1800 to 2200, what rounding can move one evaluation of a distance by
beyond its first-order response: the VSOP87 series' terms and sums (the
secular term t × L1, up to Mercury's 26,088 rad a millennium, dominates); the
rounding of the instant itself and of the light-time instant, times the
body's and the Earth's greatest heliocentric speeds; and the light-time
solution, which returns once two light times agree to 1e-9 day, after one
correction or two (for every body k² τ < 1e-9 day, k = v / c), and can switch
between them only where the first correction is about 1e-9 day, which moves
the distance by at most c² (1e-9 day)² / r. Its output, `distance-floor.json`:
at most 5.62e-12 au per evaluation (Mercury's; Mars's and Venus's next). The half
difference of two evaluations carries at most that, and the band carries it
again through its speed's two samples 0.002 day apart, times σTT / 86.4 s.
So C4a's rule for `dist` is |half − band| ≤ max(1e-4 × band, F) with
F = 6e-12 au × (1 + σTT / 86.4 s), the bound rounded up. `lon` and `lat` keep
their floor of 1e-6″. C4a's control, the bands × 1.001, keeps the same
floors.

**2026-11-03, review 1: tool errors, and a measurement made late.**
- `tools/bands.py` gave the end of the IERS table as 1822521600000 ms,
  2027-10-03T00:00Z, one day late, so C1b expected a table source on
  2027-10-02 after 00:00Z, where the engine correctly gives the fallback (its
  C1 events rule and C5's reference used the same constant, and `horizons.py`
  imports it). It is now 1822435200000 ms, 2027-10-02T00:00Z, the engine's
  table end. A tool error found by review 1; corrected before any formal run.
- Section 8, step 3, asked for `./time` measured with and without the
  `timeBands` re-export at the band commits. It was not done then; it is done
  now, late, on this commit's tree, whose changes do not reach `./time`'s
  graph: 42,306 bytes in 7 files with the re-export and 41,420 in 6 without
  (`npm run package:contents`, Node 22.22.2, darwin-arm64). The `timeBands`
  chunk is 822 bytes and the import and export that join it 64 more. Both are
  under 42,400, so `timeBands` stays exported from `./time` (OQ5: home of
  `timeBands`). The figures of reports 3 and 6 (section 8) are not
  reconciled: their prototypes are gone.
- The changed tools were tried on T0, and C4 also on two synthetic instants
  after the IERS table, 2150-06-15T06:00Z and 2195-02-03T18:00Z (in the
  programme's notes, not a corpus of this file), where every C4 check passed
  and every control, C4c's two among them, failed as required; the named
  tests' controls were run once on this tree, and each failed as required. No
  tool ran on T1, T2, T3 or E.

**2026-11-03, review 1: the mean points' speed basis (C6, rule (iv)).** The
mean node's, the mean south node's and Black Moon Lilith's speeds were
compared with their definitions in the true ecliptic of date only (calc-api's
`compare.py`, `compare_point`), while `MEAN_POINTS_BASIS` says "in all eight
frames" and was the basis of their speed bounds too. Their speed bounds now
have a basis of their own, `MEAN_POINTS_SPEED_BASIS`
(`docs/evidence/calc-api/tools/bounds.py` writes it into
`src/calc-bounds.ts`): "largest difference from the rate of the same
definition evaluated with ERFA's fundamental arguments (faom03, faf03, fal03)
and nut06a's nutation in longitude, taken over 0.0001 day either side, over
32 instants from JD 2379457.498125 to 2520522.646618 (TT), in the true
ecliptic of date only: a check of the implementation, not of an ephemeris;
docs/evidence/calc-api/rc16". C6's rule (iv) is now: the `basis` of the
position bounds of the three mean-point cases, now `MEAN_POINTS_BASIS`, and
of their speed bounds, now `MEAN_POINTS_SPEED_BASIS`. `tools/fixture-diff.mjs`
needs no change: it counts any change of those bases as (iv). The fixture
that commit X regenerates differs from b11c5e8's in those three speed bases
and in the bands of the two `houses()` cases whose TT band is not 0 (the
whole-sign case of 1950 with the Krishnamurti ayanamsa, and the Placidus case
of 2133 with the galactic-center one); both fall under rules (i) and (iv)
against a253973's.

**2026-11-03, the site run (SR) on b11c5e8: C8 is void as run.** SR, the
cut's scratch site run (programme notes, `notes/rc2-2026-11-01/sr/`),
planted C8's control sentence, "The band bounds the error of every
position.", in a scratch copy of the rc.2 reference, as a paragraph of
`release/README.txt` and as the first paragraph of the comment of
`functions/time.timeBands.html`. The claims extractor did not list it: none
of its words is a trigger of lexicon 2 ("band", "bound" and "error" alone are
not). With ", in arcseconds" added it was listed in both places, so the plants
were in text the extractor reads. By section 9 a check whose control does not
fail is void: C8, as run in SR on b11c5e8, is void. Its version 2 is due in
the site's adoption, with a lexicon that selects the band sentences, citing
this result; no other planted sentence is chosen now. Version 1 of P1.M3c
therefore cannot meet R-M3c on C8 in this cut (section 7: "C1 to C9 pass").
SR's two rewordings, the README's sentences that TT comes from the leap
seconds "exactly" to 2027-10-02, now say that the shipped list expires on
2027-06-28 and that its last value is carried after it.
