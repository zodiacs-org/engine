/*
 * The preregistered window generator (PREREGISTRATION.md): synthetic windows
 * and places, never anyone's birth data.
 *
 *   node generate.mjs [--seed N] [--count N] [--out FILE]
 *
 * Defaults: seed 20260928, 1,000 windows, windows.json beside this file.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const seed = Number(args.get("--seed") ?? 20260928);
const count = Number(args.get("--count") ?? 1000);
const out = args.get("--out") ?? fileURLToPath(new URL("windows.json", import.meta.url));

/** mulberry32 (Tommy Ettinger's 32-bit generator), uniform in [0, 1). */
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

const SYSTEMS = [
  "whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
  "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"
];
const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const random = mulberry32(seed);
const round6 = (value) => Math.round(value * 1e6) / 1e6;

const windows = [];
for (let id = 0; id < count; id += 1) {
  // Seven draws per window, always in this order.
  const [spread, place, band, where, side, east, pick] = Array.from({ length: 7 }, random);
  const seconds = Math.round(60 * 1440 ** spread); // log-uniform, 1 minute to 24 hours
  const start = FROM + Math.floor(place * (TO - FROM - seconds * 1000));
  let latitude;
  if (band < 0.35) latitude = -60 + 120 * where;
  else {
    const [low, high] = band < 0.65 ? [60, 66] : band < 0.85 ? [66, 67] : [67, 90];
    latitude = (side < 0.5 ? -1 : 1) * (low + (high - low) * where);
  }
  windows.push({
    id,
    start: new Date(start).toISOString(),
    end: new Date(start + seconds * 1000).toISOString(),
    seconds,
    latitude: round6(latitude),
    longitude: round6(-180 + 360 * east),
    houseSystem: SYSTEMS[Math.floor(pick * SYSTEMS.length)]
  });
}
writeFileSync(out, `${JSON.stringify({ generator: "mulberry32", seed, count, windows }, null, 1)}\n`);
console.log(`${count} windows (seed ${seed}) written to ${out}`);
