/*
 * For each window whose counts differ between the branch's run and rc.16's
 * (compare-runs.json), the search on two builds, each in its own process, and
 * the number of changes of each component in each: which components the
 * difference in switches comes from.
 *
 *   node window-diff.mjs <label>=<dist> <label>=<dist> [out.json]   (out defaults to ./window-diff.json)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const component = (c) => (c.feature === "aspect" ? `aspect:${c.a}|${c.b}` : c.body ? `${c.feature}:${c.body}` : c.feature);

if (process.argv[2] === "--run") {
  const { birthWindow } = await import(pathToFileURL(resolve(process.argv[3], "window.js")).href);
  const windows = new Map(JSON.parse(readFileSync(resolve(here, "../windows.json"), "utf8")).windows.map((w) => [w.id, w]));
  const out = {};
  for (const id of JSON.parse(process.argv[4])) {
    const w = windows.get(id);
    const result = birthWindow({ start: new Date(w.start), end: new Date(w.end), latitude: w.latitude, longitude: w.longitude, houseSystem: w.houseSystem });
    const counts = {};
    for (const s of result.switches) for (const c of s.changes) counts[component(c)] = (counts[component(c)] ?? 0) + 1;
    out[id] = { switches: result.switches.length, counts };
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const builds = process.argv.slice(2).filter((arg) => arg.includes("="));
  const outFile = resolve(process.argv.slice(2).find((arg) => !arg.includes("=")) ?? resolve(here, "window-diff.json"));
  const ids = JSON.parse(readFileSync(resolve(here, "compare-runs.json"), "utf8")).rows.map((row) => row.id);
  const [[labelA, a], [labelB, b]] = builds.map((build) => {
    const [label, dist] = build.split("=");
    return [label, JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--run", resolve(dist), JSON.stringify(ids)], { encoding: "utf8", maxBuffer: 1 << 28 }))];
  });
  const rows = ids.map((id) => {
    const names = new Set([...Object.keys(a[id].counts), ...Object.keys(b[id].counts)]);
    const differences = {};
    for (const name of names) {
      const d = (b[id].counts[name] ?? 0) - (a[id].counts[name] ?? 0);
      if (d !== 0) differences[name] = d;
    }
    return { id, switches: [a[id].switches, b[id].switches], differences };
  });
  const names = (row) => Object.keys(row.differences);
  const nodesOnly = rows.filter((row) => names(row).length > 0 && names(row).every((name) => /^(house|sign):(North|South) Node$/u.test(name)));
  const report = {
    builds: [labelA, labelB],
    windows: rows.length,
    sameSwitches: rows.filter((row) => row.switches[0] === row.switches[1]).length,
    noDifference: rows.filter((row) => names(row).length === 0).map((row) => row.id),
    differenceOnlyInTheNodes: nodesOnly.length,
    differenceInOtherComponents: rows.filter((row) => names(row).length > 0 && !nodesOnly.includes(row)).map((row) => row.id),
    rows
  };
  writeFileSync(outFile, `${JSON.stringify(report, null, 1)}\n`);
  console.log(JSON.stringify({ ...report, rows: undefined }, null, 1));
}
