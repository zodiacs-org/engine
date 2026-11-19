// What an engine from before the choice of pass does with this candidate's
// receipts (CHANGELOG.md, 1.1.0-rc.6, Receipts).
//
//   node later-receipt-on-earlier-readers.mjs <this build's checkout> <unpacked reader package>
//
// The second directory is a carried archive, unpacked beside a node_modules
// that holds astronomy-engine 2.1.19: artifacts/zodiacs-engine-1.1.0-rc.3.tgz
// for later-receipt-on-rc3.json and artifacts/zodiacs-engine-1.1.0-rc.1.tgz
// for later-receipt-on-rc1.json. The births are synthetic, in New York:
// 01:30 on 2021-11-07, a time the clock showed twice; 12:00 on 2021-06-15, an
// ordinary time; and 02:30 on 2021-03-14, a time the clock skipped.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [candidateDir, readerDir] = process.argv.slice(2).map((dir) => resolve(dir));
const load = (dir, file) => import(pathToFileURL(join(dir, "dist", file)).href);
const candidate = { ...(await load(candidateDir, "index.js")), ...(await load(candidateDir, "geo.js")), ...(await load(candidateDir, "receipt.js")) };
const reader = { ...(await load(readerDir, "index.js")), ...(await load(readerDir, "receipt.js")) };

const place = { timeZone: "America/New_York", latitude: 40.7128, longitude: -74.006 };
const TIMES = {
  repeated: { date: "2021-11-07", time: "01:30" },
  ordinary: { date: "2021-06-15", time: "12:00" },
  skipped: { date: "2021-03-14", time: "02:30" }
};
const verdict = (parsed) => (parsed.ok ? "ok" : parsed.code);
const out = { candidate: candidate.ENGINE_VERSION, reader: reader.ENGINE_VERSION, node: process.version, times: {} };
for (const [label, when] of Object.entries(TIMES)) {
  const passes = {};
  const texts = {};
  for (const fold of ["earlier", "later"]) {
    const { birth, resolution, reference } = candidate.resolveLocalBirth({ ...when, ...place, fold });
    const envelope = candidate.createNatalEnvelope(candidate.natalChart(birth), { reference, localResolution: resolution.localResolution });
    const text = (texts[fold] = candidate.serializeNatalEnvelope(envelope));
    // The same record under the reader's own version, so that the record
    // alone decides: the reader does not know the candidate's version.
    const asReader = JSON.parse(text);
    asReader.receipt.engine.version = reader.ENGINE_VERSION;
    passes[fold] = {
      asked: fold,
      instant: birth.utc.toISOString(),
      inputFlags: envelope.receipt.inputFlags,
      policy: envelope.receipt.localResolution.policy,
      candidateReads: candidate.parseNatalEnvelope(text).ok,
      readerReadsAsWritten: verdict(reader.parseNatalEnvelope(text)),
      readerReadsUnderItsOwnVersion: verdict(reader.parseNatalEnvelope(JSON.stringify(asReader)))
    };
  }
  out.times[label] = { ...when, ...passes, sameReceiptWhicheverPassIsAsked: texts.earlier === texts.later };
}
console.log(JSON.stringify(out, null, 1));
