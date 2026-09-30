// The receipt codec's verdict on engine versions that no release wrote, in the
// carried rc.14 archive and in this build: rc.14's receipt fixture (the rc.8
// set, src/fixtures/receipt-rc14.json) relabelled with each version, and a
// receipt of the time-basis set that this build writes for the same synthetic
// chart, relabelled likewise (rc.14 has no such set).
//
//   node version-probe.mjs <rc.14 package directory> <this package directory>
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [rc14Root, candidateRoot] = process.argv.slice(2).map((path) => resolve(path));
const load = (root, entry) => import(pathToFileURL(join(root, "dist", entry)).href);
const fixture = readFileSync(join(candidateRoot, "src/fixtures/receipt-rc14.json"), "utf8");
const engine = await load(candidateRoot, "index.js");
const candidate = await load(candidateRoot, "receipt.js");
const current = candidate.serializeNatalEnvelope(
  candidate.createNatalEnvelope(engine.natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" }))
);
const VERSIONS = ["0.1.1-rc.13", "0.1.1-rc.13+..", "0.1.1-rc.01", "0.1.1-rc.14.1", "0.1.1-beta", "0.1.1-alpha.7", "0.1.1-rc", "0.1.1-rc.15"];
const verdict = (codec, json, version) => {
  const copy = JSON.parse(json);
  copy.receipt.engine.version = version;
  const parsed = codec.parseNatalEnvelope(JSON.stringify(copy));
  return parsed.ok ? "ok" : parsed.code;
};
const rc14 = await load(rc14Root, "receipt.js");
console.log("version            rc.8 set: rc.14 | this build   time-basis set: this build");
for (const version of VERSIONS) {
  console.log(`${version.padEnd(19)}${verdict(rc14, fixture, version).padEnd(22)}${verdict(candidate, fixture, version).padEnd(35)}${verdict(candidate, current, version)}`);
}
