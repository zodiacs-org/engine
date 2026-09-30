# Preregistration: house positions, co-ascendants, cusp speeds and planetary returns

Written 2026-09-29 on branch `feature-houses-extra`, made from `rc15-work` at
`eb58011` (the 0.1.1-rc.15 candidate). It is committed before any of the
measurements below is run, and before the code they measure is written. It is
not edited after a measurement. A gate that fails is recorded as a failure,
with its numbers, in this folder's README; no tolerance, grid or criterion
below is changed after seeing a result.

## Instruments and arbiters

- **Swiss Ephemeris 2.10.03** (pyswisseph 2.10.03 under `python3`), used as a
  comparison instrument only. Its values stay in memory. The committed files
  hold verdicts and summary statistics, never a per-case Swiss value, and no
  test expectation comes from it. The functions used take the sidereal time,
  latitude and obliquity directly, so no ephemeris file enters.
- **JPL Horizons** (API 1.2, DE441), the arbiter for the return instants.
- **USNO** Astronomical Applications API, `seasons` (the published equinox
  instants, to the minute), for one solar-return fixture.

## Common inputs

A case is a right ascension of the midheaven θ (RAMC), a geographic latitude
φ and an obliquity ε, all in degrees. The engine receives
`{ gastHours: θ / 15, longitude: 0, latitude: φ, obliquity: ε }`, the
`AngleInput` its house functions already take. Swiss receives `armc = θ`,
`geolat = φ`, `eps = ε`.

### Grid L: the latitude ladder

- φ = ±(550 + k) / 10 degrees for k = 0 … 116: every 0.1° from 55.0° to
  66.6°, in both hemispheres (234 latitudes);
- θ = 7.5° + 15° j for j = 0 … 23 (24 sidereal times);
- ε = 23.4392911°.

That is 5,616 cases, in the order: φ ascending from −66.6 to 66.6, then θ
ascending; c is a case's index in that order. For house positions each case
has 8 bodies, 44,928 in all: body m (m = 0 … 7) has ecliptic longitude
λ = 11.25° + 45° m and ecliptic latitude β = B[(m + c) mod 8], with
B = [0, 1.4, −1.4, 5.2, −5.2, 11.3, −17.1, 17.1] degrees.

### Grid G: the global grid

20,000 draws from the mulberry32 generator with seed 20260929:

```js
let a = 20260929;
const next = () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
```

Each draw takes five numbers in order: φ = −89.9 + 179.8 u₁,
θ = 360 u₂, ε = 23.41 + 0.06 u₃ (the obliquities of 1800 to 2200, with
nutation), λ = 360 u₄, β = −20 + 40 u₅. Each draw is one case with one body.

## Gate P: the house position of a body (capability 1)

- **Systems**, with Swiss's letters: whole sign `W`, Placidus `P`, Porphyry
  `O`, Equal `E`, Equal from the midheaven `D`, Vehlow `V`, Koch `K`,
  Regiomontanus `R`, Campanus `C`, Topocentric `T`, Alcabitius `B`, Morinus
  `M`, Meridian `X`.
- **Engine:** `housePosition(system, input, { lon: λ, lat: β })`, a number in
  [1, 13) or `null` where the system does not define the body's position.
- **Swiss:** `swe.house_pos(θ, φ, ε, (λ, β), hsys)`. It counts as undefined
  when it raises `swisseph.Error` or returns a value outside [1, 13) (Koch's 0).
- **Metric:** the difference of the mundane positions, (p − 1) × 30°, taken
  across the 0°/360° seam: d = ((p_engine − p_Swiss) × 30 + 180) mod 360 − 180,
  in arcseconds.
- **Tolerance:** |d| ≤ 0.01″, the house rule of the programme's version-1
  brief (M5).
- **Polar status** agrees when both sides are defined or both are undefined.
- **Pass:** for each system on each grid, no compared case over 0.01″ and no
  case where one side is defined and the other is not. The capability passes
  when all 13 systems pass on both grids.
- **Reported** per system and grid: the cases compared; both undefined;
  engine only undefined; Swiss only undefined; the median, 95th percentile and
  largest |d|; the count over 0.01″.

## Gate A: co-ascendants and the polar ascendant (capability 2)

- **Engine:** the equatorial ascendant, Walter Koch's co-ascendant, Michael
  Munkasey's co-ascendant and Munkasey's polar ascendant for the case.
- **Swiss:** `swe.houses_armc(θ, φ, ε, b'E')`, `ascmc[4]` to `ascmc[7]`.
- **Metric:** the angular difference across the seam, in arcseconds.
- **Tolerance:** 0.01″ (M5).
- **Grids:** L (5,616 cases) and G (20,000 cases; the body is not used).
- **Pass:** no case over 0.01″ for any of the four points on either grid. A
  value that is not finite on either side is a failure.
- **Reported:** per point and grid, median, 95th percentile, largest, count
  over 0.01″.

## Gate S: cusp and angle speeds against Swiss (capability 3)

- **Engine:** the analytic speeds of the twelve cusps of the system, and of
  the ascendant and the midheaven, in degrees per day: the derivative with
  respect to the RAMC times the sidereal rate, 360.98564736629° per day, with
  the latitude and the obliquity held fixed. Where Placidus or Koch is
  undefined (inside the polar circle) the engine falls back, and the case is
  counted as undefined on the engine's side.
- **Swiss:** `swe.houses_armc_ex2(θ, φ, ε, hsys)`: `cusps_speed[0..11]`,
  `ascmc_speed[0]` (ascendant) and `ascmc_speed[1]` (midheaven). Undefined when
  it raises `swisseph.Error`.
- **Rate:** Swiss reports the speed of the RAMC itself, `ascmc_speed[2]` = r.
  Its speeds are rescaled to the engine's rate before comparing,
  v′ = v × 360.98564736629 / r, so the choice of rate constant does not enter.
  If r is not finite or not positive, the unscaled speeds are compared and the
  README says so.
- **Metric:** Δ = v_engine − v′ in degrees per day; per case, the largest
  |Δ| over the twelve cusps, and the ascendant and midheaven separately.
- **Tolerance:** |Δ| ≤ 0.004°/day + 10⁻⁶ |v′|.
  **Reason.** The M5 rule holds positions to 0.01″. A speed is used to carry a
  cusp or an angle through a short time. Birth times are recorded to the
  minute, and an error of 0.004°/day (14.4″ a day) moves a cusp carried
  through one minute by 0.01″. Near the polar circle cusps can move thousands
  of degrees a day; there the relative term, one part in a million, allows
  0.0036″ of error for each degree the cusp is carried. Swiss Ephemeris does
  not document how `houses_ex2` computes its speeds; gate F checks the
  engine's speeds at the same tolerance without Swiss.
- **Grids:** L and G, every system.
- **Pass:** no cusp, ascendant or midheaven over the tolerance and no status
  disagreement, for every system on both grids.
- **Reported:** per system and grid, the cases compared, the status counts,
  and the median, 95th percentile and largest |Δ| and |Δ| / |v′|, and the
  count over the tolerance; the same for the ascendant and the midheaven.

## Gate F: speeds against a central difference of the engine's own cusps

- For each case of L and G, each system, each cusp, and the ascendant and the
  midheaven: c(θ) is the engine's own value (`computeHouses`, and
  `computeAngles` for the angles) at the case's inputs with the RAMC set to
  θ; D(h) = [c(θ + h) − c(θ − h)] / (2h), the difference taken across the
  seam; h = 0.001° of RAMC; the Richardson value R = [4 D(h/2) − D(h)] / 3;
  v_F = R × 360.98564736629.
- **Void cases:** where c(θ ± h) or c(θ ± h/2) differs from c(θ) by more
  than 1° (a jump: a whole-sign cusp changing sign, the ascendant turning
  half a circle inside the polar circle), or where the system falls back at
  θ. Void cases are counted and reported, not compared.
- **Tolerance:** the same as gate S, with v_F for v′.
- **Pass:** no compared value over the tolerance, every system, both grids.

## Gate R: planetary returns (capability 4)

- **Engine:** `planetaryReturns(natal, body, from, to)` with its default
  options, for invented natal charts: invented instants and invented places.
  No fixture describes a real person's birth.
- **Horizons fixtures.** One fixture for each body. The Sun: a window with
  three solar returns. The Moon: a window with four lunar returns. Mercury to
  Pluto: a window with a pass of three returns (direct, retrograde, direct).
  For these the natal instant is chosen from Horizons's own longitudes, not
  the engine's: an instant at which the body stood at the middle longitude of
  a retrograde loop that falls in the window, so that both stations of the
  loop are at least 0.1° from the natal degree and the number of returns
  cannot change within the ephemeris error. No natal instant or window falls
  between 1962 and 1972, where Horizons's UT is UTC and the engine reads the
  instant as UT1.
- **Expected values:** Horizons `QUANTITIES='31'` (ObsEcLon: the apparent
  geocentric ecliptic longitude of date), `CENTER='500@399'`, DE441, times in
  UT. The natal longitude is Horizons's value at the natal instant. Around
  each crossing Horizons tabulates the longitude every hour for ±2 days (every
  5 minutes for ±2 hours for the Moon); the crossing instant is found by
  4-point Lagrange interpolation of the unwrapped longitude and bisection to
  1 ms, and its speed v_H by the central difference of the table.
- **Checks:**
  - R1: every result carries its completeness verdict, `status`, and it is
    `"complete"`.
  - R2: the returns, in time order, have the same directions (the
    `retrograde` flag) as Horizons's crossings, so the counts are equal. A
    missed or extra return fails.
  - R3: each return is within τ / |v_H| of Horizons's instant, with
    τ = 6″ for the Sun, 8″ for the Moon and 45″ for Mercury to Pluto.
    **Reason:** a return is where the engine's longitude equals its own natal
    longitude, and each of the two can differ from DE441 by the ephemeris
    error E, so Horizons's longitude at the engine's return can differ from
    Horizons's natal longitude by up to 2E. The largest differences measured
    for the engine are 1.354″ (Sun), 3.874″ (Moon) and 18.846″ (Neptune) in
    longitude over the conformance suite's 240 L1 vectors against DE441, and
    2.7″ (Sun), 3.4″ (Moon) and 21.6″ (Saturn) in declination at 20,000
    instants against DE440s (README, *Chart declinations*). τ is twice the
    larger figure for the body's class, rounded up. It checks that the search
    found the right root; it does not measure the ephemeris.
  - R4: the same search under a `maxSamples` smaller than its coarse scan
    returns `status: "refused"` with no returns.
- **USNO fixture:** an invented native born at the March equinox of 2000 as
  USNO publishes it, 2000-03-20 07:35 UT. In the window 2000-06-01 to
  2004-06-01 the engine must return exactly four solar returns, all direct,
  each within 210 s of USNO's March equinox of 2001, 2002, 2003 and 2004
  (13:31, 19:16, 01:00 on 21 March, 06:49). **Reason:** USNO rounds every
  instant to the minute: ±30 s at the birth, which moves every return by as
  much, and ±30 s at each equinox; the ephemeris error, 2 × 2.7″ at the Sun's
  0.0411″ a second, adds 131 s; 30 + 30 + 131 = 191 s, and 210 s leaves room
  for the Sun's speed varying by 3% through the year.
- **Pass:** every check on every fixture.

A consistency check, labelled as one and not a gate against an arbiter: the
returns agree with a plain scan of the engine's own longitudes at a fine step
(0.005 day for the Moon, 0.02 day for the others), every sign change bisected
to the millisecond, including natal longitudes placed within 10⁻³° to 10⁻⁶°
of a station, where two returns lie close together. It checks that the
search misses no crossing of the longitudes it searches.

## Gate B: bundles and existing behaviour

- The root entry's import graph, counted as
  `scripts/verify-package-contents.mjs` counts it, stays at 95,273 bytes, and
  its files under `dist/` are byte-identical to rc.15's (SHA-256).
- `./houses` gets a budget of its measured graph plus 5 to 11 per cent, stated
  with its reason; `./timing` stays within its 120,000-byte budget; the
  package stays within its 700,000-byte cap.
- Every existing test passes unchanged, and no released function's output
  changes.
