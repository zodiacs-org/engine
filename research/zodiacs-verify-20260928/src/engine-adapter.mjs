import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createChartReceipt, digest, instant, SIGNS } from './core.mjs';

// This qualification identifies installed bytes, not independently established
// source ancestry, astronomical accuracy, or a signature from the publisher.
const ENGINE_VERSION = '0.1.1-rc.10';
const DEPENDENCY_VERSION = '2.1.19';
const ENGINE_HASHES = {
  "dist/chunk-35EQGGYX.js": "21d1603de4a067c2cd0d9404de00a9a1753386a6b8d27eef805c55aada120f68",
  "dist/chunk-AECKV73C.js": "a812be9882c25f67c9fa8dfe19eb0d950a3867a7cdbede4c746c226ca760480c",
  "dist/chunk-CPALRSPC.js": "9db1a3814ec9bd00a40d4bc295e348debd6108f62a322ed91d18610c81b9fb08",
  "dist/chunk-FR5TX5ZG.js": "32992ee054cdb37c9e5548e5a4136f125dbf8da7857c5db8d3bbb530011bf9e1",
  "dist/chunk-IYNERVXW.js": "2d297d94afc12e305da43c865415bbf9c4bf0cd4292936c7c10089c8d41beb84",
  "dist/chunk-N4WHSUFK.js": "0404459e3bb1a10413c34397f7a269d11a2599227ee6aff18c60e3f091964740",
  "dist/chunk-ONBZ4HK7.js": "50f11205373c177c728ea8c7d50d41b19ff80cd9921eb51c6e907a8045f93308",
  "dist/chunk-PFGUCNOK.js": "6d9d38ab4606288700b0959e732a61dfa5b4cdc570be21d17b4ac9b9fe1c0eb4",
  "dist/crossings.js": "bad1c9bcf76338a95d8c09d1019fb32a65f2d9622c611fd87f81a83392bd3f5f",
  "dist/deltat.js": "43b1503b6597e82ed6e920c18991703fe02be05856e6de0fc347e4abcf4c15e4",
  "dist/geo.js": "65b0af0d4c6823483ad321ab91a703889303a6e8051f171d2de8fc3df7e94d64",
  "dist/index.js": "d3a2ef95bdff80c70c2edeb95b89569894eb58e235ffbbbd73035f08b81602c3",
  "dist/internal-math.js": "5b9f2247f099f6fa2de0ecbe0b5ed730c6db5a630cd6e841b046c54f182d8d91",
  "dist/internal.js": "09941e5ed9937f02d313609cf080e1cff76225aaea9f97def14a8a6d70382ce6",
  "dist/receipt.js": "ff7a6b2a8ce0d4be22225cb2752f33601bc7ebf9dde8aeedbf67a4bbf885de03",
  "package.json": "e2ff18b132f2a01cfea37ed4b8c3f827a1d5c238d26654bb481d44168a9afc4e"
};
const DEPENDENCY_HASHES = {
  "README.md": "73c2de22668374bafd2d238ef43bccd96017550d47ba05afaedd969a00490b1f",
  "astronomy.browser.js": "a2cfab19cab1a15843e4c8cc7410b6cbaafd0907122a8698c25d63d00c2774e4",
  "astronomy.browser.min.js": "f41139a87941ea017ab902b954c9389fa27ea72083d7fab4971756d7769d14e6",
  "astronomy.d.ts": "fc5f1ede68dbebc32ce2f3f878cb3b261dc1bf8c16422451f0c4092c41fc871e",
  "astronomy.js": "729c0ce37cc1a8096034a689039a5f04585ee8184177c638e8c74dec4fa3185a",
  "astronomy.min.js": "6268029496ec7072e91a6ee3588dc645144dccc91ddbaa03b7f646fa0959da59",
  "esm/astronomy.js": "068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7",
  "package.json": "d035702763839ae11f41600cf4b8210005672658dcb19cea4a09591078af4931"
};
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node', 'South Node'];
const PLANETS = BODIES.slice(0, 10);
const HOUSE_SYSTEMS = ['whole', 'placidus', 'porphyry', 'equal', 'equal-mc', 'vehlow', 'koch', 'regiomontanus', 'campanus', 'topocentric', 'alcabitius', 'morinus', 'meridian'];
const REQUEST_KEYS = new Set(['subjectId', 'utc', 'latitude', 'longitude', 'timeKnowledge', 'houseSystem', 'deltaT']);
const ASPECT_POLICY = [
  {type:'conjunction', angle:0, orb:8, luminaryOrb:10},
  {type:'sextile', angle:60, orb:4, luminaryOrb:5},
  {type:'square', angle:90, orb:7, luminaryOrb:8},
  {type:'trine', angle:120, orb:7, luminaryOrb:8},
  {type:'opposition', angle:180, orb:8, luminaryOrb:10},
];
const fail = (message) => { throw new Error('Zodiacs adapter: ' + message); };
const check = (condition, message) => { if (!condition) fail(message); };
const clone = (value) => JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function finite(value, label) {
  check(typeof value === 'number' && Number.isFinite(value), label + ' must be finite.');
  return value;
}
function plain(value, label) {
  check(value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null), label + ' must be a plain object.');
  check(Reflect.ownKeys(value).every(key => typeof key === 'string' && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value') && Object.getOwnPropertyDescriptor(value, key).enumerable), label + ' must contain only enumerable data properties.');
}

// A symlink inside a package would make the effective inventory depend on
// another mutable tree. The configured entry itself can resolve to a real path.
async function inventory(root, {excludeNodeModules = false, javascriptOnly = false} = {}) {
  const files = [];
  async function visit(relative = '') {
    for (const name of (await readdir(path.join(root, relative))).sort()) {
      if (excludeNodeModules && name === 'node_modules') continue;
      const local = path.join(relative, name);
      const stat = await lstat(path.join(root, local));
      check(!stat.isSymbolicLink(), 'package inventory contains a symbolic link: ' + local);
      if (stat.isDirectory()) await visit(local);
      else if (stat.isFile() && (!javascriptOnly || /\.(?:js|mjs|cjs)$/.test(name))) files.push(local.split(path.sep).join('/'));
      else check(stat.isFile(), 'unsupported package filesystem entry: ' + local);
    }
  }
  await visit();
  return files.sort();
}
async function verifyFiles(root, expected, actual, label) {
  check(JSON.stringify([...actual].sort()) === JSON.stringify(Object.keys(expected).sort()), label + ' file inventory is not qualified.');
  for (const relative of actual) {
    const bytes = await readFile(path.join(root, relative));
    const hash = createHash('sha256').update(bytes).digest('hex');
    check(hash === expected[relative], label + ' hash mismatch: ' + relative);
  }
}

function requestInput(request, sampleMs) {
  plain(request, 'request');
  for (const key of Object.keys(request)) check(REQUEST_KEYS.has(key), 'unsupported setting: ' + key);
  check(typeof request.subjectId === 'string' && request.subjectId.trim().length > 0 && request.subjectId.length <= 256, 'subjectId must be a nonempty identifier of at most 256 characters.');
  check(request.timeKnowledge === 'exact' || request.timeKnowledge === 'reference', 'timeKnowledge must be exact or reference.');
  check(HOUSE_SYSTEMS.includes(request.houseSystem), 'unsupported houseSystem.');
  const hasLatitude = Object.hasOwn(request, 'latitude');
  const hasLongitude = Object.hasOwn(request, 'longitude');
  check(hasLatitude === hasLongitude, 'latitude and longitude must be supplied together.');
  if (hasLatitude) {
    finite(request.latitude, 'latitude'); finite(request.longitude, 'longitude');
    check(request.latitude >= -90 && request.latitude <= 90, 'latitude is outside [-90,90].');
    check(request.longitude >= -180 && request.longitude <= 180, 'longitude is outside [-180,180].');
  }
  if (Object.hasOwn(request, 'deltaT')) {
    finite(request.deltaT, 'deltaT');
    check(Math.abs(request.deltaT) <= 1e10, 'deltaT exceeds the qualified engine limit.');
  }
  if (sampleMs === undefined || Object.hasOwn(request, 'utc')) instant(request.utc);
  const ms = sampleMs === undefined ? instant(request.utc) : finite(sampleMs, 'sample epoch milliseconds');
  check(Number.isInteger(ms) && Math.abs(ms) <= 8.64e15, 'sample epoch must be an integral valid Date millisecond.');
  const utc = new Date(ms).toISOString();
  instant(utc); // Keep samples within the same canonical-epoch domain as receipts.
  return {
    input: {
      utc,
      timeKnown: request.timeKnowledge === 'exact',
      houseSystem: request.houseSystem,
      ...(hasLatitude ? {latitude:request.latitude, longitude:request.longitude} : {}),
      ...(Object.hasOwn(request, 'deltaT') ? {deltaT:request.deltaT} : {}),
    },
    context: {
      utc,
      latitude: hasLatitude ? request.latitude : null,
      longitude: hasLongitude ? request.longitude : null,
      timeKnowledge: request.timeKnowledge,
      requestedHouseSystem: request.houseSystem,
      effectiveHouseSystem: null,
    },
  };
}

function checkChart(chart, context) {
  check(chart && chart.engineVersion === ENGINE_VERSION, 'runtime returned an unexpected engine version.');
  check(Array.isArray(chart.bodies) && chart.bodies.length === BODIES.length, 'runtime returned an unexpected body set.');
  check(new Set(chart.bodies.map(body => body.body)).size === BODIES.length && chart.bodies.every(body => BODIES.includes(body.body)), 'runtime body identities are inconsistent.');
  for (const body of chart.bodies) {
    finite(body.lon, 'body longitude');
    check(body.lon >= 0 && body.lon < 360, 'body longitude is outside [0,360).');
    check(SIGNS[Math.floor(body.lon / 30)].toLowerCase() === body.sign, 'runtime sign disagrees with its longitude.');
  }
  const needsHouses = context.timeKnowledge === 'exact' && context.latitude !== null;
  check(Array.isArray(chart.flags), 'runtime flags are missing.');
  check(!chart.flags.includes('polar-fallback'), 'implicit house fallback is unsupported; select an explicit supported house system.');
  if (needsHouses) {
    check(chart.houses && chart.angles, 'requested houses or angles were dropped.');
    check(chart.houses.system === context.requestedHouseSystem, 'effective house system differs from the requested system.');
    check(chart.houses.cusps.length === 12 && chart.houses.cusps.every(value => Number.isFinite(value) && value >= 0 && value < 360), 'invalid house cusps.');
    for (const key of ['asc', 'mc']) check(Number.isFinite(chart.angles[key]) && chart.angles[key] >= 0 && chart.angles[key] < 360, 'invalid chart angle.');
    context.effectiveHouseSystem = chart.houses.system;
  } else check(chart.houses === null && chart.angles === null, 'unexpected houses or angles for this time/location profile.');
  check(chart.input.utc instanceof Date && chart.input.utc.toISOString() === context.utc, 'runtime changed the observation instant.');
  check(chart.deltaT && Number.isFinite(chart.deltaT.seconds), 'runtime deltaT provenance is missing.');
  const warnings = ['utc-label-read-as-ut1', 'finite-reference-coverage-not-an-absolute-accuracy-bound'];
  if (context.timeKnowledge === 'reference') warnings.push('reference-instant-not-known-birth-time');
  if (context.latitude === null) warnings.push('angles-and-houses-unavailable-without-location');
  for (const flag of chart.flags) if (flag !== 'no-time') warnings.push('engine:' + flag);
  return warnings;
}

/**
 * Load a trusted local rc.10 installation, verify its complete executable
 * package inventory plus its resolved astronomy-engine dependency, then import
 * only public entry points. No network, engine writes, or automatic upgrades.
 */
export async function loadZodiacsAdapter(enginePath) {
  check(typeof enginePath === 'string' && path.isAbsolute(enginePath), 'enginePath must be a configured absolute local path.');
  const entry = await realpath(enginePath);
  check(path.basename(entry) === 'index.js' && path.basename(path.dirname(entry)) === 'dist', 'expected the installed package dist/index.js entry.');
  const packageRoot = path.dirname(path.dirname(entry));
  const pkg = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  check(pkg.name === '@zodiacs/engine' && pkg.version === ENGINE_VERSION, 'unqualified engine version; expected @zodiacs/engine ' + ENGINE_VERSION + '.');
  const javascript = await inventory(packageRoot, {excludeNodeModules:true, javascriptOnly:true});
  await verifyFiles(packageRoot, ENGINE_HASHES, [...javascript, 'package.json'], 'engine');
  const require = createRequire(pathToFileURL(entry));
  const dependencyEntry = await realpath(require.resolve('astronomy-engine'));
  const dependencyRoot = path.dirname(dependencyEntry);
  const dependency = JSON.parse(await readFile(path.join(dependencyRoot, 'package.json'), 'utf8'));
  check(dependency.name === 'astronomy-engine' && dependency.version === DEPENDENCY_VERSION, 'unqualified astronomy-engine dependency.');
  await verifyFiles(dependencyRoot, DEPENDENCY_HASHES, await inventory(dependencyRoot), 'dependency');
  const api = await import(pathToFileURL(entry).href);
  check(api.ENGINE_VERSION === ENGINE_VERSION && api.EPHEMERIS?.name === dependency.name && api.EPHEMERIS?.version === DEPENDENCY_VERSION, 'loaded API disagrees with qualified metadata.');
  check(typeof api.natalChart === 'function' && typeof api.houseOf === 'function', 'required public API is unavailable.');
  check(JSON.stringify(api.ASPECTS) === JSON.stringify(ASPECT_POLICY), 'aspect policy is not qualified.');
  const model = freeze({
    engine:'@zodiacs/engine',
    engineVersion:ENGINE_VERSION,
    artifact:{
      digest:digest({engine:ENGINE_HASHES, dependency:{name:dependency.name,version:DEPENDENCY_VERSION,files:DEPENDENCY_HASHES}}),
      scope:'sha256 manifest of all installed engine JS/MJS/CJS excluding node_modules, engine package.json, and every file of the resolved astronomy-engine 2.1.19 package; source ancestry and physical accuracy not authenticated',
    },
    conventions:{
      zodiac:'tropical',
      origin:'geocentric',
      frame:'true-ecliptic-of-date;astronomy-engine-EQJ-precession-five-term-nutation-true-obliquity',
      corrections:'non-Moon:light-time-and-first-order-aberration;no-gravitational-deflection;Moon:no-light-time-or-aberration;nodes:instantaneous-geocentric-lunar-orbit-plane',
      timeScale:'proleptic-gregorian-UTC-label-read-as-UT1;TT=UT1+deltaT;no-explicit-leap-second-or-TT-TDB-conversion',
      deltaT:{policy:'request-pin-or-engine-model',model:api.DELTA_T_MODEL,tableVersion:api.DELTA_T_TABLE.version,tableDigest:api.DELTA_T_TABLE.digest},
      aspectOrbPolicy:'longitude-only;10-physical-bodies;inclusive-orb;normal/luminary-degrees:conjunction8/10,sextile4/5,square7/8,trine7/8,opposition8/10;no-node-or-angle-aspects',
    },
  });
  function compute(request, sampleMs) {
    const {input,context} = requestInput(request, sampleMs);
    // Synchronous public calculation restores a supplied deltaT override before
    // returning. The host must not mutate the shared dependency clock.
    const chart = api.natalChart(input);
    const warnings = checkChart(chart, context);
    return {chart,context,warnings};
  }
  function calculate(request) {
    const {chart,context,warnings} = compute(request);
    const facts = [];
    const positions = new Map(chart.bodies.map(body => [body.body, body.lon]));
    if (chart.angles) {
      positions.set('Ascendant', chart.angles.asc);
      positions.set('Midheaven', chart.angles.mc);
    }
    for (const [entity,longitude] of positions) {
      facts.push({id:'longitude:' + entity,kind:'longitude',entity,value:longitude,unit:'deg',scope:'instant'});
      facts.push({id:'sign:' + entity,kind:'sign',entity,value:SIGNS[Math.floor(longitude / 30)],scope:'instant'});
    }
    if (chart.houses) for (const body of chart.bodies) facts.push({
      id:'house:' + body.body,kind:'house',entity:body.body,value:api.houseOf(body.lon, chart.houses.cusps),scope:'instant',
    });
    check(Array.isArray(chart.aspects), 'runtime aspects are missing.');
    for (let a=0; a<PLANETS.length; ++a) for (let b=a+1; b<PLANETS.length; ++b) {
      const first=PLANETS[a], second=PLANETS[b];
      const luminary = ['Sun','Moon'].includes(first) || ['Sun','Moon'].includes(second);
      for (const definition of ASPECT_POLICY) {
        const orb = luminary ? definition.luminaryOrb : definition.orb;
        const value = chart.aspects.some(aspect => aspect.type === definition.type && ((aspect.a === first && aspect.b === second) || (aspect.a === second && aspect.b === first)));
        facts.push({id:'aspect:' + first + ':' + second + ':' + definition.type,kind:'aspect',entity:first + '|' + second + '|angle=' + definition.angle + '|orb=' + orb,value,scope:'instant'});
      }
    }
    const receiptModel = clone(model);
    receiptModel.conventions.deltaT = clone(chart.deltaT);
    return createChartReceipt({schema:'zodiacs.verify.chart.v1',subjectId:request.subjectId,context,model:receiptModel,facts,warnings});
  }
  function sample(ms, request) {
    const {chart,warnings} = compute(request, ms);
    const longitudes = Object.fromEntries(chart.bodies.map(body => [body.body,body.lon]));
    if (chart.angles) {
      longitudes.Ascendant=chart.angles.asc;
      longitudes.Midheaven=chart.angles.mc;
    }
    return {longitudes,warnings};
  }
  return Object.freeze({model,calculate,sample});
}
