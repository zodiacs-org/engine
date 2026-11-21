#!/usr/bin/env node
/**
 * Conformance adapter for astronomia (../SPEC.md).
 *
 * Uses astronomia's own public VSOP87D planetary ephemeris (solar.apparentVSOP87
 * for the Sun; elliptic.position with Equatorial.toEcliptic at true obliquity
 * for Mercury through Neptune), deltat.deltaT for Delta T, and julian calendar
 * functions for JDN conversions. Moon (mean equinox of date / J2000 only) and
 * Pluto (J2000 astrometric only) are reported as unsupported rather than
 * converted outside astronomia's public apparent-position API.
 *
 *   (cd conformance/adapters/astronomia && npm ci)
 *   node conformance/harness/run.mjs \
 *     --adapter "node conformance/adapters/astronomia.mjs" \
 *     --out conformance/results/astronomia.json
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = resolve(HERE, 'astronomia');
const require = createRequire(resolve(PKG_DIR, 'package.json'));

const astronomiaPkg = JSON.parse(
  readFileSync(resolve(PKG_DIR, 'node_modules/astronomia/package.json'), 'utf8'),
);

const { deltat, elliptic, julian, nutation, planetposition, solar } = await import(
  new URL('./astronomia/node_modules/astronomia/src/index.js', import.meta.url)
);
const vsopMod = await import(
  new URL('./astronomia/node_modules/astronomia/data/index.js', import.meta.url)
);
const vsopData = vsopMod.default;

const R2D = 180 / Math.PI;
const EARTH = new planetposition.Planet(vsopData.earth);
const PLANETS = {
  Mercury: new planetposition.Planet(vsopData.mercury),
  Venus: new planetposition.Planet(vsopData.venus),
  Mars: new planetposition.Planet(vsopData.mars),
  Jupiter: new planetposition.Planet(vsopData.jupiter),
  Saturn: new planetposition.Planet(vsopData.saturn),
  Uranus: new planetposition.Planet(vsopData.uranus),
  Neptune: new planetposition.Planet(vsopData.neptune),
};

function norm360(deg) {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

function position(input) {
  const { body, jd_tt: jde } = input;
  if (body === 'Sun') {
    const pos = solar.apparentVSOP87(EARTH, jde);
    return { output: { lon: norm360(pos.lon * R2D), lat: pos.lat * R2D } };
  }
  if (body === 'Moon') {
    return {
      unsupported:
        'astronomia moonposition.position returns mean equinox of date without nutation and elp.Moon returns J2000 inertial coordinates; no public apparent true-of-date Moon function',
    };
  }
  if (body === 'Pluto') {
    return {
      unsupported:
        'astronomia pluto.astrometric returns J2000 astrometric coordinates only; no public apparent true-of-date Pluto function',
    };
  }
  const planet = PLANETS[body];
  if (!planet) {
    return { unsupported: `astronomia has no VSOP87D series for ${body}` };
  }
  // elliptic.position computes apparent geocentric ecliptic coordinates (light-time,
  // aberration, FK5, nutation) and converts to equatorial with true obliquity;
  // astronomia's own Equatorial.toEcliptic(eps) recovers apparent ecliptic of date.
  const eq = elliptic.position(planet, EARTH, jde);
  const [, dEps] = nutation.nutation(jde);
  const eps = nutation.meanObliquity(jde) + dEps;
  const ecl = eq.toEcliptic(eps);
  return { output: { lon: norm360(ecl.lon * R2D), lat: ecl.lat * R2D } };
}

function deltaT(input) {
  const cal = new julian.Calendar().fromJD(input.jd_ut1);
  return { output: { delta_t_s: deltat.deltaT(cal.toYear()) } };
}

function toJdn(input) {
  const fn = input.calendar === 'gregorian' ? julian.CalendarGregorianToJD : julian.CalendarJulianToJD;
  const jd = fn(input.year, input.month, input.day + 0.5);
  return Number.isInteger(jd) ? { output: { jdn: jd } } : { error: `non-integer JDN ${jd}` };
}

function fromJdn(input) {
  const fn = input.calendar === 'gregorian' ? julian.JDToCalendarGregorian : julian.JDToCalendarJulian;
  const cal = fn(input.jdn);
  const day = Math.floor(cal.day);
  return { output: { year: cal.year, month: cal.month, day } };
}

const HANDLERS = {
  'position.apparent.ecliptic-true-of-date': position,
  'angles.asc-mc': () => ({ unsupported: 'astronomia has no astrology ascendant or midheaven function' }),
  'angles.vertex-east-point': () => ({ unsupported: 'astronomia has no vertex or east point function' }),
  'houses.cusps': () => ({ unsupported: 'astronomia has no house system functions' }),
  'time.zone-offset': () => ({ unsupported: 'astronomia has no time zone database' }),
  'time.local-mean-time': () => ({ unsupported: 'astronomia has no local mean time offset function' }),
  'time.tt-minus-utc': () => ({ unsupported: 'astronomia has no leap-second table for TT minus UTC' }),
  'time.delta-t': deltaT,
  'calendar.to-jdn': toJdn,
  'calendar.from-jdn': fromJdn,
  'event.ingress': () => ({ unsupported: 'astronomia has no zodiac sign ingress search function' }),
  'event.station': () => ({ unsupported: 'astronomia has no planetary station search function' }),
  'event.lunation': () => ({ unsupported: 'astronomia moonphase solves nearest phase to a decimal year rather than first phase in a TT/UTC window' }),
};

const handshake = {
  adapter: {
    name: 'astronomia',
    version: '0.1.0',
    engine: 'astronomia',
    engineVersion: astronomiaPkg.version,
    configuration: {
      licence: astronomiaPkg.license,
      planetaryTheory: 'VSOP87B (default astronomia/data planet series) via solar.apparentVSOP87 and elliptic.position + Equatorial.toEcliptic at true obliquity',
      deltaT: 'deltat.deltaT (Espenak/Meeus polynomials and shipped IERS table)',
      calendar: 'julian.CalendarGregorianToJD / CalendarJulianToJD and JDToCalendarGregorian / JDToCalendarJulian',
    },
  },
};

process.stdout.write(`${JSON.stringify(handshake)}\n`);
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  const handler = HANDLERS[request.kind];
  let response;
  try {
    response = handler ? handler(request.input) : { unsupported: `unknown kind ${request.kind}` };
  } catch (error) {
    response = { error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` };
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, ...response })}\n`);
}
