// Reads one release's natal envelopes with another release's codec: the
// serialized envelopes that values.mjs wrote on the first package (its line
// `receipt.envelopes all`), with that package's version put back where
// values.mjs wrote a placeholder, each parsed by the second package's
// parseNatalEnvelope. Prints each envelope's outcome, and whether the record
// it reads back equals the one the writer's own codec read (values.mjs's
// parseNatalEnvelope calls, one for each envelope, in the same order).
// With --tamper, as a control, each envelope that names Placidus names
// Porphyry instead, and each must be refused.
//
//   node receipts-cross.mjs <reading package directory> <writer's values.jsonl> <writer's version> [--tamper]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const tamper = process.argv.includes("--tamper");
const [root, valuesPath, writerVersion] = process.argv.slice(2).filter((arg) => arg !== "--tamper");
if (!root || !valuesPath || !writerVersion) {
  console.error("usage: node receipts-cross.mjs <reading package directory> <writer's values.jsonl> <writer's version>");
  process.exit(2);
}
const { ENGINE_VERSION } = await import(pathToFileURL(join(root, "dist", "index.js")).href);
const { parseNatalEnvelope } = await import(pathToFileURL(join(root, "dist", "receipt.js")).href);
const lines = readFileSync(valuesPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const written = lines.find((line) => line.id === "receipt.envelopes all #1").result.value;
const own = lines.filter((line) => /^receipt\.parseNatalEnvelope( contexts?)? #\d+$/u.test(line.id));
if (own.length !== written.length) throw new Error(`${written.length} envelopes but ${own.length} of the writer's own parses`);
let accepted = 0;
let tampered = 0;
console.log(`# ${written.length} envelopes written by ${writerVersion}, read by ${ENGINE_VERSION}${tamper ? ", each that names Placidus changed to Porphyry" : ""}`);
for (const [index, text] of written.entries()) {
  let restored = text.replaceAll('"<engine version>"', JSON.stringify(writerVersion));
  if (tamper) {
    if (!restored.includes('"placidus"')) continue;
    restored = restored.replace('"placidus"', '"porphyry"');
    tampered += 1;
  }
  const result = parseNatalEnvelope(restored);
  const ok = result.ok === true;
  if (ok) accepted += 1;
  if (tamper) {
    console.log(`envelope ${index}: ${ok ? "accepted" : `refused, ${result.code}`}`);
    continue;
  }
  const mine = own[index].result.value;
  const same =
    JSON.stringify(JSON.parse(JSON.stringify(result).replaceAll(JSON.stringify(writerVersion), '"<engine version>"'))) === JSON.stringify(mine)
      ? "the same record as the writer's own codec reads"
      : "a record other than the writer's own codec reads";
  console.log(`envelope ${index}: ${ok ? "accepted" : `refused, ${result.code}`}; ${same}`);
}
console.log(tamper ? `${tampered - accepted} of ${tampered} tampered envelopes refused` : `${accepted} of ${written.length} accepted`);
