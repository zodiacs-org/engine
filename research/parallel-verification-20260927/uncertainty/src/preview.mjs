import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const SCHEMA = 'zodiacs.birth-window.experimental/0.1';
const HOUSES = new Set(['whole','placidus','porphyry','equal','equal-mc','vehlow','koch','regiomontanus','campanus','topocentric','alcabitius','morinus','meridian']);
const BODIES = new Set(['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto','North Node','South Node']);
const ANGLES = new Set(['asc','mc','dsc','ic']);
const SIGNS = new Set(['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces']);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const assert = (ok, why) => { if (!ok) throw new RangeError(why); };
function keys(object, allowed, name) {
  assert(object && typeof object === 'object' && !Array.isArray(object), `${name} must be an object.`);
  assert(Object.keys(object).every(k => allowed.includes(k)), `${name} contains an unknown field; validate against the experimental request schema.`);
}

function timestamp(value) {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value), 'UTC timestamps require YYYY-MM-DDTHH:mm:ss.sssZ; leap seconds are unsupported.');
  const n = Date.parse(value);
  assert(Number.isFinite(n) && new Date(n).toISOString() === value, 'Invalid calendar timestamp.');
  return n;
}

export function validatePreviewRequest(r) {
  keys(r,['schemaVersion','requestId','mode','time','location','model','features','budget','prior'],'request');
  assert(r && r.schemaVersion === SCHEMA && typeof r.requestId === 'string', 'Invalid request/schema version.');
  assert(r.mode === 'finite-preview', 'Only finite-preview is implemented; no certificates are emitted.');
  assert(r.time?.kind === 'utc-union', 'Resolve local clocks independently first; this preview accepts utc-union only.');
  assert(r.prior?.kind === 'none', 'Priors and probability calculations are not implemented. Use prior:none.');
  assert(r.location?.kind === 'point' || r.location?.kind === 'absent', 'Coordinate boxes require a future multidimensional evaluator.');
  keys(r.time,['kind','intervals'],'time');
  keys(r.prior,['kind'],'prior');
  keys(r.location,r.location.kind === 'point' ? ['kind','latitude','longitude'] : ['kind'],'location');
  keys(r.model,['engineCommit','houseSystems','deltaT'],'model');
  keys(r.budget,['maxStepMs','maxEvaluations'],'budget');
  if (r.location.kind === 'point') {
    assert(finite(r.location.latitude) && Math.abs(r.location.latitude) <= 90 && finite(r.location.longitude) && Math.abs(r.location.longitude) <= 180, 'Invalid point coordinates.');
  }
  assert(r.model?.engineCommit === null || (typeof r.model?.engineCommit === 'string' && /^[a-f0-9]{40}$/.test(r.model.engineCommit)), 'engineCommit must be a full 40-character commit or null when source ancestry is unknown.');
  assert(Array.isArray(r.model?.houseSystems) && r.model.houseSystems.length && r.model.houseSystems.every(x => HOUSES.has(x)) && new Set(r.model.houseSystems).size === r.model.houseSystems.length, 'Select distinct supported house systems.');
  assert(r.model.deltaT?.kind === 'engine' || (r.model.deltaT?.kind === 'pinned' && finite(r.model.deltaT.seconds) && Math.abs(r.model.deltaT.seconds) <= 1e10), 'Only engine-model or pinned finite ΔT is supported.');
  keys(r.model.deltaT,r.model.deltaT.kind === 'engine' ? ['kind'] : ['kind','seconds'],'deltaT');
  assert(Number.isSafeInteger(r.budget?.maxStepMs) && r.budget.maxStepMs >= 1 && Number.isSafeInteger(r.budget.maxEvaluations) && r.budget.maxEvaluations >= 1 && r.budget.maxEvaluations <= 1_000_000, 'Invalid sampling budget.');
  assert(Array.isArray(r.features) && r.features.length && new Set(r.features.map(f => f.id)).size === r.features.length, 'Features need unique IDs.');
  for (const f of r.features) {
    keys(f,f.kind === 'aspect-present' ? ['id','kind','a','b','angleDegrees','orbDegrees'] : f.kind === 'angle-sign' ? ['id','kind','angle'] : ['id','kind','body'],'feature');
    assert(typeof f.id === 'string' && f.id.length > 0, 'Nonempty feature ID required.');
    if (f.kind === 'body-sign' || f.kind === 'body-house') assert(BODIES.has(f.body), 'Unknown body.');
    else if (f.kind === 'angle-sign') assert(ANGLES.has(f.angle), 'Unknown angle.');
    else if (f.kind === 'aspect-present') assert(BODIES.has(f.a) && BODIES.has(f.b) && f.a !== f.b && finite(f.angleDegrees) && f.angleDegrees >= 0 && f.angleDegrees <= 180 && finite(f.orbDegrees) && f.orbDegrees >= 0 && f.orbDegrees <= 180, 'Invalid explicit aspect predicate.');
    else throw new RangeError('Unsupported feature kind.');
  }
  assert(Array.isArray(r.time.intervals) && r.time.intervals.length && new Set(r.time.intervals.map(x => x.id)).size === r.time.intervals.length, 'Distinct interval IDs are required.');
  const intervals = r.time.intervals.map(i => {
    keys(i,['id','start','end','includeStart','includeEnd'],'interval');
    assert(typeof i.id === 'string' && i.id.length > 0 && typeof i.includeStart === 'boolean' && typeof i.includeEnd === 'boolean', 'Explicit interval ID/endpoint ownership required.');
    const a = timestamp(i.start), b = timestamp(i.end);
    assert(a < b || (a === b && i.includeStart && i.includeEnd), 'Empty or reversed interval.');
    const lo = a + (i.includeStart ? 0 : 1), hi = b - (i.includeEnd ? 0 : 1);
    assert(lo <= hi, 'No integer-millisecond instant remains in this interval.');
    return { lo, hi };
  });
  return intervals;
}

export function sampleDomain(r) {
  const intervals = validatePreviewRequest(r);
  const step = r.budget.maxStepMs;
  // Conservative preflight bound. Reject before allocation; overlap may reduce the actual cost.
  const upperBound = intervals.reduce((n,{lo,hi}) => n + Math.ceil((hi-lo)/step) + 1, 0) * r.model.houseSystems.length;
  assert(Number.isSafeInteger(upperBound) && upperBound <= r.budget.maxEvaluations, `Sampling request exceeds conservative evaluation budget (${upperBound} > ${r.budget.maxEvaluations}); widen maxStepMs or raise the explicit budget.`);
  const all = new Set();
  let maxGap = 0;
  for (const {lo,hi} of intervals) {
    all.add(lo);
    let previous = lo;
    for (let at = lo + step; at < hi; at += step) { all.add(at); maxGap = Math.max(maxGap, at-previous); previous = at; }
    all.add(hi); maxGap = Math.max(maxGap, hi-previous);
  }
  return { instants:[...all].sort((a,b) => a-b), maxGap };
}

function featureValue(engine, chart, f, system) {
  const signAt = (longitude) => {
    const slug = engine.signForLongitude(longitude)?.slug;
    if (!SIGNS.has(slug)) throw new Error('Invalid sign slug from public sign function.');
    return slug;
  };
  const body = (name) => {
    const b = chart.bodies.find(x => x.body === name);
    if (!b || !finite(b.lon) || b.lon < 0 || b.lon >= 360) throw new Error(`Invalid/missing body ${name}.`);
    return b;
  };
  if (f.kind === 'body-sign') {
    const b = body(f.body);
    if (signAt(b.lon) !== b.sign) throw new Error('Body sign/longitude disagree.');
    return b.sign;
  }
  if (f.kind === 'angle-sign') {
    if (!chart.angles) return {unavailable:'Angles require a location.'};
    if (!finite(chart.angles[f.angle]) || chart.angles[f.angle] < 0 || chart.angles[f.angle] >= 360) throw new Error('Invalid angle; expected [0,360).');
    return signAt(chart.angles[f.angle]);
  }
  if (f.kind === 'body-house') {
    if (!chart.houses) return {unavailable:'Houses require a location.'};
    if (chart.houses.system !== system) return {unavailable:`Requested ${system}; engine substituted ${chart.houses.system}.`};
    const cusps = chart.houses.cusps;
    if (!Array.isArray(cusps) || cusps.length !== 12 || !cusps.every(v => finite(v) && v >= 0 && v < 360)) throw new Error('Invalid cusp array.');
    const spans = cusps.map((v,i) => ((cusps[(i+1)%12]-v)%360+360)%360);
    if (spans.some(v => v <= 1e-10) || Math.abs(spans.reduce((a,b)=>a+b,0)-360) > 1e-7) return {unavailable:'Degenerate or noncyclic cusp geometry; explicit convention needed.'};
    const house = engine.houseOf(body(f.body).lon, cusps);
    if (!Number.isInteger(house) || house < 1 || house > 12) throw new Error('Invalid house number; expected integer 1..12.');
    return house;
  }
  const separation = engine.separation(body(f.a).lon, body(f.b).lon);
  if (!finite(separation) || separation < 0 || separation > 180) throw new Error('Invalid separation.');
  return Math.abs(separation-f.angleDegrees) <= f.orbDegrees;
}

export function runPreview(request, engine, provenance = {}) {
  const {instants, maxGap} = sampleDomain(request);
  for (const exportName of ['natalChart','houseOf','signForLongitude','separation']) assert(typeof engine[exportName] === 'function', `Missing public engine export: ${exportName}`);
  const findings = [];
  let chartEvaluations = 0;
  let finiteDomainEvaluated = true;
  for (const system of request.model.houseSystems) {
    const work = request.features.map(f => ({feature:f, values:new Map(), issues:[], unavailable:0, failures:0}));
    for (const t of instants) {
      const at = new Date(t).toISOString();
      let chart;
      chartEvaluations++;
      try {
        chart = engine.natalChart({utc:at, houseSystem:system, timeKnown:true,
          ...(request.location.kind === 'point' ? {latitude:request.location.latitude,longitude:request.location.longitude} : {}),
          ...(request.model.deltaT.kind === 'pinned' ? {deltaT:request.model.deltaT.seconds} : {})});
        if (!chart || !Array.isArray(chart.bodies) || !chart.input || !(chart.input.utc instanceof Date) || chart.input.utc.getTime() !== t || chart.input.houseSystem !== system || chart.input.timeKnown !== true) throw new Error('Returned chart does not match requested instant/model.');
        if (request.location.kind === 'point' && (chart.input.latitude !== request.location.latitude || chart.input.longitude !== request.location.longitude)) throw new Error('Returned chart does not match requested coordinates.');
        if (!finite(chart.deltaT?.seconds)) throw new Error('Returned chart has no finite ΔT receipt.');
        if (request.model.deltaT.kind === 'pinned' && (chart.deltaT.model !== 'pinned' || chart.deltaT.seconds !== request.model.deltaT.seconds)) throw new Error('Returned chart does not honor requested ΔT pin.');
        if (request.model.deltaT.kind === 'engine' && chart.deltaT.model === 'pinned') throw new Error('Returned chart substitutes a pinned ΔT for the requested engine model.');
      } catch (e) { finiteDomainEvaluated = false; for (const w of work) { w.issues.push({at,reason:`Engine error: ${e.message}`}); w.failures++; } continue; }
      for (const w of work) {
        try {
          const value = featureValue(engine,chart,w.feature,system);
          if (value && typeof value === 'object' && value.unavailable) { w.issues.push({at,reason:value.unavailable}); w.unavailable++; continue; }
          const key = JSON.stringify(value);
          if (!w.values.has(key)) w.values.set(key, {at,value,requestedHouseSystem:system,actualHouseSystem:chart.houses?.system ?? null,engineFlags:chart.flags ?? [],...(request.location.kind === 'point' ? {latitude:request.location.latitude,longitude:request.location.longitude} : {})});
        } catch(e) { finiteDomainEvaluated = false; w.issues.push({at,reason:e.message}); w.failures++; }
      }
    }
    for (const w of work) {
      const witnesses = [...w.values.values()];
      const status = witnesses.length > 1 ? 'variable' : witnesses.length === 1 ? 'observed-constant' : w.failures ? 'unresolved' : 'unavailable';
      findings.push({featureId:w.feature.id, houseSystem:system, status,complete:false,values:witnesses.map(w=>w.value),witnesses,issues:w.issues,probabilities:null,certificate:null});
    }
  }
  return {schemaVersion:SCHEMA, requestId:request.requestId, requestSha256:hash(JSON.stringify(request)),
    provenance:{engineVersion:engine.ENGINE_VERSION ?? 'unknown',assertedEngineCommit:request.model.engineCommit,moduleSha256:provenance.moduleSha256 ?? 'not-recorded',ephemeris:engine.EPHEMERIS ?? null,runtime:process.version,toolVersion:'0.1.0'},
    coverage:{mode:'finite-preview',domain:'finite samples of the permitted integer-millisecond UTC union; continuum not covered',complete:false,finiteDomainEvaluated,sampleCount:instants.length,chartEvaluations,maxObservedGridGapMs:maxGap,requestedMaxStepMs:request.budget.maxStepMs,note:'Equal sample values do not exclude intervening changes. Variable means witnessed variation; unseen additional values are possible.'},
    findings,warnings:['No continuum certificate or astronomical error bound is supplied.',request.model.engineCommit === null ? 'Engine source ancestry is unknown; no commit is asserted.' : 'Engine commit is asserted by the request; verify source ancestry against the surrounding frozen-source manifest.']};
}

async function cli() {
  const args = process.argv.slice(2), options = {};
  assert(args.length === 6, 'Usage: --engine /abs/dist/index.js --request request.json --output result.json');
  for (let i=0;i<args.length;i+=2) { assert(['--engine','--request','--output'].includes(args[i]) && !options[args[i]], 'Invalid/duplicate CLI option.'); options[args[i]] = args[i+1]; }
  assert(options['--engine'] && options['--request'] && options['--output'], 'All three CLI options are required.');
  const enginePath = path.resolve(options['--engine']);
  const [engine, raw, bytes] = await Promise.all([import(pathToFileURL(enginePath).href),readFile(options['--request'],'utf8'),readFile(enginePath)]);
  const report = runPreview(JSON.parse(raw),engine,{moduleSha256:hash(bytes)});
  await writeFile(options['--output'],JSON.stringify(report,null,2)+'\n');
  process.stdout.write(`Wrote ${report.coverage.chartEvaluations} evaluations; finite preview only.\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cli().catch(e => { process.stderr.write(e.message+'\n'); process.exitCode=1; });
