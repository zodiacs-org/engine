# P2.B.vargas preregistration, version 1

The birth-time sensitivity of the varga signs, for `@zodiacs/engine`
1.1.0-rc.2.

- **Status of this text.** Written on 2026-11-02 (ICT), before any of the
  unit's code exists and before any formal run. Nothing in it has been run.
  It is committed as
  `docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/PREREGISTRATION.md` in
  commit P of the cut, together with the four other preregistrations of
  1.1.0-rc.2 and nothing else, before any code of the cut; that commit dates
  it. Commit P is pushed alone, as the first head of the draft cut pull
  request, and no formal run happens before it is on GitHub. The unit's
  inputs follow in commit I, right after commit P and before any of the
  unit's code, with their SHA-256 in `INPUTS.md` beside this file
  (section 6). After commit P this text is never edited in place: an owner
  answer, or any other change, is a dated amendment appended to section 13.
  The design it tests is `DESIGN-vargas.md` (programme notes, not in this
  repository); where this text depends on it for a definition or a bound,
  that is written out here. Places where an owner answer would change a rule
  are marked **[OQn]** and listed in section 4.
- **Written from** the draft `notes/rc2-2026-11-01/drafts/vargas/PREREGISTRATION-vargas.md`
  and `DESIGN-vargas.md` beside it, with the corrections of the cut's plan
  (`notes/rc2-2026-11-01/drafts/critic/RC2-PLAN.md`, section 1) that concern
  this text: K10 (this status, sections 6 and 10), K11 (F3's build), K12
  (sparse clones; section 10, step 3), K13 with OQ14 (section 10, step 7),
  K18 (the evaluation budget), K24 (owner questions) and K28 (R5 and G-V5);
  K1's rule for the site's order is stated in section 11 (OQ8).
- **Candidate.** 1.1.0-rc.2, cut from engine main a253973, under the owner's
  choice of 2026-11-01 to cut the candidates that do not wait on IMCCE from
  main first.
- **Line references** are to engine main a253973
  (`a2539735f99fe38f9623cd1101de96b8c5cdf0f0`) and site main 9a67f761
  (`9a67f761bc231741c6571af2dfae65b798954e11`) unless a line names another
  commit.
- **Citations of the scoping journal**
  (`notes/rc2-2026-11-01/rc2-scope-journal-results.json`) give positions in
  its arrays counted from 0, as the sibling preregistrations do: report 0 the
  cut, 1 prior work, 2 the site adoption, 3 ΔT and F-53, 4 vargas and KP
  ("the vargas report"), 5 the lite entry, 6 the scoping critic. Steps of the
  scoping critic's plan keep the numbers its own titles give them. Owner
  questions are the cut's OQ1 to OQ14 (section 4).
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
    folder out; nothing touched it, and nothing in this unit reads it or
    depends on it.
  - *Commit P* was made in the same clone, whose sparse checkout leaves
    `docs/evidence/calc-sidereal-2026-10-05/` off the disk. The clone's local
    identity, "Zodiacs Admin" <admin@zodiacs.org>, was set with
    `config user.name` and `config user.email` just before the writing began.
    Every git command run there that walks a tree carried the exclusion
    pathspec above; no `git grep`, `log -p` or `archive` ran; directories were
    listed by name, never recursively, and the excluded folder appears in none
    of the listings; no file inside it was opened or read. The commit was
    amended before any push, to correct these texts after two reviews.
  - *Every tool and step below* keeps the folder out of every traversal:
    engine copies are made only with
    `git archive <commit> -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`;
    every clone used for a build or a run is `engine-rc2` itself or a sparse
    clone made as `git clone --no-checkout --no-local <repository> <dir>`,
    then `git -C <dir> sparse-checkout set --no-cone '/*'
    '!/docs/evidence/calc-sidereal-2026-10-05/'`, then `git -C <dir>
    checkout --detach <commit>`, never a plain clone or a worktree; archive
    rebuilds (`node scripts/verify-archive-binding.mjs --rebuild-all`, and the
    same check on the carrier commit) run only in CI's jobs, whose run ids
    the gate record cites.
  - *The private birth-data search* is relied on by section 10, step 7. The
    scanner the owner approved excludes only the one file named above, not
    the folder, so on the engine it runs only with the whole folder excluded
    and only once the owner has answered OQ14 (section 4). Until then no
    engine push is made.
- **Inputs.** Every birth used below is synthetic; no one's birth data is used.

## 1. The gate, as the ledger words it

Site `docs/platform/programme/acceptance-ledger.json` on main 9a67f761, lines
1318 to 1333:

| field | value |
| --- | --- |
| id | `P2.B.vargas` |
| title | "Sixteen divisional charts with named variants and time sensitivity" |
| source | `docs/platform/ENGINE-AND-PLATFORM-BRIEF.md §3 Phase 2 B` |
| scope, weight | required, 2 |
| gate | "exact on boundary fixtures" |
| dependsOn | none |
| status, release | `partial`, `deployed` |
| notes | "the time-sensitivity output the unit names (the minutes of birth time before each varga sign changes, brief §3 Phase 2 B) is not implemented" |

The gate comes from the brief's rule for Phase 2 B (site
`docs/platform/ENGINE-AND-PLATFORM-BRIEF.md:346-348`): "varga assignments exact
on boundary fixtures"; the same rule gives dasha and panchang boundaries
"within 5 s of an independent first-principles computation". The output is the
brief's "sensitivity output: how many minutes of birth time before each varga
sign changes" (`:335-340`). Phase 2 checks each item against a first-principles
computation where Swiss does not compute it, with every formula or definition
cited (`:276-280`). A claim of completeness, accuracy or a bound needs a
preregistration (`:72-74`, `:859-861`): this file is it.

The rc.15 evidence already in the ledger covers the assignments: `vargaOf` exact
on 3,480 boundaries (10,440 points) of `src/vedic/fixtures/boundaries.json`, the
variants named and three refused by name. What the unit lacks is the time
sensitivity.

## 2. Status of the reading, and the runs already made

The gate was written for assignments, and the output it must now cover did not
exist when it was written. Section 3's reading is an interpretation, and it was
proposed after prototype runs had been seen:

- The rc.2 scoping (the vargas report, finding 8) ran a prototype of this
  output through the public API: 300 random births (1800 to 2200, latitude
  within 60 degrees, lahiri and krishnamurti), 37,245 change instants, 0
  failures; a second variant, 12,473 changes on 100 births, 0 failures; dense
  sampling (Ascendant 1 s, Moon 10 s, others 60 s), 439,088 samples, none off
  the birth sign; four seam cases and UT1, TT, pinned-ΔT and 65.9-degree
  charts, 0 failures. Its seeds were 20261101, 424242 and 7. The same report
  then proposed gates G-V1 to G-V5, which section 3 adopts with changes.
- The prototype and its outputs were scratch files and are gone from the
  scratchpad. Nothing of them is reused here, and they are not evidence.

So, plainly: **any reading of this gate chosen after those runs, this one
included, counts as `validated`, not `accepted`, until the owner ratifies it.**
The programme's rule is that a gate that passes only under an amendment adopted
after its residual was seen counts as validated until the owner ratifies the
amendment (site `docs/platform/programme/README.md:92-94`, *Status and
release*); and the programme does not ratify its own readings under a general
delegation, because "the party whose work is measured" should not make that
judgement (site `docs/platform/programme/DECISIONS-2026-10-05.md` §4,
`:52-65`). The owner's ratification, or the reading the owner gives instead, is
recorded here **[OQ5]**:

> Owner's answer: not yet given at commit P (2026-11-02). OQ5 is to be asked
> with the cut's other owner questions, before any formal run; the answer is
> appended to section 13 as a dated amendment.

**Earlier attempts.** None: no implementation, preregistration or result for
this output exists on the engine's branches or in the owner's bundles (report
1; site `HANDOFF-2026-09-30.md:207-209` lists it among rc.17's follow-ups, and
the vargas report found it never built). This is version 1. Two earlier texts
are followed:

- B2.a's preregistration (`docs/evidence/birth-window/PREREGISTRATION.md`), the
  pattern for the seeded corpus, the lone calls, the matching rule, the pass
  rule and the procedure.
- An unmerged research note on a research branch of this repository, at
  commit `ec4f5e6`,
  `research/parallel-verification-20260927/uncertainty/SPECIFICATION.md`,
  whose rules are adopted: equal samples do not prove a feature constant
  (line 11); a monotonicity argument needs a derivative bound that excludes
  zero (line 89); dense sampling is a falsification gate, not a proof
  (line 110).

The seeds below were not used by any run before this file. Unit tests use
seeds 1 to 3 only.

## 3. The reading this cut is judged by

"Exact on boundary fixtures" is read, for the sixteen vargas with their named
schemes and for the sensitivity output, as all five of:

| | reading | check |
| --- | --- | --- |
| R1 | The assignments stay exact on the existing boundary fixture, its bytes unchanged. | G-V1 |
| R2 | An engine-free fixture says which part boundaries change the varga sign; the engine's change boundaries equal it, and every reported change crosses one of its change rows with its signs. | G-V2 |
| R3 | Each reported change is the exact first millisecond of the new sign in the engine's own arithmetic, as its public API computes it; the birth sign holds at every sampled instant between previous and next; cases planted at the seams of the time basis give their planted millisecond. | G-V3 |
| R4 | For the Ascendant, an independent ERFA computation gives the same boundaries and signs, and instants within 5 s, rule B's tolerance for boundary instants; where a birth lies within 5 s of a crossing, its side is counted, not judged. | G-V4 |
| R5 | The bodies' instants are stated with what limits their accuracy, and not judged. This is narrower than the brief's Phase 2 rule, which checks each item against a first-principles computation where Swiss does not compute it (brief lines 276 to 280), and it is put to the owner for ratification as such **[OQ5]**. | G-V5 |

"None missed" in R3 is claimed from a derived bound for the Ascendant and the
two mean nodes only. For the bodies it rests on scanned rate bounds, a stated
limit (section 7).

## 4. Owner questions that bear on this file

Numbered as the cut's plan numbers them, OQ1 to OQ14 (OQ14, for the private
birth-data search, was added last). None was answered at commit P, so each
default below is what this file is written to. An answer given later is a dated
amendment (section 13), made before any formal run it affects; the rules of
section 8 never change after a run under this version.

| | question | default written here | if the answer differs |
| --- | --- | --- | --- |
| OQ1 | The cut's scope; P2.B.kp waits for Krishnamurti's own text with pages | KP's ruling planets held: no ruling-planet code, export or text enters the cut | None here; no KP output is tested. If P2.B.vargas leaves the cut, this file is withdrawn by a dated amendment, not run |
| OQ3 | Size ceilings (`./vedic` 143,000, cap 1,100,000, or the CHANGELOG's 0.x history moved out); (b) the marks of the tables `scripts/pure-tables.mjs` leaves unmarked; (c) the budget written is the ceiling | approved as ceilings; (b) the exemption stays, its reason rewritten; (c) the ceiling | No change to the checks. Without a `./vedic` raise the output cannot ship (249 bytes left at 1.1.0-rc.1), and this file is withdrawn, not run. (b) changes bytes only |
| OQ5 | The reading of section 3, its 5 s and its side rule, R5 as narrower than the brief's Phase 2 rule, completeness derived only for the Ascendant and the mean nodes; the true node left out | asked before the formal runs; the true node left out | Another reading changes section 8's rules by a dated amendment before the formal run, never after a run. Unratified, the unit is `validated` at most. A true-node row would need its own rules and check, by amendment before the formal run |
| OQ6 | pyerfa 2.0.1.5 and numpy 2.4.6 in a scratch environment outside every repository | not installed until approved | G-V4 does not run, and the unit stays `partial` under this reading (section 11). A stricter reading of R5 would also need a NAIF kernel and a reader (G-V5) |
| OQ7 | "Deployed" means production serves the vendored 1.1.0-rc.2, as at rc.15, with no site code | yes | Section 11's release condition changes |
| OQ8 | Site order: site#862 (B3.c) is an open programme PR | the adoption branch is pushed without a PR until #862 is merged or closed | The owner may allow a second programme PR on the site |
| OQ13 | An IERS or ΔT table refresh in rc.2 | none | F3's seams move (the end of the IERS UT1 table, 2027-10-02, and any new leap second); F3 is rebuilt and this file amended before any of the unit's code |
| OQ14 | The owner-approved birth-data scanner excludes only `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`, not the whole folder; should it exclude the whole folder for engine pushes (a copy of the scanner kept outside the repositories whose pathspec and archive-member skip cover `:(exclude,top)docs/evidence/calc-sidereal-2026-10-05`, its output naming the exclusion)? | ask before any engine push: the search does not run on the engine, and nothing is pushed, until the owner answers | Another rule for the search is written into the scope limitation as a dated amendment before the first push |

## 5. What is tested

`vargaSensitivity` from `@zodiacs/engine/vedic`, built from the candidate's
source commit (named in `RESULTS.md`; the runs use that tree's build only) with
`npm ci` and `npm run build` on Node 22.22.2. The platform is recorded. The
checker uses the public entry points only: `siderealChart`, `vargaOf`,
`siderealLongitude`, `ayanamsa` and `userAyanamsa` from `@zodiacs/engine/vedic`,
and `chartPoints` from the root. It imports nothing from the search module and
shares no code with it.

Definitions, fixed here. Everything is on the integer-millisecond lattice of
the chart's own clock (its input scale, `utc`, `ut1` or `tt`, and its pinned
ΔT if it has one), in the engine's own arithmetic.

- `x(t)` is the point's sidereal longitude at millisecond `t`, exactly as the
  public API computes it for a chart at `t` with the same place and clock:
  `siderealChart(...).ascendant` and `.bodies`, and for the mean nodes
  `siderealLongitude` of `chartPoints(...)`'s longitude with the chart's
  `ayanamsaValue`.
- The sign of a varga key K (a varga with its scheme) at `t` is
  `vargaOf(x(t), K).sign`.
- A part boundary `T` (a whole number of ticks, 1/7560 degree) is a **change
  boundary** of K when the sign on the tick below differs from the sign at
  `T`. A **run** is the arc of longitudes from one change boundary up to the
  next; it can span a sign start and can wrap through 0 degrees (the D2 holds
  Leo from 345 to 15 degrees).
- `t0` is the birth instant. The **birth run** of K is the run holding
  `x(t0)`.
- **next** is the first millisecond `t` in `(t0, t0 + H]` at which `x(t)` lies
  outside the birth run; `null` if there is none. **previous** is one
  millisecond after the last `u` in `[t0 - H, t0)` at which `x(u)` lies
  outside the birth run; `null` if there is none. So the birth sign holds at
  every millisecond of `[previous, next)`, and not at `previous - 1` nor at
  `next`.
- Each change gives `at` (that millisecond), `minutes` (`(at - t0) /
  60,000`: zero or negative for previous, positive for next), `boundary` (the
  change boundary crossed, as the double nearest `T / 7560`), and `from` and
  `to`, the signs at `at - 1` and at `at`.
- `H` is the horizon, cut where needed so that every instant searched has its
  UT1 and TT inside `REFERENCE_SPAN` (1800 to 2200). The result's `searched`
  gives the span actually searched; a `null` side means no change within it.

## 6. Inputs fixed before any run

Each is committed in commit I, right after commit P and before any of the
unit's code, with its SHA-256 in `INPUTS.md` beside this file. Only marginal
counts of F2 and F4 are looked at before that commit.

**F1, the change fixture.** `tools/varga_changes.py` imports the transcribed
rules of `docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py`
(`varga_sign` and `boundary_ticks`, lines 144 to 179) and nothing from the
engine. For each of the 18 keys (the sixteen Parashari vargas, and the cyclic D2
and D3) it writes every part boundary `T` with the sign at the exact rational
`(T - 1) / 7560` and at `T / 7560`, and whether they differ. Output:
`src/vedic/fixtures/varga-changes.json`. Expected from the scoping's scratch
count: 3,480 part boundaries, 3,456 changes and 24 keeps (the D2 at its 12 sign
starts; D10 and D24 at 30, 90, 150, 210, 270 and 330 degrees). Other counts are
reported and explained before any engine run. `boundaries.json` is not
changed: its recorded SHA-256,
`3578be675ddb51bb80ab543431d654c9a6e7bcab4d70d9abcae381ea29dcd51f`
(`docs/evidence/vedic-2026-09-28/README.md:581-583`), must still match, and
regenerating it must give identical bytes.

**F2, the G-V3 corpus.** `generate.mjs`: mulberry32, seed **20261102**, 1,000
births, draws in a fixed order, written to `births.json`.

- Instant: uniform to the millisecond from 1800-01-02T01:00:00Z to
  2199-12-30T23:00:00Z, so that the 1,440-minute horizon lies inside
  `REFERENCE_SPAN` on every clock and is never cut.
- Latitude: 70 per cent with |φ| uniform in [0, 60] degrees, 30 per cent in
  [60, 66]; hemisphere at random; rounded to 1e-6 degree.
- Longitude: uniform in [-180, 180) degrees, rounded to 1e-6 degree.
- Clock: 80 per cent UTC; 10 per cent UT1; 5 per cent TT; 5 per cent a pinned
  ΔT uniform in [0, 120] s to the millisecond, on a scale drawn uniformly from
  the three.
- Ayanamsa: 40 per cent lahiri, 40 per cent krishnamurti, 10 per cent
  true-chitra, 5 per cent a caller's epoch definition (`userAyanamsa` with a
  value uniform in [22, 25] degrees at an epoch uniform over 1900 to 2100, model
  "engine"), and 5 per cent a caller's linear definition (the same, with a rate
  uniform in [-3600, 3600] arcseconds a year, the full range `userAyanamsa`
  accepts).
- Points: the default ten (the Ascendant, the Sun to Saturn, the two mean
  nodes), with Uranus, Neptune and Pluto added on 10 per cent of births.
- Vargas: all sixteen, with `cyclic: true`. Horizon: 1,440 minutes. House
  system: whole (it does not touch the rows).

**F3, the planted seam cases.** `seams.mjs` builds them before the unit's code
exists, from a build of engine main a253973's packed sources, whose time basis
and positions this unit does not change: built in `engine-rc2` at commit P
(which adds only these five texts to a253973) on Node 22.22.2, or from
`git archive a253973 -- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'`;
never from a plain clone. One heavy job. One case for each seam on each clock
on which it steps, 13 in all:

| seam | UTC | UTC, pinned ΔT | UT1 | TT |
| --- | --- | --- | --- | --- |
| the leap second before 2017-01-01 (the last in `src/time-scale-data.ts:13`) | Ascendant | Ascendant | | |
| 1972-01-01T00:00:00Z | Ascendant | Ascendant | Moon | Ascendant |
| 2027-10-02T00:00:00Z, the end of the IERS UT1 table | Ascendant | Ascendant | Moon | Ascendant |
| 1940-12-31T18:00 UT1, the ΔT model's handover | Moon | | Moon | Ascendant |

Where UT1 steps, the generator chooses the place's longitude so that a D60
boundary of the Ascendant falls inside the step. Where only TT steps, it chooses
a caller's epoch ayanamsa's value so that a D60 boundary of the Moon does.
Where the step goes backward, it plants a crossing half a step before the seam,
which the step then undoes. Each case records its seam, the measured step on
each scale, and its expected change: key, side, millisecond, boundary and signs.
The expected millisecond follows from the construction. A case whose
construction fails is reported, not dropped.

**F4, the G-V4 corpus.** `generate.mjs --g-v4`: mulberry32, seed **20261103**,
1,000 births, written to `births-erfa.json`. Instants and latitudes as F2;
longitudes uniform; every birth on `timeScale: "ut1"` with a pinned ΔT uniform
in [0, 120] s to the millisecond, so that the comparison takes no time-scale
conversion; lahiri or krishnamurti, half each; the Ascendant only; all 18 keys;
horizon 1,440 minutes.

**The evaluation budget.** One evaluation budget covers each call: when it is
spent, the point in progress and those after it are refused with
`evaluation-budget`, so the Ascendant is the last to be lost. Its value is a
constant fixed, with how it was derived, in `INPUTS.md` in commit I, before
any of the unit's code exists and so before the code runs on F2; it is never
chosen after a G-V3 result has been seen. The docs state it, as the window
entry's 2,000,000 instants are stated (`src/window.ts:104`).

## 7. Completeness: what is claimed and what is not

- **The Ascendant.** For |φ| ≤ 66 degrees, within one piece of the time basis,
  its sidereal longitude is strictly increasing, with `R_lo ≤ dx/dt ≤ R_hi`,
  so bisection on a bracket finds the exact first millisecond and skips none.
  The derivation: with φ the latitude, ε the true obliquity, θ the local
  sidereal time, A the Ascendant's azimuth and η the angle between the
  ecliptic and the horizon at the Ascendant, the eastern intersection's
  longitude moves as dλ/dθ = cos φ · sin A / sin η, and for |φ| + ε below 90
  degrees sqrt(cos²φ - sin²ε) ≤ dλ/dθ ≤ cos φ / cos(|φ| + ε). With the
  engine's true obliquity under 23.47 degrees from 1800 to 2200 (the vargas
  report), the obliquity's own motion at most 5e-5 degree a day
  (`src/window.ts:90-96`, scanned), θ advancing at 360.9856 degrees a UT1 day,
  and `a` the ayanamsa's rate bound, the bounds in degrees a day are
  `R_hi = 1.01 × 360.9856 × cos φ / cos(|φ| + 23.5°) + a` and
  `R_lo = 0.99 × 360.9856 × sqrt(cos²φ - sin²23.5°) - 5e-5 / cos(|φ| + 23.5°) - a`.
  Seams are walked in 1 ms steps. `tools/derived_bounds.py` (standard library
  only) writes the derivation's table: `R_lo` and `R_hi` at |φ| of 0, 30,
  45, 60 and 66 degrees, for `a` of 0.0003 degree a day and for the largest
  linear rate a caller may give, and the largest |φ| at which `R_lo` stays
  above zero. Its control: at 66.6 degrees, beyond 90 degrees less 23.5, the
  lower bound has no real value and the script must say so. The premises are
  checked at run time by the bracket guard (refusal `rate-bound`).
- **The mean nodes.** Strictly decreasing: the polynomial's leading rate,
  -6,962,890.5431 arcseconds a Julian century (`src/points.ts:32`), outweighs
  any ayanamsa's (at most 3,600 arcseconds a year for a caller's linear
  definition). The same argument holds.
- **The bodies.** "None missed" rests on `WINDOW_RATE_BOUNDS`, twice the
  largest rate found by scanning the engine's own positions over 1800 to 2200
  (`src/window.ts:54-73`), and on the evaluation not jumping between
  neighbouring milliseconds by as much as one millisecond's bound. Neither is
  derived. G-V3's dense sampling tests them; it does not prove them (site
  `HANDOFF-2026-09-30.md:293`). The docs say so, and each body row says
  `completeness: "scanned"`.
- **Floating point.** Every claim is about the engine's floating-point
  execution on the millisecond lattice of the input scale: not about real time
  between milliseconds, and not about the sky.

## 8. The checks

### G-V1: the assignments stay exact

- **What.** `src/vedic/boundaries.test.ts:61-66` on the candidate tree: for each
  of the 18 keys, `vargaOf` at the three points of every part boundary of
  `boundaries.json` (3,480 boundaries, 10,440 points).
- **Reference.** `docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py`:
  exact rational arithmetic on the rules transcribed from BPHS ch. 6 (R.
  Santhanam's translation, 1984), with the trimsamsa in degrees from P. V. R.
  Narasimha Rao (2000) §6.2. It never runs the engine. No download.
- **Pass.** Zero mismatches, and regenerating the fixture gives identical bytes
  (the SHA-256 in section 6).
- **Control that must fail.** The mutation the 2026-09-28 evidence recorded:
  the exact `floor(lon × 7560)` in `src/vedic/grid.ts` replaced by a naive
  `Math.floor(lon * 7560)`. It must fail at least one of the 18 varga tests. It
  failed D7, D9, D27 and D45 then, with the nakshatra and KP tests
  (`docs/evidence/vedic-2026-09-28/README.md:584-587`).

### G-V2: which boundaries are changes

- **What.** (a) The module's change boundaries, key by key, equal F1's change
  rows; (b) in G-V3's results, every reported `boundary` is a change row of F1
  for its key, with `from` and `to` equal to F1's signs below and at it, in the
  direction of the crossing.
- **Reference.** F1, engine-free. No download.
- **Pass.** Zero mismatches in (a), zero exceptions in (b).
- **Controls that must fail.** (i) A test build whose change boundaries are all
  3,480 part boundaries, the keeps ignored, must fail (a) with exactly 24
  mismatches. (ii) F1 with one change row turned into a keep must fail (a) with
  exactly one. (iii) A copy of G-V3's results with one D2 boundary replaced by
  the sign start next to it, a keep, must fail (b) once.

### G-V3: instants exact in the engine's arithmetic, none missed

- **What.** `run.mjs` runs `vargaSensitivity` on every F2 birth and F3 case and
  writes `results.jsonl`; `checker.mjs` checks each result through the public
  API, with lone calls.
- **Lone calls.** astronomy-engine keeps some values for 1e-6 day. The checker
  evaluates a chart a day away before the first instant of each batch and
  before any instant within 100 ms of the one before, as B2.a's checker does
  (`docs/evidence/birth-window/checker.mjs:60-72`).
- **Matching rule**, for each birth or case and each of its rows:
  - M0: the call returns, and no row is refused (the corpus holds no polar,
    timeless or out-of-span birth, by construction); a refusal with
    `evaluation-budget` under the constant fixed in `INPUTS.md` is a FAIL like
    any other;
  - M1: `position` equals `vargaOf` of the public API's longitude at the birth;
  - M2: for each reported change, the public API gives `from` at `at - 1 ms`
    and `to` at `at`;
  - M3: `minutes` equals `(at - birth) / 60,000`, zero or negative for
    `previous` and positive for `next`, and `at` lies in `searched`;
  - M4: `boundary` is the double nearest `T / 7560` for a whole `T` that lies on
    the short arc from the longitude at `at - 1 ms` to the longitude at `at`
    (G-V2 (b) then checks `T` against F1);
  - M5: coverage: at every sample instant in `[previous, next)` the key's sign
    is the birth sign. A `null` side extends the interval to that end of
    `searched`. Samples are taken every whole second for the Ascendant, every
    10 s for the Moon and every 60 s for the other points, counted from the
    birth in both directions, and at the interval's first and last
    milliseconds;
  - M6: every F3 case gives its expected change: key, side, `at`, `boundary`,
    `from` and `to`.
- **Reference.** None independent, by design: the claim is exactness in the
  engine's own arithmetic, not accuracy (engine `AGENTS.md:110-115`), so the
  reference is the engine's public API, evaluated apart from the search, with
  F1's boundaries and F3's construction. No download.
- **Pass.** Zero failures of M0 to M6 over all 1,000 births and 13 cases.
  Anything else is FAIL, reported with its details.
- **Reported outside the pass rule.** Changes found per point and key; `null`
  sides; evaluations per call and per point; run times; and, as a disclosure,
  whether the public API gives identical bits at each of F2's 1,000 birth
  instants alone and 1 ms after a call at the millisecond before.
- **Controls that must fail.**
  - C3a, the checker: on a copy of the results with one `next.at` moved 1 ms
    later it must report an M2 failure; with one `next` set to `null` where a
    change exists, an M5 failure.
  - C3b, the bodies' bounds: a build with every body bound divided by 10 must
    not pass on births 1 to 50 of F2 (it refuses with `rate-bound`, or misses).
  - C3c, no bisection: a build that reports the Ascendant's changes at the end
    of 60 s brackets must fail M2 on births 1 to 50 of F2.
  - C3d, seams ignored: a build whose seam finder returns none must fail M6 on
    at least one F3 case; the backward-step plants are built for it.

### G-V4: the Ascendant against an independent computation

- **What.** `vargaSensitivity` on F4, and the arbiter `tools/varga_ascendant.py`
  on the same births. The arbiter imports nothing from the engine and uses no
  Swiss code or data. On a real UT1 axis, with TT = UT1 + the birth's pin:
  - sidereal time from ERFA `gst06a`; the true obliquity from `obl06` plus the
    nutation in obliquity of `nut06a`;
  - the Ascendant's eastern intersection from them;
  - the ayanamsa for lahiri and krishnamurti built as
    `docs/evidence/vedic-2026-09-28/tools/reference_values.py` builds the epoch
    ayanamsas (`docs/evidence/vedic-2026-09-28/README.md:484-511`), with
    `nut06a`'s nutation in longitude for the true value;
  - each key's runs from F1;
  - for each key and side, the first crossing of the birth run's end, by
    bracketing and bisection to 1 microsecond.
- **Comparison**, for each birth, key and side:
  - Side rule: if the birth lies within 5 s of any arbiter crossing of that
    key's run ends, the side is counted as not judged.
  - A crossing within 5 s of either end of `searched` is not judged.
  - Otherwise both report no change, or both report a change with the same
    boundary, `from` and `to`, and |engine `at` - arbiter instant| ≤ 5 s.
- **Reference.** ERFA through pyerfa 2.0.1.5 and numpy 2.4.6, with F1. **Needs
  a download the owner has not approved [OQ6]**: both from PyPI, into a scratch
  environment outside every repository. Without it G-V4 does not run.
- **Pass.** Over all judged sides of all 1,000 births: zero mismatches of
  boundary or sign, and every difference within 5 s.
- **Reported.** The maximum, median and 99th percentile of |difference| in the
  latitude bands 0 to 45, 45 to 60 and 60 to 66 degrees; the counts judged and
  not judged. The scoping expected under 0.05 s within 45 degrees and under 0.9
  s at 60 degrees, from the angle gates of `src/angles-erfa.test.ts` (0.5
  arcsecond within 45 degrees, 8 elsewhere) and its slowest sampled rates; that
  expectation is not part of the pass rule.
- **Controls that must fail.**
  - C4a: the engine's instants shifted by 6 s must fail every compared side.
  - C4b: the arbiter given the other definition's ayanamsa (krishnamurti for
    lahiri, and the reverse) must fail at least one comparison. The two differ
    by 0.096872077 degree at J2000.0 (23.857092325 and 23.760220248,
    `docs/evidence/vedic-2026-09-28/README.md:494-495`).

### G-V5: the bodies stated, not judged

- **What.** The body rows' instants inherit the ephemeris's error.
  `docs/vedic.md` states how far a longitude error moves each body's instants,
  from a committed script and its output. The scoping put 1 arcsecond at about
  2 s of time for the Moon, 25 s for the Sun and 13 minutes for Saturn.
- **No pass rule on the instants.** Nothing about them is judged. The one
  falsifiable part is the docs' table: the script's `--check` recomputes it and
  compares it with the figures in `docs/vedic.md`. Its control: one docs figure
  changed by hand must fail `--check`.
- **Not proposed.** A Moon comparison against DE440. No decision depends on
  its result under R5; under a stricter reading, which the brief's Phase 2 rule
  would support (R5), it would need a NAIF kernel and a reader, downloads the
  owner has not approved **[OQ6]**.

### Named tests, in CI on every push

These are ordinary tests with named cases (brief `:72-74`), listed so that the
record is whole. Each has a control that fails:

| test | its control |
| --- | --- |
| The three evaluation paths equal `siderealChart` and `chartPoints` bit for bit, on UTC, UT1, TT and pinned clocks, for each kind of ayanamsa, alone and 1 ms after another call (a regression test, not accuracy evidence) | subtracting the mean ayanamsa in place of the true one fails it |
| The copied rate bounds equal `WINDOW_RATE_BOUNDS` | one copied value changed fails it |
| Analytic contract cases on the search core: synthetic longitudes with exact crossing milliseconds (steady motion either way; a wrap through 0 degrees; the D2 run from 345 to 15 degrees; a station touching a boundary for one millisecond, which is a change; a station stopping short; a seam stepping forward across a boundary; a seam stepping back after a crossing just before it; a bound broken on purpose, refused; the budget spent, refused) | a search without its 1 ms terminal step fails the one-millisecond touch; brackets allowed across seams fail the backward step |
| Refusals: no time, no place, 66 and 66.000001 degrees, outside the span, each malformed option | a build that computes instead of refusing fails each |
| The docs' synthetic birth (`docs/vedic.md:27`), pinned as a regression example | a changed instant fails it |
| The existing Vedic tests, `src/sign-rulers.test.ts` included | (their own) |

## 9. Independent references and downloads

| check | what is compared | independent reference | runs with | a download the owner has not approved |
| --- | --- | --- | --- | --- |
| G-V1 | 10,440 varga signs at 3,480 boundaries | exact rationals from the texts, `boundary_fixtures.py` | Python standard library, Node | none |
| G-V2 | the change or keep class of 3,480 boundaries, and every reported boundary | F1, from the same transcribed rules | Python standard library, Node | none |
| G-V3 | change milliseconds, signs, coverage | none independent, by design (self-consistency through the public API), with F1 and F3's construction | Node 22.22.2 | none |
| Section 7 | `R_lo`, `R_hi` | the derivation, evaluated in Python | Python standard library | none |
| G-V4 | the Ascendant's change instants, boundaries and signs | ERFA `gst06a`, `obl06`, `nut06a`, `reference_values.py`'s ayanamsas, F1 | pyerfa 2.0.1.5, numpy 2.4.6 | **yes: pyerfa and numpy from PyPI [OQ6]** |
| G-V5 | the docs' table of time per arcsecond (the instants are not judged) | the script's own recomputation, `--check` | Node or Python | none (a DE440 comparison, not proposed under R5, would need a kernel and a reader) |
| Named tests | bit identity, copies, analytic cases | the public API, the source tables, exact construction | Node | none |

## 10. Procedure

1. Before any of the unit's code: this file in commit P with the other four
   preregistrations (commit P is pushed alone, by its own hash, as the first
   head of the draft PR, once the owner allows the first push: OQ3 and
   OQ14). Right after commit P, commit I: F1's generator and F1; F2 and F4's
   generator and outputs; F3's generator with F3, built in `engine-rc2` at
   commit P on Node 22.22.2 (section 6); and `INPUTS.md` with each file's
   SHA-256 and the evaluation budget constant with its derivation.
   `boundaries.json` must still hash to its recorded SHA-256.
2. Implement. CI runs G-V1, G-V2 (a) and the named tests on every push.
3. At the candidate's source commit, after the reviews: `npm ci` and `npm run
   build` on Node 22.22.2, in `engine-rc2` or in a sparse clone made as the
   scope limitation says, never a plain clone.
4. G-V3: `run.mjs`, then `checker.mjs`, as one heavy job run alone; then the
   controls C3a to C3d, each run alone.
5. G-V4, only once OQ6 is approved: create the scratch environment outside
   every repository and record its versions; run the arbiter and the
   comparison, then C4a and C4b, each alone.
6. Commit the outputs unchanged in method: `results/`, `RESULTS.md` with the
   counts and each check's verdict, and `README.md` with the environment (Node,
   platform, Python, and the pyerfa and numpy versions if G-V4 ran).
7. Before every push, the private birth-data search runs over the new
   commits, counts only, with the whole folder
   `docs/evidence/calc-sidereal-2026-10-05/` excluded, and only once the
   owner has answered OQ14; by default the owner is asked before any engine
   push, and nothing is pushed until then.

No birth or case is dropped or rerun on its own; an interrupted run is run
again in full. A FAIL stays recorded. A fix after a FAIL needs a new
preregistration (version 2) with new seeds, citing this one.

## 11. Release state and acceptance

`P2.B.vargas` is recorded `accepted` only when all of these hold:

1. G-V1 to G-V4 pass as preregistered, with their evidence committed in the
   engine and reproducible, and G-V5's statement is in `docs/vedic.md` with its
   evidence.
2. The unit is in the release state its gate needs, `deployed`: "an engine
   candidate the site vendors and production serves" (site
   `docs/platform/programme/README.md:70-74`). Read as at rc.15 **[OQ7]**: the
   owner merges the 1.1.0-rc.2 candidate with its carried archive; the site's
   adoption PR, opened only once site#862 (B3.c) is merged or closed and
   pushed without a PR until then **[OQ8]**, vendors the same bytes and is
   merged; and production checks show the engine chunk naming 1.1.0-rc.2 and
   the regenerated reference serving the page for `vargaSensitivity`; each is
   also run on the deployment that served the site before the adoption and
   must fail there (its engine chunk names 1.1.0-rc.1 and its reference has
   no `vargaSensitivity` page). The site adds no code: it may not import
   `./vedic` (site `scripts/engine-entry-imports.test.mjs:48-53`).
3. The owner has ratified section 3's reading **[OQ5]**.

With 1 and 2 but not 3, the unit is `validated`. Without G-V4 it stays `partial`
under this reading, whatever G-V1 to G-V3 show. Accepted, it moves the ledger
from 83.95 to 85.95 of 182.45 (46.013 to 47.109 per cent), before the cut's
other units.

## 12. What this preregistration does not claim

- Any physical accuracy for the bodies' instants.
- Completeness for the bodies beyond the scanned bounds and the stated premise.
- Anything outside `REFERENCE_SPAN` (1800 to 2200), where the search refuses.
- The Ascendant beyond 66 degrees of latitude, where it is refused.
- The true node, the ΔT band, KP's ruling planets, or any site surface.
- Anything about real time between milliseconds.

## 13. Amendments

Any change after commit P to a reading, an input, a seed, a pass rule, a
tolerance or a control is an amendment: dated, with its reason, appended to
this section, never an edit in place. An owner answer that arrives after
commit P, OQ5's included, is such an amendment, appended before any formal
run it affects. An amendment adopted after its result was seen makes the
reading `validated` only, until the owner ratifies it. Once a formal run has
been seen, a change of rule is a new version (section 10).

None at commit P.

**2026-11-03, the owner's answers.** The answers to OQ1 to OQ14, given under
the owner's delegation of that day and before any formal run, are in
[`../OWNER-ANSWERS.md`](../OWNER-ANSWERS.md). For P2.B.vargas: OQ1, KP
waits; OQ3, `./vedic`'s ceiling 143,000; OQ6 yes, so G-V4 can run with
pyerfa in the scratch environment; OQ7 yes. OQ5 is not answered under that delegation (zodiacs.org
`DECISIONS-2026-10-05.md` §4). Section 3's
reading, with its 5 s and side rule, R5 as narrower than the brief's Phase 2
rule, and completeness derived only for the Ascendant and the mean nodes,
stays unratified, and the true node stays out. The unit is `validated` at
most (section 11, condition 3) until the owner ratifies. This amendment is
the answer section 2's "Owner's answer" line waits for.

**2026-11-03, the implementation's departures.** Commits `9259a6c`,
`da193bf` and `e546f15` implement this file. In writing them the design was
departed from in the points below, each found while writing the code or in
light trials on a development corpus of 40 births drawn by `generate.mjs`
with seed 1 (section 2: unit tests use seeds 1 to 3). All come before any
formal run: F2, F3 and F4 have not been run. No reading of section 3, pass
rule, seed, fixture or tolerance changes, and no control's pass condition.

- **`a` for a star definition is 0.0213 degree a day**, 0.0003 plus 0.021,
  not 0.0003. Section 7 defines `a` as the ayanamsa's rate bound, and 0.0003
  is not one for a star definition: near the Sun's conjunction with the
  star, the light deflection that `src/vedic/ayanamsa.ts` applies moved
  true-pushya's ayanamsa by up to 0.019 degree a day (sampled each minute
  around 2000-07-31) and true-revati's by up to 0.0027 (around 2000-04-09).
  With 0.0003 the bracket guard refused the mean nodes with `rate-bound` for
  about three days. The 0.021 is derived from that code: the deflection
  moves at most (2GM/c²)/r/f radian for each radian the Sun moves, f = 1e-6
  / max(r², 1) being the code's floor of 1 - cos E (r the Earth's distance
  from the Sun, at least 0.98 au; E the star's angle from the Sun), so at
  most 0.02015, and the Sun moves at most 1.0194 degrees a day. Every other
  definition keeps 0.0003, and a linear definition adds its own rate, as
  section 7 has it. In section 7's bounds this moves `R_lo` and `R_hi` by
  at most 0.021 degree a day, against an Ascendant rate of at least 28.6
  degrees a day up to 66 degrees, where `R_lo` stays above zero. The mean
  nodes still decrease: their leading rate is 0.0529 degree a day.
  `tools/derived_bounds.py` adds a column for this bound.
- **The mean nodes' guard** takes their leading rate within a relative 1e-5
  of itself, for the polynomial's higher terms (under 4.3e-6 of it from 1800
  to 2200), give or take `a`.
- **Rounding.** A bracket's advance is held to its bounds with 1e-9 degree
  of slack, for floating-point rounding. The design had none.
- **The seam walk** reaches the step's size plus one second on each side, so
  a leap second costs 4,001 evaluations a point, where INPUTS.md's estimate
  (section 6) counted 3,001; the estimate's total becomes 55,230. The
  budget, 2,000,000 a call, does not change.
- **Seams on a pinned UTC clock.** TAI - UTC is read at the record's UTC
  instant, so a leap second counts as a seam on that clock too.
- **A birth out of range** reports the birth instant alone as `searched`.
- **The output.** Each row also names its `varga` and `scheme`, so that a
  refused row whose position is `null` still says which varga it is. The
  result gives each point's `evaluations`, which G-V3 reports (section 8)
  and which the output could not otherwise show.
- **C3c's build** reports each Ascendant change, with the signs of the true
  crossing, at the end of its 60 s bracket. A build that only moved the
  instant would compute the signs again there, and M2 alone would not catch
  it.
- **G-V4's side rule.** "Where a birth lies within 5 s of a crossing, its
  side is counted, not judged" (section 3, R4) is read as covering both
  sides of the key: when the birth lies within 5 s of the arbiter's crossing
  at either end of the key's run, neither side of that key is judged, since
  the birth's own sign is then in doubt. This is part of section 3's reading
  that OQ5 leaves unratified.
- **An erratum in INPUTS.md** (section 6): the longest Ascendant bracket at
  0 degrees is 71,715,147 ms by the floor, not 71,715,148. Its bisection
  still takes at most 27 halvings, and with `a` of 0.0213 the bracket is
  71,711,853 ms, with the same count of halvings.

The unit stays `validated` at most until the owner ratifies OQ5.
