#!/usr/bin/env node
/*
 * Writes the natal envelope an installed engine serializes for a synthetic
 * chart after the IERS table, 2030-06-15T12:00:00Z at 51.5 N 0.12 W, on its
 * default source:
 *
 *   node make-receipt.mjs <package directory> > receipt.json
 *
 * Run on the carried 1.1.0 and 2.0.0-rc.2 archives, installed outside the
 * checkout, it wrote src/fixtures/receipt-1.1.0-after-table.json and
 * src/fixtures/receipt-2.0.0-rc.2-after-table.json.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node make-receipt.mjs <package directory>");
const engine = await import(pathToFileURL(join(dir, "dist", "index.js")).href);
const receipt = await import(pathToFileURL(join(dir, "dist", "receipt.js")).href);
const chart = engine.natalChart({ utc: "2030-06-15T12:00:00Z", latitude: 51.5, longitude: -0.12 });
process.stdout.write(`${receipt.serializeNatalEnvelope(receipt.createNatalEnvelope(chart))}\n`);
