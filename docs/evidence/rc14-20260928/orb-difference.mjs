// How far exact configured-aspect orbs (rc.13 on, unchanged in rc.14) are from
// rc.12's floating-point ones: the review's example, and the largest difference
// over 200,000 seeded random pairs of full-precision longitudes under custom
// angles in hundredths of a degree, with an orb wide enough that both match.
//
// usage: node orb-difference.mjs <rc.12 dist/index.js> <candidate dist/index.js>
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [before, after] = await Promise.all(process.argv.slice(2, 4).map((path) => import(pathToFileURL(resolve(path)).href)));
const example = [{ body: "Moon", lon: 331.026, speed: 13 }, { body: "Sun", lon: 103.38600000000001, speed: 1 }];
const exampleOrb = (engine) => engine.findConfiguredAspects(example,
  engine.createAspectPolicy({ bodies: ["Moon", "Sun"], aspects: [{ type: "custom", angle: 132.36, orb: 1 }] })).aspects[0].orb;

let seed = 7;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
let largest = 0;
let where = null;
let pairs = 0;
for (let i = 0; i < 200_000; i += 1) {
  const a = (random() + random() * 2 ** -32) * 360;
  const b = (random() + random() * 2 ** -32) * 360;
  const angle = Math.round(random() * 18000) / 100;
  const rows = [{ body: "P", lon: a, speed: 0 }, { body: "Q", lon: b, speed: 0 }];
  const orbOf = (engine) => engine.findConfiguredAspects(rows,
    engine.createAspectPolicy({ bodies: ["P", "Q"], aspects: [{ type: "custom", angle, orb: 180 }] })).aspects[0]?.orb;
  const x = orbOf(before);
  const y = orbOf(after);
  if (x === undefined || y === undefined) continue;
  pairs += 1;
  if (Math.abs(x - y) > largest) { largest = Math.abs(x - y); where = { a, b, angle, before: x, after: y }; }
}
console.log(JSON.stringify({
  versions: [before.ENGINE_VERSION, after.ENGINE_VERSION],
  example: { rows: example, angle: 132.36, before: exampleOrb(before), after: exampleOrb(after), differenceInUnitsOf2PowMinus46: Math.abs(exampleOrb(before) - exampleOrb(after)) / 2 ** -46 },
  random: { pairs, largestDifference: largest, inUnitsOf2PowMinus45: largest / 2 ** -45, at: where }
}, null, 2));
