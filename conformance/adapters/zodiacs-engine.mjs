#!/usr/bin/env node
/*
 * Conformance adapter for @zodiacs/engine, speaking the protocol in
 * ../SPEC.md. It answers from the engine's public entry points only
 * (`@zodiacs/engine`, or `@zodiacs/engine/core` with `--entry core`, and
 * `@zodiacs/engine/geo`) and computes nothing itself
 * beyond unit conversions; a kind the engine has no function for is reported
 * as unsupported.
 *
 * By default it loads the build in ../../dist (run `npm run build` first).
 * ZODIACS_ENGINE_DIST points it at another build, for example an extracted
 * release archive's `package/dist`.
 *
 * Positions. From 1.1.0-rc.9 a plain call computes on the sealed DE440 pack
 * the package ships (docs/de440.md), and by default the adapter answers the
 * position requests the way an application would: a plain `natalChart`, with
 * nothing opened, supplied or fetched. Every other kind is answered the same
 * way, so their bodies are the pack's too. From 1.1.0-rc.10 every chart names
 * its ephemeris, so each position's meta carries it on either run, and a
 * fallback's flag with it. Two other runs can be asked for:
 *
 * - `--ephemeris astronomy-engine` (an argument of this script) first calls
 *   `setDefaultEphemeris("astronomy-engine")`, so that every request is
 *   answered from astronomy-engine, as the engine answers outside the pack's
 *   years and as every build before 1.1.0-rc.9 answered. A build without
 *   `setDefaultEphemeris` (an archive before 1.1.0-rc.9, through
 *   ZODIACS_ENGINE_DIST) is such a build, and runs this way whatever the
 *   argument.
 * - ZODIACS_ENGINE_DE440_PACK and ZODIACS_ENGINE_DE440_SHA256 (both, or
 *   neither) answer the position requests from a sealed DE440 pack the
 *   caller supplies: the adapter opens it with `@zodiacs/engine/de440`, which
 *   refuses it unless its SHA-256 is the one given, and computes inside the
 *   root's `withEphemeris`.
 * - `--entry core` (an argument of this script) answers from
 *   `@zodiacs/engine/core` (`core.js` in place of `index.js`), the entry that
 *   carries no pack and computes on astronomy-engine; its verdicts are held
 *   to `conformance/results/zodiacs-engine-astronomy-engine.json`. Not
 *   together with a supplied pack.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

const flagsMeta = (chart) => (chart.flags.length ? { meta: { flags: chart.flags } } : {});

/**
 * The request handlers, one per kind, over the engine's root entry point, or
 * its core entry point with `--entry core` (`engine`), and its geo entry point
 * (`geo`); `de440Source` is the caller's DE440 source for the position
 * requests, or null. Exported so that another
 * host, such as a browser page in tools/runtime-conformance, answers the same
 * requests with the same code; run as a script, this file answers with it.
 */
export function createHandlers({ engine, geo, de440Source = null }) {
  function chartAt(input, houseSystem = 'porphyry') {
    // The instant is given as UT1; from 0.1.1-rc.15 the engine reads an instant
    // as UTC unless told its scale.
    return engine.natalChart({
      utc: dateOfJd(input.jd_ut1),
      timeScale: 'ut1',
      timeKnown: true,
      latitude: input.lat,
      longitude: input.lon,
      houseSystem,
    });
  }

  return {
    'position.apparent.ecliptic-true-of-date'(input) {
      // The instant is given as TT, and the engine reads it on that scale.
      const compute = () => engine.natalChart({ utc: dateOfJd(input.jd_tt), timeScale: 'tt', timeKnown: false });
      const chart = de440Source ? engine.withEphemeris(de440Source, compute) : compute();
      const body = chart.bodies.find((candidate) => candidate.body === input.body);
      if (!body) return { unsupported: `no body ${input.body}` };
      const meta = { ...(chart.flags.length ? { flags: chart.flags } : {}), ...(chart.ephemeris ? { ephemeris: chart.ephemeris } : {}) };
      return { output: { lon: body.lon, lat: body.lat }, ...(Object.keys(meta).length ? { meta } : {}) };
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

    async 'time.zone-offset'(input) {
      const [date, clock] = input.local.split('T');
      if (!clock.endsWith(':00')) return { unsupported: 'the engine takes local times to the minute' };
      const time = clock.slice(0, 5);
      // Before 1970 the engine reads its shipped tzdb history, which the caller
      // loads first; from 1970 this resolves at once.
      await geo.prepareLocalTime(date, input.zone);
      const resolution = geo.resolveLocalToUtc(date, time, input.zone);
      const meta = { flags: resolution.flags, zone: resolution.zone.source, dataForm: resolution.zone.dataForm };
      if (resolution.jump?.kind === 'gap') return { output: { status: 'nonexistent' }, meta: { ...meta, cause: resolution.jump.cause } };
      if (resolution.jump?.kind === 'fold') {
        // A repeated wall time resolves to its earlier instant; the transition
        // the engine reports gives the offsets before and after it, that is of
        // the earlier and the later reading.
        const { transition } = resolution;
        if (!transition || transition.offsetBeforeMinutes !== resolution.offsetMinutes) {
          return { error: 'a fold without the transition that makes it' };
        }
        return {
          output: { status: 'ambiguous', utc_offsets_s: [seconds(transition.offsetBeforeMinutes), seconds(transition.offsetAfterMinutes)] },
          meta: { ...meta, cause: resolution.jump.cause },
        };
      }
      return { output: { status: 'ok', utc_offset_s: seconds(resolution.offsetMinutes) }, meta };
    },

    'time.local-mean-time'(input) {
      if (typeof geo.localMeanTimeOffset !== 'function') return { unsupported: 'this build has no localMeanTimeOffset' };
      return { output: { utc_offset_s: geo.localMeanTimeOffset(input.lon) } };
    },

    'time.tt-minus-utc'(input) {
      if (/:60(\.\d+)?Z$/u.test(input.utc)) return { unsupported: 'the engine takes instants as JavaScript dates, which have no leap second' };
      // TT − UTC is the chart's ΔT (TT − UT1) plus its UT1 − UTC; before 1972
      // the engine reads UTC as UT1, and there the second term is zero.
      const { deltaT, timeScale } = engine.natalChart({ utc: input.utc, timeKnown: false });
      return {
        output: { tt_minus_utc_s: deltaT.seconds + (timeScale.ut1MinusUtc?.seconds ?? 0) },
        meta: { basis: timeScale.basis, leapSeconds: timeScale.leapSeconds, deltaTModel: deltaT.model },
      };
    },

    'time.delta-t'(input) {
      // ΔT as a chart at that UT1 instant has it, on the engine's time basis.
      const { deltaT } = engine.natalChart({ utc: dateOfJd(input.jd_ut1), timeScale: 'ut1', timeKnown: false });
      return { output: { delta_t_s: deltaT.seconds }, meta: { model: deltaT.model, segment: deltaT.segment } };
    },

    // Years, months and days in and out as the vectors give them, in
    // astronomical year numbering (year 0 exists; -4712 is 4713 BC).
    'calendar.to-jdn'(input) {
      if (typeof geo.julianDayNumber !== 'function') return { unsupported: 'this build has no julianDayNumber' };
      const { calendar, year, month, day } = input;
      return { output: { jdn: geo.julianDayNumber({ year, month, day }, calendar) } };
    },

    'calendar.from-jdn'(input) {
      if (typeof geo.dateOfJulianDayNumber !== 'function') return { unsupported: 'this build has no dateOfJulianDayNumber' };
      const { year, month, day } = geo.dateOfJulianDayNumber(input.jdn, input.calendar);
      return { output: { year, month, day } };
    },
  };
}

const NAMES = { default: 'zodiacs-engine', supplied: 'zodiacs-engine-de440', 'astronomy-engine': 'zodiacs-engine-astronomy-engine', core: 'zodiacs-engine-core' };
const ENGINES = {
  default: '@zodiacs/engine',
  supplied: '@zodiacs/engine with a DE440 pack the caller supplies',
  'astronomy-engine': '@zodiacs/engine on astronomy-engine',
  core: '@zodiacs/engine/core, on astronomy-engine',
};
/** What the default source is, from the engine's own report of it. */
export function defaultSourceText(engine) {
  const { de440 } = engine.defaultEphemeris();
  if (!de440.opened) return `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}: the shipped DE440 pack did not open (${de440.error})`;
  return `the default source: jpl-de440 from the sealed pack the package ships, SHA-256 ${de440.version}, for instants from ${de440.fromTtDays} to ${de440.toTtDays} days of TT from J2000.0; ${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version} outside them`;
}

/** Whether this file is the program being run, rather than a module another one imports. */
function runAsScript() {
  const argv = globalThis.process?.argv;
  if (!Array.isArray(argv) || typeof argv[1] !== 'string') return false;
  try {
    return realpathSync(resolve(argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (runAsScript()) {
  const dist = resolve(process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL('../../dist', import.meta.url)));
  const entryArgument = process.argv.indexOf('--entry');
  const entry = entryArgument === -1 ? null : process.argv[entryArgument + 1];
  if (entry !== null && entry !== 'core') {
    console.error('zodiacs-engine adapter: --entry takes core');
    process.exit(2);
  }
  const engine = await import(pathToFileURL(resolve(dist, entry === 'core' ? 'core.js' : 'index.js')).href);
  const geo = await import(pathToFileURL(resolve(dist, 'geo.js')).href);

  const packPath = process.env.ZODIACS_ENGINE_DE440_PACK;
  const packDigest = process.env.ZODIACS_ENGINE_DE440_SHA256;
  if (Boolean(packPath) !== Boolean(packDigest)) {
    console.error('zodiacs-engine adapter: set ZODIACS_ENGINE_DE440_PACK and ZODIACS_ENGINE_DE440_SHA256 together');
    process.exit(2);
  }
  const ephemerisArgument = process.argv.indexOf('--ephemeris');
  const asked = ephemerisArgument === -1 ? null : process.argv[ephemerisArgument + 1];
  if ((asked !== null && asked !== 'astronomy-engine') || (asked && packPath)) {
    console.error('zodiacs-engine adapter: --ephemeris takes astronomy-engine, and not together with a supplied pack');
    process.exit(2);
  }
  if (entry === 'core' && packPath) {
    console.error('zodiacs-engine adapter: --entry core does not take a supplied pack');
    process.exit(2);
  }
  /**
   * Where the requests are answered from: "default" (a plain call: the shipped
   * DE440 pack inside its years), "supplied" (the caller's pack, for the
   * position requests), "astronomy-engine", or "core" (a plain call to
   * `@zodiacs/engine/core`, which computes on astronomy-engine).
   */
  const mode = packPath ? 'supplied' : entry === 'core' ? 'core' : asked === 'astronomy-engine' || typeof engine.setDefaultEphemeris !== 'function' ? 'astronomy-engine' : 'default';
  /** The caller's DE440 source for the position requests, or null. */
  let de440Source = null;
  if (mode === 'supplied') {
    const de440 = await import(pathToFileURL(resolve(dist, 'de440.js')).href);
    de440Source = await de440.openDe440Pack(new Uint8Array(readFileSync(resolve(packPath))), { expectDigest: packDigest });
  } else if (mode === 'astronomy-engine' && typeof engine.setDefaultEphemeris === 'function') {
    engine.setDefaultEphemeris('astronomy-engine');
  }

  const handlers = createHandlers({ engine, geo, de440Source });

  process.stdout.write(`${JSON.stringify({
    adapter: {
      name: NAMES[mode],
      version: '0.3.0',
      engine: ENGINES[mode],
      engineVersion: engine.ENGINE_VERSION,
      configuration: {
        ephemeris: de440Source
          ? `positions from ${de440Source.ephemeris.name}, a sealed pack the caller supplies (@zodiacs/engine/de440), SHA-256 ${de440Source.ephemeris.version}, through withEphemeris; ${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version} is not used for them`
          : mode === 'default' ? defaultSourceText(engine) : `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}`,
        deltaTModel: engine.DELTA_T_MODEL,
        timeBasis: 'from 1972 to 2027-10-02, TT from the leap seconds and UT1 from IERS UT1 − UTC; the ΔT model otherwise',
        timeZones: `before 1970 the shipped tzdb ${geo.TZDB.version} history (${geo.TZDB.form}), loaded with prepareLocalTime; from 1970 the host's Intl time zone data (Node ${process.versions.node}, ICU ${process.versions.icu}, tz ${process.versions.tz})`,
        positions: de440Source
          ? 'natalChart with timeScale "tt" inside withEphemeris: the requested instant is read as TT; Mars to Pluto are system barycentres, as the vectors are'
          : mode === 'default'
            ? 'a plain natalChart with timeScale "tt", outside withEphemeris: the requested instant is read as TT; from the shipped pack, Mars to Pluto are system barycentres, as the vectors are'
            : 'natalChart with timeScale "tt", outside withEphemeris: the requested instant is read as TT',
        angles: 'natalChart with timeScale "ut1": the requested instant is read as UT1',
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
      response = handler ? await handler(request.input) : { unsupported: `unknown kind ${request.kind}` };
    } catch (error) {
      response = { error: error instanceof Error ? error.message : String(error) };
    }
    process.stdout.write(`${JSON.stringify({ id: request.id, ...response })}\n`);
  }
}
