// Runs the built package (dist/) on requests read from stdin and writes JSON to
// stdout. Used by swiss_ayanamsa.py and dasha_independent.py; it computes
// nothing itself. Usage: node engine-bridge.mjs [path/to/dist/index.js] < request.json
// The Vedic functions come from the vedic.js entry beside index.js.
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const entry = resolve(process.argv[2] ?? new URL("../../../../dist/index.js", import.meta.url).pathname);
const root = await import(pathToFileURL(entry).href);
const vedic = await import(pathToFileURL(resolve(dirname(entry), "vedic.js")).href);
const engine = { ...root, ...vedic };

let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);

function definitionOf(spec) {
  if (typeof spec === "string") return spec;
  return engine.userAyanamsa(spec);
}

function ayanamsaRows({ definitions, instants, sun, deltaT }) {
  const out = {};
  const options = deltaT === undefined ? {} : { deltaT };
  for (const [key, spec] of Object.entries(definitions)) {
    const definition = definitionOf(spec);
    out[key] = instants.map((ms) => {
      const value = engine.ayanamsa(definition, ms, options);
      return [value.mean, value.true, value.nutation, value.deltaT.seconds, value.julianDateTT];
    });
  }
  // The engine's apparent tropical Sun, to find where an anchor star is near it.
  if (sun) out.sun = instants.map((ms) => engine.positions(ms)[0].lon);
  return out;
}

const flat = (period) => [period.lords.join("/"), period.startMs, period.endMs];

function dashaRows({ cases }) {
  return cases.map(({ id, moon, birthMs, yearLength, probes, expand }) => {
    const sidereal = engine.declareSiderealLongitude(moon, { ayanamsa: "synthetic", at: birthMs });
    const options = { yearLength };
    const vim = engine.vimshottariDasha(sidereal, options);
    const periods = [];
    // Levels 1-3 in full.
    for (const maha of vim.mahadashas) {
      periods.push(flat(maha));
      for (const antar of engine.dashaSubperiods(maha)) {
        periods.push(flat(antar));
        for (const pratyantar of engine.dashaSubperiods(antar)) periods.push(flat(pratyantar));
      }
    }
    // Levels 4 and 5 below the chosen antardasha (by mahadasha and antardasha position).
    const chosen = engine.dashaSubperiods(vim.mahadashas[expand[0]])[expand[1]];
    for (const pratyantar of engine.dashaSubperiods(chosen)) {
      for (const sookshma of engine.dashaSubperiods(pratyantar)) {
        periods.push(flat(sookshma));
        for (const prana of engine.dashaSubperiods(sookshma)) periods.push(flat(prana));
      }
    }
    const chains = probes.map((at) => engine.vimshottariAt(sidereal, at, options).map(flat));
    const yogini = engine.yoginiDasha(sidereal, { ...options, cycles: 2 }).mahadashas.map(flat);
    const ashtottari = engine.ashtottariDasha(sidereal, { ...options, cycles: 2 }).mahadashas.map(flat);
    return { id, balance: vim.balance, periods, chains, yogini, ashtottari };
  });
}

const handlers = { ayanamsa: ayanamsaRows, dasha: dashaRows };
process.stdout.write(JSON.stringify({ engineVersion: engine.ENGINE_VERSION, result: handlers[request.kind](request) }));
