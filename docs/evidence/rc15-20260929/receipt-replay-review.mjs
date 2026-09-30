// How far this build's replay of receipts that rc.14 wrote moves from the
// result rc.14 stored in them. The carried rc.14 archive, in its own
// process, serializes a receipt for each of five synthetic charts, the ones
// a review of rc.15 used; this build parses each, replays its request and
// compares the result. The fixture receipt src/fixtures/receipt-rc14.json
// (1990-06-15 08:30 in New York) is the sixth row. Angles and cusps are in
// degrees.
//
//   node receipt-replay-review.mjs <rc.14 package directory> <this package directory>
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CHARTS = [
  { utc: "1985-03-10T04:20:00.000Z", latitude: 48.85, longitude: 2.35, houseSystem: "placidus" },
  { utc: "1955-11-01T23:00:00.000Z", latitude: -33.9, longitude: 18.4, houseSystem: "koch" },
  { utc: "2031-07-04T12:00:00.000Z", latitude: 35.7, longitude: 139.7, houseSystem: "whole" },
  { utc: "2016-12-31T23:59:30.000Z", latitude: 10, longitude: 10, houseSystem: "whole" },
  { utc: "2003-05-05T05:05:05.000Z", timeKnown: false, houseSystem: "whole" }
];

if (process.argv[2] === "--rc14") {
  const root = process.argv[3];
  const engine = await import(pathToFileURL(join(root, "dist/index.js")).href);
  const receipt = await import(pathToFileURL(join(root, "dist/receipt.js")).href);
  if (engine.ENGINE_VERSION !== "0.1.1-rc.14") throw new Error(engine.ENGINE_VERSION);
  const texts = CHARTS.map((input) =>
    receipt.serializeNatalEnvelope(receipt.createNatalEnvelope(engine.natalChart({ ...input, utc: new Date(input.utc) }), { reference: "supplied-instant" }))
  );
  process.stdout.write(JSON.stringify(texts));
} else {
  const [before, after] = process.argv.slice(2);
  const texts = JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--rc14", before], { encoding: "utf8" }));
  texts.push(readFileSync(join(after, "src/fixtures/receipt-rc14.json"), "utf8").trimEnd());
  const engine = await import(pathToFileURL(join(after, "dist/index.js")).href);
  const receipt = await import(pathToFileURL(join(after, "dist/receipt.js")).href);
  const turn = (a, b) => Math.abs(((((b - a) % 360) + 540) % 360) - 180);
  const rows = texts.map((text) => {
    const parsed = receipt.parseNatalEnvelope(text);
    if (!parsed.ok) throw new Error(`refused: ${parsed.code}`);
    const stored = parsed.envelope.result;
    const chart = engine.natalChart(receipt.natalReplayInput(parsed.envelope));
    const bodies = Math.max(...stored.bodies.map((body) => turn(body.lon, chart.bodies.find((row) => row.body === body.body).lon)));
    const angles = stored.angles ? Math.max(turn(stored.angles.asc, chart.angles.asc), turn(stored.angles.mc, chart.angles.mc)) : null;
    const cusps = stored.houses ? Math.max(...stored.houses.cusps.map((cusp, k) => turn(cusp, chart.houses.cusps[k]))) : null;
    const r = parsed.envelope.receipt;
    return { instant: r.instant, coordinates: r.coordinates, houses: r.houses.requested, bodies, angles, cusps };
  });
  for (const row of rows) console.log(JSON.stringify(row));
  const largest = (key) => Math.max(...rows.map((row) => row[key] ?? 0));
  console.log(`largest: bodies ${largest("bodies").toPrecision(3)}°, angles ${largest("angles").toPrecision(3)}°, cusps ${largest("cusps").toPrecision(3)}°`);
}
