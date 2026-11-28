// Run with: node examples/library.mjs (after installing draconic's tooling).
// This setup is specific to this private source checkout; it writes no build.
import { register } from "node:module";
import { readFile } from "node:fs/promises";

register(new URL("../scripts/source-loader.mjs", import.meta.url));
const { draconicChart, draconicCompare, rotateLongitude, signedLongitudeDelta } =
  await import("../src/index.ts");

// Invented input only. The library takes BirthInput, without the CLI envelope.
const { birth } = JSON.parse(await readFile(new URL("./synthetic.json", import.meta.url), "utf8"));
const context = { sourceInstant: birth.utc };
const chart = draconicChart(birth, {}, context); // Default true north node.
const comparison = draconicCompare(birth, { node: "mean" }, context);

// Independent hand arithmetic in test/ARITHMETIC.md, not this cast's positions:
// Sun: 100.5 - 75.25 = 25.25; Moon: 15 - 75.25 + 360 = 299.75.
// Moon delta: 299.75 - 15 - 360 = -75.25 degrees.
const arithmetic = {
  sunLongitude: rotateLongitude(100.5, 75.25),
  moonLongitude: rotateLongitude(15, 75.25),
  moonDeltaDegrees: signedLongitudeDelta(15, 299.75)
};

// I/O belongs to this example; the imported library functions perform no I/O.
process.stdout.write(`${JSON.stringify({ arithmetic, chart, comparison }, null, 2)}\n`);
