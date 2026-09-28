# L2 arbiter: ERFA sidereal time and obliquity, house geometry from the published definitions

The expected values in `vectors/L2-houses-angles.json` (150 vectors: 60
`angles.asc-mc`, 10 `angles.vertex-east-point`, 70 `houses.cusps` with values
and 10 `houses.cusps` whose answer is `status: "undefined"`) come from two
things only:

- **Earth rotation and the ecliptic, from ERFA** (pyerfa 2.0.1.5, ERFA 2.0.1):
  GAST = `gst06a` (IAU 2006 precession, IAU 2000A nutation), true obliquity
  ε = `obl06` + the Δε of `nut06a`, RAMC = GAST + east longitude. TT comes from
  IERS measurements where they exist (see below) and is recorded in every
  vector as `input.jd_tt`.
- **Spherical geometry written in `build.py` from each system's published
  definition** (Holden, *The Elements of House Division*, 1977; Munkasey,
  *An Astrological House Formulary*; Smart, *Textbook on Spherical
  Astronomy*; Polich and Page for the topocentric system; Placidus de Titis
  and Koch & Schaeck for the constructions whose existence decides the status
  vectors). No astrology engine's code and no Swiss Ephemeris code was read
  or imported. Swiss Ephemeris was run afterwards, as an instrument, by
  `check_swiss.py`, and chose nothing.

## Regenerate

```bash
python3 conformance/arbiters/l2/build.py            # writes conformance/vectors/L2-houses-angles.json
python3 conformance/arbiters/l2/build.py --report   # also prints the diagnostics quoted here
python3 conformance/arbiters/l2/check_swiss.py      # optional: rewrites swiss-check.json (needs pyswisseph)
```

Requirements: Python 3.11 and pyerfa 2.0.1.5 (numpy comes with it). The Swiss
check also needs pyswisseph 2.10.3.2 and the files `sepl_18.se1` and
`semo_18.se1` (`--ephe DIR`). The build is deterministic. Two runs give
identical bytes, sha256
`5718690f184f8bb9c1f38056c1bd11ec71a4aebf3f945a4dd519501ef33f50d0`. It also
validates its output against SPEC.md before writing (`validate()` in
`build.py`), and `node conformance/harness/validate.mjs --expect-total 500`,
run from the repository root, reports that all 500 vectors of the suite
conform.

## Inputs

| file | sha256 | what it is |
| --- | --- | --- |
| `sources/l2/iers-finals2000A-ut1.csv` | `c698117a9c11524196e51a71493776e3287223b9ee75582548392dec8d45f669` | UT1−UTC per day, 1973-01-02 to 2027-09-25, flag `I` (observed) or `P` (predicted): three columns of the IERS `finals.all` (IAU 2000) file fetched 2026-09-22 (sha256 `c672540e…58a1`). Copied unchanged from the engine audit's corpus. |
| `sources/l2/Leap_Second.dat` | `6cb6f5d4b819f2e568e25db4b0b26d89dedf031fdffb18bc94d40f4e94e268d7` | IERS Bulletin C TAI−UTC table, `hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat`, updated through Bulletin C 72, fetched 2026-09-28. `build.py` checks it against `erfa.dat` on every IERS row. |

## Time

ΔT = TT − UT1:

- From the IERS rows flagged `I`, 1973-01-02 to 2026-09-17: ΔT = 32.184 s +
  (TAI−UTC) − (UT1−UTC). ΔT has no leap-second steps, so it is interpolated
  linearly between daily rows. Predicted rows are not used.
- Everywhere else: the Espenak & Meeus polynomials (NASA/TP-2006-214141,
  §2.6). Their argument is y = 2000 + (JD − 2451544.5)/365.2425. The
  transcription reproduces the published ΔT table to within the polynomials'
  own fit, and its segments meet within 0.09 s. The seams with the IERS
  series are +0.06 s at 1973 and −6.3 s at 2026-09-17: the 2005–2050
  polynomial overestimates today's ΔT.

Of the 150 vectors, 21 use IERS values and 129 the polynomials.
`jd_tt = round(jd_ut1 + ΔT/86400, 9)`, and that rounded value is the one
used.

**Sensitivity to ΔT.** IAU 2006 sidereal time depends on TT only through
precession-nutation, about 1e-4″ per minute. Moving ΔT by 60 s moves the
outputs by:

| kind / system | max amplification of an RAMC error | of an ε error | max change for ΔT + 60 s | median |
| --- | ---: | ---: | ---: | ---: |
| asc-mc | 3.6 | 9.1 | 0.00033″ | 0.00009″ |
| vertex-east-point | 4.0 | 3.1 | 0.00048″ | 0.00010″ |
| Placidus | 1.8 | 4.4 | 0.00030″ | 0.00005″ |
| Koch | 1.4 | 2.3 | 0.00012″ | 0.00010″ |
| Regiomontanus | 2.0 | 4.4 | 0.00019″ | 0.00004″ |
| Campanus | 19.7 | 49.6 | 0.0026″ | 0.00013″ |
| Porphyry | 1.2 | 2.8 | 0.00014″ | 0.00008″ |
| Alcabitius | 1.7 | 4.4 | 0.00017″ | 0.00008″ |
| equal | 1.4 | 1.6 | 0.00021″ | 0.00014″ |
| whole-sign | 0 | 0 | 0 | 0 |
| Morinus | 1.1 | 0.2 | 0.00009″ | 0.00005″ |
| meridian | 1.1 | 0.2 | 0.00016″ | 0.00004″ |
| topocentric | 7.8 | 9.9 | 0.0013″ | 0.00014″ |
| Vehlow | 1.6 | 3.3 | 0.00013″ | 0.00008″ |
| equal-MC | 1.1 | 0.1 | 0.00019″ | 0.00012″ |

The effect is far below 0.001″ everywhere except two near-polar vectors:
Campanus at 66° (`L2-CSP-0024`, 0.0026″) and topocentric at 64°
(`L2-CSP-0056`, 0.0013″). Both are far below the 1″ tolerance. Amplification
means arcsec of output per arcsec of RAMC or ε. The one vector where it
reaches 10 or more (`L2-CSP-0024`) carries a note, because a sidereal-time or
obliquity model that differs from IAU 2006/2000A by 1 mas moves its cusps by
up to 20 or 50 mas.

**Sensitivity to the choice of IAU model.** The build recomputes every value
through ERFA with two older model sets:
- IAU 2000B sidereal time and nutation (`gst00b`, `obl06` + `nut00b`): no
  value moves by more than 0.36″.
- IAU 1982/1994 sidereal time with the IAU 1980 obliquity and nutation
  (`gst94`, `obl80` + `nut80`), the set many older programs use: GAST moves by
  up to 0.54″ over 1800–2200. That is the IAU 1976 precession-rate error,
  about 0.27″ per century from J2000. Four vectors then move by more than the
  1″ tolerance: `L2-ASC-0051` (1.01″), `L2-ASC-0060` (1.21″), `L2-CSP-0056`
  (3.52″) and `L2-CSP-0024` (14.46″). Each carries a note.

The IAU 1980 mean obliquity alone (84381.448″ at J2000, 42 mas above IAU
2006) moves `L2-CSP-0024` by 4.0″. The expected values stay defined by IAU
2006/2000A. The notes only tell an adapter author where a model choice, not
the geometry, can decide the verdict.

## Definitions

K, Z, E, N and M are the ecliptic pole, zenith, east point, north point of
the horizon, and the equator point on the upper meridian, as unit vectors of
date. Every angle and every great-circle cusp is ±(K × pole of the circle),
taking the intersection on a named side. Index m = k − 1, so cusps 11, 12, 2
and 3 are m = −2, −1, 1, 2. Cusps 4–9 are opposite 10–3.

- **Ascendant**: horizon ∩ ecliptic on the east (rising) side.
- **MC**: meridian ∩ ecliptic with right ascension = RAMC.
- **Vertex**: prime vertical ∩ ecliptic on the **west** side, in both
  hemispheres.
- **East point**: the ecliptic point with right ascension RAMC + 90°.
- **equal**: Asc + 30°(k−1). **whole-sign**: 0° of the Asc's sign, then +30°.
  **Vehlow**: Asc − 15° + 30°(k−1). **equal-MC**: MC + 30°(k−10).
- **Porphyry**: each quadrant MC→Asc→IC trisected in longitude.
- **Regiomontanus**: circles through the north and south points of the horizon
  and the equator points at RA RAMC + 90° + 30°m.
- **Campanus**: circles through the north and south points and the
  prime-vertical points cos(a)E + sin(a)Z, a = −30°m.
- **meridian**: the ecliptic point with RA RAMC + 90° + 30°(k−1), projected
  along hour circles (cusp 10 = MC).
- **Morinus**: the ecliptic longitude of the equator point with RA RAMC + 90° +
  30°(k−1), projected through the ecliptic poles.
- **Placidus**: the point whose RA − RAMC = 90° + 30°m + (1 − |m|/3)·AD of its
  own declination, where AD = asin(tan φ tan δ). That is DSA/3 and 2DSA/3
  before culmination (cusps 11, 12), and 2NSA/3 and NSA/3 after lower
  culmination (cusps 2, 3).
- **Koch**: the MC degree's diurnal semi-arc trisected in time; cusp k is the
  degree rising at RAMC + m·DSA_MC/3.
- **Alcabitius**: the ascendant's DSA trisected in RA and carried along hour
  circles.
- **Topocentric** (Polich–Page): the degree rising at RAMC + 30°m on the
  horizon of pole p, tan p = (1 − |m|/3) tan φ.

## How the values are checked

Every value is computed by two routes that share no formula:
- vector intersections against the classical closed forms;
- Placidus solved by bisection in longitude and again in ascensional
  difference (tan δ = tan ε sin RA), each root checked unique on a 2000-point
  grid;
- Koch, Alcabitius and topocentric by vector ascendants against the
  oblique-ascension formula;
- Campanus against the ascendant formula for each house circle's own pole;
- on every valued Placidus and Koch vector, the construction test described
  under the status vectors, which must find exactly one set of cusps in
  zodiacal order over the whole ecliptic, equal to the values above. For
  Placidus it is run by two routes.

Each result is then checked against its defining property through ERFA's own
`s2c`/`rx`/`c2s`/`hd2ae`. For example:
- the Asc has altitude 0;
- the vertex has azimuth 270°;
- a Koch cusp is on the horizon at RAMC + m·DSA_MC/3;
- a Placidus cusp has the stated semi-arc fraction.

The build stops if any residual exceeds 1e-6″. The largest over all 140
valued vectors is 7.3e-10″, and the output is rounded to 1e-10° (3.6e-7″).

## Case design

The design is fixed in `build.py` and was drawn before any engine was run.
Every random stream is SplitMix64, seeded with the first 8 bytes of
SHA-256(`zodiacs-conformance/L2/0.1.0/<label>`). Instants are drawn
uniformly within equal strata of 1800-01-01..2200-01-01 UT1 and rounded to
1e-6 day, so they are not round hours. Longitudes are one draw per stratum of
[−180°, 180°), rounded to 1e-4° and shuffled.

- `angles.asc-mc` (`L2-ASC-0001`…`0060`, in time order): latitudes 0, ±15,
  ±30, ±45, ±52, ±60, ±64 and ±66, each four times, shuffled. Instants: 55
  strata over 1800–2200 plus 5 strata over 2025–2030. Six asc-mc vectors, and
  seven vectors in all, fall in 2025–2030; two of them are on IERS values.
- `angles.vertex-east-point` (`L2-VTX-…`): latitudes 60, 45, 30, 15, 5, −5,
  −15, −30, −45 and −60, one per vector. Guard: the vertex must lie at least
  1° from the meridian plane (no redraw was needed).
- `houses.cusps` (`L2-CSP-…`, grouped by system in SPEC order): system s gets
  latitudes pool[(s + 2j) mod 11], j = 0..4, with pool = (60, 52, 45, 30, 15,
  0, −15, −30, −45, −52, −60), so every system gets both hemispheres. Five
  near-polar extras: Placidus +66, Koch −66, topocentric +64, Regiomontanus
  −64 and Campanus +66. Instants: 70 strata assigned by shuffle. Guard: for
  whole-sign, the Asc must be at least 0.01° from a sign boundary (no redraw
  was needed).
- Status (`L2-POL-…`): ten cases, Placidus and then Koch at 70, 75, 80, −72
  and −78°. Instants come from 10 shuffled strata, longitudes from 10.
  Guard: the system's construction must fail at the case's RAMC and at RAMC ±
  0.1°. Case n keeps its first draw, as `L2-POL-000n`, if the guard holds.
  Otherwise that draw is withdrawn, and the case is redrawn in the same
  stratum from its own stream `polar/redraw/<n>`, so no other case moves. The
  first redraw that passes takes the next new id from `L2-POL-0011`. Only case
  4 was redrawn, once.

## The status vectors: cusps that do not exist

**Definition** (arbiter `l2-houses-undefined`). A house system's cusps exist
where its defining construction has a solution for every cusp and the twelve
cusps that result are in zodiacal order. Going 1 → 2 → … → 12 → 1 they must
advance through one turn of longitude, every step forward. With cusps 4–9
opposite 10–3 that is 0 < d11 < d12 < d1 < d2 < d3 < 180°, where d_k is the
forward distance of cusp k from cusp 10. Each construction is taken from its
system's definitional source:

- **Placidus**: Placidus de Titis, *Tabulae primi mobilis* (Milan, 1657;
  English translation by J. Cooper, *Primum Mobile*, 1814), restated in Holden
  (1977). Cusps 11 and 12 are the degrees that still have 1/3 and 2/3 of their
  own diurnal semi-arc to go to culmination. Cusps 3 and 2 are the degrees that
  have completed 1/3 and 2/3 of their own nocturnal semi-arc since lower
  culmination. Only degrees that rise and set have semi-arcs, and every one of
  them is searched, not one quadrant.
- **Koch**: W. A. Koch and E. Schaeck, *Häusertabellen des Geburtsortes*
  (Göppingen, 1962), restated in Holden (1977). The MC degree's diurnal
  semi-arc is trisected in time, and cusp k is the degree rising at RAMC +
  (k − 1)·DSA_MC/3. This needs the MC degree to rise and set.

Cusp 10 (the degree on the upper meridian) and cusp 1 (the degree rising)
always exist. No page numbers are given for Holden: none could be verified for
this file.

**Solver.** `placidus_roots` scans every degree that rises and sets. At these
latitudes those form two arcs around the equinoxes. Each arc is parametrised
by the ascensional difference, which keeps the residual smooth up to the arc's
ends. The scan uses a 4000-point grid, refines every sign change by bisection
and every local minimum of the residual by golden-section search.

A second route, `placidus_roots_by_ad`, uses the fact that tan δ = tan ε sin RA
along the ecliptic. It solves each condition as one smooth equation, sin AD =
tan φ tan ε sin(RAMC + 90° + 30°m + (1 − |m|/3)·AD), and must find the same
solutions (it does, to 3.7e-10″). ERFA confirms that every solution meets the
condition. For Koch, ERFA confirms the MC degree's circumpolarity and that
each constructed cusp rises at its sidereal time.

**How each status vector fails:**

| vector | system | φ | year | failure |
| --- | --- | ---: | ---: | --- |
| L2-POL-0001 | Placidus | 70 | 1844 | cusp 11 has no solution (closest miss 9.54° of hour angle) |
| L2-POL-0002 | Placidus | 75 | 2190 | cusps 11, 2 and 3 have no solution (21.17°, 25.41°, 25.41°) |
| L2-POL-0003 | Placidus | 80 | 1912 | cusps 2 and 3 have no solution (1.50°, 1.50°) |
| L2-POL-0005 | Placidus | −78 | 2135 | cusps 11, 2 and 3 have no solution (51.30°, 2.67°, 57.33°) |
| L2-POL-0006 | Koch | 70 | 1832 | the MC degree never rises (tan φ tan δ_MC = −1.173), so there is no semi-arc to trisect |
| L2-POL-0007 | Koch | 75 | 2088 | the MC degree never sets (tan φ tan δ_MC = 1.613) |
| L2-POL-0008 | Koch | 80 | 1937 | all cusps constructed but out of zodiacal order: cusps 11 and 12 fall 15.40° and 21.06° before the MC |
| L2-POL-0009 | Koch | −72 | 2059 | all cusps constructed but out of zodiacal order: cusp 3 falls 65.52° past the IC |
| L2-POL-0010 | Koch | −78 | 1964 | the MC degree never rises (tan φ tan δ_MC = −1.738) |
| L2-POL-0011 | Placidus | −72 | 2036 | cusps 11, 12, 2 and 3 have no solution (23.07°, 23.07°, 0.19°, 20.16°) |

**Withdrawn and added.** `L2-POL-0004` (Placidus, −72°, first draw of case 4,
2012) was withdrawn before release. Its construction has exactly one solution
for each cusp, and they are in zodiacal order, so its cusps exist.
`L2-POL-0011` is that case's first redraw that passes the guard. The other
nine first draws all fail by their construction and keep their ids.

**Margins.** The Placidus residual moves by exactly the change of RAMC. A
Placidus failure therefore survives any change of RAMC smaller than the
largest closest miss among its unsolvable cusps: at least 1.50°
(`L2-POL-0003`). Every circumpolar MC degree has |tan φ tan δ_MC| ≥ 1.17, and
every order violation is at least 15.4°. Every failure was also checked at
RAMC ± 0.1°. Sidereal-time and obliquity model differences are of order
milliarcseconds, so none of them can change a status.

## Swiss Ephemeris check (after the fact; `swiss-check.json`)

`check_swiss.py` records statistics only, never a Swiss value. It used
pyswisseph 2.10.3.2 (Swiss Ephemeris 2.10.03), house flags 0, and the
ephemeris files `sepl_18.se1`
(`ca1393ceab3a44fbc895887cf789c68819ae6a1cbc9b22225872dbe4ccd99a66`) and
`semo_18.se1`
(`1ca07bd67c24374d77226180c20a4f9996cba013697894810518e7eb582ca4f7`).

Columns of the table below:
- **geometry**: `houses_armc_ex2` fed the arbiter's own RAMC and ε.
- **pipeline**: `houses_ex2` from `jd_ut1`, either with Swiss's ΔT pinned to
  the vector's (`set_delta_t_userdef`) or with Swiss's own ΔT.

Max |arbiter − Swiss| in arcsec; cusps are the per-vector maximum over the
12. Vector counts are in parentheses.

| kind / system | n | geometry median | geometry max | pipeline, pinned ΔT, 1850–2050 | pipeline, pinned ΔT, outside | pipeline, Swiss ΔT, 1850–2050 | pipeline, Swiss ΔT, outside |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| asc | 60 | 9.3e-8 | 1.8e-7 | 0.0070 (33) | 20.5 (27) | 0.0070 | 5.9 |
| mc | 60 | 9.1e-8 | 1.8e-7 | 0.0011 (33) | 9.5 (27) | 0.0011 | 2.0 |
| vertex | 10 | 7.6e-8 | 1.6e-7 | 0.0014 (5) | 9.3 (5) | 0.0013 | 3.0 |
| east point | 10 | 1.1e-7 | 1.8e-7 | 0.0007 (5) | 9.6 (5) | 0.0006 | 2.0 |
| Placidus | 6 | 1.3e-5 | **0.00103** | 0.0004 (2) | 5.3 (4) | 0.0004 | 2.2 |
| Koch | 6 | 1.5e-7 | 1.8e-7 | 0.0010 (4) | 9.3 (2) | 0.0010 | 1.5 |
| Regiomontanus | 6 | 1.6e-7 | 1.7e-7 | 0.0007 (3) | 12.7 (3) | 0.0007 | 2.9 |
| Campanus | 6 | 1.4e-7 | 1.7e-7 | 0.0012 (2) | 204 (4) | 0.0012 | 15.7 |
| Porphyry | 5 | 1.5e-7 | 1.7e-7 | 0.0012 (3) | 1.0 (2) | 0.0012 | 2.2 |
| Alcabitius | 5 | 1.6e-7 | 1.8e-7 | 0.0005 (1) | 1.5 (4) | 0.0005 | 2.2 |
| equal | 5 | 6.0e-8 | 1.7e-7 | 0.0007 (4) | 0.08 (1) | 0.0007 | 0.16 |
| whole-sign | 5 | 0 | 0 | 0 (5) | – (0) | 0 | – |
| Morinus | 5 | 1.7e-7 | 1.8e-7 | 0.0006 (2) | 9.9 (3) | 0.0006 | 1.9 |
| meridian | 5 | 1.4e-7 | 1.7e-7 | 0.0006 (4) | 4.9 (1) | 0.0006 | 1.8 |
| topocentric | 6 | 1.6e-7 | 1.8e-7 | 0.0009 (2) | 3.1 (4) | 0.0009 | 3.6 |
| Vehlow | 5 | 1.1e-7 | 1.2e-7 | 0.0011 (1) | 9.7 (4) | 0.0011 | 2.4 |
| equal-MC | 5 | 1.2e-7 | 1.6e-7 | 0.0003 (3) | 0.43 (2) | 0.0004 | 1.8 |

### What the check found

- **The geometry agrees in every system and angle** to the output's own
  rounding (≤ 1.8e-7″), except one Placidus cusp (next point). That includes
  the 3 low-latitude vertex vectors where the usual co-latitude closed form
  lands on the anti-vertex: Swiss also takes the western intersection. No
  convention differs in the 13 systems or the four angles.
- **Placidus, 0.00103″ at 66° (`L2-CSP-0001`, cusp 2).** This is Swiss's
  iteration stopping early, not a definitional difference. Put back into the
  Placidus condition, Swiss's cusps miss it by up to 0.0015″ of right
  ascension, while the arbiter's miss it by at most 3.7e-10″. The arbiter's
  value is kept.
- **Inside 1850–2050 the full pipelines agree to ≤ 0.007″.** Swiss's GAST
  and true obliquity differ from ERFA's IAU 2006/2000A values by at most 1.09
  and 1.14 mas. A milliarcsecond model difference, multiplied by these
  vectors' amplification (≤ 9), accounts for all of it.
- **Outside 1850–2050, Swiss's sidereal time is a different model.** There it
  moves by 0.0411″ per second of ΔT, which is the sidereal-minus-solar rate
  (0.00273791 × 15″/s). The part of its sidereal time that carries that rate
  is therefore evaluated in TT rather than UT1. ERFA's GAST, and Swiss's own
  inside the window, move by about 1e-6″/s. With the arbiter's ΔT pinned,
  Swiss's GAST is 2.9″ (median) to 10.4″ (max) off `gst06a`, and the
  ill-conditioned Campanus vector amplifies that to 204″. With Swiss's own
  ΔT (115 s median, 272 s max from the arbiter's outside the window), the
  largest difference per system outside the window runs from 0.16″ (equal)
  to 15.7″ (Campanus). This comes from Swiss's time model, not from house
  geometry. Counted as verdicts, Swiss's own pipeline differs by more than
  1″ on 47 of the 66 valued vectors outside 1850–2050, and on 0 of the 74
  inside (42 of 66 with ΔT pinned).
- **Status vectors:** Swiss raised `swisseph.Error` (refused) for all 10,
  given either the arbiter's RAMC and ε or its own pipeline.

## Files

| file | sha256 |
| --- | --- |
| `arbiters/l2/build.py` | `2a6a866ba9d74fc41e5504816ea8ccd8c6fa8b04ce8c816c0fbc127f70da83d3` |
| `arbiters/l2/check_swiss.py` | `0d6ae1f9f7908ca449b9ba7459671dbcdb659fea59aa3de0070f4d97bc0ace66` |
| `arbiters/l2/swiss-check.json` | `49a25ca8c150ce8fc2b281ca51ca2842036ee2a7e9816ad94d37513544a6fb89` |
| `vectors/L2-houses-angles.json` | `5718690f184f8bb9c1f38056c1bd11ec71a4aebf3f945a4dd519501ef33f50d0` |
| `sources/l2/iers-finals2000A-ut1.csv` | `c698117a9c11524196e51a71493776e3287223b9ee75582548392dec8d45f669` |
| `sources/l2/Leap_Second.dat` | `6cb6f5d4b819f2e568e25db4b0b26d89dedf031fdffb18bc94d40f4e94e268d7` |
