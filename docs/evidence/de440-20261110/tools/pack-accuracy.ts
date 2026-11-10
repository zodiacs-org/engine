/**
 * How far a sealed pack's places are from DE440's own: the reduction of
 * src/de440/reduce.ts on the pack (src/de440/pack.ts, what the entry reads)
 * against the same reduction on the raw kernel (src/de440/kernel.testkit.ts),
 * and the pack against the ERFA chain's oracles of rule (viii). A pack is a
 * refit of the kernel's series, quantised, so its places differ from the
 * kernel's by its own fitting and rounding errors; this measures them.
 *
 *   PRECISION_KERNEL=de440.bsp PRECISION_PACK=de440-1790-2210.v2.zeph \
 *     npx vite-node docs/evidence/de440-20261110/tools/pack-accuracy.ts > docs/evidence/de440-20261110/pack-accuracy.json
 *
 * Instants: 20,001 TT instants evenly spaced from 1800-01-01T00:00 TT to
 * 2200-01-01T00:00 TT, by ten bodies and the true node; the edges of the
 * pack's records, where a refit's error is largest: for the node, 1 ms and
 * 10 ms either side of every boundary of the Moon's records, and for each
 * body, 1 ms either side of every boundary of its own records at the instant
 * its light left (the boundary plus the light time) and of the Earth-Moon
 * system's records at reception; and the 200 instants of the oracles. The
 * angle between two places is atan2(|u x w|, u . w) of their directions; the
 * node's is its wrapped longitude difference.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { KernelSource } from "../../../../src/de440/kernel.testkit.js";
import { PackEphemeris, parsePack } from "../../../../src/de440/pack.js";
import { REDUCED_BODIES, Reducer } from "../../../../src/de440/reduce.js";

const KERNEL_SHA256 = "a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5";
const PACK_SHA256 = "51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7";
const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const kernelPath = process.env.PRECISION_KERNEL;
const packPath = process.env.PRECISION_PACK;
if (!kernelPath || !packPath) throw new Error("set PRECISION_KERNEL and PRECISION_PACK");
if (sha256(readFileSync(kernelPath)) !== KERNEL_SHA256) throw new Error("PRECISION_KERNEL is not the pinned de440.bsp");
const packBytes = new Uint8Array(readFileSync(packPath));
if (sha256(packBytes) !== PACK_SHA256) throw new Error("PRECISION_PACK is not the pinned pack");

const header = parsePack(packBytes);
const onPack = new Reducer(new PackEphemeris(packBytes, header));
const onKernel = new Reducer(new KernelSource(kernelPath));

function angleArcsec(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const r = Math.PI / 180;
  const u = [Math.cos(a.lat * r) * Math.cos(a.lon * r), Math.cos(a.lat * r) * Math.sin(a.lon * r), Math.sin(a.lat * r)];
  const w = [Math.cos(b.lat * r) * Math.cos(b.lon * r), Math.cos(b.lat * r) * Math.sin(b.lon * r), Math.sin(b.lat * r)];
  const x = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
  return (Math.atan2(Math.hypot(x[0]!, x[1]!, x[2]!), u[0]! * w[0]! + u[1]! * w[1]! + u[2]! * w[2]!) / r) * 3600;
}
function wrappedArcsec(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Math.abs(d) * 3600;
}
const quantile = (values: number[], q: number): number => {
  const s = [...values].sort((x, y) => x - y);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo]! : s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
};
const stats = (rows: { value: number; ttMs: number }[]) => {
  const values = rows.map((row) => row.value);
  const worst = rows.reduce((m, row) => (row.value > m.value ? row : m), rows[0]!);
  return { n: rows.length, maxArcsec: worst.value, at: new Date(worst.ttMs).toISOString().replace("Z", " TT"), p50Arcsec: quantile(values, 0.5), p99Arcsec: quantile(values, 0.99) };
};

const FROM = Date.UTC(1800, 0, 1);
const TO = Date.UTC(2200, 0, 1);
const STEPS = 20_000;
const dense: Record<string, { value: number; ttMs: number }[]> = Object.fromEntries([...REDUCED_BODIES, "North Node"].map((b) => [b, []]));
for (let k = 0; k <= STEPS; k += 1) {
  const ttMs = Math.round(FROM + ((TO - FROM) * k) / STEPS);
  const ttDays = (ttMs - J2000_MS) / DAY_MS;
  for (const body of REDUCED_BODIES) dense[body]!.push({ value: angleArcsec(onPack.apparent(body, ttDays), onKernel.apparent(body, ttDays)), ttMs });
  dense["North Node"]!.push({ value: wrappedArcsec(onPack.trueNode(ttDays), onKernel.trueNode(ttDays)), ttMs });
}

// The edges of the pack's records (TDB seconds; TT differs by under 2 ms).
const recordsOf = (name: string) => header.bodies.find((b) => b.name === name)!;
function boundaries(name: string): number[] {
  const b = recordsOf(name);
  const out: number[] = [];
  const lo = ((FROM - J2000_MS) / 1000);
  const hi = ((TO - J2000_MS) / 1000);
  for (let k = 1; k < b.nrec; k += 1) {
    const et = b.initEt + k * b.intervalSec;
    if (et > lo && et < hi) out.push(et);
  }
  return out;
}
const PACK_BODY: Record<string, string> = { Sun: "sun", Moon: "moon", Mercury: "mercuryBary", Venus: "venusBary", Mars: "marsBary", Jupiter: "jupiterBary", Saturn: "saturnBary", Uranus: "uranusBary", Neptune: "neptuneBary", Pluto: "plutoBary" };
const edges: Record<string, { value: number; ttMs: number }[]> = Object.fromEntries([...REDUCED_BODIES, "North Node"].map((b) => [b, []]));
const observerEdges = [...boundaries("emb"), ...boundaries("moon")];
const at = (body: (typeof REDUCED_BODIES)[number], ttDays: number) =>
  edges[body]!.push({ value: angleArcsec(onPack.apparent(body, ttDays), onKernel.apparent(body, ttDays)), ttMs: J2000_MS + ttDays * DAY_MS });
for (const body of REDUCED_BODIES) {
  const own = body === "Moon" ? [...boundaries("moon"), ...boundaries("emb")] : boundaries(PACK_BODY[body]!);
  for (const et of own) {
    const tau = onKernel.apparent(body, et / 86400).lightTimeSec;
    for (const d of [-0.001, 0.001]) at(body, (et + tau + d) / 86400);
  }
  if (body !== "Moon") for (const et of observerEdges) for (const d of [-0.001, 0.001]) at(body, (et + d) / 86400);
}
for (const et of boundaries("moon")) {
  for (const d of [-0.01, -0.001, 0.001, 0.01]) {
    const ttDays = (et + d) / 86400;
    edges["North Node"]!.push({ value: wrappedArcsec(onPack.trueNode(ttDays), onKernel.trueNode(ttDays)), ttMs: J2000_MS + ttDays * DAY_MS });
  }
}

const ORACLES = new URL("../oracles/", import.meta.url);
const places = JSON.parse(readFileSync(new URL("erfa-places.json", ORACLES), "utf8")) as { rows: { ttMs: number; body: string; lon: string; lat: string }[] };
const nodes = JSON.parse(readFileSync(new URL("erfa-nodes.json", ORACLES), "utf8")) as { rows: { ttMs: number; northNodeLon: string }[] };
const oracle: Record<string, { value: number; ttMs: number }[]> = Object.fromEntries([...REDUCED_BODIES, "North Node"].map((b) => [b, []]));
for (const row of places.rows) {
  const place = onPack.apparent(row.body as (typeof REDUCED_BODIES)[number], (row.ttMs - J2000_MS) / DAY_MS);
  oracle[row.body]!.push({ value: angleArcsec(place, { lon: Number(row.lon), lat: Number(row.lat) }), ttMs: row.ttMs });
}
for (const row of nodes.rows) {
  oracle["North Node"]!.push({ value: wrappedArcsec(onPack.trueNode((row.ttMs - J2000_MS) / DAY_MS), Number(row.northNodeLon)), ttMs: row.ttMs });
}

const raw = header.raw as { compiler?: unknown; bodies: { name: string; budgetKm?: number; provenPosKm?: number; provenVelKmS?: number; encoding?: string }[] };
process.stdout.write(`${JSON.stringify({
  what: "The reduction on the sealed pack against the same reduction on the raw kernel, and against the ERFA chain's oracles of rule (viii)",
  kernel: { sha256: KERNEL_SHA256 },
  pack: { sha256: PACK_SHA256, bytes: packBytes.byteLength, compiler: raw.compiler ?? null },
  packBodies: raw.bodies.map((b) => ({ name: b.name, encoding: b.encoding ?? null, budgetKm: b.budgetKm ?? null, provenPosKm: b.provenPosKm ?? null, provenVelKmS: b.provenVelKmS ?? null })),
  node: process.version,
  dense: { instants: STEPS + 1, from: "1800-01-01T00:00 TT", to: "2200-01-01T00:00 TT", byBody: Object.fromEntries(Object.entries(dense).map(([b, rows]) => [b, stats(rows)])) },
  recordEdges: { what: "1 ms (the node also 10 ms) either side of each record boundary, 1800 to 2200 (above)", byBody: Object.fromEntries(Object.entries(edges).map(([b, rows]) => [b, stats(rows)])) },
  largest: Object.fromEntries([...REDUCED_BODIES, "North Node"].map((b) => [b, Math.max(stats(dense[b]!).maxArcsec, stats(edges[b]!).maxArcsec)])),
  oracles: { instants: nodes.rows.length, byBody: Object.fromEntries(Object.entries(oracle).map(([b, rows]) => [b, stats(rows)])) }
}, null, 1)}\n`);
