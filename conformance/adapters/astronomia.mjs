#!/usr/bin/env node
/**
 * Conformance adapter for astronomia (../SPEC.md).
 *
 * Uses astronomia's own public VSOP87B planetary ephemeris (solar.apparentVSOP87
 * for the Sun; elliptic.position with Equatorial.toEcliptic at true obliquity
 * for Mercury through Neptune), deltat.deltaT for Delta T, and julian calendar
 * functions for JDN conversions. Its lunar positions lack nutation and
 * its astrometric Pluto positions use J2000.
 *
 *   (cd conformance/adapters/astronomia && npm ci)
 *   node conformance/harness/run.mjs \
 *     --adapter "node conformance/adapters/astronomia.mjs" \
 *     --out conformance/results/astronomia.json
 */
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';

const require = createRequire(new URL('./astronomia/package.json', import.meta.url));
const astronomiaPkg = require('astronomia/package.json');
const { deltat, elliptic, julian, moon, planetposition, solar } = require('astronomia');
const vsopData = require('astronomia/data').default;

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
    return { unsupported: 'moonposition.position and elp.position omit nutation. L1 requires an apparent true-of-date Moon position.' };
  }
  if (body === 'Pluto') {
    return { unsupported: 'pluto.astrometric returns J2000 astrometric coordinates. L1 requires an apparent true-of-date Pluto position.' };
  }
  if (!Object.hasOwn(PLANETS, body)) {
    return { unsupported: `astronomia has no VSOP87B series for ${body}` };
  }
  const eq = elliptic.position(PLANETS[body], EARTH, jde);
  // The published moon.Moon type exposes true obliquity of date as ε.
  const ecl = eq.toEcliptic(new moon.Moon(jde).ε);
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
  'event.ingress': () => ({ unsupported: 'This adapter measures positions and time/calendar conversions. solstice.longitude takes a year and the Sun, without a general planetary ingress search.' }),
  'event.station': () => ({ unsupported: 'astronomia has no planetary station search function' }),
  'event.lunation': () => ({ unsupported: 'moonphase returns the phase nearest a decimal year. This adapter has no window search for the first lunation.' }),
};

const handshake = {
  adapter: {
    name: 'astronomia',
    version: '0.1.1',
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
  const handler = Object.hasOwn(HANDLERS, request.kind) && HANDLERS[request.kind];
  let response;
  try {
    response = handler ? handler(request.input) : { unsupported: `unknown kind ${request.kind}` };
  } catch (error) {
    response = { error: `${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` };
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, ...response })}\n`);
}
