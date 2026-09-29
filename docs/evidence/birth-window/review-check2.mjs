// The review's checker, second round, written by the reviewer of this branch and
// credited to the review; kept here so the unresolved-interval check can be rerun.
// Changes from the review's copy (check2.mjs, sha256 eb7c45bd...): this paragraph, and
// DIST defaulting to this repository's dist/. What follows is the reviewer's:
//
// Reviewer's checker, second round: my check.mjs (sha256 f2026d46...) extended, by me and
// independently of the author's check-masked.mjs, to understand `unresolved` intervals.
//
// Inside an unresolved interval [a, b) only the listed components are wildcards; the
// partition must hold null for exactly those, exactly there. Everything else is compared
// as before. At each interval's edges the resolved side is verified at its millisecond
// (natalChart at a-1 must equal the value before the interval; natalChart at b must equal
// the value it resumes with), and every millisecond within EDGE_MS of each edge, outside
// the interval, is compared for all 72 components.
//
//   node check2.mjs --windows FILE --out FILE.jsonl [--workers N] [--only id,id]
// DIST env: the engine build directory.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort } from "node:worker_threads";

const DIST = resolve(process.env.DIST ?? fileURLToPath(new URL("../../../dist", import.meta.url)));
const EDGE_MS = Number(process.env.EDGE_MS ?? 1000);
const DAY = 86_400_000;
const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
const SIGN = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const ASPECT = ["conjunction", "sextile", "square", "trine", "opposition"];
const SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const NULLV = -9; // a null (unresolved) value in the partition
const PAIR = new Map();
const PAIRS = [];
for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) { PAIR.set(`${BODIES[i]}|${BODIES[j]}`, PAIRS.length); PAIR.set(`${BODIES[j]}|${BODIES[i]}`, PAIRS.length); PAIRS.push([i, j]); }
const NC = 72;
const compName = (c) => c < 12 ? `sign:${BODIES[c]}` : c === 12 ? "asc" : c === 13 ? "mc" : c < 26 ? `house:${BODIES[c - 14]}` : c < 71 ? `aspect:${BODIES[PAIRS[c - 26][0]]}|${BODIES[PAIRS[c - 26][1]]}` : "system";

if (isMainThread) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  const input = JSON.parse(readFileSync(args.get("--windows"), "utf8"));
  let windows = input.windows;
  if (args.has("--only")) { const keep = new Set(args.get("--only").split(",").map(Number)); windows = windows.filter((w) => keep.has(w.id)); }
  windows = [...windows].sort((a, b) => (Date.parse(b.end) - Date.parse(b.start)) - (Date.parse(a.end) - Date.parse(a.start)));
  const out = args.get("--out");
  writeFileSync(out, "");
  const workers = Number(args.get("--workers") ?? 3);
  let next = 0, done = 0;
  const began = Date.now();
  const all = [];
  await Promise.all(Array.from({ length: Math.min(workers, windows.length) }, () => new Promise((settle, fail) => {
    const worker = new Worker(fileURLToPath(import.meta.url));
    const feed = () => next < windows.length ? worker.postMessage(windows[next++]) : worker.terminate().then(settle);
    worker.on("message", (r) => {
      all.push(r); appendFileSync(out, JSON.stringify(r) + "\n"); done++;
      if (done % 20 === 0 || done === windows.length) process.stderr.write(`${done}/${windows.length} ${((Date.now() - began) / 60000).toFixed(1)} min\n`);
      feed();
    });
    worker.on("error", fail);
    feed();
  })));
  const sum = (k) => all.reduce((s, r) => s + (r[k] ?? 0), 0);
  const summary = {
    windows: all.length, errors: all.filter((r) => r.error).map((r) => ({ id: r.id, error: r.error })),
    samples: sum("samples"), sampledTransitions: sum("transitions"), maskedTransitions: sum("maskedTransitions"), matched: sum("matched"), missed: sum("missed"), extra: sum("extra"),
    excursionChanges: sum("excursionChanges"), excursionConfirmed: sum("excursionConfirmed"),
    cellDisagreements: sum("disagree"), maskedSamples: sum("maskedSamples"), nullMismatch: sum("nullMismatch"), structural: sum("structural"),
    switches: sum("switches"), changes: sum("changes"), msChecks: sum("msChecks"), msFailures: sum("msFailures"), msMaskedSkips: sum("msMaskedSkips"),
    edgeChecks: sum("edgeChecks"), edgeFailures: sum("edgeFailures"), denseEdgeSamples: sum("denseEdgeSamples"), denseEdgeFailures: sum("denseEdgeFailures"),
    houseOfCrossCheckMismatches: sum("houseMismatch"),
    unresolvedWindows: all.filter((r) => r.unresolved?.length).map((r) => r.id),
    boundExceeded: all.filter((r) => r.flags?.includes("bound-exceeded")).map((r) => r.id),
    polarFallback: all.filter((r) => r.flags?.includes("polar-fallback")).length,
    finderSeconds: sum("finderMs") / 1000, checkerSeconds: sum("checkerMs") / 1000, wallMinutes: (Date.now() - began) / 60000,
    failedIds: all.filter((r) => !r.pass).map((r) => r.id)
  };
  summary.verdict = summary.errors.length === 0 && all.every((r) => r.pass) ? "PASS" : "FAIL";
  writeFileSync(out.replace(/\.jsonl$/, ".summary.json"), JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
} else {
  const W = await import(pathToFileURL(resolve(DIST, "window.js")).href);
  const engine = await import(pathToFileURL(resolve(DIST, "index.js")).href);
  const mod360 = (x) => ((x % 360) + 360) % 360;
  const myHouse = (lon, cusps) => {
    for (let i = 0; i < 12; i++) {
      const span = mod360(cusps[(i + 1) % 12] - cusps[i]);
      const off = mod360(lon - cusps[i]);
      if (off < span || span === 0) return i + 1;
    }
    return 12;
  };
  let last = Number.NaN;
  let houseMismatch = 0;
  const chartAt = (t, w, forceFresh) => {
    if (forceFresh || !(Math.abs(t - last) > 100)) engine.natalChart({ utc: new Date(t + DAY) });
    const c = engine.natalChart({ utc: new Date(t), latitude: w.latitude, longitude: w.longitude, houseSystem: w.houseSystem });
    last = t;
    return c;
  };
  const vec = (c, out, o) => {
    const byName = new Map(c.bodies.map((b) => [b.body, b]));
    for (let i = 0; i < 12; i++) {
      const b = byName.get(BODIES[i]);
      out[o + i] = SIGN.indexOf(b.sign);
      const h = myHouse(b.lon, c.houses.cusps);
      if (h !== engine.houseOf(b.lon, c.houses.cusps)) houseMismatch++;
      out[o + 14 + i] = h;
    }
    out[o + 12] = Math.floor(mod360(c.angles.asc) / 30);
    out[o + 13] = Math.floor(mod360(c.angles.mc) / 30);
    for (let p = 0; p < 45; p++) out[o + 26 + p] = -1;
    for (const a of c.aspects) out[o + 26 + PAIR.get(`${a.a}|${a.b}`)] = ASPECT.indexOf(a.type);
    out[o + 71] = SYSTEMS.indexOf(c.houses.system);
  };
  const enc = (list, v) => (v === null ? NULLV : list.indexOf(v));
  const cellVec = (f) => {
    const v = new Int8Array(NC);
    for (let i = 0; i < 12; i++) { v[i] = enc(SIGN, f.signs[BODIES[i]]); v[14 + i] = f.houses[BODIES[i]] === null ? NULLV : f.houses[BODIES[i]]; }
    v[12] = SIGN.indexOf(f.ascendant); v[13] = SIGN.indexOf(f.midheaven);
    for (let p = 0; p < 45; p++) v[26 + p] = -1;
    for (const a of f.aspects) v[26 + PAIR.get(`${a.a}|${a.b}`)] = ASPECT.indexOf(a.type);
    v[71] = SYSTEMS.indexOf(f.houseSystem);
    return v;
  };
  const encodeChange = (ch) => {
    switch (ch.feature) {
      case "sign": return [BODIES.indexOf(ch.body), enc(SIGN, ch.from), enc(SIGN, ch.to)];
      case "ascendant": return [12, SIGN.indexOf(ch.from), SIGN.indexOf(ch.to)];
      case "midheaven": return [13, SIGN.indexOf(ch.from), SIGN.indexOf(ch.to)];
      case "house": return [14 + BODIES.indexOf(ch.body), ch.from === null ? NULLV : ch.from, ch.to === null ? NULLV : ch.to];
      case "aspect": return [26 + PAIR.get(`${ch.a}|${ch.b}`), ch.from === null ? -1 : ASPECT.indexOf(ch.from), ch.to === null ? -1 : ASPECT.indexOf(ch.to)];
      case "house-system": return [71, SYSTEMS.indexOf(ch.from), SYSTEMS.indexOf(ch.to)];
      default: throw new Error(`unknown feature ${ch.feature}`);
    }
  };

  parentPort.on("message", (w) => {
    const start = Date.parse(w.start), end = Date.parse(w.end);
    const base = { id: w.id, seconds: (end - start) / 1000, latitude: w.latitude, houseSystem: w.houseSystem, tag: w.tag };
    houseMismatch = 0;
    let result, error = null;
    const f0 = performance.now();
    try {
      result = W.birthWindow({ start: new Date(start), end: new Date(end), latitude: w.latitude, longitude: w.longitude, houseSystem: w.houseSystem });
    } catch (e) { error = `${e?.name}: ${e?.message ?? e}`; }
    const finderMs = performance.now() - f0;
    const c0 = performance.now();
    const times = [];
    for (let t = start; t < end; t += 1000) times.push(t);
    if (times[times.length - 1] !== end - 1) times.push(end - 1);
    const n = times.length;
    const S = new Int8Array(n * NC);
    last = Number.NaN;
    for (let k = 0; k < n; k++) vec(chartAt(times[k], w, k === 0), S, k * NC);
    let transitions = 0;
    for (let k = 1; k < n; k++) for (let c = 0; c < NC; c++) if (S[k * NC + c] !== S[(k - 1) * NC + c]) transitions++;
    if (error) {
      parentPort.postMessage({ ...base, error, pass: false, finderMs, checkerMs: performance.now() - c0, samples: n, transitions, missed: transitions, matched: 0, extra: 0 });
      return;
    }
    const fails = [];
    const note = (x) => { if (fails.length < 16) fails.push(x); };
    // Unresolved intervals and which components they leave open.
    const gaps = (result.unresolved ?? []).map((u) => ({ a: u.start.getTime(), b: u.end.getTime(), comps: u.features.map((f) => (f.feature === "sign" ? 0 : 14) + BODIES.indexOf(f.body)) }));
    const maskedAt = (t, c) => gaps.some((g) => g.a <= t && t < g.b && g.comps.includes(c));
    let structural = 0;
    for (const g of gaps) {
      if (!(g.a >= start && g.b <= end && g.b > g.a) || g.comps.some((c) => ![10, 11, 24, 25].includes(c))) { structural++; note({ kind: "gap-shape", g }); }
      const u = result.unresolved.find((x) => x.start.getTime() === g.a);
      if (u.milliseconds !== g.b - g.a) { structural++; note({ kind: "gap-ms" }); }
    }
    if ((gaps.length > 0) !== result.flags.includes("node-unresolved")) { structural++; note({ kind: "flag-vs-unresolved" }); }
    // (1) Structure.
    const cells = result.cells.map((cell) => ({ s: cell.start.getTime(), e: cell.end.getTime(), v: cellVec(cell.features), cell }));
    const L = end - start;
    let shareSum = 0, roundedSum = 0, nullMismatch = 0;
    if (result.start.getTime() !== start || result.end.getTime() !== end) { structural++; note({ kind: "bounds" }); }
    if (cells.length === 0 || cells[0].s !== start || cells[cells.length - 1].e !== end) { structural++; note({ kind: "tiling-ends" }); }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (!(c.e > c.s) || c.cell.milliseconds !== c.e - c.s || c.cell.share !== (c.e - c.s) / L) { structural++; note({ kind: "cell", i }); }
      if (i > 0 && cells[i - 1].e !== c.s) { structural++; note({ kind: "gap", i }); }
      shareSum += c.cell.share;
      if (c.cell.roundedShare !== undefined) roundedSum += c.cell.roundedShare;
      // Null exactly where an unresolved interval lists the component, for the whole cell.
      for (let comp = 0; comp < NC; comp++) {
        const isNull = c.v[comp] === NULLV;
        const inGapStart = maskedAt(c.s, comp), inGapEnd = maskedAt(c.e - 1, comp);
        if (isNull !== inGapStart || inGapStart !== inGapEnd) { nullMismatch++; note({ kind: "null-region", i, comp: compName(comp), isNull, inGapStart, inGapEnd }); }
      }
    }
    if (Math.abs(shareSum - 1) > 1e-9) { structural++; note({ kind: "shares", shareSum }); }
    if (result.switches.length !== cells.length - 1) { structural++; note({ kind: "switch-count" }); }
    const changes = [];
    for (let i = 0; i < result.switches.length; i++) {
      const sw = result.switches[i];
      const at = sw.at.getTime();
      if (!cells[i + 1] || cells[i + 1].s !== at || sw.changes.length === 0) { structural++; note({ kind: "switch-cell", i }); continue; }
      const seen = new Set();
      const after = Int8Array.from(cells[i].v);
      for (const ch of sw.changes) {
        const [comp, from, to] = encodeChange(ch);
        if (seen.has(comp) || from === to || after[comp] !== from) { structural++; note({ kind: "change-from", i, comp: compName(comp), from, to, cell: after[comp] }); }
        seen.add(comp);
        after[comp] = to;
        changes.push({ at, comp, from, to });
      }
      for (let c = 0; c < NC; c++) if (after[c] !== cells[i + 1].v[c]) { structural++; note({ kind: "cell-after-switch", i, comp: compName(c) }); }
    }
    // (2) Cell agreement at every sample instant; masked components are wildcards.
    let disagree = 0, maskedSamples = 0;
    let ci = 0;
    for (let k = 0; k < n; k++) {
      const t = times[k];
      while (ci < cells.length && cells[ci].e <= t) ci++;
      const cell = cells[ci];
      for (let c = 0; c < NC; c++) {
        if (maskedAt(t, c)) { maskedSamples++; continue; }
        if (!cell || cell.s > t || cell.v[c] !== S[k * NC + c]) { disagree++; note({ kind: "disagree", t, comp: compName(c), sampled: S[k * NC + c], cell: cell?.v[c] }); }
      }
    }
    // (3) Steps (times[k-1], times[k]]: a step with a masked end is not observable for that component.
    const perStep = new Map();
    let extra = 0, kk = 1;
    for (const ch of changes) {
      if (ch.at <= times[0] || ch.at > times[n - 1]) { extra++; note({ kind: "outside", at: ch.at, comp: compName(ch.comp) }); continue; }
      while (times[kk] < ch.at) kk++;
      const key = kk * 128 + ch.comp;
      if (!perStep.has(key)) perStep.set(key, []);
      perStep.get(key).push(ch);
    }
    let matched = 0, missed = 0, maskedTransitions = 0;
    const maskedStep = (k, c) => maskedAt(times[k - 1], c) || maskedAt(times[k], c);
    for (let k = 1; k < n; k++) for (let c = 0; c < NC; c++) {
      const a = S[(k - 1) * NC + c], b = S[k * NC + c];
      if (a === b) continue;
      if (maskedStep(k, c)) { maskedTransitions++; continue; }
      const list = perStep.get(k * 128 + c);
      if (list && list[0].from === a && list[list.length - 1].to === b) matched++;
      else { missed++; note({ kind: "missed", step: [times[k - 1], times[k]], comp: compName(c), a, b, reported: list ?? null }); }
    }
    const P = new Map();
    const probe = (t) => { if (!P.has(t)) { const v = new Int8Array(NC); vec(chartAt(t, w, true), v, 0); P.set(t, v); } return P.get(t); };
    let excursionChanges = 0, excursionConfirmed = 0;
    for (const [key, list] of perStep) {
      const k = Math.floor(key / 128), c = key % 128;
      if (maskedStep(k, c)) continue; // edges are verified in (5)
      if (S[(k - 1) * NC + c] !== S[k * NC + c]) continue;
      const chain = list[0].from === S[(k - 1) * NC + c] && list[list.length - 1].to === S[k * NC + c];
      for (const ch of list) {
        excursionChanges++;
        if (chain && probe(ch.at - 1)[c] === ch.from && probe(ch.at)[c] === ch.to) excursionConfirmed++;
        else { extra++; note({ kind: "extra", at: ch.at, comp: compName(c), from: ch.from, to: ch.to }); }
      }
    }
    // (4) Every switch at its millisecond; a component masked at at-1 or at is skipped here.
    let msChecks = 0, msFailures = 0, msMaskedSkips = 0;
    for (const sw of result.switches) {
      const at = sw.at.getTime();
      const before = probe(at - 1), afterV = probe(at);
      const listed = new Map(sw.changes.map((ch) => { const [comp, from, to] = encodeChange(ch); return [comp, [from, to]]; }));
      for (let c = 0; c < NC; c++) {
        if (maskedAt(at - 1, c) || maskedAt(at, c)) { msMaskedSkips++; continue; }
        msChecks++;
        const l = listed.get(c);
        const ok = l ? before[c] === l[0] && afterV[c] === l[1] : before[c] === afterV[c];
        if (!ok) { msFailures++; note({ kind: "ms", at, comp: compName(c), listed: l ?? null, before: before[c], after: afterV[c] }); }
      }
    }
    // (5) Edges of every unresolved interval: the resolved side at its millisecond, and a dense check nearby.
    let edgeChecks = 0, edgeFailures = 0, denseEdgeSamples = 0, denseEdgeFailures = 0;
    const cellValue = (t, c) => { const cell = cells.find((x) => x.s <= t && t < x.e); return cell ? cell.v[c] : undefined; };
    for (const g of gaps) {
      for (const c of g.comps) {
        if (g.a > start) {
          edgeChecks++;
          const sw = result.switches.find((x) => x.at.getTime() === g.a);
          const entry = sw && sw.changes.map(encodeChange).find(([comp]) => comp === c);
          const expect = cellValue(g.a - 1, c);
          if (!entry || entry[2] !== NULLV || entry[1] !== expect || probe(g.a - 1)[c] !== expect) { edgeFailures++; note({ kind: "edge-open", a: g.a, comp: compName(c), entry, expect, natal: probe(g.a - 1)[c] }); }
        }
        if (g.b < end) {
          edgeChecks++;
          const sw = result.switches.find((x) => x.at.getTime() === g.b);
          const entry = sw && sw.changes.map(encodeChange).find(([comp]) => comp === c);
          const expect = cellValue(g.b, c);
          if (!entry || entry[1] !== NULLV || entry[2] !== expect || probe(g.b)[c] !== expect) { edgeFailures++; note({ kind: "edge-close", b: g.b, comp: compName(c), entry, expect, natal: probe(g.b)[c] }); }
        }
      }
      const dense = [];
      for (let t = Math.max(start, g.a - EDGE_MS); t < g.a; t++) dense.push(t);
      for (let t = g.b; t < Math.min(end, g.b + EDGE_MS); t++) dense.push(t);
      const v = new Int8Array(NC);
      last = Number.NaN;
      for (const t of dense) {
        vec(chartAt(t, w, true), v, 0);
        denseEdgeSamples++;
        const cell = cells.find((x) => x.s <= t && t < x.e);
        for (let c = 0; c < NC; c++) {
          if (maskedAt(t, c)) continue;
          if (cell.v[c] !== v[c]) { denseEdgeFailures++; note({ kind: "dense-edge", t, comp: compName(c), cell: cell.v[c], natal: v[c] }); }
        }
      }
    }
    const checkerMs = performance.now() - c0;
    const pass = missed === 0 && extra === 0 && disagree === 0 && structural === 0 && nullMismatch === 0 && msFailures === 0 && edgeFailures === 0 && denseEdgeFailures === 0 && houseMismatch === 0;
    parentPort.postMessage({
      ...base, pass, flags: result.flags, cells: cells.length, switches: result.switches.length, changes: changes.length,
      unresolved: result.unresolved.map((u) => [u.start.toISOString(), u.end.toISOString(), u.features.map((f) => `${f.feature}:${f.body}`).join(",")]),
      samples: n, transitions, maskedTransitions, matched, missed, extra, excursionChanges, excursionConfirmed, disagree, maskedSamples, nullMismatch, structural,
      msChecks, msFailures, msMaskedSkips, edgeChecks, edgeFailures, denseEdgeSamples, denseEdgeFailures, houseMismatch, shareSum, roundedSum: result.rounding ? roundedSum : null,
      finderMs, checkerMs, fails
    });
  });
}
