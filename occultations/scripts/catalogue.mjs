import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import acquisition from "../data/sao-acquisition.json" with { type: "json" };

const root = new URL("../", import.meta.url);
const args = process.argv.slice(2);
const extract = args.length === 2 && args[0] === "--extract";
const download = args.length === 1 && args[0] === "--download";
if (args.length !== 0 && !extract && !download) {
  throw new Error("Usage: node scripts/catalogue.mjs [--extract parent-query.txt | --download]");
}
await mkdir(new URL(".generated/", root), { recursive: true });
const moduleUrl = new URL(".generated/catalogue-tools.mjs", root);
await build({
  entryPoints: [fileURLToPath(new URL(extract || download ? "src/catalogue-source.ts" : "src/catalogue.ts", root))],
  outfile: fileURLToPath(moduleUrl), bundle: true, platform: "node", format: "esm", target: "node22"
});
const module = await import(moduleUrl.href);
if (extract || download) {
  let bytes;
  if (download) {
    const response = await fetch(acquisition.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok || !response.body) throw new Error(`SAO download failed: HTTP ${response.status}`);
    // Bound memory and disk use even if the remote endpoint changes its response.
    const chunks = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.length;
      if (length > acquisition.bytes) throw new Error("SAO response exceeds pinned byte count.");
      chunks.push(chunk);
    }
    bytes = Buffer.concat(chunks);
  } else {
    const info = await stat(args[1]);
    if (!info.isFile() || info.size !== acquisition.bytes) throw new Error("SAO source size mismatch.");
    bytes = await readFile(args[1]);
  }
  const source = module.extractSaoSource(bytes);
  const text = JSON.stringify(source, null, 2) + "\n";
  // Write candidates only in the ignored folder. Never replace committed source records.
  await writeFile(new URL(".generated/sao-source.json", root), text);
  if (download) {
    await mkdir(new URL(".cache/catalogue/", root), { recursive: true });
    await writeFile(new URL(".cache/catalogue/sao-query.txt", root), bytes);
  }
  assert.equal(text, await readFile(new URL("data/sao-source.json", root), "utf8"),
    "Regenerated SAO subset differs from committed source records; inspect .generated/sao-source.json");
  console.log(`SAO extraction matched: ${acquisition.rows} parent rows, ${source.rows.length} selected source rows.`);
} else {
  await writeFile(new URL(".generated/catalogue.json", root), JSON.stringify(module.starCatalogue(), null, 2) + "\n");
  console.log(`SAO catalogue validated and generated: ${module.starCatalogue().stars.length} stars.`);
}
