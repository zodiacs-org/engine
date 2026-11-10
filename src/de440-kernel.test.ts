/**
 * `@zodiacs/engine/de440` against DE440 itself (tier B): skipped unless
 * PRECISION_KERNEL names NAIF's `de440.bsp` (SHA-256 a4ce9bf9...c4b5), as the
 * tier-B CI job sets it.
 *
 * Rule (viii) of P4.1's preregistration: this entry's reduction, run on the
 * raw kernel (`src/de440/kernel.testkit.ts`), against the places of an ERFA
 * chain over the same kernel (pyerfa, exact arithmetic for the states), at
 * 200 instants by 10 bodies: every row within 1e-6 arcsecond. Check C4: the
 * true node against the chain's, to 1e-6 arcsecond, and a node with the
 * frame's rotation added to the velocity fails that. The chain's outputs were
 * made in the site repository (zodiacs-org/site, commit 4fa9ffbf,
 * docs/platform/evidence/de440-hosted-20261109/oracles/) and are copied here
 * under docs/evidence/de440-20261110/oracles/, checked by digest.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { apply, equToEcl, npbMatrix } from "./de440/frames.js";
import type { Mat3, Vec3 } from "./de440/frames.js";
import { KernelSource } from "./de440/kernel.testkit.js";
import { Reducer, etOf } from "./de440/reduce.js";
import type { ReducedBody } from "./de440/reduce.js";

const KERNEL = process.env.PRECISION_KERNEL;
const KERNEL_SHA256 = "a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5";
const ORACLES = new URL("../docs/evidence/de440-20261110/oracles/", import.meta.url);
const DIGESTS = {
  "erfa-places.json": "7d56d6ea938cd90df04a5b902f3ff3fddd5d3535efc886d2dac1fd9dc58831cd",
  "erfa-nodes.json": "f8091b4dff24507486af2bfeee56af55f389671db5c96ecf3a9f788408db7213"
} as const;
const GATE_ARCSEC = 1e-6;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const RAD = Math.PI / 180;

function oracle<T>(name: keyof typeof DIGESTS): T {
  const bytes = readFileSync(new URL(name, ORACLES));
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(DIGESTS[name]);
  return JSON.parse(bytes.toString("utf8")) as T;
}

const unit = (lon: number, lat: number): Vec3 => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
/** The angle between two directions, atan2(|u x w|, u . w), arcseconds. */
function angleArcsec(u: Vec3, w: Vec3): number {
  const c: Vec3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  return (Math.atan2(Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]), u[0] * w[0] + u[1] * w[1] + u[2] * w[2]) / RAD) * 3600;
}
const wrapArcsec = (d: number): number => (((d * 3600 + 648000) % 1296000) + 1296000) % 1296000 - 648000;

/** With DE440_KERNEL_REPORT set, the measured figures are written there as JSON (zodiacs.org's P4.1 harness records them). */
const REPORT = process.env.DE440_KERNEL_REPORT;
const measured: Record<string, unknown> = {};
function report(key: string, value: unknown): void {
  if (!REPORT) return;
  measured[key] = value;
  writeFileSync(REPORT, `${JSON.stringify({ kernelSha256: KERNEL_SHA256, oracles: DIGESTS, gateArcsec: GATE_ARCSEC, node: process.version, ...measured }, null, 1)}\n`);
}

describe.skipIf(!KERNEL)("de440 on the raw kernel (tier B)", () => {
  const kernel = (): KernelSource => {
    expect(existsSync(KERNEL!)).toBe(true);
    expect(createHash("sha256").update(readFileSync(KERNEL!)).digest("hex")).toBe(KERNEL_SHA256);
    return new KernelSource(KERNEL!);
  };

  it("rule (viii): every place within 1e-6 arcsecond of the ERFA chain's, 2,000 rows", () => {
    const reducer = new Reducer(kernel());
    const places = oracle<{ rows: { ttMs: number; body: ReducedBody; lon: string; lat: string }[] }>("erfa-places.json");
    expect(places.rows).toHaveLength(2000);
    let worst = 0;
    const over: string[] = [];
    const byBody: Record<string, { rows: number; maxArcsec: number }> = {};
    for (const row of places.rows) {
      const place = reducer.apparent(row.body, (row.ttMs - J2000_MS) / 86_400_000);
      const d = angleArcsec(unit(place.lon, place.lat), unit(Number(row.lon), Number(row.lat)));
      worst = Math.max(worst, d);
      const entry = (byBody[row.body] ??= { rows: 0, maxArcsec: 0 });
      entry.rows += 1;
      entry.maxArcsec = Math.max(entry.maxArcsec, d);
      if (d > GATE_ARCSEC) over.push(`${row.body} at ${row.ttMs}: ${d}`);
    }
    report("viii", { rows: places.rows.length, over: over.length, byBody });
    expect(over).toEqual([]);
    expect(worst).toBeLessThanOrEqual(GATE_ARCSEC);
  });

  it("C4: the true node within 1e-6 arcsecond of the chain's at the 200 instants", () => {
    const reducer = new Reducer(kernel());
    const nodes = oracle<{ rows: { ttMs: number; northNodeLon: string }[] }>("erfa-nodes.json");
    expect(nodes.rows).toHaveLength(200);
    const differences = nodes.rows.map((row) => Math.abs(wrapArcsec(reducer.trueNode((row.ttMs - J2000_MS) / 86_400_000) - Number(row.northNodeLon))));
    report("c4", { rows: differences.length, maxArcsec: Math.max(...differences) });
    for (const d of differences) expect(d).toBeLessThanOrEqual(GATE_ARCSEC);
  });

  it("C4's control: a node with the frame's rotation added to the velocity is not the oracle's", () => {
    const source = kernel();
    const nodes = oracle<{ rows: { ttMs: number; northNodeLon: string }[] }>("erfa-nodes.json");
    const ofDate = (ttDays: number): Mat3 => {
      const { matrix, epsTrue } = npbMatrix(ttDays / 36525);
      const column = (i: 0 | 1 | 2): Vec3 => equToEcl([matrix[0][i], matrix[1][i], matrix[2][i]], epsTrue);
      const rows = [column(0), column(1), column(2)];
      return [
        [rows[0]![0], rows[1]![0], rows[2]![0]],
        [rows[0]![1], rows[1]![1], rows[2]![1]],
        [rows[0]![2], rows[1]![2], rows[2]![2]]
      ];
    };
    const emb = new Float64Array(6);
    const moon = new Float64Array(6);
    const earth = new Float64Array(6);
    let largest = 0;
    for (const row of nodes.rows) {
      const ttDays = (row.ttMs - J2000_MS) / 86_400_000;
      source.lunar(etOf(ttDays), emb, moon, earth);
      const r: Vec3 = [moon[0]! - earth[0]!, moon[1]! - earth[1]!, moon[2]! - earth[2]!];
      const v: Vec3 = [moon[3]! - earth[3]!, moon[4]! - earth[4]!, moon[5]! - earth[5]!];
      const h = 0.01;
      const n = ofDate(ttDays);
      const plus = ofDate(ttDays + h);
      const minus = ofDate(ttDays - h);
      const rDate = apply(n, r);
      const rotation = apply(plus, r).map((x, i) => (x - apply(minus, r)[i]!) / (2 * h * 86400)) as unknown as Vec3;
      const vDate = apply(n, v).map((x, i) => x + rotation[i]!) as unknown as Vec3;
      const hDate: Vec3 = [rDate[1] * vDate[2] - rDate[2] * vDate[1], rDate[2] * vDate[0] - rDate[0] * vDate[2], rDate[0] * vDate[1] - rDate[1] * vDate[0]];
      let lon = (Math.atan2(hDate[0], -hDate[1]) * 180) / Math.PI;
      if (lon < 0) lon += 360;
      largest = Math.max(largest, Math.abs(wrapArcsec(lon - Number(row.northNodeLon))));
    }
    report("c4Control", { maxArcsec: largest, failsTheGate: largest > GATE_ARCSEC });
    expect(largest).toBeGreaterThan(GATE_ARCSEC);
  });
});
