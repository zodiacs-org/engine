/*
 * The independent path: the chart's discrete features at every whole second of
 * a window, from the engine's public root entry point only (natalChart,
 * houseOf, signForLongitude). It imports nothing from @zodiacs/engine/window
 * and shares no code with its search.
 *
 * By default it loads the build in ../../../dist (run `npm run build` first);
 * ZODIACS_ENGINE_DIST points it at another build.
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = resolve(
  process.env.ZODIACS_ENGINE_DIST ?? fileURLToPath(new URL("../../../dist", import.meta.url))
);
const engine = await import(pathToFileURL(resolve(dist, "index.js")).href);

const DAY = 86_400_000;
const PHYSICAL = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];

/** Every component's name, in a fixed order. */
export const COMPONENTS = (() => {
  const names = [];
  for (const body of [...PHYSICAL, "North Node", "South Node"]) names.push(`sign:${body}`);
  names.push("ascendant", "midheaven");
  for (const body of [...PHYSICAL, "North Node", "South Node"]) names.push(`house:${body}`);
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) names.push(`aspect:${PHYSICAL[i]}|${PHYSICAL[j]}`);
  }
  names.push("house-system");
  return Object.freeze(names);
})();

/** natalChart's features at one instant, keyed by component name. */
export function featuresAt(utc, window) {
  const chart = engine.natalChart({
    utc: new Date(utc),
    latitude: window.latitude,
    longitude: window.longitude,
    houseSystem: window.houseSystem
  });
  const features = {};
  for (const body of chart.bodies) {
    features[`sign:${body.body}`] = body.sign;
    features[`house:${body.body}`] = engine.houseOf(body.lon, chart.houses.cusps);
  }
  features.ascendant = engine.signForLongitude(chart.angles.asc).slug;
  features.midheaven = engine.signForLongitude(chart.angles.mc).slug;
  const aspects = new Map(chart.aspects.map((aspect) => [`${aspect.a}|${aspect.b}`, aspect.type]));
  for (let i = 0; i < PHYSICAL.length; i += 1) {
    for (let j = i + 1; j < PHYSICAL.length; j += 1) {
      const pair = `${PHYSICAL[i]}|${PHYSICAL[j]}`;
      features[`aspect:${pair}`] = aspects.get(pair) ?? null;
    }
  }
  features["house-system"] = chart.houses.system;
  return features;
}

/**
 * astronomy-engine reuses its last nutation for any instant within 1e-6 day
 * (86.4 ms). natalChart's own calls are always further apart than that; the
 * first instant of a batch, and any instant within 100 ms of the one before,
 * is preceded by an evaluation a day away, so that every sample is computed as
 * a lone natalChart call would compute it, whatever ran before the batch.
 */
let previous = Number.NaN;
function freshFeaturesAt(utc, window) {
  if (!(Math.abs(utc - previous) > 100)) engine.natalChart({ utc: new Date(utc + DAY) });
  const features = featuresAt(utc, window);
  previous = utc;
  return features;
}

/**
 * The sample instants of a window [start, end): start and every whole second
 * after it inside the window, then end − 1 ms if that is not already one.
 */
export function sampleTimes(window) {
  const times = [];
  for (let time = window.start; time < window.end; time += 1000) times.push(time);
  if (times.at(-1) !== window.end - 1) times.push(window.end - 1);
  return times;
}

/** Features at every sample instant. */
export function sample(window) {
  previous = Number.NaN;
  return sampleTimes(window).map((time) => ({ time, features: freshFeaturesAt(time, window) }));
}

/** Features at single instants, each computed fresh (for millisecond confirmations). */
export function probe(window, times) {
  previous = Number.NaN;
  return times.map((time) => ({ time, features: freshFeaturesAt(time, window) }));
}
