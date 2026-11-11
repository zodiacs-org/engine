// What 1.1.0-rc.3 does with a receipt that records the later pass of a
// repeated hour (CHANGELOG.md, 1.1.0-rc.4, Receipts).
//
//   node later-receipt-on-rc3.mjs <this build's checkout> <unpacked 1.1.0-rc.3 package>
//
// The second directory is the carried archive
// artifacts/zodiacs-engine-1.1.0-rc.3.tgz, unpacked beside a node_modules
// that holds astronomy-engine 2.1.19. The birth is synthetic: 01:30 in New
// York on 2021-11-07, a time the clock showed twice.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [candidateDir, rc3Dir] = process.argv.slice(2).map((dir) => resolve(dir));
const load = (dir, file) => import(pathToFileURL(join(dir, "dist", file)).href);
const candidate = { ...(await load(candidateDir, "index.js")), ...(await load(candidateDir, "geo.js")), ...(await load(candidateDir, "receipt.js")) };
const rc3 = { ...(await load(rc3Dir, "index.js")), ...(await load(rc3Dir, "receipt.js")) };

const form = { date: "2021-11-07", time: "01:30", timeZone: "America/New_York", latitude: 40.7128, longitude: -74.006 };
const out = { candidate: candidate.ENGINE_VERSION, reader: rc3.ENGINE_VERSION, node: process.version, passes: {} };
for (const fold of ["earlier", "later"]) {
  const { birth, resolution, reference } = candidate.resolveLocalBirth({ ...form, fold });
  const envelope = candidate.createNatalEnvelope(candidate.natalChart(birth), { reference, localResolution: resolution.localResolution });
  const text = candidate.serializeNatalEnvelope(envelope);
  // The same record under the reader's own version, so that the fold alone
  // decides: 1.1.0-rc.3 does not know the candidate's version.
  const asReader = JSON.parse(text);
  asReader.receipt.engine.version = rc3.ENGINE_VERSION;
  out.passes[fold] = {
    instant: birth.utc.toISOString(),
    policy: envelope.receipt.localResolution.policy,
    candidateReads: candidate.parseNatalEnvelope(text).ok,
    rc3ReadsAsWritten: verdict(rc3.parseNatalEnvelope(text)),
    rc3ReadsUnderItsOwnVersion: verdict(rc3.parseNatalEnvelope(JSON.stringify(asReader)))
  };
}
function verdict(parsed) {
  return parsed.ok ? "ok" : parsed.code;
}
console.log(JSON.stringify(out, null, 1));
