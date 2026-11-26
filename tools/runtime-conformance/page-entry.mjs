/*
 * The browser page's module, bundled by browser-adapter.mjs with esbuild. It
 * answers conformance requests with the adapter's own handlers
 * (conformance/adapters/zodiacs-engine.mjs, createHandlers) over the built
 * engine in ../../dist, and computes the synthetic receipts.
 */
import * as engine from '@zodiacs/engine';
import { setDefaultEphemeris } from '../../dist/index.js';
import { useDe440 } from '../../dist/de440-pack.js';
import * as geo from '../../dist/geo.js';
import * as calc from '../../dist/calc.js';
import * as receipt from '../../dist/receipt.js';
import { createHandlers, defaultSourceText } from '../../conformance/adapters/zodiacs-engine.mjs';
import { receiptTexts } from './receipt-cases.mjs';

const core = __RUNTIME_CONFORMANCE_ENTRY__ === 'core';
// As the Node adapter does: core on astronomy-engine, and the root on the shipped
// DE440 pack, which from 3.0.0 useDe440() makes the default source.
if (core) setDefaultEphemeris('astronomy-engine');
else useDe440();
const handlers = createHandlers({ engine, geo, calcEntry: async () => calc });

globalThis.runtimeConformance = Object.freeze({
  /** The adapter's first line, with the browser's facts for the host's. */
  header() {
    return {
      name: core ? 'zodiacs-engine-core' : 'zodiacs-engine',
      version: '0.3.0',
      engine: core ? '@zodiacs/engine/core, on astronomy-engine' : '@zodiacs/engine',
      engineVersion: engine.ENGINE_VERSION,
      configuration: {
        ephemeris: core ? `${engine.EPHEMERIS.name} ${engine.EPHEMERIS.version}` : defaultSourceText(engine),
        deltaTModel: engine.DELTA_T_MODEL,
        timeBasis: 'from 1972 to 2027-10-02, TT from the leap seconds and UT1 from IERS UT1 − UTC; the ΔT model otherwise',
        timeZones: `before 1970 the shipped tzdb ${geo.TZDB.version} history (${geo.TZDB.form}), loaded with prepareLocalTime; from 1970 the host's Intl time zone data (this browser's; its tzdb version is not exposed)`,
        positions: core
          ? 'natalChart with timeScale "tt", outside withEphemeris: the requested instant is read as TT'
          : 'a plain natalChart with timeScale "tt", outside withEphemeris: the requested instant is read as TT; from the shipped pack, Mars to Pluto are system barycentres, as the vectors are',
        angles: 'natalChart with timeScale "ut1": the requested instant is read as UT1',
        host: 'a browser page: the same handlers as the Node adapter (createHandlers), bundled with esbuild by tools/runtime-conformance/browser-adapter.mjs',
      },
    };
  },
  /** One request, answered as the Node adapter's loop answers it. */
  async answer(request) {
    try {
      const handler = handlers[request.kind];
      return { id: request.id, ...(handler ? await handler(request.input) : { unsupported: `unknown kind ${request.kind}` }) };
    } catch (error) {
      return { id: request.id, error: error instanceof Error ? error.message : String(error) };
    }
  },
  receipts() {
    return receiptTexts(engine, receipt);
  },
});
