# Preregistration: `@zodiacs/engine/sky` and `@zodiacs/engine/chinese`

Written and committed on branch `feature-sky` (from `rc15-work`, `eb58011`,
0.1.1-rc.15) on 2026-09-29, before any of the measurements below was run and
before the code it measures was written. Each gate fixes its grid, method,
tolerance and what counts as a failure. A gate is not loosened after its
results are seen. A failure is reported as a failure, with its numbers. An
amendment made before a measurement runs is committed as a separate change to
this file, with the reason; none may follow a measurement it affects.

Common to every gate:

- Statistics are over the absolute differences |Δ| in seconds: the count, the
  median, the 95th percentile (nearest rank), the maximum, and the count over
  the tolerance. Events or terms found by one side and not the other are
  counted separately and are failures.
- Swiss Ephemeris (pyswisseph 2.10.03, ephemeris files `sepl_18.se1` and
  `semo_18.se1`, 1800–2400) is a comparison instrument only. Its values stay
  in memory. Only verdicts and summary statistics are committed, and no test
  expectation or engine constant comes from it.
- JPL kernels, USNO downloads and HKO downloads are not committed. A small
  table of published values, each with its source, may be committed as a
  fixture.
- The first-principles computations use skyfield 1.55 (numpy 2.4.6, jplephem
  2.24) with JPL DE440s (`de440s.bsp`, 32,726,016 bytes, sha256
  `c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`), IAU 2006
  precession and IAU 2000A nutation (skyfield's defaults), and share no code
  with the engine.
- If the engine's Sun (for the solar terms and true solar time) is fitted to
  any ephemeris, that ephemeris is not DE440 or DE440s, and the fit never reads
  the gate's reference. The fitted ephemeris is named in the evidence README.

## S1. Rise, set and transits against a first-principles computation

- **Sites (88):** latitudes −65, −55, −45, −30, −15, 0, 15, 30, 45, 55 and 65°
  by longitudes −180, −135, −90, −45, 0, 45, 90 and 135°, height 0 m.
- **Dates (54):** 15 January, 20 March, 15 May, 21 June, 22 September and
  21 December of 1900, 1925, 1950, 1975, 2000, 2025, 2050, 2075 and 2100. The
  window is the UTC day, from 00:00 UTC for 24 hours.
- **Bodies (10):** Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus,
  Neptune, Pluto.
- **Events:** rise, set, upper transit and lower transit, every one in the
  window.
- **Conventions:** (i) the engine's defaults: the Sun's and Moon's upper limb,
  the planets' centre, refraction 34′; (ii) for the Sun and Moon only, the
  centre with no refraction.
- **Reference:** a rise or set is an instant at which the geometric
  (unrefracted) topocentric apparent altitude of the body's centre, from
  skyfield with DE440s for a WGS84 observer without polar motion, equals
  h0 = −R − S, where R is 34′ with refraction and 0 without, and S is the
  semi-diameter asin(radius / topocentric distance) for an upper limb (radius
  696,000 km for the Sun and 1,737.4 km for the Moon) and 0 for a centre. An
  upper or lower transit is an instant at which the topocentric apparent hour
  angle is 0 h or 12 h. skyfield is run at the engine's UT1 and TT for the
  instant: UT1 − UTC and ΔT are the engine's at the start of the window, held
  through it. Roots are bracketed from samples every 10 minutes from 60 minutes
  before the window to 60 minutes after it; where three samples turn without a
  sign change and the middle one is within 0.5° of the threshold, a
  golden-section search looks for an extremum across it. Every root is bisected
  to 1 ms.
- **Pairing:** each engine event is paired with the reference event of the same
  kind nearest to it, within 30 minutes. An engine event with no partner is
  "extra"; a reference event at least 60 s inside the window with no partner is
  "missing".
- **Tolerance:** 5 s. **Failure:** a pair with |Δ| > 5 s, or any extra or
  missing event.
- **Reported:** by convention, by body and by latitude, with the altitude rate
  at each failing event (not gated).

## S2. Rise, set and transits against Swiss Ephemeris `rise_trans`

- Sites, dates, bodies, events and both conventions as in S1.
- **Flags:** convention (i): `rise_trans_true_hor` with `BIT_NO_REFRACTION` and
  a horizon of −34′, the Sun's and Moon's default upper limb, `BIT_DISC_CENTER`
  for the planets; convention (ii): `BIT_DISC_CENTER | BIT_NO_REFRACTION` and a
  horizon of 0. Transits: `CALC_MTRANSIT` and `CALC_ITRANSIT`. Height 0 m.
- **Time:** ΔT fixed with `set_delta_t_userdef` to the engine's ΔT at the start
  of the window; the search starts at the engine's UT1 for the start of the
  window, and Swiss's UT result is returned to UTC with the engine's
  UT1 − UTC.
- **Pairing:** Swiss's next event of each kind after the start of the window is
  paired with the engine's first event of that kind in the window, within
  30 minutes. When Swiss's event falls after the window and the engine has
  none, there is no event. Any other unpaired event is a failure, except one
  within 60 s of an edge of the window, which is listed but not counted.
- **Tolerance:** 5 s. **Failure:** a pair with |Δ| > 5 s, or an unpaired event
  as above.

## S3. Rise, set and transit against the US Naval Observatory (±30 s)

- **Source:** the USNO API, `https://aa.usno.navy.mil/api/rstt/oneday` with
  `tz=0`, which gives times in UT to the minute. If it cannot be reached, that
  is recorded, and published USNO values with their citations are used instead.
- **Sites (10):** 0°, 0°; 38.89° N 77.03° W; 51.48° N 0.00°; 35.68° N
  139.69° E; 33.87° S 151.21° E; 64.84° N 147.72° W; 22.30° N 114.17° E;
  55.75° N 37.62° E; 34.60° S 58.38° W; 19.43° N 99.13° W.
- **Dates (8):** 1900-06-21, 1950-03-20, 1975-12-21, 2000-09-22, 2020-01-15,
  2024-06-21, 2050-05-15, 2100-12-21.
- **Events:** the Sun's and Moon's rise, set and upper transit, as USNO lists
  them for the UTC date, against the engine's events of the same kind in that
  UTC day, convention (i).
- **Tolerance:** 30 s. **Failure:** |engine − USNO| > 30 s, or an event listed
  by one and not the other.

## S4. Planetary hours

- **Worked examples (fixtures, committed with their sources):**
  1. Chaucer, *Treatise on the Astrolabe* II.12 (Skeat's edition): "The 13 day
     of March fil up-on a Saterday per aventure": the day's hours run Saturn,
     Jupiter, Mars, Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars, Sun,
     Venus; the night begins with Mercury, then the Moon; the next sunrise
     begins the Sun's hour (Sunday). Place: Oxford, latitude 51°50′ (Chaucer
     II.25), longitude 1°15′ W. Date: 13 March 1389 (Julian), a Saturday.
     Pass: every ruler as stated.
  2. Skeat's notes to II.7–10: at Oxford with the Sun at the first point of
     Cancer the day is about 16½ hours, a day hour 1 h 22½ m and a night hour
     37½ m. Engine at 2000-06-21, Oxford as above, centre and no refraction
     (the astrolabe's horizon). Pass: day hour 82.5 ± 1.0 min and night hour
     37.5 ± 1.0 min.
  3. Heindel, *Simplified Scientific Astrology* (1919), pp. 155–156: at
     latitude 40 on a Thursday in December, at 2 P.M., Mars rules "from 1:32 to
     2:18 P.M.". Engine at Thursday 2025-12-18, 40° N 75° W, convention (i),
     local mean time UTC − 5 h. Pass: 14:00 falls in the ninth day hour, ruled
     by Mars, which starts within 5 minutes of 13:32 and ends within 5 minutes
     of 14:18.
  4. Cassius Dio 37.19: counting the hours from Saturn in the order Saturn,
     Jupiter, Mars, Sun, Venus, Mercury, Moon, the first hour of the next day
     falls to the Sun and that of the third day to the Moon. Pass: the first
     hour of each weekday is ruled by that day's planet.
- **Consistency with the rise/set function:** at every S1 site and date where
  the Sun rises, sets and rises again, each day hour k (0 to 12) starts at
  sunrise + k(sunset − sunrise)/12 and each night hour k at sunset +
  k(next sunrise − sunset)/12, within 1 ms, where the three instants are those
  the rise/set function returns with the same options; the rulers follow the
  Chaldean order from the day's ruler. Failure: any exception.

## C1. Solar terms against a first-principles computation

- **Terms:** every term, all 24 longitudes k × 15°, whose instant falls from
  1900-01-01T00:00Z to 2100-12-31T24:00Z (expected 4,824).
- **Reference:** the apparent geocentric ecliptic longitude of the Sun in the
  true ecliptic and equinox of date, from skyfield with DE440s
  (`earth.at(t).observe(sun).apparent().frame_latlon(ecliptic_frame)`), solved
  for k × 15° by bisection in TT to 1 ms.
- **Comparison in TT:** Δ = engine TT − reference TT, so that ΔT models do not
  enter. The UTC difference with skyfield's own UTC and ΔT is reported, not
  gated.
- **Tolerance:** 2 s. **Failure:** any |Δ| > 2 s, or a term missing or extra.

## C2. Solar terms against Swiss Ephemeris (instrument)

- The C1 terms, from `solcross` (TT) with `FLG_SWIEPH`, compared in TT.
- Tolerance 2 s, reported as a secondary verdict with its statistics.

## C3. Solar terms against published tables (±30 s)

- **HKO:** the Hong Kong Observatory's 24 solar terms for each year its site
  serves (`https://www.hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_YYYY.xml`,
  Hong Kong Time, UTC+8, to the minute). The years fetched are recorded.
- **USNO:** the equinoxes and solstices from the USNO API
  (`https://aa.usno.navy.mil/api/seasons`), to the minute in UT, gated for
  1900–2026, the years with observed ΔT; 2027–2100, which depend on predicted
  ΔT, are reported and not gated.
- **Tolerance:** 30 s. **Failure:** |engine − published| > 30 s.

## C4. Four Pillars

- **Year and month pillars at the jie terms:** for every jie term (Lichun and
  the eleven others) in the HKO years of C3, the instants 60 s before and 60 s
  after HKO's published minute. Expected: the pillars before and after the
  term, from the rules (the year's stem and branch from (Y − 4) mod 60 for the
  year that Lichun begins; the month's branch from the jie that begins it, Yin
  at Lichun; the month's stem from the year's stem by the Five Tigers rule).
  Pass: every pillar as expected.
- **Day pillar anchor:** the *Chunqiu* records a solar eclipse on day jisi (己巳)
  of the second month of Duke Yin's third year, the eclipse of −719 February 22
  (proleptic Julian, JDN 1,458,496). Pass: the engine's sexagenary day for that
  date is 己巳, and its count agrees with (JDN + 49) mod 60 (甲子 = 0) on every
  day from JDN 0 to JDN 3,000,000.
- **Hour pillar and conventions:** the Five Rats rule for each day stem, and
  the day and hour pillars on either side of 23:00, 00:00 and 01:00, for each
  clock (civil time, local mean time, true solar time) and each day change
  (23:00, 00:00). Expected values from the rules. Pass: all.
- **True solar time:** the engine's local apparent solar time against
  skyfield's (hour angle of the apparent Sun plus 12 h, at the engine's UT1
  and TT), at 2,000 instants spread over 1900–2100 and 10 longitudes.
  Tolerance 1 s. Failure: any |Δ| > 1 s.

## Package gates

`npm run typecheck`, `npm test`, `npm run build`, `npm run exports:smoke`,
`npm run package:contents` and `npm run pack:dry-run` pass before each commit
set. The root entry's import graph does not grow (0.1.1-rc.15: 95,273 bytes),
and each new entry has a budget with its reason.
