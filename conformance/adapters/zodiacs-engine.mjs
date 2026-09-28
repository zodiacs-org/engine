#!/usr/bin/env node
/*
 * Conformance adapter for @zodiacs/engine, speaking the protocol in
 * ../SPEC.md. It answers from the engine's public entry points only
 * (`@zodiacs/engine` and `@zodiacs/engine/geo`) and computes nothing itself
 * beyond unit conversions; a kind the engine has no function for is reported
 * as unsupported.
 *
 * By default it loads the build in ../../dist (run `npm run build` first).
 * ZODIACS_ENGINE_DIST points it at another build, for example an extracted
 * release archive's `package/dist`.
 */
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL('../../dist', import.meta.url)));
const engine = await import(pathToFileURL(resolve(dist, 'index.js')).href);
const geo = await import(pathToFileURL(resolve(dist, 'geo.js')).href);

const UNIX_EPOCH_JD = 2440587.5;
const J2000_JD = 2451545.0;
const DAY_MS = 86_400_000;
const SYSTEMS = { 'whole-sign': 'whole' };

/** A Julian date as the nearest JavaScript millisecond. */
const dateOfJd = (jd) => new Date(Math.round((jd - UNIX_EPOCH_JD) * DAY_MS));

/** Whole seconds when the engine's minutes are an integral number of seconds. */
function seconds(minutes) {
  const value = minutes * 60;
  return Math.abs(value - Math.round(value)) < 1e-6 ? Math.round(value) : value;
}

function chartAt(input, houseSystem = 'porphyry') {
  return engine.natalChart({
    utc: dateOfJd(input.jd_ut1),
    timeKnown: true,
    latitude: input.lat,
    longitude: input.lon,
    houseSystem,
  });
}

const flagsMeta = (chart) => (chart.flags.length ? { meta: { flags: chart.flags } } : {});

const handlers = {
  'position.apparent.ecliptic-true-of-date'(input) {
    // With ΔT pinned at zero the engine's clock reads the given instant as TT.
    const chart = engine.natalChart({ utc: dateOfJd(input.jd_tt), timeKnown: false, deltaT: 0 });
    const body = chart.bodies.find((candidate) => candidate.body === input.body);
    if (!body) return { unsupported: `no body ${input.body}` };
    return { output: { lon: body.lon, lat: body.lat }, ...flagsMeta(chart) };
  },

  'angles.asc-mc'(input) {
    const chart = chartAt(input);
    return { output: { asc: chart.angles.asc, mc: chart.angles.mc }, ...flagsMeta(chart) };
  },

  'angles.vertex-east-point'(input) {
    const chart = chartAt(input);
    const { points } = engine.chartPoints(chart);
    const vertex = points.find((point) => point.point === 'Vertex');
    const eastPoint = points.find((point) => point.point === 'East Point');
    return { output: { vertex: vertex.lon, east_point: eastPoint.lon }, ...flagsMeta(chart) };
  },

  'houses.cusps'(input) {
    const system = SYSTEMS[input.system] ?? input.system;
    if (!engine.HOUSE_SYSTEMS.includes(system)) return { unsupported: `no house system ${input.system}` };
    const chart = chartAt(input, system);
    if (chart.flags.includes('polar-fallback')) {
      return { output: { status: 'undefined' }, meta: { flags: chart.flags, substituted: chart.houses.system } };
    }
    return { output: { cusps: chart.houses.cusps }, ...flagsMeta(chart) };
  },

  'time.zone-offset'(input) {
    const [date, clock] = input.local.split('T');
    if (!clock.endsWith(':00')) return { unsupported: 'the engine takes local times to the minute' };
    const time = clock.slice(0, 5);
    const resolution = geo.resolveLocalToUtc(date, time, input.zone);
    if (resolution.flags.includes('dst-gap')) return { output: { status: 'nonexistent' }, meta: { flags: resolution.flags } };
    if (resolution.flags.includes('dst-fold')) {
      // The engine resolves a repeated local time to its earlier instant only;
      // it has no public way to give the later one, so the pair is not answered.
      return { unsupported: 'the engine resolves a repeated local time to its earlier instant and does not return the later one', meta: { flags: resolution.flags, earlierOffsetS: seconds(resolution.offsetMinutes) } };
    }
    return {
      output: { status: 'ok', utc_offset_s: seconds(resolution.offsetMinutes) },
      ...(resolution.flags.length ? { meta: { flags: resolution.flags } } : {}),
    };
  },

  'time.local-mean-time'() {
    return { unsupported: "the engine resolves local times against a zone's history only; it has no birthplace local mean time" };
  },

  'time.tt-minus-utc'(input) {
    if (/:60(\.\d+)?Z$/u.test(input.utc)) return { unsupported: 'the engine takes instants as JavaScript dates, which have no leap second' };
    const ut = (Date.parse(input.utc) - (J2000_JD - UNIX_EPOCH_JD) * DAY_MS) / DAY_MS;
    const deltaT = engine.deltaTAt(ut);
    return { output: { tt_minus_utc_s: deltaT.seconds }, meta: { note: 'the engine reads UTC as UT1, so its TT − UTC is its ΔT', segment: deltaT.segment } };
  },

  'time.delta-t'(input) {
    const deltaT = engine.deltaTAt(input.jd_ut1 - J2000_JD);
    return { output: { delta_t_s: deltaT.seconds }, meta: { segment: deltaT.segment } };
  },

  'calendar.to-jdn'() {
    return { unsupported: 'the engine has no calendar conversion in its public API' };
  },

  'calendar.from-jdn'() {
    return { unsupported: 'the engine has no calendar conversion in its public API' };
  },
};

process.stdout.write(`${JSON.stringify({
  adapter: {
    name: 'zodiacs-engine',
    version: '0.1.0',
    engine: '@zodiacs/engine',
    engineVersion: engine.ENGINE_VERSION,
    configuration: {
      ephemeris: `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}`,
      deltaTModel: engine.DELTA_T_MODEL,
      timeZones: `the host's Intl time zone data (Node ${process.versions.node}, ICU ${process.versions.icu}, tz ${process.versions.tz})`,
      positions: 'natalChart with ΔT pinned at 0 s, so the requested instant is read as TT',
      angles: 'natalChart at the UT1 instant (the engine reads its instant as UT1)',
    },
  },
})}\n`);

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  const request = JSON.parse(line);
  let response;
  try {
    const handler = handlers[request.kind];
    response = handler ? handler(request.input) : { unsupported: `unknown kind ${request.kind}` };
  } catch (error) {
    response = { error: error instanceof Error ? error.message : String(error) };
  }
  process.stdout.write(`${JSON.stringify({ id: request.id, ...response })}\n`);
}
