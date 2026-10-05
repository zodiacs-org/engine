# Vedic techniques: evidence (2026-09-28)

**Branch and base.** Work is on `feature-vedic`, rebased onto main at
`8c4946b142c731ecdec186df6c04b91b7f2463e0` (engine 0.1.1-rc.12 with the
conformance suite v0). The version is unchanged; the changelog has an
"Unreleased" entry. Nothing was published.

**Integration into 0.1.1-rc.15 (2026-09-29).** The branch was integrated with
rc.14 and the time basis (`docs/time.md`). An ayanamsa is now read as a chart
reads its own instant: on UTC and the engine's time basis (leap seconds and
IERS UT1 − UTC from 1972 to 2027-10-02, the ΔT model otherwise), or a
`timeScale` and pinned ΔT the caller gives; the value records its `timeScale`,
and an instant whose TT is outside `EPHEMERIS_SPAN` is refused. Everything
below was measured on this branch before that integration, where instants were
read as UT1 on the ΔT model. The measurements repeated on rc.15 are in
`docs/evidence/rc15-20260929/`. The branch is local and was never pushed;
this repository's history carries its commits in rc.15's one integration
commit (`docs/evidence/rc15-20260929/README.md`, *The published history*).

**What was added.** A separate entry, `@zodiacs/engine/vedic`, with:

- ayanamsas: nine named ones, plus user-defined ayanamsas;
- tagged sidereal longitudes and sidereal charts;
- nakshatras and padas;
- the sixteen Parashari vargas;
- KP sub-lords and sub-sub-lords;
- Vimshottari dashas to five levels;
- Yogini and Ashtottari mahadashas.

The root entry does not import it and is unchanged. User documentation is in
[`docs/vedic.md`](../../vedic.md). No runtime dependency was added.

**Use of Swiss Ephemeris.** Swiss Ephemeris (pyswisseph 2.10.03) was used
only as a measuring instrument. Its values stayed in memory. The committed
files contain statistics of the differences only, with no Swiss code, data or
output, and no constant or tolerance was set from it. Where this README
quotes the Swiss Ephemeris documentation, it says so.

**Fixtures.** Every fixture uses synthetic instants and places.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Epoch ayanamsas against ERFA (IAU 2006, IAU 1976 and Newcomb as below), 36 instants 1800–2200 and 3 user definitions at 13 instants | max \|Δ\| 4.3 × 10⁻⁷″; test gate 10⁻⁵″ | `src/vedic/fixtures/ayanamsa-reference.json`, `tools/reference_values.py` |
| Star ayanamsas against ERFA's astrometry on the same catalogue values, 164 instants 1800–2200 more than 5° from the Sun | max \|Δ\| 0.00077″; test gate 0.001″ | same |
| Lahiri against the *Indian Astronomical Ephemeris 2027*: mean for 2027.0 and 2028.0 (printed to 0.01″), 161 true values (printed to 0.1″) | max \|Δ\| 0.0044″ and 0.0505″; test gates 0.007″ and 0.053″ | same |
| Lahiri against earlier IAE editions (quoted) | +0.073″ to −0.124″, explained below | `results/primary-tables.json` |
| Krishnamurti against KP Reader 1's own table, 1840–2000, to the minute | 145 of 161 years (entries on 1 January) | same |
| Mean ayanamsa against `swe_get_ayanamsa_ex_ut`, 1800–2200, gate 0.01″ | **Pass:** Lahiri, Fagan–Bradley, True Chitra, True Revati, user-defined at three epochs (all within 0.0044″). **Fail:** Krishnamurti (epoch reading, 0.0712″), Raman and Yukteswar (definitional), True Pushya (12 instants behind the Sun), Galactic Center (catalogue data) | `results/ayanamsa-swiss.json` |
| ΔT pins up to ±1e10 s, every kind of definition and `siderealChart` | all return, in about 0.2 s; under a 10 s wall-clock limit per test | `src/vedic/ayanamsa.test.ts` |
| Whole-sign houses rebuilt from the sidereal ascendant (asked for, and the polar fallback) | pass | same |
| `vimshottariAt` on each period's own `start` and `end − 1 ms`, 6,264 periods of levels 1–5 in 24 cases | pass | `src/vedic/dasha.test.ts` |
| Boundary fixtures: nakshatra, pada, KP sub and sub-sub, and all vargas | 5,781 boundaries and 17,343 points, all exact | `src/vedic/fixtures/boundaries.json`, `src/vedic/boundaries.test.ts` |
| Dasha boundaries against an independent exact-rational implementation, gate 5 s | 402,240 periods; max \|Δ\| 2.3 µs; 0 lord or count mismatches | `results/dasha-independent.json` |
| Published Vimshottari example (BPHS 46, notes to v. 16) | Ketu, 2 months 3 days: matches | same file, `publishedExample` |
| Existing results: 1,500 charts, with points, declinations, transits, positions, Moon phase, returns and progressions, against main | byte-identical, also with Vedic calls (pinned ΔT included) interleaved | below |
| `npm test` | 2,685 tests passed in 32 files (73 Vedic, in 4 files) | `results/gates.log` |
| Typecheck, build, exports smoke, package contents, pack dry run, packed consumer smoke, conformance steps | pass; the package is 298,903 bytes unpacked against the 300,000 limit | `results/gates.log` |

## The entry point and its size

The Vedic API is the `./vedic` export (`dist/vedic.js`), built as its own
tsup entry. `siderealChart` lives there and takes a `Chart` or `BirthInput`;
the only root module it uses is the chart validation in `src/api.ts`, now
exported internally as `resolvedChart`. `scripts/module-resolution-smoke.mjs`
asserts every Vedic export is in the subpath and none is in the root, and the
packed-consumer smoke imports it through the tarball with TypeScript's
`nodenext` resolution. TypeDoc documents `src/vedic.ts` as a fourth entry.

Bundles made with esbuild (minified, ESM, `astronomy-engine` external; with it
bundled in parentheses), from each tree's `dist/` beside its `package.json`:

| Import | main (base) | before this change | now |
| --- | --- | --- | --- |
| `export *` from the root | 38,434 B (88,399) | 56,478 B (107,113) | 38,437 B (88,399) |
| `natalChart` only | 19,294 B (69,222) | 26,647 B (76,391) | 19,294 B (69,222) |
| `natalChart`, `transits`, `synastry` | 21,540 B (71,473) | 28,889 B (78,641) | 21,530 B (71,473) |
| `export *` from `./vedic` | — | 38,437 B (89,044), from the root | 34,911 B (85,517) |

The root's code is the same as main's; its `export *` bundle differs by 3
bytes because the minifier sees the modules in another order. Long runtime
strings were shortened (varga rules, citations, the ayanamsa labels), and the
JSDoc of the Vedic modules tightened, the full text staying in
`docs/vedic.md`.

## Definitions and citations

### Conventions

- Sidereal longitude = tropical longitude − ayanamsa.
- The engine's tropical longitudes are apparent positions, referred to the
  true equinox and ecliptic of date.
- Every definition yields a **mean** ayanamsa, measured from the mean equinox
  of date.
- `true = mean + Δψ`, where Δψ is the engine's own nutation in longitude:
  astronomy-engine's five largest IAU 2000B terms. They differ from the full
  IAU 2000B series by up to 0.270″ over 1800–2200 (0.2701″ in 1834, sampled
  every 0.73 days; `results/primary-tables.json`).
- `siderealLongitude` subtracts `true`. The result equals the mean-equinox
  longitude minus the mean ayanamsa, so the truncated nutation cancels.
- Precession is the engine's IAU 2006 (P03) model, as astronomy-engine
  implements it through `Rotation_EQJ_ECT` and `e_tilt`.
- Instants are UT, converted with the engine's ΔT model (`zodiacs-deltat/1`)
  or a pinned `deltaT`.
- Epochs are Julian dates in TT. A rate's year is the Julian year of 365.25
  days of TT.
- Results outside `REFERENCE_SPAN` (1800–2200), or from an epoch definition
  whose epoch is outside it, carry `outside-reference-span`, as charts do.
  User epochs are limited to the Julian dates a JavaScript `Date` can hold,
  like every instant in the engine; within that range there is no further
  limit, as there is none for charts.

### Epoch ayanamsas: held at J2000.0

For a definition with value `A0` at epoch `t0` computed with precession
model M, the mean ayanamsa at date `t` is

    ayanamsa(t) = A0 − λ_M(t0; J2000) + λ_2006(t0; J2000) − λ_2006(t0; t)

where `λ_M(t0; t)` is the longitude of the mean equinox of `t` on the mean
ecliptic of `t0`, from the mean equinox of `t0`, in model M. The zodiac is
held where the definition's own model puts it at J2000.0 and carried from
there with IAU 2006.

The older models are:

- **Newcomb:** H. Kinoshita, *Theory of the rotation of the rigid Earth*,
  SAO Special Report 364 (1975), table 3. It uses tropical centuries from
  B1850.0 and Newcomb's obliquity, 23°27′31.68″ at 1850.
- **IAU 1976:** J. H. Lieske et al., A&A 58, 1 (1977), with the IAU 1980
  obliquity.

**Why this construction.** The review asked for a deliberate choice between
holding each definition at J2000.0 and holding it at its own epoch, on what
the primary definitions support. Lahiri's primary source settles it. The
*Indian Astronomical Ephemeris* for 2027 (Positional Astronomy Centre,
Kolkata; downloaded 2026-09-28 from packolkata.imd.gov.in as
`IAE2027.zip`, SHA-256
`14fe5c3fdcf7ce42e6e9c9ab72425da55b1a84735a7c74e3d984c096074cffdc`) states on
p. 382:

> The ayanamsa value has been calculated from the polynomial of precession
> in longitude published by N.Capitaine et. al. (2003) in journal Astronomy
> and Astrophysics. The polynomial for ayanamsa has been introduced in this
> publication from the year 2021. The polynomial used is as given below.
> Mean Ayanamsa = 23°51′25″.53 + 5028″.796195 T + 1″.1054348 T² + … Where
> T = (JD − 2451545)/36525. Ayanamsha for J2000.0 is taken as 23°51′25″.53

(p. 381 still describes the initial point by "23° 15′ 00″ for 0h on 21st
March, 1956".) 23°51′25.53″ is the value the 1985 definition gives at
J2000.0 with IAU 1976 precession (23°51′25.532″). So the IAE itself holds its
zodiac at J2000.0 in its old model and carries it with IAU 2006, and the
engine applies that construction to every epoch definition. It keeps the
sidereal longitudes that each definition's own tables imply: a star's
tropical longitude at `t0` differs between the old model and IAU 2006 by
nearly the same amount as the ayanamsa does. Swiss Ephemeris has used the
same construction since version 2.09 (documentation §2.8.11); that is where
the branch took it from, and why the review found it undocumented.

The 1985 revision itself is the IAE 1989 footnote, p. 556, quoted from the
Swiss Ephemeris documentation (§2.8.5 and appendix E), as the edition was not
available here: "According to new determination of the location of equinox
this initial value has been revised to 23°15′00″.658 and used in computing
the mean ayanamsa with effect from 1985". Despite "mean", the value is the
true ayanamsa: the Swiss appendix reproduces IAE 2019's table of true values
to 0.1″ with 23°15′00.658″ taken as true, and a mean reading would be 16.8″
off.

**What it costs.** No epoch definition returns its defining value at its own
epoch (engine values with ΔT pinned to 0):

| Name | Defined | Engine at that instant | Difference |
| --- | --- | --- | --- |
| `lahiri` | 23°15′00.658″ true at 1956-03-21 0h TT | 23°15′00.830″ true, 23°14′44.019″ mean | +0.172″ true, +0.130″ mean |
| `fagan-bradley` | 24°02′31.36″ mean at B1950.0 | 24°02′30.947″ | −0.413″ |
| `krishnamurti` | 22°21′50.000″ at 1900-01-01 0h TT | 22°21′49.170″ | −0.830″ |

Carried with the definition's own model from its own epoch instead, the
values would depart from the engine's by up to 0.623″ (Lahiri: +0.577″ at
1800, −0.623″ at 2200) and 1.673″ (Fagan–Bradley and Krishnamurti: −1.673″
at 1800, +1.621″ at 2200) over 1800–2200.

**Against the IAE.** From `tools/primary_tables.py` and the test fixture:

| Table | Engine − table |
| --- | --- |
| IAE 1989, p. 512, 1989.0 (read as January 1, 0h TT), quoted | +0.073″ |
| IAE 1989, p. 512, 1990.0, quoted | +0.044″ |
| IAE 2019, p. 429, 2000 January 1, 12h TT, quoted | +0.002″ |
| IAE 2019, p. 429, 2019 January 1, 12h TT, quoted | −0.122″ |
| IAE 2019, p. 429, 2020 January 1, 12h TT, quoted | −0.124″ |
| IAE 2027, p. 423, 2027.0 and 2028.0 (January 0, 0h TT) | −0.0041″, −0.0044″ (printed to 0.01″) |
| IAE 2027, p. 423, 161 true values at 0h TT, 2027-01-01 to 2028-04-25, less IAU 2000A Δψ | within 0.0505″ (printed to 0.1″), mean −0.003″ |

Until 2020 the IAE carried the 1956 value with IAU 1976 precession, which
runs about 0.3″ a century ahead of IAU 2006 away from J2000.0; the Swiss
appendix finds the IAE's mean values a further 0.01–0.06″ from that model,
without a known cause. Together these make the trend in the first five rows.
The quoted values come from the Swiss Ephemeris documentation, appendix E;
the editions were not available here, so they are recorded, not tested. The
2027 edition's table is transcribed in `tools/reference_values.py` and
tested. Its "2027.0" and "2028.0" are January 0.0 TT: there the edition's
polynomial, with the unrounded 23°51′25.532″, rounds to both printed values;
J2027.0 and B2027.0 are 0.17″ and 0.07″ away. Its true values are the
polynomial plus IAU 2000A nutation (ERFA `nut06a`); IAU 2000B fits equally
well at 0.1″. The engine stays within 0.004″ of the polynomial over
1800–2200 (0.0024″ of it is the rounding of 23°51′25.532″ to 25.53″; the
rest is the engine measuring the precession on the ecliptic of 1956 rather
than using the IAE's p_A).

**Newcomb's formulation.** Kinoshita's is one of several. The Explanatory
Supplement (1961) form, as in Meeus's *Astronomical Algorithms*, places the
zodiac at J2000.0 lower by 4.48 mas (Fagan–Bradley) and 7.67 mas
(Krishnamurti) when applied from J2000.0 to the epoch, and by 4.84 and 9.10
mas when applied from the epoch and inverted, as the review did
(`results/sensitivities.json`).

| Name | A0 and t0 | Mean or true in the source | Model | Source |
| --- | --- | --- | --- | --- |
| `lahiri` | 23°15′00.658″ − 16.768927″ = 23°14′43.889073″ at 1956-03-21 0h TT (JD 2435553.5) | **True.** The engine subtracts the IAU 1980 Δψ at t0, +16.768927″ (ERFA `nut80`) | IAU 1976 | IAE 1989, p. 556, footnote (quoted above); IAE 2027, pp. 381–382. It revises the 23°15′00″ at 1956-03-21 0h ET of M. N. Saha and N. C. Lahiri, *Report of the Calendar Reform Committee* (CSIR, 1955). |
| `fagan-bradley` | 24°02′31.36″ at B1950.0 (JD 2433282.42345905 TT) | **Mean.** "The Mean Sidereal Longitude of the SVP for the epoch BY1950.0 is defined to be 335°57′28.64″, … an Ayanamsha of 24°02′31.36″." | Newcomb | M. Erlewine, *Astro\*Index* (1997), "Synetic Vernal Point" |
| `krishnamurti` | 22.363889° at 1900-01-01 0h TT (JD 2415020.5) | Mean, fitted to a table | Newcomb | See below |

### Krishnamurti's own definition

The review asked what Krishnamurti's own publications define. K. S.
Krishnamurti, *KP Reader 1* (*Casting the Horoscope*), pp. 54–59, gives:

- a zero-ayanamsa year, 291 CE, with no date (Swiss Ephemeris documentation
  §2.8.6; D. Senthilathiban, *Study of KP Ayanamsa with Modern Precession
  Theories*, 2019, §2);
- a rate: "KRISHNAMURI follows the figure given by NEWCOMB = 50.2388475″ …
  If you want ayanamsa from the years beyond 2001, for each year add at the
  rate of 50.2388475 secs" (quoted by Senthilathiban, §2, item 7);
- a table of the ayanamsa for each year 1840–2001 (p. 58), to the minute,
  with no date within the year. `tools/primary_tables.py` carries it for
  1840–2000 as Senthilathiban transcribes it (table 29, column 6).

The zero year and the table disagree by about 1′ (54″ with Newcomb's
precession, per the Swiss documentation). Krishnamurti told his readers to use
the table ("take that Ayanamsa which I have given in this book"; Reader 1, as
quoted by Senthilathiban). So the table is the operative definition, and it
fixes the ayanamsa only to the minute.

22.363889° (22°21′50.0″) at 1900 is not Krishnamurti's number. It is a fit to
his table by R. Hand (Nova) and G. Dawson (Solar Fire), reported in the Swiss
documentation §2.8.6 with "t0 = 1 Jan 1900"; Solar Fire's manual (*Solar Fire
9 User Guide*, 2014, p. 399) enters every ayanamsa as the sidereal vernal
point "on 1st January 1900". Neither gives a time. The branch had used
JD 2415020.0 (J1900.0, noon on 31 December 1899), the epoch Swiss
Ephemeris's values correspond to (the branch matched them to 0.0024″ with
it); nothing in these sources supports it over the start of the stated day.
The engine now uses 1900-01-01 0h TT (JD 2415020.5). The two readings differ
by 0.0688″ at every date, about 1/870 of the table's resolution:

| Reading, table entry taken on | Years matching to the minute | Mean (engine − table) | Max \|engine − table\| |
| --- | --- | --- | --- |
| 1900-01-01 0h TT, 1 January | 145 of 161 | +0.1″ | 67.8″ |
| J1900.0, 1 January | 145 of 161 | +0.1″ | 67.7″ |
| 1900-01-01 0h TT, 15 April | 110 of 161 | +14.4″ | 53.3″ |
| J1900.0, 15 April | 110 of 161 | +14.5″ | 53.2″ |

The table is consistent with the Hand–Dawson value on 1 January, not
15 April, and cannot tell the two readings of "1900" apart. The largest
differences are in 1908–1918, where the table runs about a minute ahead of
its neighbours. With this reading the engine fails the 0.01″ gate against Swiss
Ephemeris for Krishnamurti, by 0.0712″; given Swiss's own epoch it agrees to
0.0024″ (below).

### Linear ayanamsas

- **`raman`**: "(1) Subtract 397 from the year of birth (A.D.) (2) Multiply
  the remainder by 50⅓″" (B. V. Raman, *A Manual of Hindu Astrology*, 1935,
  §49, titled "Determination of (Approximate) Ayanamsa"). The manual's worked
  examples give 1912 → 76,255″ (21°10′55″) and 1918 → 76,557″; the engine
  reproduces both. It reads the rule as continuous, per §49's "Ayanamsa for
  odd days": 0 at J397.0 (JD 1866049.25 TT), plus 50⅓″ per Julian year. The
  manual's §47 lists 397 among several proposed years of coincidence; Raman's
  *Hindu Predictive Astrology* (pp. 378–379) gives 389 CE, as the Swiss
  Ephemeris documentation (§2.8.9) reports. The engine follows the manual's
  formula, and the difference between the years is 6.7′.
- **`yukteswar`**: "The astronomical reference books show the Vernal Equinox
  now [1894] to be 20°54′36″ distant from the first point of Aries" (Sri
  Yukteswar, *The Holy Science*, 1894, Introduction). The precession cycle is
  "about 24,000 years", which is 54″ a year. The epoch is the March equinox of
  1894, 1894-03-20 14:59 TT (JD 2412908.1244), computed with
  astronomy-engine's `Seasons`.

Both formulas are used as the mean value, and `true` adds Δψ.

### Star ayanamsas

Each star's apparent geocentric place of date is held at a fixed sidereal
longitude. The place includes these effects:

1. **Space motion:** proper motion, parallax and radial velocity, as a linear
   barycentric motion.
2. **Annual parallax:** the star's position is taken relative to the Earth's
   barycentric position from astronomy-engine.
3. **Light deflection by the Sun:** the SOFA `ldsun` form, 2GM/c² = 1.974
   × 10⁻⁸ au, with its limiter near the Sun.
4. **Annual aberration:** relativistic.
5. **Frame bias from ICRS:** IERS Conventions 2010, eq. 5.21.
6. **Precession and nutation:** the engine's own.

The mean ayanamsa is the place's longitude from the mean equinox of date
minus the anchor longitude.

| Name | Star and anchor | Catalogue (ICRS) |
| --- | --- | --- |
| `true-chitra` | Spica, α Vir, HIP 65474, at 180° | Hipparcos new reduction (F. van Leeuwen 2007, VizieR I/311) at J1991.25: α 201.29835228°, δ −11.16124494°, μα* −42.35, μδ −30.67 mas/yr, ϖ 13.06 mas. RV −3.31 km/s (SIMBAD). |
| `true-revati` | ζ Psc A, HIP 5737, at 359°50′ | I/311: 18.43250842°, +7.57548938°, 145.00, −55.69 mas/yr, ϖ 18.76 mas. RV +15.0 km/s (G. A. Gontcharov 2006, Pulkovo compilation). |
| `true-pushya` | δ Cnc, HIP 42911, at 106° | I/311: 131.17129191°, +18.15486373°, −17.67, −229.26 mas/yr, ϖ 24.98 mas. RV +17.14 km/s (Famaey et al. 2005). |
| `galactic-center` | Sgr A*, at 240° (0° Sagittarius) | SIMBAD ICRS radio position (Petrov et al. 2011) taken at J2000.0: 266.416816625°, −29°00′28.1699″. Apparent motion relative to J1745−283: −3.151 mas/yr east, −5.547 mas/yr north (M. J. Reid and A. Brunthaler, ApJ 616, 872, 2004, table 2). No parallax or radial velocity. |

Sources for the anchors:

- Chitra at 180° and Revati at 359°50′: the junction-star longitudes of the
  Surya Siddhanta, ch. VIII (E. Burgess tr.), read as ecliptic longitudes, as
  the true-star ayanamsas take them.
- δ Cnc at 106°: P. V. R. Narasimha Rao, "Introducing Pushya-paksha
  Ayanamsha" (2013).
- The Galactic Center at 0° Sagittarius, the start of Mula: proposed by
  D. Koch, as the Swiss Ephemeris documentation, §2.8.7, records.

**The catalogue dominates.** SIMBAD's Gaia EDR3 values (VizieR I/350,
propagated by SIMBAD to J2000.0; queried 2026-09-28) for ζ Psc A
(18.43285834319°, +7.575359937450°, 142.693, −53.051 mas/yr, ϖ 24.4595 mas)
and δ Cnc (131.17124658769°, +18.154308069054°, −18.435, −227.813 mas/yr,
ϖ 23.8271 mas) move the ayanamsas as follows, Hipparcos minus Gaia
(`tools/sensitivities.py`):

| | 1800 | 1900 | 2000 | 2100 | 2200 |
| --- | --- | --- | --- | --- | --- |
| True Revati | −0.211″ | −0.098″ | +0.016″ | +0.130″ | +0.245″ |
| True Pushya | −0.221″ | −0.109″ | +0.002″ | +0.114″ | +0.226″ |

Gaia has no usable astrometry for Spica. The engine keeps Hipparcos. Swiss
Ephemeris's star file comes from SIMBAD (its documentation, §2.6) and
evidently carries the same values for these stars: with Gaia's, the two
programs would differ by up to 0.25″. Their agreement to 0.0044″ below
therefore reflects shared inputs and the same astrometric model, not
accuracy.

### Nakshatras, vargas, KP and dashas

The rules come from *Brihat Parashara Hora Shastra*, tr. R. Santhanam
(Ranjan Publications, 1984), as follows:

- **Nakshatras and Vimshottari:** ch. 46, vv. 12–16. The lords run from
  Krittika: Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury, Ketu, Venus. Their
  years are 6, 10, 7, 18, 16, 19, 17, 7 and 20.
- **Vargas:** ch. 6, vv. 2–41, with the specula in the notes.
- **Sign lords:** ch. 4.
- **Sub-periods:** ch. 51, v. 1, and notes. The notes give Venus–Venus as
  3y 4m, Venus³ as 6m 20d, and Saturn–Mercury as 2y 8m 9d.
- **Yogini:** ch. 46, vv. 195–199. The book's example is Mrigashira → Sankata.
- **Ashtottari:** ch. 46, vv. 17–23. That includes the Abhijit rule, the
  equal shares (vv. 21–22 and notes) and the applicability rules (vv. 17–20
  and 23).

Other sources:

- P. V. R. Narasimha Rao, *Vedic Astrology: An Integrated Approach* (2000),
  §6.2, supplied the varga worked examples and the trimsamsa in degrees.
- The KP subs follow K. S. Krishnamurti's *KP Reader*: nine subs per star in
  Vimshottari proportion starting with the star lord, then sub-subs in the
  same way. There are 249 numbered subs, because a sub cut by a sign boundary
  is counted in each sign.

`ashtottariDasha`'s JSDoc and `docs/vedic.md` state that choosing Ashtottari
is the caller's; the applicability rule is documented, not computed.

## Ayanamsa comparison with Swiss Ephemeris

The tool is `tools/swiss_ayanamsa.py`, and the engine side runs
`tools/engine-bridge.mjs` on the built `dist/` (both entries).

**Setup:**

- Instants: 14,647 UT instants, every 10 days from 1800-01-01 to 2200-12-31,
  each at a pseudo-random time of day.
- Swiss calls: `swe_get_ayanamsa_ex_ut`, with `FLG_SWIEPH | FLG_NONUT` for the
  mean ayanamsa and `FLG_SWIEPH` for the true one.
- Sidereal bits: the defaults, so Swiss applies its own corrections for
  definitions made with older precession models.
- Ephemeris files: `sepl_18.se1` and `semo_18.se1`.
- Process: each Swiss mode runs in its own process, because Swiss caches
  state between sidereal modes.
- Output: differences are engine − Swiss, in arcseconds.

| Name | Swiss mode | n | Median | Max \|diff\| | Gate 0.01″ |
| --- | --- | --- | --- | --- | --- |
| lahiri | SE_SIDM_LAHIRI | 14,647 | 0.000230 | 0.001284 | pass |
| fagan-bradley | SE_SIDM_FAGAN_BRADLEY | 14,647 | −0.000678 | 0.000909 | pass |
| krishnamurti | SE_SIDM_KRISHNAMURTI | 14,647 | −0.070921 | 0.071152 | **fail** (epoch reading) |
| raman | SE_SIDM_RAMAN | 14,647 | 5.508275 | 10.137788 | **fail** (definitional) |
| yukteswar | SE_SIDM_YUKTESHWAR | 14,647 | 66.387516 | 806.154280 | **fail** (definitional) |
| true-chitra | SE_SIDM_TRUE_CITRA | 14,647 | 0.000236 | 0.002000 | pass |
| true-revati | SE_SIDM_TRUE_REVATI | 14,647 | 0.000226 | 0.004363 | pass |
| true-pushya | SE_SIDM_TRUE_PUSHYA | 14,647 | 0.000280 | 0.543838 | **fail** (12 instants) |
| galactic-center | SE_SIDM_GALCENT_0SAG | 14,647 | 0.019496 | 0.100779 | **fail** (catalogue data) |
| user, 22.46° at JD 2415020.0 TT | SE_SIDM_USER | 14,647 | −0.000048 | 0.001006 | pass |
| user, 23.15° at JD 2433282.5 TT | SE_SIDM_USER | 14,647 | 0.000169 | 0.001223 | pass |
| user, 23.85° at JD 2451545.0 TT | SE_SIDM_USER | 14,647 | 0.000231 | 0.001285 | pass |

Agreement with Swiss Ephemeris is a consistency check between two programs,
not a measure of either one's accuracy.

**The true ayanamsa is not gated.** It differs from Swiss's by the mean
difference plus the difference in nutation. The engine's Δψ minus Swiss's Δψ
has a median of 0.0012″ and a max of 0.2564″ at these instants. The engine's
Δψ is also in every tropical longitude it reports, so tropical − true (the
sidereal longitude) carries only the mean difference above. A full-series Δψ
here would put up to 0.27″ into every sidereal longitude.

**ΔT.** The two ΔT models differ by a median of −0.125 s and a max of
37.0 s. That shifts the ayanamsa by at most 0.00006″.

### Why five modes miss the gate

**Krishnamurti, Raman and Yukteswar differ by definition.** The engine
implements the cited texts: 22°21′50″ at the start of 1 January 1900,
Raman's 1935 formula, and The Holy Science's 20°54′36″ at the 1894 equinox
with 54″/yr. Swiss Ephemeris's Krishnamurti values correspond to J1900.0,
and its Raman and Yukteswar modes use epoch values of their own. The tool
checked this directly:

- It read each Swiss mode's own value at JD 2415020.0 TT, in memory only.
- It gave that value to `userAyanamsa` at that epoch: with `model: "newcomb"`
  for Krishnamurti and Raman, and with the engine's precession for Yukteswar.
- The engine then matched Swiss to a max of 0.002353″ (Krishnamurti and
  Raman) and 0.001006″ (Yukteswar). The precession machinery therefore
  agrees, and only the constants differ.

Those constants are not recorded here. The engine keeps the published
definitions. A caller who wants the Swiss variants can build them with
`userAyanamsa`.

**True Pushya fails only when δ Cnc is behind the Sun.**

- δ Cnc lies 0.08° from the ecliptic, so the Sun passes in front of it every
  August.
- All 12 instants over the gate have the star within 0.197° of the Sun in
  longitude. The ray from the star then passes through the solar disk (radius
  about 0.27°), between roughly 0.3 and 0.8 solar radii from the centre.
- At those instants, Swiss's own light deflection is about 1.0–2.8″. The tool
  records this only as a coarse range: Swiss's with-deflection values minus
  its without-deflection values, rounded to 0.1″.
- The two programs model such a ray differently. According to its
  documentation (appendix A), Swiss Ephemeris deflects rays from occulted
  bodies in a transparent model of the Sun's gravity field, using the
  standard solar mass distribution. The engine applies the point-mass
  formula everywhere (the SOFA `ldsun` form). No observation can decide
  between them, because the star is occulted.
- At the 14,628 instants when the star is more than 0.3° from the Sun, the
  max is 0.002089″.
- True Chitra passes at every instant, including 26 near-Sun instants; Spica
  lies 2° from the ecliptic, so the Sun never covers it.
- True Revati passes at every instant, including 25 near-Sun instants. ζ Psc
  lies 0.21° from the ecliptic, so its ray crosses the disk no closer than
  0.8 solar radii from the centre. Almost all of the Sun's mass lies within
  that radius, so the two models agree there (max 0.0044″).

**The Galactic Center fails on catalogue data.**

- The engine uses the SIMBAD ICRS position and Reid and Brunthaler's
  eastward motion as μα cos δ, which is what the paper states.
- The difference from Swiss is linear in time. It is +20 mas at J2000.0 and
  changes by −0.40 mas per year. It is largest at 1800 (0.101″), and the median
  is 0.0195″.
- The drift equals the paper's eastward motion times (1 − cos δ). Two
  changes to the engine's inputs reproduce Swiss to 1.3 mas: multiplying the
  eastward motion by cos δ once more, and shifting the position by the
  constant offset. This was a scratch analysis and is not committed.
- So Swiss's Sgr A* entry differs from these sources in its proper-motion
  convention and its reference position. The engine keeps the cited values.

The `nearSun` blocks in the JSON split every star mode by elongation. For
`galactic-center`, the "beyond gate" count covers most instants, because
that failure has nothing to do with the Sun.

## Reference values

`tools/reference_values.py` writes `src/vedic/fixtures/ayanamsa-reference.json`
and `ayanamsa.test.ts` checks the engine against it. It uses pyerfa and numpy,
imports nothing from the engine, and uses no Swiss code or data. `--check`
rebuilds the file in memory and fails if it differs.

- **Epoch ayanamsas** at 12 instants from 1800-01-01 to 2199-12-31, including
  each definition's own epoch: the construction above with ERFA's IAU 2006
  (`bp06`, `obl06`), IAU 1976 (`prec76`, `obl80`) and Kinoshita's Newcomb, and
  the J2000.0 values `A0 − λ_M(t0; J2000)`: Lahiri 23.857092325°,
  Fagan–Bradley 24.740299714°, Krishnamurti 23.760220248°. The IAU 1980 Δψ at
  Lahiri's epoch is ERFA `nut80`'s 16.768927″. Three user definitions (the
  engine model from 1950, Newcomb from J1900.0 and IAU 1976 from 1956) are
  computed the same way at their epochs and the same 12 instants; they show
  that `value` holds at the epoch only for the engine model (−0.830″ and
  +0.130″ otherwise).
- **Star ayanamsas** every ten years 1800–2200: ERFA `pmsafe`, `apcg13`,
  `atciq` and `ecm06` on the engine's catalogue values, leaving out instants
  with the star within 5° of the Sun (164 remain).
- **IAE 2027**: the edition's mean values for 2027.0 and 2028.0 and its 161
  true values (p. 423), with ERFA `nut06a`'s Δψ at each date so the test can
  compare mean values.

These replace three checks that only repeated the engine's own arithmetic
(its constant plus its own Δψ, its user definition at its own epoch, and its
own tropical positions less its own ayanamsa); those remain as tests labelled
"consistency".

## Pinned ΔT

`ayanamsa` evaluates an epoch definition on the ecliptic of its epoch. The
branch built that epoch with astronomy-engine's
`AstroTime.FromTerrestrialTime`, inside the caller's pinned ΔT clock. That
function iterates until its error is below 10⁻¹² day; with a large constant
ΔT the rounding of `ut + ΔT` keeps the error above that, and the loop never
ends (Lahiri from about 1e8 s). The epoch frame depends only on TT, so it is
now built once per definition on a zero ΔT clock, where the AstroTime's TT is
the epoch exactly, and cached; nothing calls `FromTerrestrialTime`. The tests
run every kind of definition (the nine built-ins, user definitions with each
model, and a linear one) at pins of ±1e10, ±1e9, 1e8, 1e5 and 0 s, and
`siderealChart` at ±1e10 and 1e9 s, inside `vm.runInThisContext` with a 10 s
limit, so a hang fails the test instead of stopping the run. Put back, the old
construction fails both tests at the limit.

## Whole-sign houses

`siderealChart` used to subtract the ayanamsa from every cusp. For whole-sign
houses that put each sidereal cusp about 6° into a sign. Whole-sign houses,
asked for or given by the polar fallback, are now rebuilt from the sign of the
sidereal ascendant, each cusp exactly on a sign's start, and the result
reports `houseSystem` and `flags`. For the docs' synthetic birth with
`houseSystem: "whole"` the sidereal ascendant is Leo 26.25° and house 1
starts at 120°; the Sun moves from house 9 to 10 and Saturn from 5 to 6.
Placidus at 78.2°N falls back to whole signs and is rebuilt the same way,
with `polar-fallback` in the flags.

## Boundary fixtures

`tools/boundary_fixtures.py` writes `src/vedic/fixtures/boundaries.json`. It
does not import or run the engine. The expected values come from the rules as
the texts state them, transcribed as tables:

- the lord of each nakshatra, from BPHS 46.15's table of three constellations
  per lord;
- the Vimshottari order counted from Krittika;
- the drekkana, chaturthamsa and trimsamsa specula;
- the starting sign of each varga.

The values are computed with exact rational arithmetic on the exact binary
value of each test longitude.

Every boundary is a whole number `T` of 1/7560°. For each boundary there are
three points:

- `x0`, the double nearest `T/7560`;
- `x0 − 1e-9` and `x0 + 1e-9`, each normalised into [0, 360) as the engine
  does.

`x0` lies exactly on the boundary for 2,787 of the boundaries. For 1,456 it
lies just below, and for 1,538 just above. The expected answer follows where
the double actually lies. So a degree–minute value on a boundary that is not
a double is placed by its rounding: `93 + 20/60` is 4.7 × 10⁻¹⁵° below 93°20′
and is placed in Punarvasu, while degree–minute tables start Pushya there.
`docs/vedic.md` says so and gives the remedy (add 1e-9°).

| Division | Boundaries |
| --- | --- |
| Nakshatra and pada | 108 |
| KP sub and sub-sub (2,187 sub-sub boundaries plus 6 sign cuts) | 2,193 |
| D1, D2, D3, D4, D7, D9, D10, D12 | 12, 24, 36, 48, 84, 108, 120, 144 |
| D16, D20, D24, D27, D30, D40, D45, D60 | 192, 240, 288, 324, 60, 480, 540, 720 |
| D2 and D3 cyclic | 24, 36 |
| **Total** | **5,781 boundaries and 17,343 points** |

- Each point is checked against the nakshatra index and pada, the numbered
  KP sub and sub-sub-lord, and the varga sign.
- The fixture's SHA-256 is
  `3578be675ddb51bb80ab543431d654c9a6e7bcab4d70d9abcae381ea29dcd51f`.
  Regenerating it gives identical bytes.
- A mutation check replaced the exact `floor(lon × 7560)` with a naive
  `Math.floor(lon * 7560)`. Six of the 21 fixture tests then failed
  (nakshatra and pada, KP, D7, D9, D27 and D45), and so did the tick-grid
  test. The change was reverted.
- `jyotish.test.ts` also checks the tick grid against a BigInt reference on
  more than 180,000 values. These include every 49th tick of the grid, the
  doubles about one ulp either side of each, and 20,000 random longitudes.
  It also checks the worked examples from BPHS and Narasimha Rao.
- Narasimha Rao's Example 23 prints Leo for the D27 of Gemini 11°. His own
  rule gives Cancer, and the test expects Cancer, with a note.

## Dasha comparison

`tools/dasha_independent.py` implements Vimshottari, Yogini and Ashtottari
from the BPHS rules in exact rational arithmetic (`fractions.Fraction`). The
inputs are the exact binary Moon longitude and an integer-millisecond birth.
It compares every boundary the engine returns.

**Cases.** There are 240 synthetic cases:

- Birth instants run from 1800 to 2100 and include the Unix epoch and −1 ms.
- There are 12 chosen Moon longitudes and 228 pseudo-random ones. The chosen
  ones are 0; 1e-9; 13°20′ and just below it; the last double below 360°;
  253°; the start of Uttara Ashadha; both edges of Abhijit; and three more
  nakshatra-boundary values.
- The three year lengths are used in rotation.
- Each case also has three instants for `vimshottariAt`.

**What was compared** for each case:

- Vimshottari levels 1–3 in full;
- levels 4–5 under one antardasha;
- five-level chains at the three instants;
- two cycles each of Yogini and Ashtottari mahadashas.

That is 402,240 periods in all. The Vimshottari periods by level are 2,160,
19,440, 174,960, 19,440 and 174,960.

**Results.**

- The largest \|difference\| is 2.26 µs (Vimshottari), 1.93 µs
  (`vimshottariAt`), 1.24 µs (Yogini) and 1.88 µs (Ashtottari). The gate is
  5 s.
- There are no lord mismatches and no count mismatches.
- The balance differs by at most 2.8 × 10⁻¹⁴ years.

**Boundaries.** `vimshottariAt` now compares whole-millisecond instants with
the rounded boundaries that `start` and `end` print, and a period's last
sub-period ends exactly at the period's end, so each period's own `start`
finds it. Before, it compared with the unrounded boundaries: the first
mahadasha's own `start` could fall before it (a RangeError) and the second's
could return the first. The tool applies the same rule to the exact
boundaries. An exact boundary within a few microseconds of a half millisecond
can round the other way from the engine's float, so the round trip itself is
tested in `dasha.test.ts` (6,264 periods; the old comparison fails it).

**Published example.** BPHS 46, notes to v. 16 (Santhanam, from Lahiri's
balance table): the Moon at Sagittarius 13°, Mula pada 4, leaves "2 months
and 3 days" of Ketu. The engine gives Ketu, 0.175 years, which is 2 months 3
days in the text's 360-day reckoning. This matches. Only the Moon's longitude
is taken from the example.

**Balance convention.** The engine and the independent implementation both
take the elapsed part of the birth nakshatra from the Moon's longitude.
BPHS's own examples use time (bhayat/bhabhog). The two differ by the Moon's
speed variation within the nakshatra.

## Existing results

The review's regression script computed natal charts, chart points,
declinations, transits, positions, Moon phase, Saturn returns (every 25th)
and progressions (every 5th) for 1,500 seeded births over 1800–2200 across
the 13 house systems, with pinned ΔT and unknown times among them. Against
main's build, the output of this branch's build is byte-identical (SHA-256
`6df40a5d4c3b4a3f9ca92bf5f0e76fc20ccf58d3b42bc5c84e745615116c820d`), also when
every third birth first runs `ayanamsa` with a 12,345 s pin, `siderealChart`,
a refused call and a 1e9 s pin on the Vedic entry. The conformance suite's
committed verdicts are unchanged.

## Reproduction

```sh
npm ci && npm run build
python3 docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py     # rewrites the fixture; compare with git diff
python3 docs/evidence/vedic-2026-09-28/tools/dasha_independent.py     # writes results/dasha-independent.json
python3 docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py \
  --python /path/to/venv/bin/python --ephe /path/to/ephe              # needs pyswisseph; writes results/ayanamsa-swiss.json
# needs numpy and pyerfa:
/path/to/venv/bin/python docs/evidence/vedic-2026-09-28/tools/reference_values.py --check
/path/to/venv/bin/python docs/evidence/vedic-2026-09-28/tools/primary_tables.py   # writes results/primary-tables.json
/path/to/venv/bin/python docs/evidence/vedic-2026-09-28/tools/sensitivities.py    # writes results/sensitivities.json
npm test && npm run typecheck && npm run exports:smoke && npm run package:contents
```

**Environment used:** Node 22.22.2, Python 3.11.15, pyswisseph 2.10.03,
pyerfa 2.0.1.5 and numpy 2.4.6.

## Left out

- **Yogini and Ashtottari antardashas.** Only mahadashas are given, and
  `dashaSubperiods` rejects their periods.
- **Ashtottari applicability test.** The rule is stated and cited, not
  computed.
- **Time-based dasha balance** (bhayat/bhabhog). Only the arc fraction is
  used.
- **Other varga variants.** The Kashinatha hora and the Jagannatha and
  Somanatha drekkanas are named and rejected. Vargas outside the sixteen are
  not implemented.
- **Swiss Ephemeris's own Krishnamurti epoch and Raman, Yukteswar and Sgr A*
  constants.** These are not adopted; the engine keeps the cited definitions.
- **Other ayanamsas.** These include Lahiri ICRC (23°15′00″ at 1956, used
  before 1985), Lahiri 1940 and VP285, the IAE's pre-2021 IAU 1976 carry,
  Krishnamurti–Senthilathiban, other star anchors, and galactic-equator
  zodiacs. `userAyanamsa` covers any value-at-epoch definition.
- **Full-series nutation in `true`.** This is deliberate, for consistency
  with the engine's positions.
- **Light deflection for rays through the solar disk.** This is why True
  Pushya fails behind the Sun.
- **Historical frames.** The FK4 equinox of the Newcomb era is not modelled.
- **Long-term precession.** The comparison covers 1800–2200 only. P03
  departs from long-term models by about 0.34″ at 0 CE and 10″ at 3000 BCE.
- **Sidereal house systems, a sidereal field in the natal receipt, panchanga,
  shadbala and ashtakavarga.**

## Correction, 2026-10-05

The star ayanamsas' comparison with ERFA in *Results* ran on 41 instants
about ten years apart, which land near the same date each decade; none of
the 164 was within 17° of the Sun, so its filter at 5° left nothing out, and
"more than 5° from the Sun" describes the filter, not a sample near it.
`docs/evidence/calc-sidereal-2026-10-05/` compares the same definitions near
each star's conjunction with the Sun, densely around its closest approach:
within 0.0011″ with the star 2° or more from the Sun (0.00101″ at its
largest, 7.7° from it), within 0.0034″ from 0.3° to 2°, and within 0.036″
inside 0.3°. The figures above are left as they were measured.
