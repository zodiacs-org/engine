import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync("node_modules/@zodiacs/engine/package.json", "utf8"));
let refused = 0;
for (const key of Object.keys(pkg.exports)) {
  const spec = "@zodiacs/engine" + key.slice(1);
  try { require(spec); console.log("NOT REFUSED", spec); } catch (e) { if (e.code === "ERR_ZODIACS_ESM_ONLY") refused++; else console.log("other", spec, e.code); }
}
console.log(`require refused with ERR_ZODIACS_ESM_ONLY: ${refused} of ${Object.keys(pkg.exports).length}`);
const root = await import("@zodiacs/engine");
const chart = root.natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006 });
console.log("version", pkg.version, "ENGINE_VERSION", root.ENGINE_VERSION, "bodies", chart.bodies?.length ?? Object.keys(chart.bodies ?? {}).length, "source", root.defaultEphemeris().name);
try { root.searchLongitudeCrossings("Vulcan", 0, new Date("2026-01-01T00:00:00Z"), new Date("2026-02-01T00:00:00Z")); console.log("no throw"); } catch (e) { console.log("unknown body:", e.constructor.name, e.message); }
