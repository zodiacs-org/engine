// The Li Chun instant: the moment the Sun's apparent geocentric ecliptic
// longitude of date reaches 315 degrees.
//
// The Sun is the "higher accuracy" solar series of Jean Meeus, Astronomical
// Formulae for Calculators (4th ed., 1988), chapter 18: mean longitude, mean
// anomaly and equation of centre, five periodic perturbation terms (Venus,
// Jupiter, the Moon and a long-period term) and the apparent-place
// correction for aberration and nutation. It is a published analytical
// series, not a fit to a JPL ephemeris, so JPL Horizons can serve as its
// independent arbiter. The measured differences are in
// docs/evidence/chinese-zodiac-2026-10-24/.
//
// Universal Time is TT minus Delta T from the polynomial expressions of
// Espenak and Meeus (NASA, Five Millennium Canon of Solar Eclipses, 2006).

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2_440_587.5;
const MEEUS_1900_JD = 2_415_020.0;
/** Mean motion of the Sun in longitude, degrees per day. */
const SUN_DEG_PER_DAY = 0.98564736;

const normalize = (degrees) => ((degrees % 360) + 360) % 360;

/** Apparent geocentric ecliptic longitude of the Sun of date, degrees, at a Julian Ephemeris Day. */
export function apparentSunLongitude(jde) {
  const T = (jde - MEEUS_1900_JD) / 36_525;
  const L = 279.69668 + 36_000.76892 * T + 0.0003025 * T * T;
  const M = (358.47583 + 35_999.04975 * T - 0.00015 * T * T - 0.0000033 * T * T * T) * RAD;
  const C = (1.91946 - 0.004789 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.020094 - 0.0001 * T) * Math.sin(2 * M)
    + 0.000293 * Math.sin(3 * M);
  const A = (153.23 + 22_518.7541 * T) * RAD;
  const B = (216.57 + 45_037.5082 * T) * RAD;
  const J = (312.69 + 32_964.3577 * T) * RAD;
  const D = (350.74 + 445_267.1142 * T - 0.00144 * T * T) * RAD;
  const E = (231.19 + 20.2 * T) * RAD;
  const perturbations = 0.00134 * Math.cos(A) + 0.00154 * Math.cos(B) + 0.002 * Math.cos(J)
    + 0.00179 * Math.sin(D) + 0.00178 * Math.sin(E);
  const omega = (259.18 - 1934.142 * T) * RAD;
  return normalize(L + C + perturbations - 0.00569 - 0.00479 * Math.sin(omega));
}

/** Delta T = TT - UT in seconds for a decimal year (Espenak and Meeus 2006), valid 1860 to 2150. */
export function deltaTSeconds(y) {
  if (!(y >= 1860 && y <= 2150)) throw new RangeError('Delta T polynomial covers 1860 to 2150');
  if (y < 1900) {
    const t = y - 1860;
    return 7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3 - 0.0004473624 * t ** 4 + t ** 5 / 233_174;
  }
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y < 2005) {
    const t = y - 2000;
    return 63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3 + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5;
  }
  if (y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t ** 2;
  }
  return -20 + 32 * ((y - 1820) / 100) ** 2 - 0.5628 * (2150 - y);
}

/** Li Chun of a Gregorian year as Terrestrial Time, in milliseconds since 1970-01-01 (TT scale). */
export function liChunTerrestrialMs(year) {
  let jde = UNIX_EPOCH_JD + Date.UTC(year, 1, 4) / DAY_MS;
  for (let i = 0; i < 8; i++) {
    const offset = ((315 - apparentSunLongitude(jde) + 540) % 360) - 180;
    jde += offset / SUN_DEG_PER_DAY;
    if (Math.abs(offset) < 1e-9) break;
  }
  return (jde - UNIX_EPOCH_JD) * DAY_MS;
}

/** Li Chun of a Gregorian year (1860 to 2150) as a UT instant, milliseconds since the Unix epoch. */
export function liChunUtcMs(year) {
  if (!Number.isInteger(year)) throw new TypeError('Year must be an integer');
  const tt = liChunTerrestrialMs(year);
  // Espenak and Meeus evaluate Delta T at y = year + (month - 0.5) / 12; Li Chun is in February.
  return tt - deltaTSeconds(year + 1.5 / 12) * 1000;
}
