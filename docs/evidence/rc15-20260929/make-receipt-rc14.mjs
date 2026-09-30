// Serialize a draft natal receipt with the carried 0.1.1-rc.14 archive, for a
// synthetic chart (1990-06-15 08:30 in New York), as src/fixtures/receipt-rc13.json
// was made with rc.13. src/fixtures/receipt-rc14.json is this script's output
// with one newline appended (SHA-256
// af72929d7a9113f378bf491730763bcf2d98ff30eacaa48f9c6d468838ee85a7).
//
// Run it in a directory outside the checkout, with no node_modules or
// package.json above it, where the carried archive is installed:
//
//   npm init -y && npm install <checkout>/artifacts/zodiacs-engine-0.1.1-rc.14.tgz
//   node make-receipt-rc14.mjs > receipt-rc14.json && echo >> receipt-rc14.json
//
// (with "type": "module" in that package.json, or the file named .mjs as here).
import { natalChart, ENGINE_VERSION } from "@zodiacs/engine";
import { resolveLocalToUtc } from "@zodiacs/engine/geo";
import { createNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
const local = resolveLocalToUtc("1990-06-15", "08:30", "America/New_York");
const chart = natalChart({ utc: local.utc, latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" });
const envelope = createNatalEnvelope(chart, {
  reference: "supplied-instant",
  localResolution: {
    date: "1990-06-15", time: "08:30", timeZone: "America/New_York",
    offsetMinutes: local.offsetMinutes, gapShiftMinutes: 0, policy: { fold: "earlier", gap: "shift-forward" }
  }
});
if (ENGINE_VERSION !== "0.1.1-rc.14") throw new Error(ENGINE_VERSION);
process.stdout.write(serializeNatalEnvelope(envelope));
