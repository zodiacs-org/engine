// Prints the tables of docs/evidence/bundle-weight-*/README.md from a
// results.json that measure.mjs wrote, so that every number in the README
// can be regenerated and compared.
//
//   node report.mjs <results.json>
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node report.mjs <results.json>");
  process.exit(2);
}
const results = JSON.parse(readFileSync(file, "utf8"));
const n = (value) => (typeof value === "number" ? value.toLocaleString("en-US") : String(value));
const BUNDLERS = ["esbuild", "rollup", "vite", "webpack"];
const LINES = [];
const out = (line = "") => LINES.push(line);

for (const archive of results.archives) {
  out(`### ${archive.label}: ${archive.archive}, ${n(archive.bytes)} bytes, SHA-256 ${archive.sha256}`);
  out();
  if (archive.packChunk) {
    const pack = archive.packChunk;
    out(`Pack chunk ${pack.file}: ${n(pack.raw)} raw, ${n(pack.gzip)} gzip -9, ${n(pack.brotli)} brotli 11 (${n(pack.base64Characters)} characters of base64).`);
  } else {
    out("No file of this archive holds the pack.");
  }
  out();
  out("| App | Bundler | Files | Raw | gzip -9 | brotli 11 | Pack | First script raw | Runs in Node on |");
  out("| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | --- |");
  for (const [app, byBundler] of Object.entries(archive.apps)) {
    for (const bundler of BUNDLERS) {
      const value = byBundler[bundler];
      if (!value) continue;
      if (!value.built) {
        out(`| ${app} | ${bundler} | | | | | | | did not build: ${value.error.slice(0, 120).replace(/\|/g, "/")} |`);
        continue;
      }
      const ran = value.node.ran ? (value.node.reported?.ephemeris ?? "ran") : `failed: ${value.node.error.slice(0, 80)}`;
      const pack = app === "e" ? value.split : value.holdsPack ? "yes" : "no";
      out(`| ${app} | ${bundler} | ${value.files.length} | ${n(value.total.raw)} | ${n(value.total.gzip)} | ${n(value.total.brotli)} | ${pack} | ${n(value.entry.raw)} | ${ran} |`);
    }
  }
  out();
  for (const run of archive.nodeImport) {
    if (run.error) {
      out(`Node cold import of \`${run.specifier}\`: failed, ${run.error.slice(0, 160)}`);
      continue;
    }
    const s = (x) => `median ${n(x.median)} ms (${n(x.min)} to ${n(x.max)}, ${x.samples} runs)`;
    out(`Node cold import of \`${run.specifier}\`: import ${s(run.importMs)}; first natalChart after it ${run.firstChartMs ? s(run.firstChartMs) : "not called"} on ${run.ephemeris}; whole process ${s(run.processMs)}.`);
  }
  out();
}
const failed = results.checks.filter((entry) => !entry.pass);
out(`Checks: ${results.checks.length}, ${failed.length} failed.`);
for (const entry of results.checks.filter((c) => /1 per cent|400,000/.test(c.name))) out(`- ${entry.pass ? "pass" : "FAIL"}: ${entry.name}: ${entry.detail}`);
console.log(LINES.join("\n"));
