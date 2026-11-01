/*
 * F2 and F4 of the varga sensitivity check (PREREGISTRATION.md, section 6):
 * synthetic births, never anyone's birth data. Nothing here imports the
 * engine.
 *
 *   node generate.mjs [--g-v4] [--seed N] [--count N] [--out FILE]
 *
 * Without --g-v4, F2, the G-V3 corpus: seed 20261102, 1,000 births,
 * births.json beside INPUTS.md. With --g-v4, F4, the G-V4 corpus: seed
 * 20261103, 1,000 births, births-erfa.json beside INPUTS.md.
 *
 * Every birth takes the same draws from mulberry32 in the same order, used or
 * not (DRAWS below), so a birth's values never depend on another birth's
 * branches. Only marginal counts are printed.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const erfa = argv.includes("--g-v4");
const args = new Map();
for (let index = 0; index < argv.length; index += 1) {
  if (argv[index] === "--g-v4") continue;
  args.set(argv[index], argv[index + 1]);
  index += 1;
}
for (const key of args.keys()) {
  if (!["--seed", "--count", "--out"].includes(key)) throw new Error(`Unknown option ${key}.`);
}
const seed = Number(args.get("--seed") ?? (erfa ? 20261103 : 20261102));
const count = Number(args.get("--count") ?? 1000);
const out = args.get("--out") ?? fileURLToPath(new URL(erfa ? "../births-erfa.json" : "../births.json", import.meta.url));

/** mulberry32 (Tommy Ettinger's 32-bit generator), uniform in [0, 1), as docs/evidence/birth-window/generate.mjs has it. */
function mulberry32(state) {
  let a = state >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DRAWS = erfa
  ? ["instantHigh", "instantLow", "latitudeBand", "latitude", "hemisphere", "longitude", "deltaT", "ayanamsa"]
  : ["instantHigh", "instantLow", "latitudeBand", "latitude", "hemisphere", "longitude", "clock", "pinnedScale",
      "deltaT", "ayanamsa", "ayanamsaValue", "ayanamsaEpoch", "ayanamsaRate", "outerPlanets"];

/** Births from 1800-01-02T01:00:00Z to 2199-12-30T23:00:00Z inclusive, so that a 1,440-minute horizon on any clock stays inside REFERENCE_SPAN. */
const FROM = Date.UTC(1800, 0, 2, 1);
const TO = Date.UTC(2199, 11, 30, 23);
/** 1900-01-01T00:00 and 2100-01-01T00:00 TT as Julian dates: the span of a caller's epoch. */
const EPOCH_FROM_JD = 2_415_020.5;
const EPOCH_TO_JD = 2_488_069.5;
const VARGAS = ["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"];
const INNER = ["Ascendant", "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"];
const OUTER = ["Uranus", "Neptune", "Pluto"];
const NODES = ["Mean Node", "Mean South Node"];

const round6 = (value) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

/** Uniform to the millisecond over [FROM, TO]: two 32-bit draws, since one gives a grid of about 2.9 s over 400 years. */
function instant(high, low) {
  const span = TO - FROM + 1;
  return FROM + Math.min(span - 1, Math.floor((high + low / 4294967296) * span));
}

/** 70 per cent with |latitude| uniform in [0, 60], 30 per cent in [60, 66]; hemisphere at random; rounded to 1e-6 degree. */
function latitude(band, where, hemisphere) {
  const size = round6(band < 0.7 ? 60 * where : 60 + 6 * where);
  return size === 0 ? 0 : hemisphere < 0.5 ? -size : size;
}

/** Uniform in [-180, 180), rounded to 1e-6 degree (a value that rounds to 180 is -180). */
function longitude(east) {
  const value = round6(-180 + 360 * east);
  return value === 180 ? -180 : value;
}

/** Uniform in [0, 120] s to the millisecond. */
const pin = (draw) => Math.floor(draw * 120_001) / 1000;

const random = mulberry32(seed);
const births = [];
for (let id = 0; id < count; id += 1) {
  const draw = Object.fromEntries(DRAWS.map((name) => [name, random()]));
  const birth = { id, utc: new Date(instant(draw.instantHigh, draw.instantLow)).toISOString() };
  if (erfa) {
    birth.timeScale = "ut1";
    birth.deltaT = pin(draw.deltaT);
  } else if (draw.clock < 0.8) birth.timeScale = "utc";
  else if (draw.clock < 0.9) birth.timeScale = "ut1";
  else if (draw.clock < 0.95) birth.timeScale = "tt";
  else {
    birth.timeScale = ["utc", "ut1", "tt"][Math.floor(draw.pinnedScale * 3)];
    birth.deltaT = pin(draw.deltaT);
  }
  birth.latitude = latitude(draw.latitudeBand, draw.latitude, draw.hemisphere);
  birth.longitude = longitude(draw.longitude);
  if (erfa) birth.ayanamsa = draw.ayanamsa < 0.5 ? "lahiri" : "krishnamurti";
  else if (draw.ayanamsa < 0.4) birth.ayanamsa = "lahiri";
  else if (draw.ayanamsa < 0.8) birth.ayanamsa = "krishnamurti";
  else if (draw.ayanamsa < 0.9) birth.ayanamsa = "true-chitra";
  else {
    // A caller's definition: userAyanamsa's input, as given.
    const epoch = { julianDateTT: EPOCH_FROM_JD + draw.ayanamsaEpoch * (EPOCH_TO_JD - EPOCH_FROM_JD) };
    const value = 22 + 3 * draw.ayanamsaValue;
    birth.ayanamsa = draw.ayanamsa < 0.95
      ? { name: "user-epoch", epoch, value, model: "engine" }
      : { name: "user-linear", epoch, value, rate: -3600 + 7200 * draw.ayanamsaRate };
  }
  if (!erfa) birth.points = [...INNER, ...(draw.outerPlanets < 0.1 ? OUTER : []), ...NODES];
  births.push(birth);
}

const header = {
  generator: "docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/generate.mjs",
  corpus: erfa ? "F4, the G-V4 corpus (PREREGISTRATION.md, section 6)" : "F2, the G-V3 corpus (PREREGISTRATION.md, section 6)",
  prng: "mulberry32",
  seed,
  count,
  draws: DRAWS,
  input: { houseSystem: "whole" },
  options: erfa
    ? { points: ["Ascendant"], vargas: VARGAS, cyclic: true, horizonMinutes: 1440 }
    : { vargas: VARGAS, cyclic: true, horizonMinutes: 1440 },
  fields: erfa
    ? "each birth is a BirthInput (utc on timeScale ut1, deltaT pinned in seconds, latitude, longitude) with input's houseSystem, an ayanamsa name, and options"
    : "each birth is a BirthInput (utc on its timeScale, deltaT when pinned, latitude, longitude) with input's houseSystem, an ayanamsa name or userAyanamsa input, and options with its own points"
};
const opening = JSON.stringify(header, null, 1).replace(/\n\}$/u, ",\n \"births\": [\n");
const text = `${opening}${births.map((birth) => `  ${JSON.stringify(birth)}`).join(",\n")}\n ]\n}\n`;
JSON.parse(text);
writeFileSync(out, text);

// Marginal counts only.
const tally = (key) => births.reduce((counts, birth) => {
  const value = key(birth);
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});
const marginal = {
  clock: tally((birth) => (birth.deltaT === undefined ? birth.timeScale : `pinned ${birth.timeScale}`)),
  ayanamsa: tally((birth) => (typeof birth.ayanamsa === "string" ? birth.ayanamsa : birth.ayanamsa.name)),
  latitudeBand: tally((birth) => (Math.abs(birth.latitude) <= 60 ? "|latitude| <= 60" : "60 < |latitude| <= 66")),
  hemisphere: tally((birth) => (birth.latitude < 0 ? "south" : "north")),
  century: tally((birth) => `${birth.utc.slice(0, 2)}00s`),
  ...(erfa ? {} : { outerPlanets: tally((birth) => (birth.points.length === 13 ? "with" : "without")) })
};
console.log(JSON.stringify({
  out,
  sha256: createHash("sha256").update(text).digest("hex"),
  bytes: Buffer.byteLength(text),
  seed,
  count,
  marginal
}, null, 1));
