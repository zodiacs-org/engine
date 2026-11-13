# Review 1: accuracy

Redone on 2026-11-11 in two passes. The first pass had only this repository
at `origin/main` (`bc0b5a7`). The second pass also opened ZOD-63 and ZOD-65
in Linear, the master plan, pull request 92 and its branch
(`origin/admin/zod-65-engine-phase-1-replace-receipt-error-limits`, now at
`255b615`, read with `git show` and not changed), the site repository at
`47fee79f`, the live methodology page and the live connector, and it ran one
comparison of its own against JPL Horizons (A10). Findings that the second
pass changed are marked "second pass". This review states what the evidence
shows. It proposes no sentence for publication and approves none.

## What the package tells a caller today

- `@zodiacs/engine/calc` returns `bounds.position`, `bounds.distance` and
  `bounds.speed` with every position. The values are in `src/calc-bounds.ts`,
  written by `docs/evidence/calc-api/tools/bounds.py` from
  `docs/evidence/calc-api/rc16/summary.json`, and
  `src/calc-bounds.test.ts` checks that the table and the summary agree.
- Their basis string (`MEASURED_BASIS`, `src/calc-bounds.ts:13`) is "largest
  difference from JPL Horizons (DE441) over 32 instants from JD
  2379457.498125 to 2520522.646618 (TT), in all eight frames".
- `docs/calc.md:295-296` says of them: "They are the largest seen on those
  instants, not limits: another instant can exceed them."
- The field is still named `bounds`, the README's first paragraph says the
  calc entry gives positions "with bounds" (`README.md:6-7`), and
  `docs/de440.md:115-116` speaks of functions "whose bounds were measured".

So the wording in the guide is honest, and the name of the field is not. A
caller who reads only the result object sees a number called a bound.

## Finding A1: committed evidence already exceeds five of those values

No figure from ZOD-65 is needed for this. For the geocentric apparent row, in
arcseconds:

| Body | Value in the receipt (`src/calc-bounds.ts`) | Largest of the 32 instants (`calc-api/rc16/tables.md:30-39`) | A larger difference already committed |
| --- | ---: | ---: | --- |
| Mercury | 9.3 | 9.237 | 12.166 in declination |
| Venus | 11 | 10.034 | 14.706 in declination |
| Mars | 6.6 | 6.556 | 14.501 in declination |
| Jupiter | 13 | 12.697 | 16.095 in declination |
| Saturn | 18 | 17.598 | 21.573 in declination; 19.028 in latitude on the conformance suite |
| Sun | 3.0 | 2.944 | none (2.688 in declination) |
| Moon | 8.3 | 8.291 | none (3.375 in declination) |
| Uranus | 20 | 19.516 | none (19.264 in declination) |
| Neptune | 21 | 20.127 | none (15.473 in declination; 18.774 in longitude on the suite) |
| Pluto | 25 | 24.631 | none (4.532 in declination) |

Sources of the last column:

- Declination: `docs/evidence/nutation-2026-09-29/results/declination-truth.json`,
  the engine against an apparent place reduced from JPL's DE440s with ERFA
  (light time, deflection for the planets, aberration, `pnm06a`:
  `docs/evidence/rc14-20260928/apparent.py:6-14`), at 20,000 random instants
  from 1850-01-01 to 2150-01-01 TT. `README.md:493-502` prints these maxima.
- Suite: `conformance/results/summary.json:223` and `:230`, the 240 L1
  vectors (24 instants from 1851 to 2148, arbiter Horizons DE441);
  `conformance/RESULTS.md` attributes the latitude maximum to Saturn and the
  longitude maximum to Neptune.

A difference in declination, or in latitude, cannot be larger than the angle
between the two directions. So each figure in the last column is a lower
limit on an angular difference of the kind `bounds.position` describes, at an
instant inside the span the 32 instants cover (1802 to 2188).

Two cautions, so that this is not read for more than it is:

- The declination run's engine was 0.1.1-rc.15, before the IAU 2000B nutation.
  That change moved longitudes by at most 0.2701″ from 1800 to 2200
  (`README.md:115-116`), which is far less than the 2.9″ to 7.9″ by which the
  five rows are exceeded. The figures are used here only as an inequality,
  and are not figures for the current build.
- The declination reference has the Sun's light deflection for the planets,
  and the calc entry's apparent place has none
  (`docs/evidence/calc-api/PREREGISTRATION.md`, *Arbiters*). Deflection is
  milliarcseconds away from the Sun's limb. It does not explain arcseconds.

The repository therefore already holds the evidence that a 32-instant maximum
understates the error for Mercury, Venus, Mars, Jupiter and Saturn. The
declination maxima are in `README.md:493-502` and the receipt values in
`src/calc-bounds.ts` and `docs/calc.md`; no document sets one beside the
other.

## Finding A2: the five figures quoted from ZOD-65 (second pass: now measured, on another branch)

ZOD-65 says: "The [...] accuracy review compared 1.1.0-rc.2 against JPL
DE440 on all 146,097 daily dates 1800 to 2199 and found maxima of Sun 2.4″,
Moon 12.0″, Venus 22.9″, Pluto 29.2″, true node 32.4″." That review's data
is in neither repository.

The first pass of this review could not confirm the figures, and inferred
from the Sun's figure (2.4″, below the 2.944″ already measured at one of the
32 instants) that they were longitude differences and not the receipt's
measure. Pull request 92 has since committed a sweep that settles it
(`docs/evidence/de440-sweep-20261111/` on its branch: plan at `3cb8aee`,
results at `1313fed`, a second run recorded at `255b615`; workflow run
43037857931, ten jobs green, kernel SHA-256 `a4ce9bf9...c4b5`). From that
branch's `README.md`, largest differences from DE440 over 146,097 instants,
apparent geocentric places, engine 1.1.0-rc.3, arcseconds:

| Body | Quoted in ZOD-65 | Sweep, ecliptic longitude of date | Sweep, angle in any frame | Receipt value now | Same rule on the sweep |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sun | 2.4 | 2.39 | 3.34 | 3.0 | 3.4 |
| Moon | 12.0 | 11.92 | 11.88 | 8.3 | 12 |
| Mercury | | 14.12 | 16.92 | 9.3 | 17 |
| Venus | 22.9 | 22.92 | 23.32 | 11 | 24 |
| Mars | | 14.32 | 22.92 | 6.6 | 23 |
| Jupiter | | 10.64 | 16.81 | 13 | 17 |
| Saturn | | 13.10 | 23.22 | 18 | 24 |
| Uranus | | 12.09 | 19.65 | 20 | 20 |
| Neptune | | 19.71 | 21.28 | 21 | 22 |
| Pluto | 29.2 | 29.19 | 29.86 | 25 | 30 |
| True node | 32.4 | 32.64 | 32.64 | 16 | 33 |

What this review takes from it, and what it does not:

- The four body figures in ZOD-65 are reproduced as **longitude**
  differences, to 0.1″. The inference of the first pass holds: they are not
  on the receipt's measure. The receipt's measure gives larger values (Mars
  22.92″ against 14.32″ in longitude).
- The node is 32.64″ here against 32.4″ quoted. The branch says the reason
  is not known. The sweep is on rc.3 and the quoted review on rc.2.
- Ten of the eleven receipt values are below what the sweep found. That
  agrees with A1, which found five from evidence already on `main`.
- The results are on an unmerged draft branch. This review did not run the
  sweep, has no kernel, and did not rebuild the summary from the era files.
  It read the committed files and the pull request's checks (green at
  14:51 UTC on 2026-11-11, with one sweep run still in progress when read).
  Until that branch is merged, `main` holds no evidence for any of the
  eleven sweep figures.
- The Moon's row has the angle (11.88″) below the longitude difference
  (11.92″). An angle cannot be smaller than its longitude component times
  the cosine of the latitude, and at the Moon's latitude (up to about 5°)
  that factor is at least 0.996, so 11.92″ in longitude is at least 11.87″
  on the sky. The two figures are consistent. A reader of the table will
  still ask, and the branch's README should say so.

**The sentence in ZOD-65 and in the plan.** ZOD-65 proposes: "Zodiac
longitudes for the Sun, Moon and planets agree with NASA JPL's DE440
ephemeris to within 30 arcseconds on every one of 146,097 dates tested from
1800 to 2200." The master plan lists the same claim under "Done". This
review approves no sentence. What a later reviewer of that sentence must
hold against it, all from the sweep's own README:

1. It is true of longitude and of the whole angle only by 0.81″ and 0.14″
   (Pluto, largest on the last day of the span, and still growing).
2. It is false for the true node (32.64″), which a chart also shows.
3. It was measured on rc.3 at noon TT. The live service answers with
   1.1.0-rc.2 (A5), and npm's `latest` is 1.0.0.
4. "146,097 dates tested from 1800 to 2200" is one instant a day. A10 of
   this review shows what the same errors do to the time of a sign change.

## Finding A3: one package, two meanings of "apparent"

- The calc entry's apparent place is light time and stellar aberration with
  no deflection (`PREREGISTRATION.md`, *Arbiters*: "apparent without
  deflection, which is this engine's apparent"); its apparent Moon is its
  series at the instant with neither light time nor aberration (the same
  file, section (b)).
- The DE440 entry's place has light time, the Sun's deflection and
  relativistic aberration (`docs/de440.md:70-80`).
- The conformance suite's L1 vectors and the declination reference have
  deflection.

The ZOD-65 plan sees this and adds a second reference with deflection for
the true ecliptic of date. Any sentence for readers has to say which place
it describes. Away from the Sun the difference is milliarcseconds, so it
does not change the arcsecond figures above, but it does change what
"agrees with JPL" means at the milliarcsecond level the DE440 entry works at.

## Finding A4: what the DE440 entry's figures do and do not show

`docs/de440.md` and `CHANGELOG.md` (1.1.0-rc.3, *Accuracy*) give three
figures. Each is true as written. None is the accuracy of a chart.

1. "within 1e-6″ of the ERFA chain at the oracles' 200 instants"
   (`docs/de440.md:94-97`). This compares the TypeScript reduction with a
   Python chain that applies the same models to the same kernel. It shows
   that the port computes what it was specified to compute. It is enforced
   only when `PRECISION_KERNEL` is set (CI's tier-B job). The oracles and
   their generator were made in zodiacs.org's repository and copied here by
   digest (`docs/evidence/de440-20261110/README.md`, first section), so the
   generator is not in this repository.
2. The pack's refit: at most 0.0016″ (Moon), 0.0008″ (Venus), 0.0005″
   (others) and 0.84″ (true node) against the raw kernel
   (`pack-accuracy.json`, `largest`). Measured, not enforced by a test in
   this repository (`de440-20261110/README.md`, *The checks*, "Not enforced
   here").
3. The reduction uses IAU 2000B nutation. `docs/calc.md:637-639` measures
   IAU 2000B against ERFA's IAU 2006/2000A chain at under 0.0023″ on 32
   instants. That is larger than the pack's refit for every body, and it is
   the floor of any comparison of the DE440 entry with a full IAU
   2006/2000A place.

The true node from a pack can be 0.84″ from the node of the raw kernel. It is
500 times the Moon's own figure, and it is a node "of DE440" only by the
definition in `docs/de440.md:89-92`: DE440 has no node.

Mars to Pluto are system barycentres in the calc comparison, the suite and
the DE440 entry. `conformance/results/summary.json:23` measures body centre
minus barycentre at up to 0.0835″ (Pluto) on the suite's 24 instants.

## Finding A5: the default ephemeris is not JPL's

The root computes positions from astronomy-engine 2.1.19's series unless a
caller supplies a pack and calls `withEphemeris` (`README.md:123-124`,
`docs/de440.md:5-8`). The npm package ships no pack and fetches none
(`docs/de440.md:8`). On the suite, 192 of the 240 L1 position vectors fail
the 1″ tolerance (`conformance/RESULTS.md`), median 2.083″ in longitude.
`README.md:1004-1005` ("Tests compare modern and historical positions with
public JPL Horizons vectors") is true and easy to misread as agreement.

Second pass, the hosted service. `docs/de440.md:7-8` says "zodiacs.org's
hosted compute API uses it on its server". That is not so today:

- The live connector's `get_capabilities`, called on 2026-11-11, returns
  `"engine":{"name":"@zodiacs/engine","version":"1.1.0-rc.2","ephemeris":{"name":"astronomy-engine","version":"2.1.19"}}`,
  and every receipt it returned in this job names the same.
- The site's `package.json:168` on `main` (`47fee79f`) depends on
  `file:vendor/zodiacs-engine-1.1.0-rc.2.tgz`, which has no DE440 entry, and
  no `withEphemeris` or DE440 use is on its `main` outside one data file.
- The DE440 backend is site pull request 943, open and a draft, whose body
  says "Until P4.1 is recorded `validated`, a request that names no backend
  is answered by astronomy-engine."

So `docs/de440.md:7-8` describes a use that is planned, in the present
tense, which the house rules do not allow for something not yet true.
`CHANGELOG.md:5-7` is different: it says "positions from JPL's DE440, for
zodiacs.org's hosted compute API", which states a purpose and does not
claim the use. The earlier wording of this paragraph put the two together;
only `docs/de440.md` needs the correction (fix round, `BREAKER.md` S7).

## Finding A6: Swiss Ephemeris as a yardstick in the README

`AGENTS.md` lists the arbiters accuracy may rest on, and Swiss Ephemeris is
not one. It may be run as an instrument, statistics only. The README still
leans on it in three places:

- `README.md:551-558`: every house system "agrees with Swiss's
  `swe_houses_armc` to within 0.0001″", and "within 0.055″ of Swiss's
  `swe_houses_ex`".
- `README.md:610-613`: the mean node and Lilith "within 0.4503″ and 0.4887″
  of Swiss Ephemeris's `SE_MEAN_NODE` and `SE_MEAN_APOG`".
- `README.md:545-546`: "the programme's 0.01″ physical declination target
  against Swiss Ephemeris".

The files behind them (`docs/evidence/nutation-2026-09-29/results/swiss.json`,
`ladder.json`) hold statistics and no per-case Swiss output, so the rule
about what is stored is kept. Two things are still off. The runs went through
`docs/evidence/nutation-2026-09-29/tools/swiss-compare.py`, not through
`conformance/adapters/pyswisseph.py` as the rule now requires. And they read
as accuracy statements whose reference is not an allowed arbiter. The suite
has ERFA figures for the same quantities (houses and angles, L2), and 1.1.0-rc.2
already replaced one such sentence with them (`CHANGELOG.md:82-87`).

## Finding A7: small things that a public sentence would trip on

- The receipt values were measured against DE441 (Horizons). The DE440 entry
  and the ZOD-65 sweep use DE440. The declination table and the suite's
  independent check use DE440s. `conformance/results/summary.json:23` puts
  DE440s's Moon 10.24 mas from DE441's in 1851. A sentence must name the one
  it means.
- The 32 instants run from 1802-08-19 to 2188-11-08. The engine's span and
  the sweep run from 1800 to 2200. `README.md:504` says the declination
  maxima "grow outside `REFERENCE_SPAN`".
- `README.md:493` cites a declination table measured on 0.1.1-rc.15 in the
  README of 1.1.0-rc.3. `AGENTS.md` forbids reusing a figure measured on
  another build. The README does say "at those 20,000 instants", and does
  not say which build.
- The engine's solar latitude "drifts from −1.1″ on average in the 1800s to
  +1.1″ in the 2100s" (`README.md:515-516`). On the 32 instants the Sun's
  latitude difference (2.858″ at most) is larger than its longitude
  difference (1.847″ at most), and the angular difference (2.944″) follows
  the latitude (`calc-api/rc16/tables.md:30` and `:335`).

## What the letters to NAIF, IERS and CDS must not get wrong (accuracy part)

Job 6 drafts them. From this review:

1. Do not say the package's positions come from DE440 or from JPL. By
   default they come from astronomy-engine's series. DE440 is used only when
   a caller supplies a pack.
2. Do not say the pack is DE440. It is a refit of `de440.bsp` (SHA-256
   `a4ce9bf9...c4b5`) as quantised Chebyshev series, 2,489,664 bytes, for
   1790 to 2210 (`docs/de440.md:24-40`).
3. Do not say a pack is distributed. `docs/de440.md:38-40`: "Whether a pack
   derived from DE440 may be redistributed is a question put to NAIF; until
   it is answered, no pack is distributed". The letter is that question. It
   should not describe the answer as given.
4. Name the ephemeris correctly each time: DE441 through Horizons for the
   calc comparison and the suite's vectors, DE440 (`de440.bsp`) for the pack
   and the sweep, DE440s for two independent checks.
5. Do not quote 1e-6″, 0.0016″ or any ZOD-65 figure as the engine's
   accuracy. Say what each compares (A2, A4).
6. Say that Mars to Pluto are system barycentres.
7. Do not attribute the true node to JPL. It is computed from the Moon's
   state by a definition of the engine's own.
8. The UT1 − UTC table runs to 2027-10-02 and was built from
   `finals2000A.all` of 2026-09-24 (`conformance/RESULTS.md`, *TT − UTC and
   ΔT*). `docs/time.md:51` says it is "observed through 2026-09-24 and
   predicted to 2027-10-02". A letter to IERS should say that the table
   holds predictions as well as observed values.

## Finding A8 (second pass): the public page already states accuracy, against Swiss Ephemeris

`https://zodiacs.org/methodology/`, read on 2026-11-11, has a section headed
"Agreement with Swiss Ephemeris". It says the engine was measured "against
Swiss Ephemeris 2.10.03 reading its own JPL-derived data files", gives "the
median disagreement in longitude is 1.6 arcseconds, the 95th percentile is
12.1 arcseconds, and the largest is 18.6 arcseconds (Pluto in 1801)", and
then: "we also compared every tenth day from 1800 to 2199, at noon UTC, for
the ten bodies and the North Node. Up to 2026 that is 91,201 comparisons,
with a median of 2.0 arcseconds and a largest of 22.9 arcseconds (Venus in
1878)."

- This is a public accuracy statement whose reference is Swiss Ephemeris.
  The engine repository's rule excludes it as an arbiter. The page is the
  site's, and it does add "this is two implementations agreeing, not a check
  against observation".
- Its evidence in the site repository holds statistics only
  (`docs/platform/evidence/site-engine-1-1-0-rc2/accuracy-refresh/multiyear-1800-2199.json`:
  `n: 91201, p50: 1.96, p95: 11.894, max: 22.886`, Venus, 1878-03-03). The
  same file gives, for 2027 to 2199, a largest of 29.108″ (Pluto,
  2199-12-25). The page does not print that figure. Of the far future it
  says "none of them reaches one arcminute: the largest is 24.8 arcseconds,
  Pluto at 2190, where the two ephemerides differ". That 24.8″ is the
  largest of the page's 20 far-future cases, not of the every-tenth-day
  run, whose largest after 2026 is the 29.108″ above. (The earlier wording
  here cut the page's sentence short.)
- The page's 22.9″ for Venus and the DE440 sweep's 22.92″ agree, as they
  should if both references are right. That is corroboration, and the sweep
  is the one the rules allow to be cited.
- The same page says positions are tested "against NASA JPL Horizons
  reference data at two dates, 1907 and 2020, with tolerances of 0.05° for
  the Sun and planets". 0.05° is 180″. A reader may take "compared against
  NASA JPL Horizons" for more than a 180″ test at two dates.

Job 6 drafts the "How we calculate" page. It should not carry this section
over as it stands.

## Finding A9 (second pass): the plan says the engine passes all 240 position vectors; it fails 192

The master plan lists under "Done": "The engine passes all 240 position and
150 house vectors." `conformance/RESULTS.md` gives the engine 48 passes and
192 failures on the 240 position vectors (A5). The row with 240 passes is
Swiss Ephemeris's, in the next section of the same file. See
`05-disagreements.md`, item 1.

## Finding A10 (second pass): slow-planet sign changes are hours off, and the quoted figures are about right

ZOD-63 says "accuracy review: Neptune up to 9.4 h, Pluto up to 29 h off on
the default path", and the plan says "Pluto up to 29 hours". The review
behind them was not found. Site pull request 975 says "I found no committed
evidence for them in either repository" and uses figures from the site's
Horizons table instead (8 hours 8 minutes and 9 hours 37 minutes, 1900 to
2099).

This job re-checked them (`sign-changes/` in this folder: method, tools,
results and limits). For every sign change of Neptune and Pluto that the
engine of `main` finds from 1800 to 2200, it found the same sign change on
JPL Horizons (DE441) and compared the two in TT:

| Body | Sign changes | Median difference | Largest | Where |
| --- | ---: | ---: | ---: | --- |
| Neptune | 103 | 2.46 h | 9.51 h | 1848-10-16 |
| Pluto | 73 | 1.77 h | 31.54 h | 2185-03-31 |

- Both quoted figures are of the right size and slightly low against this
  check (9.4 against 9.51, 29 against 31.54). They are **re-checked, not
  confirmed**: the quoted review's span and method are unknown.
- On the years the site's table covers, this check agrees with the table:
  8.06 hours for Neptune in the 1900s, 9.63 hours for Pluto in the 2000s.
- Neptune into Aries: Horizons is 3.06 hours after the engine's
  14:31:41 UTC, which is 17:35:23 UTC, the methodology page's time.
- Not one of Pluto's 73 sign changes, and one of Neptune's 103, is within a
  minute of Horizons on the default path.
- Pluto's largest are a pair either side of a station near a boundary
  (+31.54 and −31.37 hours, 23 days apart in 2185). A station on a boundary
  can turn arcseconds into days, or remove a crossing. No crossing was
  missing here.

Two things follow for any sentence. The 30″ of A2 is 31 hours for Pluto at
the wrong moment, so "within 30 arcseconds" and "the date a planet changes
sign" must never appear as if one supported the other. And the live
connector prints these times to the millisecond (Review 2, B10).

Fix round. The measurement has now had a second reader (`BREAKER.md`, N2):
the engine file was reproduced byte for byte, seven records were asked of
Horizons again and agreed, and a scan of one Horizons row a day found the
same counts of sign changes as the engine (103 and 73), so Horizons has
none that the engine lacks at that resolution. That reader's scripts and
responses are in the job folder and are not committed, and they have had no
third reader. Two cautions stand, both in `sign-changes/README.md`: the
requests did not carry the User-Agent that JPL's fair-use policy asks for,
and the digests kept with each record cannot be checked against anything.

The second reader also found the clearest case of the last point above. On
1823-12-15, by Horizons, Pluto turns direct 0.375″ inside Aries with no
crossing; the engine's Pluto on those days comes no closer than 13.3″ to
the boundary. Neither source has a sign change there, so nothing is
missing, and the margin on the sky is about 35 times smaller than the
engine's error at that date.

## Not checked

- The sweep was read, not run. No kernel was used in this job.
- The data and method of the accuracy review that ZOD-65 quotes. Neither
  repository holds them.
- The plan's "A sign differs in 0.03% of charts". No evidence for it was
  found in either repository or in the sweep.
- Whether production serves the site's `main`. The connector's own answer
  (version 0.6.6, engine 1.1.0-rc.2) is what was observed.
- A10's comparison is this job's own and has had no second reader.
