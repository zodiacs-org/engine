import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const manifestUrl = new URL("../sources/manifest.json", import.meta.url);
const receiptUrl = new URL("../sources/retrieval.json", import.meta.url);

/** Hash network inputs in memory. Never save a bulk catalog or a full scan. */
export async function auditResource(resource, fetchImplementation = fetch) {
  const response = await fetchImplementation(resource.url, { signal: AbortSignal.timeout(60_000) });
  assert(response.ok && response.body, `source unavailable: ${resource.id}`);
  const hash = createHash("sha256");
  let bytes = 0;
  let firstLine = "";
  let headerComplete = !resource.csvHeader;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    assert(bytes <= resource.maximumBytes, `source exceeds download budget: ${resource.id}`);
    hash.update(chunk);
    if (!headerComplete) {
      firstLine += Buffer.from(chunk).toString("utf8");
      const end = firstLine.indexOf("\n");
      if (end >= 0) {
        firstLine = firstLine.slice(0, end).replace(/\r$/u, "");
        headerComplete = true;
      }
      assert(firstLine.length <= 16_384, `source header exceeds budget: ${resource.id}`);
    }
  }
  const sha256 = hash.digest("hex");
  assert.equal(sha256, resource.sha256, `source digest changed: ${resource.id}`);
  if (resource.csvHeader) {
    assert(headerComplete, `source has no header terminator: ${resource.id}`);
    assert.equal(firstLine, resource.csvHeader, `source header changed: ${resource.id}`);
  }
  return { id: resource.id, sha256, bytes, ...(resource.csvHeader ? { csvHeader: firstLine } : {}) };
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0] === "--check"), "usage: node scripts/audit-sources.mjs [--check]");
  const manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
  const resources = [];
  for (const resource of manifest.resources) resources.push(await auditResource(resource));
  const receipt = { schema: "fixedstars-source-retrieval/1", resources };
  if (args[0] === "--check") {
    assert.deepEqual(receipt, JSON.parse(readFileSync(receiptUrl, "utf8")), "source retrieval receipt changed");
    console.log("All pinned source digests and the catalog header match the committed receipt.");
  } else {
    console.log(JSON.stringify(receipt, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
