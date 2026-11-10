import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { readIndexBytes } from "../src/index-file.js";

async function receiptFile(path: string) {
  const bytes = await readIndexBytes(path);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
}

function downloadReceipt(value: unknown): { inputs: Array<Record<string, unknown>> } {
  if (value === null || typeof value !== "object") throw new TypeError("Invalid download receipt.");
  const receipt = value as Record<string, unknown>;
  if (receipt.schemaVersion !== 1 || receipt.dataset !== "geonames" || receipt.license !== "CC-BY-4.0"
      || !Array.isArray(receipt.inputs) || receipt.inputs.length !== 3) throw new TypeError("Invalid download receipt.");
  const paths = new Set(["places", "countries.tsv", "admin1.tsv"]);
  for (const item of receipt.inputs) {
    if (item === null || typeof item !== "object" || !paths.delete(item.path)) throw new TypeError("Invalid download receipt inputs.");
  }
  return { inputs: receipt.inputs };
}

function requiredDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("Input receipt requires a lowercase SHA-256 digest.");
  }
  return value;
}

try {
  const { values } = parseArgs({ options: {
    places: { type: "string" }, countries: { type: "string" }, admin1: { type: "string" },
    out: { type: "string" }, "places-url": { type: "string" },
    "countries-url": { type: "string" }, "admin1-url": { type: "string" },
    "places-sha256": { type: "string" }, "countries-sha256": { type: "string" },
    "admin1-sha256": { type: "string" }, sample: { type: "boolean" }, downloaded: { type: "string" }, help: { type: "boolean" }
  }, allowPositionals: false });
  if (values.help) {
    console.log("Build an offline GeoNames index in a new directory. Run from geocode/.");
    console.log("npm run index:build -- --sample --out generated/sample");
    console.log("npm run index:build -- --downloaded downloads/SNAPSHOT --out generated/world");
    console.log("npm run index:build -- --places FILE --places-url HTTPS_URL --countries FILE --admin1 FILE --out DIR");
    console.log("Optional: --countries-url URL --admin1-url URL --places-sha256 HASH --countries-sha256 HASH --admin1-sha256 HASH");
  } else {
    if (!values.out) throw new TypeError("--out is required.");
    if ((values.sample || values.downloaded) && Object.keys(values).some((key) => key !== (values.sample ? "sample" : "downloaded") && key !== "out")) {
      throw new TypeError("--sample and --downloaded accept only --out.");
    }
    // Receipts for the committed subset pin the bytes used by this convenience command.
    const sample = values.sample ? await receiptFile("data/sample-receipt.json") : null;
    const downloaded = values.downloaded ? downloadReceipt(await receiptFile(resolve(values.downloaded, "sources.json"))) : null;
    function input(role: "places" | "countries" | "admin1", fallbackUrl?: string) {
      if (downloaded) {
        const local = role === "places" ? "places" : `${role}.tsv`;
        const receipt = downloaded.inputs.find((item) => item.path === local);
        if (!receipt) throw new TypeError("Download receipt is missing an input.");
        if (typeof receipt.url !== "string") throw new TypeError("Input receipt requires a source URL.");
        if (role === "places" && (typeof receipt.archiveMember !== "string" || !receipt.archiveMember)) {
          throw new TypeError("Input receipt requires an archive member name.");
        }
        return { path: resolve(values.downloaded!, local),
          url: role === "places" ? `${receipt.url}#${encodeURIComponent(receipt.archiveMember as string)}` : receipt.url,
          expectedSha256: requiredDigest(role === "places" ? receipt.memberSha256 : receipt.sha256) };
      }
      if (sample) {
        const file = role === "places" ? "geonames-sample.tsv" : role === "countries" ? "country-info-sample.tsv" : "admin1-sample.tsv";
        const receipt = sample.outputs.find((item: { file: string }) => item.file === file);
        if (!receipt) throw new TypeError("Sample receipt is missing an input.");
        const url = role === "places" ? "https://download.geonames.org/export/dump/#selected-sample"
          : `https://download.geonames.org/export/dump/${role === "countries" ? "countryInfo.txt" : "admin1CodesASCII.txt"}#selected-rows`;
        return { path: `data/${file}`, url, expectedSha256: requiredDigest(receipt.sha256) };
      }
      const path = values[role];
      const url = values[`${role}-url`] ?? fallbackUrl;
      if (!path || !url) throw new TypeError(`--${role} and its source URL are required.`);
      const sha256 = values[`${role}-sha256`];
      return { path, url, ...(sha256 === undefined ? {} : { expectedSha256: sha256 }) };
    }
    await mkdir(dirname(resolve(values.out)), { recursive: true });
    const result = await buildGeoNamesIndex({
      places: input("places"),
      countries: input("countries", "https://download.geonames.org/export/dump/countryInfo.txt"),
      admin1: input("admin1", "https://download.geonames.org/export/dump/admin1CodesASCII.txt"),
      outputDirectory: values.out
    });
    console.log(JSON.stringify({ count: result.count, shards: result.shards.length, manifest: `${values.out}/manifest.json` }));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Index build failed.");
  process.exitCode = 1;
}
