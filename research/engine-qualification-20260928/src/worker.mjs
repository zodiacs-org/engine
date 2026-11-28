// Candidate imports occur only here. This bounded trusted-code process is NOT a security sandbox.
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const PROTOCOL = 'zodiacs.qualification.worker.v1';
const BODIES = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
const errorText = e => String(e?.message ?? e).slice(0,4096);
const assert = (v,m) => { if (!v) throw new Error(m); };
const lon = n => Number.isFinite(n) && n >= 0 && n < 360;
const lat = n => Number.isFinite(n) && Math.abs(n) <= 90;
const send = (type, data = {}) => new Promise((resolve,reject) => process.stdout.write(JSON.stringify({protocol:PROTOCOL,type,...data})+'\n', error => error ? reject(error) : resolve()));
function snapshot(value) {
  if (value === undefined) return null;
  const visit = (v, depth = 0) => {
    assert(depth <= 32, 'API metadata too deeply nested');
    assert(v === null || ['string','boolean','object'].includes(typeof v) || (typeof v === 'number' && Number.isFinite(v)), 'API metadata is not finite JSON');
    if (v && typeof v === 'object') Object.values(v).forEach(x => visit(x, depth+1));
  };
  visit(value);
  return JSON.parse(JSON.stringify(value));
}
function chartContract(chart, input) {
  assert(chart && typeof chart === 'object', 'Chart must be an object');
  let epoch;
  try { epoch = Date.prototype.getTime.call(chart.input?.utc); } catch { throw new Error('chart.input.utc must be a Date'); }
  assert(epoch === Date.parse(input.utc), 'Chart returned a different instant');
  assert(Array.isArray(chart.bodies), 'Missing chart bodies');
  assert(chart.deltaT && Number.isFinite(chart.deltaT.seconds), 'Missing/nonfinite clock metadata');
  if (input.deltaT !== undefined) {
    assert(chart.deltaT.model === 'pinned' && chart.deltaT.seconds === input.deltaT, 'Chart ignored/misreported requested clock pin');
  } else assert(typeof chart.deltaT.model === 'string' && chart.deltaT.model !== 'pinned', 'Default chart clock unexpectedly pinned');
}
function bodyPosition(chart, body) {
  const matches = chart.bodies.filter(b => b?.body === body);
  assert(matches.length === 1, 'Expected exactly one ' + body + ' position');
  const b = matches[0];
  assert(lon(b.lon) && lat(b.lat), 'Invalid normalized coordinates for ' + body);
  return { body, lon:b.lon, lat:b.lat };
}
function geometry(chart, input) {
  chartContract(chart,input);
  return { utc:Date.prototype.toISOString.call(chart.input.utc), deltaT:snapshot(chart.deltaT), bodies:BODIES.map(b => bodyPosition(chart,b)), angles:snapshot(chart.angles), houses:snapshot(chart.houses) };
}
async function probe(api, p) {
  const checks = {};
  try {
    if (p.kind === 'reject') {
      let rejected = false;
      try { await api.natalChart(structuredClone(p.input)); } catch { rejected = true; }
      checks.rejected = rejected;
    } else if (p.kind === 'unknown-time') {
      const chart = await api.natalChart(structuredClone(p.input)); geometry(chart,p.input);
      checks.anglesSuppressed = chart.angles === null; checks.housesSuppressed = chart.houses === null;
      checks.noTimeFlag = Array.isArray(chart.flags) && chart.flags.includes('no-time');
    } else if (p.kind === 'located') {
      const chart = await api.natalChart(structuredClone(p.input)); geometry(chart,p.input);
      checks.requestedSystem = chart.houses?.system === p.input.houseSystem;
      checks.twelveNormalizedCusps = Array.isArray(chart.houses?.cusps) && chart.houses.cusps.length === 12 && chart.houses.cusps.every(lon);
      checks.normalizedAngles = chart.angles !== null && ['asc','mc','dsc','ic'].every(k => lon(chart.angles?.[k]));
      checks.noFallback = Array.isArray(chart.flags) && !chart.flags.includes('polar-fallback') && !chart.flags.includes('no-time');
    } else if (p.kind === 'repeat') {
      const a = geometry(await api.natalChart(structuredClone(p.input)),p.input), b = geometry(await api.natalChart(structuredClone(p.input)),p.input);
      checks.identicalGeometryAndClock = JSON.stringify(a) === JSON.stringify(b);
    } else if (p.kind === 'clock') {
      const unpinned = {...p.input}; delete unpinned.deltaT;
      const alternate = {...p.input,deltaT:p.alternatePin};
      const d1 = geometry(await api.natalChart({...unpinned}),unpinned);
      const a1 = geometry(await api.natalChart({...p.input}),p.input);
      const b = geometry(await api.natalChart({...alternate}),alternate);
      const a2 = geometry(await api.natalChart({...p.input}),p.input);
      const d2 = geometry(await api.natalChart({...unpinned}),unpinned);
      checks.defaultClockRestored = JSON.stringify(d1) === JSON.stringify(d2);
      checks.pinnedRepeatUnchanged = JSON.stringify(a1) === JSON.stringify(a2);
      checks.pinChangesComputedGeometry = ['Sun','Moon'].some(body => Math.abs(a1.bodies.find(v=>v.body===body).lon-b.bodies.find(v=>v.body===body).lon)>1e-12);
    } else throw new Error('Unknown probe kind');
    return {id:p.id,passed:Object.values(checks).every(v=>v===true),details:{checks}};
  } catch (error) { return {id:p.id,passed:false,details:{checks,error:errorText(error)}}; }
}

async function main() {
  const limit = Number(process.argv[2]); assert(Number.isInteger(limit) && limit > 0 && limit <= 16777216, 'Invalid input limit');
  let size = 0; const chunks = [];
  for await (const chunk of process.stdin) { size += chunk.length; assert(size <= limit, 'Input byte limit exceeded'); chunks.push(chunk); }
  const input = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  assert(input.protocol === PROTOCOL && Array.isArray(input.cases) && Array.isArray(input.probes), 'Invalid request');
  const api = await import(pathToFileURL(input.entry).href);
  const metadata = {engineVersion:api.ENGINE_VERSION ?? null, ephemeris:snapshot(api.EPHEMERIS), exportNames:Object.keys(api).sort(), functionExportNames:Object.keys(api).filter(k=>typeof api[k]==='function').sort(),aspectPolicy:snapshot(api.ASPECTS)};
  await send('ready',{api:metadata});
  assert(typeof api.natalChart === 'function', 'Missing natalChart function');
  const groups = new Map();
  for (const c of input.cases) { const key = JSON.stringify([Date.parse(c.utc),c.deltaT]); if (!groups.has(key)) groups.set(key,[]); groups.get(key).push(c); }
  for (const group of groups.values()) {
    const request = {utc:group[0].utc,deltaT:group[0].deltaT,timeKnown:false}, started = performance.now();
    let chart, chartError;
    try { chart = await api.natalChart({...request}); } catch (error) { chartError = errorText(error); }
    const elapsedMs = performance.now()-started;
    if (!chartError) try { chartContract(chart,request); } catch (error) { chartError = errorText(error); }
    const rows = group.map(c => {
      try {
        if (chartError) throw new Error(chartError);
        const position = bodyPosition(chart,c.body);
        return {...c,status:'ok',lon:position.lon,lat:position.lat};
      } catch (error) { return {...c,status:'error',error:errorText(error)}; }
    });
    await send('rows',{rows,elapsedMs});
  }
  for (const p of input.probes) await send('probe',{probe:await probe(api,p)});
  await send('done');
}
main().then(()=>process.exit(0)).catch(async error => {
  try { await send('fatal',{error:errorText(error)}); } catch { /* Broken parent transport. */ }
  process.exit(1);
});
