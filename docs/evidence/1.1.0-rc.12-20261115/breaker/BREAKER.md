# Breaker review of 1.1.0-rc.12 (draft pull request 101)

Written 2026-11-15 (ICT) by a review session that did not build the
candidate. Head reviewed: `a8346af3d046e8cde80740a05a0d08902be63c3b`, equal
to the pushed head of the pull request's branch after `git fetch`. Every
number below was measured by the tools in `tools/` and is in `results/`.
Unless a line says otherwise the engine is the carried archive
`artifacts/zodiacs-engine-1.1.0-rc.12.tgz` (SHA-256 `4577e2ff…0297`,
2,723,759 bytes), installed with `npm install` into an empty directory, on
Node 22.22.2, with every `ZODIACS_*` variable unset. The tools import
`@zodiacs/engine`; they were run with the install's `node_modules` linked
beside them.

Independent instruments: JPL Horizons (its API; all 272 responses are in
`results/horizons-responses.tar.gz`, their values and SHA-256 in
`results/horizons.json.gz`), and NAIF's `de440.bsp` (SHA-256
`a4ce9bf9…c4b5`) read with jplephem 2.24 and reduced with pyerfa 2.0.1.5 and
numpy 2.4.6 by code written for this review (`tools/kernel_check.py`,
`tools/horizons_compare.py`, `tools/ingress_ref.py`; not the sweep's
`sweep.py`, not the builder's `compare.py`). Three tools of the rc.11 review
were run again as they are (`probe.mjs` with `probe-all.sh`, `b1.mjs`,
`edges.mjs`, in `../../1.1.0-rc.11-20261115/breaker/tools/`).

## Verdict: NO BLOCKER

Both blockers of the rc.11 review are closed, and nothing found here blocks.
One decision is the owner's and is stated first; six should-fix items follow.

### For the owner first: the candidate follows Horizons, not `eraLdsun`

The brief for this review describes the fix as a taper (ERFA's `eraLdsun`).
The candidate does not taper: it applies no deflection to a planet behind
the Sun's disc and the full deflection outside it, a step at the limb. The
builder says so and gives the reason (Horizons does the same). This review
measured it independently and agrees with the builder:

- At 786 instants inside the disc, on 109 passages of all eight planets,
  a reduction of `de440.bsp` with no deflection behind the disc is within
  0.0000045″ of Horizons in the planet's angle from the Sun. The same
  reduction with `eraLdsun`'s limiter alone is up to 5.649″ from Horizons
  (Neptune), and with the rc.11 formula up to 333.476″ (Mercury).
- So a taper would have left the default up to 5.6″ from the repository's
  arbiter inside the disc. The cut agrees with it.

The cost of the cut is a step of up to 1.70″ at the limb (measured: Neptune
1.6956″, Uranus 1.6636″, Jupiter 1.4732″, Mercury 0.4163″), which `calc()`
covers with a bound of 1.8″ there, and which the crossing searches do not
handle (should-fix 2). The rule is one function and one constant in
`src/de440/reduce.ts`.

## Should-fix

1. **The near-Sun evidence was measured on a build that called itself
   1.1.0-rc.11.** `../near-sun/results/passages.json.gz` and `summary.json`
   record engine version `1.1.0-rc.11` and `dist` `/tmp/rc12/final/dist`:
   the engine side was run before the version was raised, so that build's
   `dist/` cannot be the archive's (the version string is in it), though
   `../README.md` says every measurement was made on the build with digest
   `32a2c2ce…`. README, CHANGELOG and `docs/de440.md` cite these figures.
   This review recomputed all 6,720 rows with the installed rc.12 archive:
   6,720 of 6,720 are identical to the bit, the quoted bounds too
   (`results/builder-rows-recheck.json`). The figures hold for this build;
   the files and the README sentence should say which build they ran on.
2. **A longitude search returns one of three crossings at the limb step and
   says `complete`.** For Jupiter, Uranus and Neptune the longitude steps
   back by the deflection on entering the disc and again on leaving it, so a
   target longitude inside the step is crossed three times (forward, back at
   the step, forward). `searchLongitudeCrossings` and calc's `events()`
   return one crossing, status `complete` / `ok`, at all six such limbs
   tried; `positions()` sampled each second changes sign three times
   (`results/limb.json`). The one returned is a true crossing (the last).
   It needs a target within about 1.7″ of the planet's longitude at one of
   786 limb crossings in 400 years, so it is rare, but nothing in the docs
   says a search near the limb can be short. Either list the limb instants
   to the search (as `steps()` does for the window search) or document it.
3. **"0.0005″ at the limb" holds only where both put the planet on the same
   side.** CHANGELOG and `docs/de440.md` give 0.0005″ within 3″ of the limb
   (66 instants). At 4 of this review's 50 instants in that band the engine
   and Horizons are on different sides and differ by the step: 1.6956″
   (Neptune, twice), 1.6635″ (Uranus), 1.4732″ (Jupiter), each within a
   second of the engine's limb crossing. The same paragraph explains the
   edge and `calc()` quotes 1.8″ there, which covers it, so no bound is
   broken; the sentence should not read as the agreement at the limb.
   A small one beside it: the `eraLdsun` figure is 5.761255″ in the evidence
   and 5.77″ in the docs.
4. **Budgets raised without the owner's yes**, as the builder says: root
   149,400 to 151,700, eight other graphs with it, total cap 1,245,000 to
   1,265,000.
5. **Still open from the rc.11 review, now documented and not changed:**
   the pack quotes no speed or distance bound (`value: null`; the Moon's
   rate is up to 0.336″ a day from the kernel's, item 1); the timing and
   vedic results, `moonSignCandidates` and `searchLongitudeCrossings` flag a
   fallback and name no ephemeris; `solarReturn` and `lunarReturn` name no
   ephemeris at the top level.
6. **`artifacts/README.md`:** the rows of rc.11 and rc.12 both read "Draft
   candidate for 1.1.0, awaiting the owner's review". The paragraph under
   the table says rc.12 replaces rc.11, and leaving rc.11's row untouched is
   what the rc.11 review asked for, so this is a note, not a request.

## The items of the brief

### 0. The rc.11 blockers

**B1' closed.** `chartPoints` and `chartDeclinations` carry `ephemeris` and
`flags`.

- The rc.11 probe on the installed rc.12 archive (77 calls over every entry
  point; pack whole at 1991, 1750, 2230, 1785, 2195; 13 kinds of damage;
  the caller's choice; `results/probe/probe-report.md`): both functions,
  given a birth, flag `"de440-unavailable"` and name astronomy-engine in 13
  of 13 kinds of damage, and flag `"outside-de440-span"` at 1750 and 2230.
- This review's second hunt (`tools/hunt2.mjs`, 60 calls with argument forms
  the probe does not use: a computed chart where it passes a birth, a birth
  with no time, other bodies, other frames; pack whole at 1991, 1750, 2230;
  6 kinds of damage; `results/hunt2/hunt2-report.md`): both functions given
  a chart, and given a birth with no time, are labelled in every state. 55
  of the 60 calls ran (5 threw on arguments this review got wrong: a house
  system name, a body name, two event kinds, an ayanamsa name). None of the
  55 is silent or mislabelled.
- Tests: `src/ephemeris-fallback-root.test.ts` (9 tests: whole, damaged,
  outside, caller's choice, supplied chart, `saturnReturn`), in the suite
  that passed (item 6).
- The hunt across every export: with the pack damaged the results that
  change and say nothing are the same nine as the builder reports: the six
  documented bare forms (`findLongitudeCrossings`, `bodyLongitude`,
  `longitudeSpeed`, `solarReturnInstant`, `mostRecentSolarReturnInstant`,
  `lunarReturnInstant`), `defaultEphemeris()` (which reports
  `opened: false`), and `compositeMidpoints` and `vimshottariAt`, which
  only echo a supplied input that moved. Counts: 38 flag and name
  astronomy-engine, 14 flag, 5 name astronomy-engine by design, 11 do not
  depend on the pack. The 163 function exports the probe does not call were
  read in the API reports: none takes an instant or a birth and reads a
  position (the `./time` functions take TT numbers and use no ephemeris).
  No unlabelled fallback was found.

**B2 closed.** `tools/passages.mjs` (this review's own search with `calc()`)
finds 512 passages of Mercury to Pluto within 0.3° of the Sun's centre from
1800 to 2199: 393 behind the disc (Mercury 114, Uranus 95, Jupiter 56,
Neptune 42, Venus 28, Saturn 28, Mars 27, Pluto 3; the builder's count), 59
in front of it (Mercury 53, Venus 6), 60 that miss it. Horizons was asked
for the planet and the Sun at 1,744 TT instants (`tools/instants.mjs`): the
four passages the rc.11 review named, 41 instants each; 105 more passages
behind the disc (every 5th of each planet, the five nearest the centre of
each, all of Pluto's), 13 instants each, four of them about 10″ either side
of each limb; 17 passages that miss the disc; 10 in front of it.

Two measures that the difference between Horizons's frame of date and the
engine's does not enter (`tools/horizons_compare.py` says why): `sep`, the
planet's angle from the Sun's centre, engine minus Horizons, which holds
the whole of a deflection applied by one and not the other; and `rel`, the
planet's offset from the Sun on the sky, engine minus Horizons.

| where (by the engine's decision) | instants | `calc()` from Horizons, `sep` | `rel` | bound `calc()` quotes | over the bound |
| --- | ---: | ---: | ---: | ---: | ---: |
| behind the disc, more than 3″ from the limb | 786 | 0.000135″ | 0.001001″ | 0.004″ | 0 |
| within 3″ of the limb | 50 | 1.695639″ | 1.695676″ | 1.8″ | 0 |
| outside the disc (in front of it included) | 908 | 0.000166″ | 0.001919″ | 0.004″ | 0 |

The 46 limb-band instants where both are on the same side: `sep` within
0.000078″. The four where they are not are in should-fix 3.

The four named passages, 41 instants each (19 inside, 2 at the limb, 20
outside):

| passage | rc.11 from Horizons (rc.11 review) | rc.12 inside the disc, `sep` | `rel` | plain angle in Horizons's RA and Dec | at the least separation: `sep` |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mercury 1954-05-08 | 307.9″ | 0.000077″ | 0.000095″ | 0.089″ | 0.000005″ |
| Uranus 2029-06-04 | 195.5″ | 0.000048″ | 0.000049″ | 0.044″ | 0.000006″ |
| Neptune 1839-01-30 | 154.8″ | 0.000009″ | 0.000586″ | 0.419″ | 0.000005″ |
| Jupiter 2032-01-01 | 56.3″ | 0.000068″ | 0.000086″ | 0.030″ | 0.000012″ |

The plain angle is the two frames' difference: the Sun, which has no
deflection, is the same distance from Horizons at the same instants
(0.4186″ in 1839). Over all 1,744 instants the plain angle is at most
0.514″ outside the limb band.

Which rule Horizons follows (four reductions of `de440.bsp` against
Horizons, `sep`, largest):

| reduction | inside the disc (786) | outside (908) |
| --- | ---: | ---: |
| deflection outside the disc, none behind it (the candidate's rule) | 0.0000045″ | 0.0000049″ |
| `eraLdsun`'s limiter only | 5.649″ (Neptune) | 0.0000049″ |
| limiter 1e-14 (rc.11's formula) | 333.476″ (Mercury) | 0.0000049″ |
| no deflection anywhere | 0.0000045″ | 1.693″ |

`calc()` is within 0.0038″ of the first reduction at every instant.

Do the builder's quoted figures cover these? Inside 0.0023″ (this review:
0.0010″), outside 0.0047″ (0.0019″), `eraLdsun` 5.77″ (5.649″ on this
sample), rc.11's formula 333.48″ (333.476″): yes. At the limb 0.0005″: not
for the four instants on different sides (should-fix 3); `calc()`'s 1.8″
covers them.

The limb itself (`tools/limb.mjs`, `results/limb.json`, both limbs of the
four named passages): the step is 0.415″ to 1.696″; `calc()` quotes 1.8″
(`estimated`) from 1.3″ to 2.6″ outside the limb to 3.4″ to 4.5″ inside it,
and 0.004″ beyond; the speed changes by 1.9″ to 6.1″ a day across the step
and never holds the step.

**What changed against rc.11** (`tools/vs-rc11.mjs`, `results/vs-rc11.json`,
both carried archives installed): `positions()` at 8,000 pseudo-random
instants (96,000 rows): 18 differ, all 18 a planet behind the disc. `calc()`
with speeds at the 1,744 near-Sun instants: 815 differ, all 815 behind the
disc; every row not behind the disc is identical to the bit. Largest change
48.29″ of longitude. Nothing changed outside the disc, not even in the last
bit.

**The CI sweep gates the pack again.** `.github/workflows/de440-sweep.yml`
runs both sources over the eight eras; the new job "Sweep results on the
DE440 pack" merges the pack's eras and runs `check_pack.py` against
`src/calc-bounds-de440.ts`; the workflow now also triggers on that file and
on `src/de440/reduce.ts`. The arbiter (`sweep.py`) was changed to apply no
deflection behind the disc. That is the engine's rule on both sides of the
gate, so the gate alone would not catch a wrong rule; what justifies the
rule is Horizons, measured above and held by
`src/de440-behind-sun.test.ts` (a fixture of 168 Horizons rows). With that,
the change of arbiter is justified. The astronomy-engine run and
`src/calc-bounds.ts` are untouched. The job had not finished when this was
written (the pack eras were pending).

### 1. Sweep

- Root cause: as the rc.11 review found, the rc.10 run compared the pack's
  apparent places with an arbiter that had no deflection. Fixed in the
  engine now (`src/de440/reduce.ts`), not by loosening:
  `git diff d92a2134 -- src/calc-bounds.ts` is empty.
- Own computation (`tools/calc-sample.mjs`, `tools/kernel_check.py`,
  `results/kernel-check.json`): 2,500 pseudo-random TT instants from 1800
  to 2199 (not noon), ten bodies, eight frames (200,000 rows), and the
  instant 0.3 of the way from the centre to the limb of 99 passages behind
  the disc, planet and Sun (1,584 rows); all named `jpl-de440`, none
  flagged, convention `deflection:sun-outside-disc`. Against `de440.bsp`
  with this review's reduction (the candidate's rule behind the disc):

  | frame | largest angle, Sun and planets | Moon | longitude rate, Moon | Sun and planets | latitude rate, Moon | Sun and planets |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: |
  | `ecliptic-true-of-date` | 0.0034″ (Venus) | 0.0033″ | 0.336″/day | 0.0277″/day (Mars) | 0.028″/day | 0.0043″/day |
  | `equatorial-true-of-date` | 0.0035″ (Saturn) | 0.0035″ | 0.324″/day | 0.0306″/day (Mars) | 0.138″/day | 0.0068″/day |
  | the six other frames | 0.0006″ (Venus) | 0.0014″ | 0.323 to 0.336″/day | 0.0278 to 0.0307″/day (Mars) | 0.028 to 0.138″/day | 0.0043 to 0.0068″/day |

  Inside the disc: largest angle 0.0036″, longitude rate within 0.0024″ a
  day, latitude rate within 0.0010″ a day (with `eraLdsun`'s limiter in the
  reference the same rows are 5.65″ and 69″ a day off). Distance within
  7.3e-9 relative. No row is over the bound `calc()` quotes for it (0 of
  201,584).
- `calc()` rates against central differences of `calc()`'s own places (step
  0.01 day): within 0.053″ a day (Moon), 0.028″ a day (Mars), less for the
  rest. `calc()` in its default frame against `positions()` and against
  `natalChart()` at 600 UTC instants: equal to the bit in 6,000 of 6,000
  rows each.
- The bounds: `src/calc-bounds-de440.ts` is the larger of the L1 vectors'
  and the committed pack sweep's largest angle, rounded up to two
  significant figures (Moon 0.013, Saturn 0.0039 from 0.003898, the others
  0.0040 from 0.003911 to 0.003948); `src/calc-bounds-de440.test.ts`
  recomputes it. The sweep was run on this build: its `distSha256`
  `a8eac44d…d673` is what a build of the head gives over every file of
  `dist/` (computed here), and the same build's `*.js *.d.ts` digest is
  `32a2c2ce…90a6`, the archive's. The margins are thin by construction
  (0.003948 under 0.0040); this review's random instants reach 0.0035″.
- Docs: the sweep, window and "unchanged" figures in README, CHANGELOG and
  `docs/de440.md` are in `../sweep-pack/`, `../window/` and
  `../results/unchanged.json`. The near-Sun figures are in `../near-sun/`,
  measured on the earlier build (should-fix 1). Not rerun here: the 146,097
  day sweep and the 1,000 windows.

### 2. B1 of rc.10

- `b1.mjs` on rc.12: 42 checks in each of 15 states (whole; 13 kinds of
  damage; the caller's choice), at 1991, 1750 and 2230: 630 of 630 pass
  (`results/b1/`). Whole pack: `jpl-de440`, no flag.
- `edges.mjs`: 806 rows at the two ends of the pack, none mislabelled
  (`results/edges.json`).
- Signatures: `git diff d92a2134 -- api/` (rc.10 to this head) changes four
  reports, all by addition: techniques (the seven detailed forms and the
  patterns type, from rc.11), and in rc.12 two fields on `ChartPoints` and
  `ChartDeclinations` and an optional argument and field on `place()`
  (engine, de440, de440-pack). `npm run api:check` passes.
- The hunt: under item 0.

### 3. Docs

README, CHANGELOG, `docs/de440.md` and `docs/techniques.md` name the same
labelled forms, and they are what the package has; `docs/de440.md` now lists
which results name an ephemeris and which only flag. The 29.19″ sentence
says it is the largest at those instants, not a limit. The planet near the
Sun figure is now against Horizons (0.0023″ inside the disc at 3,490
instants; rc.11's formula 333.48″), backed by `../near-sun/`, whose rows
this build reproduces to the bit (should-fix 1). Wording at the limb:
should-fix 3.

### 4. Candidate

`package.json` 1.1.0-rc.12. `git diff 94946e6 -- artifacts/`: adds the
archive and its receipt, appends one entry to `archives.json`, adds one row
and one paragraph to `artifacts/README.md`; no line of an earlier archive,
receipt, entry or row is changed. All 23 receipts verify (`sha256sum -c`).
The tarball's SHA-256 `4577e2ff924ab1a5f5f6ffc52f7ce595c0e08e4f2cd6cd58d64f7e7bdf020297`
equals its receipt and its entry.

### 5. NASA suite

Own runner (`tools/l1.mjs`, `results/l1.json`), plain `natalChart()` with
`timeScale: "tt"`: **240 of 240 within 1″**. Worst longitude 0.0126″
(L1-POS-0002, Moon), worst latitude 0.0010″ (L1-POS-0222, Moon); the Sun and
the planets within 0.0038″ of longitude. All 240 name `jpl-de440`, none
flagged.

### 6. Gates on `a8346af`, Node 22.22.2, in a namespace without `/node_modules`

`npm ci`, then `../tools/gates.sh`: 18 of 18 exit 0
(`results/gates-a8346af-v22.22.2.log`): typecheck; suite 4,309 passed, 3
skipped; build; exports smoke; API check; package contents (rest 1,253,195
of 1,265,000); pack dry run; pack generator check; archive binding;
conformance selftest, validate 500, plain run (459, 0, 41; L1 240 of 240),
astronomy-engine run (267, 192, 41), report check; atlas check and
selftest; Offline CLI consumer (both steps, 29 checks). `--rebuild-all`: 27
archives (23 carried, 4 superseded) rebuild to their bytes, exit 0. Packed
consumer on the carried tarball: exit 0 on Node 22.22.2, 20.19.0 and
24.21.0. Not run: Node 22.7.0 (not on the machine). The gate runs had two
variables of the machine's own in their environment whose names begin
`ZODIACS_` (API keys of another tool); the engine reads neither. Every
installed-package measurement had all of them unset.

### 7. The Sun's ingress into Sagittarius, 2026

Reference from `de440.bsp` by this review's reduction: 2026-11-22
**07:23:20.563 UTC** (TT minus UTC 69.184 s), 07:23:21 to the second. From
the installed tarball on the default path (`results/ingress.json`):

| function | UTC | names |
| --- | --- | --- |
| `positions()`, `natalChart()`, `transits()`, `calc()`, calc `chart()`, `bodyLongitude`, `computeBodies`, each bisected to 1 ms | 07:23:20.564 | `jpl-de440` |
| vedic `siderealChart` (tropical longitude), bisected | 07:23:20.564 | no name, flags `[]` |
| `birthWindow` 07:00 to 08:00, the Sun's sign switch | 07:23:20.564 | `jpl-de440` |
| `findLongitudeCrossings`, `findLongitudeCrossingsWith(bodyLongitude)`, `solarReturnInstant` | 07:23:20.568 | bare values |
| `searchLongitudeCrossings`, timing `planetaryReturns` (Sun) | 07:23:20.568 | flags `[]` |
| calc `events()`, `solarReturnInstantDetailed`, `mostRecentSolarReturnInstantDetailed`, `solarReturn` | 07:23:20.568 | `jpl-de440` |

rc.12 matches 07:23:21: every default-path function is within 5 ms of the
kernel. No default-path export gives 07:23:38. After
`setDefaultEphemeris("astronomy-engine")` every one gives 07:23:38.235 to
.242 and names astronomy-engine where it names anything. The sky and lite
entries have no ingress function.

### 8. State

Pull request 101: open, draft, head `a8346af`. No tag with 1.1.0 on the
remote; newest release v0.1.1-rc.15; npm `latest` 1.0.0, `next`
0.1.1-rc.16. The three commits since `94946e6` are by Zodiacs Admin
<admin@zodiacs.org>, with no trailers and no model names; `94946e6` is an
ancestor of `a8346af` and the branch's reflog shows pushes only. The one
other remote branch that moved today (`grok-audit/engine-agents`) is
another job's.

CI: not waited; the coordinator will check.
