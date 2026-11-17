/*
 * The browser page's module, bundled by browser-adapter.mjs with esbuild. It
 * answers conformance requests with the adapter's own handlers
 * (conformance/adapters/zodiacs-engine.mjs, createHandlers) over the built
 * engine in ../../dist, and computes the synthetic receipts.
 */
import * as engine from '../../dist/index.js';
import * as geo from '../../dist/geo.js';
import * as receipt from '../../dist/receipt.js';
import { createHandlers, defaultSourceText } from '../../conformance/adapters/zodiacs-engine.mjs';
import { receiptTexts } from './receipt-cases.mjs';

const handlers = createHandlers({ engine, geo });

globalThis.runtimeConformance = Object.freeze({
  /** The adapter's first line, as the Node adapter writes it in its default mode, with the browser's facts for the host's. */
  header() {
    return {
      name: 'zodiacs-engine',
      version: '0.3.0',
      engine: '@zodiacs/engine',
      engineVersion: engine.ENGINE_VERSION,
      configuration: {
        ephemeris: defaultSourceText(engine),
        deltaTModel: engine.DELTA_T_MODEL,
        timeBasis: 'from 1972 to 2027-10-02, TT from the leap seconds and UT1 from IERS UT1 − UTC; the ΔT model otherwise',
        timeZones: `before 1970 the shipped tzdb ${geo.TZDB.version} history (${geo.TZDB.form}), loaded with prepareLocalTime; from 1970 the host's Intl time zone data (this browser's; its tzdb version is not exposed)`,
        positions: 'a plain natalChart with timeScale "tt", outside withEphemeris: the requested instant is read as TT; from the shipped pack, Mars to Pluto are system barycentres, as the vectors are',
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
