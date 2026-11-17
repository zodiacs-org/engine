#!/usr/bin/env node
/*
 * The time basis an installed engine gives on the instants that
 * src/time-scale-continuous.test.ts compares this build with, written as
 * JSON: a SHA-256 of each group's records, and a few records in full.
 *
 *   node reference-time-basis.mjs <package directory> > out.json
 *
 * <package directory> is an installed @zodiacs/engine (its own directory,
 * holding package.json and dist/), from a carried archive in artifacts/:
 * 1.1.0 and 2.0.0-rc.2 wrote results/time-basis-1.1.0.json and
 * results/time-basis-2.0.0-rc.2.json.
 * The instants come from scripts/continuous-utc-instants.mjs, the same module the
 * test imports, so the two cannot drift apart.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { GROUPS } from "../../../scripts/continuous-utc-instants.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: node reference-time-basis.mjs <package directory>");
const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
const { timeBasis } = await import(pathToFileURL(join(dir, "dist", "time.js")).href);

const out = { engine: `${pkg.name}@${pkg.version}`, groups: {} };
for (const [name, cases] of Object.entries(GROUPS)) {
  const records = cases.map(([ms, scale, pin, fields]) => {
    const basis = timeBasis(ms, scale, pin ?? undefined);
    return fields === "days" ? [basis.ut1Days, basis.ttDays] : basis;
  });
  out.groups[name] = {
    cases: cases.length,
    sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex"),
    first: records[0]
  };
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
