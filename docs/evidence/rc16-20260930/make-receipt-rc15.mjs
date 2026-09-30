// Serialize a draft natal receipt with the carried 0.1.1-rc.15 archive, for
// the synthetic chart of src/fixtures/receipt-rc13.json and receipt-rc14.json
// (1990-06-15 08:30 in New York, Placidus), resolved as rc.15 resolves a local
// birth, so that its local resolution carries the fields of rc.15's
// conventions set. src/fixtures/receipt-rc15.json is this script's output
// with one newline appended.
//
// The archive, artifacts/zodiacs-engine-0.1.1-rc.15.tgz, is checked against
// its receipt and unpacked under TMPDIR (outside the checkout), with the
// checkout's astronomy-engine, by the nutation evidence's unpackRc15:
//
//   node docs/evidence/rc16-20260930/make-receipt-rc15.mjs > src/fixtures/receipt-rc15.json && echo >> src/fixtures/receipt-rc15.json
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { unpackRc15 } from "../nutation-2026-09-29/tools/engines.mjs";

const rc15 = unpackRc15();
try {
  const load = (name) => import(pathToFileURL(join(rc15.dist, name)).href);
  const { ENGINE_VERSION, natalChart } = await load("index.js");
  const { resolveLocalBirth } = await load("geo.js");
  const { createNatalEnvelope, serializeNatalEnvelope } = await load("receipt.js");
  if (ENGINE_VERSION !== "0.1.1-rc.15") throw new Error(ENGINE_VERSION);
  const { birth, resolution, reference } = resolveLocalBirth({
    date: "1990-06-15",
    time: "08:30",
    timeZone: "America/New_York",
    latitude: 40.7128,
    longitude: -74.006,
    houseSystem: "placidus"
  });
  const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
  process.stdout.write(serializeNatalEnvelope(envelope));
} finally {
  rc15.cleanup();
}
