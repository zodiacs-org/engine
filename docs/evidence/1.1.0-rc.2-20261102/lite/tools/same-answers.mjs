// Check L5 (../PREREGISTRATION.md, section 3): on the corpus below, every
// function of @zodiacs/engine/lite gives what the same function of the root
// (the declination part) or of @zodiacs/engine/techniques (the composite and
// dignity parts) gives, Object.is on every leaf with list order and length,
// and the same inputs are refused with the same error class; sectReading's
// ecliptic convention gives the root's sectOf; and no function or table of
// the entry is the same object as its home entry's. A consistency check of
// one build against itself, not an independent one.
//
// The corpus, seeded by the 32-bit FNV-1a of "engine-1-1-0-rc2-lite:<part>"
// (mulberry32): 1,000 declination body sets (3 to 12 bodies, longitudes in
// [0, 360), latitudes in [-10, 10], obliquities in [23.43, 23.45], under the
// default and two other orb policies); 1,000 composite list pairs, with exact
// coincidences and exact oppositions; the 144 body and sign pairs; 1,000
// longitudes for dignityRulersAt; 500 essentialDignities and 300
// mutualReceptions inputs; 2,000 ecliptic sect cases, the Sun exactly on the
// ascendant and on the descendant among them; and, in each part, inputs the
// functions refuse.
//
//   node same-answers.mjs --package <root> [--lite <dir>] [--out report.json]
//
// <root> holds the package under test (this checkout after npm run build, or
// the installed candidate). --lite names another directory whose dist/ holds
// the lite files to test against that package's root and techniques entry:
// the control, a lite build whose declinations treat the luminaries with an
// orb of 1.4 (broken-builds.mjs --l5-control <dir>), must fail.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { attempt, difference, entry, finish, fnv1a, manifest, mulberry32, options } from "./load.mjs";

const args = options();
if (!args.package) throw new Error("usage: node same-answers.mjs --package <root> [--lite <dir>] [--out report.json]");
const root = await entry(args.package, ".");
const techniques = await entry(args.package, "./techniques");
const lite = args.lite ? await import(pathToFileURL(resolve(args.lite, "dist/lite.js")).href) : await entry(args.package, "./lite");

const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const CLASSICAL = BODIES.slice(0, 7);

function stream(part) {
  const next = mulberry32(fnv1a(`engine-1-1-0-rc2-lite:${part}`));
  const uniform = (low, high) => low + (high - low) * next();
  const integer = (low, high) => Math.floor(uniform(low, high + 1));
  const shuffle = (list) => {
    const out = [...list];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const other = integer(0, index);
      [out[index], out[other]] = [out[other], out[index]];
    }
    return out;
  };
  return { next, uniform, integer, shuffle, pick: (list) => list[integer(0, list.length - 1)] };
}

/** One part's tally: each case run on both sides and compared. */
function tally(part, cases) {
  const differences = [];
  let refusedAlike = 0;
  for (const [index, [name, here, home]] of cases.entries()) {
    const a = attempt(here);
    const b = attempt(home);
    if ("error" in a || "error" in b) {
      if (a.error === b.error && a.error !== undefined) refusedAlike += 1;
      else differences.push({ index, name, lite: a, home: b });
      continue;
    }
    const at = difference(a.value, b.value);
    if (at !== null) differences.push({ index, name, at });
  }
  return { part, cases: cases.length, agree: cases.length - differences.length, refusedAlike, differences: differences.slice(0, 20), differing: differences.length };
}

// Declinations.
const declinationCases = [];
{
  const random = stream("declinations");
  const labels = [...BODIES, "Ascendant", "Midheaven", "Chiron", "Lilith"];
  const policies = [undefined, { orb: 0.5, luminaryOrb: 1 }, { orb: 2, luminaryOrb: 2.5 }];
  for (let index = 0; index < 1000; index += 1) {
    const bodies = random.shuffle(labels).slice(0, random.integer(3, 12)).map((body) => ({ body, lon: random.uniform(0, 360), lat: random.uniform(-10, 10) }));
    const obliquity = random.uniform(23.43, 23.45);
    const policy = policies[index % 3];
    const args = policy === undefined ? [bodies, obliquity] : [bodies, obliquity, policy];
    declinationCases.push(["findDeclinationAspects", () => lite.findDeclinationAspects(...args), () => root.findDeclinationAspects(...args)]);
    declinationCases.push(["declinationsForBodies", () => lite.declinationsForBodies(...args), () => root.declinationsForBodies(...args)]);
    const { body, lon, lat } = bodies[0];
    declinationCases.push(["declinationOf", () => lite.declinationOf(lon, lat, obliquity), () => root.declinationOf(lon, lat, obliquity)]);
    declinationCases.push(["eclipticToEquatorial", () => lite.eclipticToEquatorial(lon, lat, obliquity), () => root.eclipticToEquatorial(lon, lat, obliquity)]);
    const pair = policy === undefined ? [body, bodies[1].body] : [body, bodies[1].body, policy];
    declinationCases.push(["declinationOrb", () => lite.declinationOrb(...pair), () => root.declinationOrb(...pair)]);
  }
  const refused = [
    [[{ body: "Sun", lon: 0, lat: 0 }, { body: "Sun", lon: 1, lat: 0 }], 23.44],
    [[{ body: "Sun", lon: Number.NaN, lat: 0 }], 23.44],
    [[{ body: "Sun", lon: 0, lat: 91 }], 23.44],
    [[{ body: "Sun", lon: 0, lat: 0 }], 91],
    [[{ body: " Sun", lon: 0, lat: 0 }], 23.44],
    [{ length: 0 }, 23.44],
    [[{ body: "Sun", lon: 0, lat: 0 }], 23.44, { orb: 1 }]
  ];
  for (const args of refused) {
    declinationCases.push(["findDeclinationAspects refused", () => lite.findDeclinationAspects(...args), () => root.findDeclinationAspects(...args)]);
  }
  for (const name of ["DEFAULT_DECLINATION_ORB_POLICY", "RA_POLE_TOLERANCE", "SUN_BOUND_LATITUDE"]) declinationCases.push([name, () => lite[name], () => root[name]]);
}

// Composite.
const compositeCases = [];
{
  const random = stream("composite");
  for (let index = 0; index < 1000; index += 1) {
    const a = random.shuffle(BODIES).slice(0, random.integer(1, 12)).map((body) => ({ body, lon: random.uniform(0, 360) }));
    const b = random.shuffle(BODIES).slice(0, random.integer(1, 12)).map((body) => {
      const own = a.find((point) => point.body === body);
      const roll = random.next();
      if (own && roll < 0.15) return { body, lon: own.lon };
      if (own && roll < 0.3) return { body, lon: (own.lon + 180) % 360 };
      return { body, lon: random.uniform(0, 360) };
    });
    compositeCases.push(["compositeMidpoints", () => lite.compositeMidpoints(a, b), () => techniques.compositeMidpoints(a, b)]);
    compositeCases.push([
      "compositeAspects", () => lite.compositeAspects(lite.compositeMidpoints(a, b)), () => techniques.compositeAspects(techniques.compositeMidpoints(a, b))
    ]);
  }
  for (const [a, b] of [
    [[{ body: "Sun", lon: 1 }, { body: "Sun", lon: 2 }], []],
    [[{ body: "Chiron", lon: 1 }], []],
    [[{ body: "Sun", lon: Number.POSITIVE_INFINITY }], []],
    ["Sun", []]
  ]) {
    compositeCases.push(["compositeMidpoints refused", () => lite.compositeMidpoints(a, b), () => techniques.compositeMidpoints(a, b)]);
  }
}

// Dignities.
const dignityCases = [];
{
  const random = stream("dignities");
  for (const planet of BODIES) {
    for (const sign of SIGNS) {
      for (const name of ["dignityFor", "dignitiesFor"]) dignityCases.push([name, () => lite[name](planet, sign), () => techniques[name](planet, sign)]);
    }
    dignityCases.push(["hasClassicalDignities", () => lite.hasClassicalDignities(planet), () => techniques.hasClassicalDignities(planet)]);
  }
  for (let index = 0; index < 1000; index += 1) {
    // Every fourth longitude on a whole degree, where terms and faces begin and end.
    const lon = index % 4 === 0 ? random.integer(0, 359) : random.uniform(0, 360);
    dignityCases.push(["dignityRulersAt", () => lite.dignityRulersAt(lon), () => techniques.dignityRulersAt(lon)]);
  }
  for (let index = 0; index < 500; index += 1) {
    const planet = random.pick(CLASSICAL);
    const lon = random.uniform(0, 360);
    const sect = index % 2 === 0 ? "day" : "night";
    dignityCases.push(["essentialDignities", () => lite.essentialDignities(planet, lon, sect), () => techniques.essentialDignities(planet, lon, sect)]);
  }
  const wanted = [undefined, { dignities: ["domicile", "exaltation", "triplicity", "term", "face"], sect: "night" }, { dignities: ["term", "face"] }];
  for (let index = 0; index < 300; index += 1) {
    const positions = random.shuffle(BODIES).slice(0, random.integer(2, 12)).map((body) => ({ body, lon: random.uniform(0, 360) }));
    const option = wanted[index % 3];
    const args = option === undefined ? [positions] : [positions, option];
    dignityCases.push(["mutualReceptions", () => lite.mutualReceptions(...args), () => techniques.mutualReceptions(...args)]);
  }
  for (const [name, args] of [
    ["dignityFor", ["Sun", "Leo"]], ["dignityFor", ["Chiron", "leo"]], ["dignitiesFor", ["Sun", ""]], ["hasClassicalDignities", ["toString"]],
    ["essentialDignities", ["Uranus", 10, "day"]], ["essentialDignities", ["Mars", 10, "dusk"]], ["dignityRulersAt", [Number.NaN]],
    ["mutualReceptions", [[], { dignities: ["triplicity"] }]], ["mutualReceptions", [[{ body: "Sun", lon: 1 }, { body: "Sun", lon: 2 }]]]
  ]) {
    dignityCases.push([`${name} refused`, () => lite[name](...args), () => techniques[name](...args)]);
  }
  for (const name of ["CHALDEAN_FACES", "CLASSICAL_PLANETS", "DOMICILE_RULERS", "EGYPTIAN_TERMS", "EXALTATIONS", "TRIPLICITY_LORDS"]) {
    dignityCases.push([name, () => lite[name], () => techniques[name]]);
  }
}

// Sect: the ecliptic convention against the root's sectOf.
const sectCases = [];
{
  const random = stream("sect");
  for (let index = 0; index < 2000; index += 1) {
    const ascendant = index % 10 < 5 ? random.integer(0, 359) + random.integer(0, 3) / 4 : random.uniform(0, 360);
    // The Sun exactly on the ascendant, exactly on the descendant, or anywhere.
    const sun = index % 5 === 0 ? ascendant : index % 5 === 1 ? (ascendant + 180) % 360 : random.uniform(0, 360);
    sectCases.push(["sectReading ecliptic", () => lite.sectReading({ convention: "ecliptic", ascendant, sunLon: sun }).sect, () => root.sectOf(ascendant, sun)]);
  }
}

const parts = [tally("declinations", declinationCases), tally("composite", compositeCases), tally("dignities", dignityCases), tally("sect", sectCases)];

// Identity: no function or table of the copied parts is its home entry's object.
const homes = {
  declinations: [root, ["DEFAULT_DECLINATION_ORB_POLICY", "declinationOf", "declinationOrb", "declinationsForBodies", "eclipticToEquatorial", "findDeclinationAspects"]],
  composite: [techniques, ["compositeAspects", "compositeMidpoints"]],
  dignities: [techniques, ["CHALDEAN_FACES", "CLASSICAL_PLANETS", "DOMICILE_RULERS", "EGYPTIAN_TERMS", "EXALTATIONS", "TRIPLICITY_LORDS", "dignitiesFor", "dignityFor", "dignityRulersAt", "essentialDignities", "hasClassicalDignities", "mutualReceptions"]]
};
const shared = Object.entries(homes).flatMap(([, [home, names]]) => names.filter((name) => lite[name] === home[name]));
const report = {
  check: "L5",
  package: manifest(args.package).version,
  lite: args.lite ? "the control build named by --lite" : "the package's own ./lite",
  node: process.version,
  parts,
  identityDiffers: shared.length === 0,
  shared,
  pass: parts.every((part) => part.differing === 0) && shared.length === 0
};
finish(report, args.out);
