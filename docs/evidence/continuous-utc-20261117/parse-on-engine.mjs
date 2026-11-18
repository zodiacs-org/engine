#!/usr/bin/env node
/*
 * Reads a natal envelope with an installed engine's parseNatalEnvelope and
 * writes the verdict as JSON:
 *
 *   node parse-on-engine.mjs <package directory> <envelope.json>
 *
 * Run on the carried 1.1.0 and 2.0.0-rc.2 archives, with the record this
 * tree's build writes for the synthetic chart of make-receipt.mjs
 * (results/continuous-utc-record.json), it wrote
 * results/new-receipt-on-earlier-engines.json: both refuse the record as
 * unsupported_feature, because it requires "time-basis-continuous-utc".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [dir, file] = process.argv.slice(2);
if (!dir || !file) throw new Error("usage: node parse-on-engine.mjs <package directory> <envelope.json>");
const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const { parseNatalEnvelope } = await import(pathToFileURL(join(dir, "dist", "receipt.js")).href);
const text = readFileSync(file, "utf8");
const verdict = parseNatalEnvelope(text.trim());
const record = JSON.parse(text);
process.stdout.write(
  `${JSON.stringify({
    engine: `${pkg.name}@${pkg.version}`,
    record: { engine: record.receipt.engine.version, requiredFeatures: record.requiredFeatures, basis: record.result.timeScale.basis },
    ok: verdict.ok,
    code: verdict.ok ? null : verdict.code
  })}\n`
);
