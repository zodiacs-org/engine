/*
 * The true node's flicker at three of its ingresses, as RESULTS.md and the
 * README time it ("three-hour windows around the ingresses of March 2028 and
 * September 2029 ... 311 and 147 sign changes ... July 2026 ... 1,579"): for
 * each, birthWindow over the three hours centred on the ingress's minute in
 * ./node-ingresses.json, Placidus at 51.5° N 0° E (the node's sign does not
 * depend on the place), and the number of switches that change the North
 * Node's sign, all switches, the unresolved intervals and the search's time,
 * the best of three runs. Each build given runs in its own process.
 *
 *   node node-flicker.mjs <label>=<dist directory> ... [--out FILE]
 *
 * out defaults to ./node-flicker.json.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const INGRESSES = ["2026-07", "2028-03", "2029-09"];
const HALF = 90 * 60_000;

if (process.argv[2] === "--run") {
  const { birthWindow } = await import(pathToFileURL(resolve(process.argv[3], "window.js")).href);
  const rows = JSON.parse(readFileSync(resolve(here, "node-ingresses.json"), "utf8")).rows;
  const out = [];
  for (const month of INGRESSES) {
    const ingress = rows.find((row) => row.at.startsWith(month));
    const at = Date.parse(ingress.at);
    const input = { start: new Date(at - HALF), end: new Date(at + HALF), latitude: 51.5, longitude: 0, houseSystem: "placidus" };
    let best = Infinity;
    let result;
    for (let run = 0; run < 3; run += 1) {
      const t0 = performance.now();
      result = birthWindow(input);
      best = Math.min(best, performance.now() - t0);
    }
    const nodeSign = result.switches.filter((s) => s.changes.some((c) => c.feature === "sign" && c.body === "North Node"));
    out.push({
      ingress: ingress.at,
      window: [input.start.toISOString(), input.end.toISOString()],
      nodeSignSwitches: nodeSign.length,
      firstNodeSwitch: nodeSign[0]?.at ?? null,
      lastNodeSwitch: nodeSign.at(-1)?.at ?? null,
      switches: result.switches.length,
      unresolved: result.unresolved.length,
      flags: result.flags,
      bestSeconds: Number((best / 1000).toFixed(2))
    });
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const outFile = resolve(outIndex >= 0 ? args[outIndex + 1] : resolve(here, "node-flicker.json"));
  const builds = args.filter((arg, index) => arg.includes("=") && (outIndex < 0 || index !== outIndex + 1));
  const report = { tool: "docs/evidence/birth-window/rc16/node-flicker.mjs", node: process.version, builds: {} };
  for (const build of builds) {
    const [label, dist] = build.split("=");
    const text = execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--run", resolve(dist)], { encoding: "utf8", maxBuffer: 1 << 26 });
    report.builds[label] = JSON.parse(text);
  }
  writeFileSync(outFile, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify(report, null, 1));
}
