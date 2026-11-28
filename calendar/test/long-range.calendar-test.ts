import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { measureLongRange } from "./support/long-range.js";

const evidence = JSON.parse(readFileSync(new URL("../docs/evidence/long-range.json", import.meta.url), "utf8"));
it("streams the declared long range through real searches and a parser without collecting the feed", async () => {
  const runs = [];
  for (const windowDays of [7, 31]) runs.push(await measureLongRange(windowDays));
  expect(runs).toEqual(evidence.runs);
  expect(runs[0]!.recordSha256).toBe(runs[1]!.recordSha256);
  expect(runs[0]!.wireSha256).toBe(runs[1]!.wireSha256);
}, 120_000);
