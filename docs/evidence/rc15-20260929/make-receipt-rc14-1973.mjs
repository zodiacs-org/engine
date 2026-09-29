// Serialize a natal receipt with the carried 0.1.1-rc.14 archive for a
// synthetic chart on a day of large UT1 - UTC: 1973-01-05T06:56:44Z at
// 59.33 N 18.07 E, Placidus, found by the review of rc.15 as the first
// second of that morning at which rc.14's ascendant lies within 18" below a
// sign (Sagittarius 29.99765°). UT1 - UTC was +0.80 s. src/fixtures/
// receipt-rc14-1973.json is this script's output with one newline appended
// (SHA-256 in src/replay-time-basis.test.ts).
//
// Run it in a directory outside the checkout, with no node_modules or
// package.json above it, where the carried archive is installed:
//
//   npm init -y && npm install <checkout>/artifacts/zodiacs-engine-0.1.1-rc.14.tgz
//   node make-receipt-rc14-1973.mjs > receipt-rc14-1973.json && echo >> receipt-rc14-1973.json
//
// (with "type": "module" in that package.json, or the file named .mjs as here).
import { natalChart, ENGINE_VERSION } from "@zodiacs/engine";
import { createNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
if (ENGINE_VERSION !== "0.1.1-rc.14") throw new Error(ENGINE_VERSION);
const chart = natalChart({ utc: "1973-01-05T06:56:44Z", latitude: 59.33, longitude: 18.07, houseSystem: "placidus" });
process.stdout.write(serializeNatalEnvelope(createNatalEnvelope(chart)));
