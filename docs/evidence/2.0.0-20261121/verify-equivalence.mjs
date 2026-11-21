/**
 * Seeded equivalence and earlier-reader checks for @zodiacs/engine 2.0.0.
 *
 * 1. Compares positions() across 1,000 seeded random instants in 1800 to 2199
 *    (LCG seed 20261121) between this checkout's dist/ (2.0.0) and the carried
 *    artifacts/zodiacs-engine-2.0.0-rc.6.tgz archive, plus four 2027-10-02
 *    boundary natalChart() calls (synthetic coordinates 51.4779, 0).
 * 2. Writes 2.0.0 natal envelopes for synthetic inputs A (historical IERS UTC)
 *    and C (continuous-UTC after 2027-10-02) and parses them with the carried
 *    2.0.0-rc.3, 2.0.0-rc.6 and 1.1.0 archives.
 *
 * Usage (from repository root, after npm run build):
 *     node docs/evidence/2.0.0-20261121/verify-equivalence.mjs
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const EV = path.join(REPO, "docs/evidence/2.0.0-20261121/results");
fs.mkdirSync(EV, { recursive: true });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "zod-200-checks-"));
try {
  const unpack = (ver) => {
    const dir = path.join(tmp, ver);
    fs.mkdirSync(dir, { recursive: true });
    execFileSync("tar", ["-xzf", path.join(REPO, `artifacts/zodiacs-engine-${ver}.tgz`), "-C", dir]);
    fs.symlinkSync(path.join(REPO, "node_modules"), path.join(dir, "package/node_modules"));
    return path.join(dir, "package");
  };
  const pkgRc6 = unpack("2.0.0-rc.6");
  const pkgRc3 = unpack("2.0.0-rc.3");
  const pkg110 = unpack("1.1.0");

  const cur = await import(pathToFileURL(path.join(REPO, "dist/index.js")).href);
  const curReceipt = await import(pathToFileURL(path.join(REPO, "dist/receipt.js")).href);
  const rc6 = await import(pathToFileURL(path.join(pkgRc6, "dist/index.js")).href);
  const rc6Receipt = await import(pathToFileURL(path.join(pkgRc6, "dist/receipt.js")).href);
  const rc3Receipt = await import(pathToFileURL(path.join(pkgRc3, "dist/receipt.js")).href);
  const v110Receipt = await import(pathToFileURL(path.join(pkg110, "dist/receipt.js")).href);

  // 1. Property test: 1,000 seeded random instants in 1800 to 2199 (all bodies returned by positions())
  // plus four 2027-10-02 boundary natalChart() calls.
  let seed = 20261121;
  const nextRand = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const startMs = Date.UTC(1800, 0, 1);
  const endMs = Date.UTC(2199, 11, 31, 23, 59, 59);
  let compared = 0;
  let equal = 0;
  const mismatches = [];
  for (let i = 0; i < 1000; i++) {
    const t = new Date(Math.floor(startMs + nextRand() * (endMs - startMs)));
    const a = cur.positions(t);
    const b = rc6.positions(t);
    compared += 1;
    if (JSON.stringify(a) === JSON.stringify(b)) {
      equal += 1;
    } else if (mismatches.length < 5) {
      mismatches.push({ instant: t.toISOString(), a, b });
    }
  }

  const boundaryInstants = [
    "2027-10-01T23:59:59.000Z",
    "2027-10-02T00:00:00.000Z",
    "2027-10-02T23:59:59.000Z",
    "2027-10-03T00:00:00.000Z"
  ];
  const boundaryChecks = boundaryInstants.map((iso) => {
    const a = cur.natalChart({ utc: iso, latitude: 51.4779, longitude: 0 });
    const b = rc6.natalChart({ utc: iso, latitude: 51.4779, longitude: 0 });
    const aNorm = { ...a, engineVersion: undefined };
    const bNorm = { ...b, engineVersion: undefined };
    return {
      utc: iso,
      timeBasis: a.timeScale.basis,
      ut1Source: a.timeScale.ut1MinusUtc.source,
      equalToRc6ExcludingVersion: JSON.stringify(aNorm) === JSON.stringify(bNorm)
    };
  });

  const propOut = {
    node: process.version,
    generator: "docs/evidence/2.0.0-20261121/verify-equivalence.mjs",
    seed: 20261121,
    prng: "lcg-1664525-1013904223-mod-2^32",
    span: "1800-01-01T00:00:00.000Z to 2199-12-31T23:59:59.000Z",
    instantsCompared: compared,
    instantsBitIdentical: equal,
    mismatches,
    boundaryInputs: { latitude: 51.4779, longitude: 0 },
    boundaryChecks
  };
  fs.writeFileSync(path.join(EV, "property-1000.json"), JSON.stringify(propOut, null, 2) + "\n");
  console.log(
    "property-1000:",
    compared,
    "compared,",
    equal,
    "bit-identical; boundaries:",
    boundaryChecks.every((x) => x.equalToRc6ExcludingVersion)
  );

  // 2. Earlier-readers check: 2.0.0 writes envelopes for synthetic inputs A and C;
  // carried 2.0.0-rc.3, 2.0.0-rc.6 and 1.1.0 archives parse them.
  const inputA = { utc: "1990-06-15T12:00:00Z", latitude: 51.4779, longitude: 0, houseSystem: "placidus" };
  const inputC = { utc: "2030-01-01T00:00:00Z", latitude: 51.4779, longitude: 0, houseSystem: "koch" };
  const envA = curReceipt.serializeNatalEnvelope(curReceipt.createNatalEnvelope(cur.natalChart(inputA)));
  const envC = curReceipt.serializeNatalEnvelope(curReceipt.createNatalEnvelope(cur.natalChart(inputC)));

  const checkReader = (name, mod, raw) => {
    const res = mod.parseNatalEnvelope(raw);
    if (res.ok) {
      return {
        reader: name,
        ok: true,
        engineVersion: res.envelope.receipt.engine.version,
        timeBasis: res.envelope.result.timeScale.basis
      };
    }
    return { reader: name, ok: false, code: res.code, message: res.message };
  };

  const earlierOut = {
    writer: cur.ENGINE_VERSION,
    node: process.version,
    generator: "docs/evidence/2.0.0-20261121/verify-equivalence.mjs",
    inputA: {
      "2.0.0-rc.3": checkReader("2.0.0-rc.3", rc3Receipt, envA),
      "2.0.0-rc.6": checkReader("2.0.0-rc.6", rc6Receipt, envA),
      "1.1.0": checkReader("1.1.0", v110Receipt, envA)
    },
    inputC: {
      "2.0.0-rc.3": checkReader("2.0.0-rc.3", rc3Receipt, envC),
      "2.0.0-rc.6": checkReader("2.0.0-rc.6", rc6Receipt, envC),
      "1.1.0": checkReader("1.1.0", v110Receipt, envC)
    }
  };
  fs.writeFileSync(path.join(EV, "earlier-readers.json"), JSON.stringify(earlierOut, null, 2) + "\n");
  console.log("earlier-readers:", JSON.stringify(earlierOut, null, 2));

  if (
    equal !== compared ||
    !boundaryChecks.every((x) => x.equalToRc6ExcludingVersion) ||
    !earlierOut.inputA["2.0.0-rc.3"].ok ||
    !earlierOut.inputA["2.0.0-rc.6"].ok ||
    !earlierOut.inputA["1.1.0"].ok ||
    !earlierOut.inputC["2.0.0-rc.3"].ok ||
    !earlierOut.inputC["2.0.0-rc.6"].ok ||
    earlierOut.inputC["1.1.0"].ok ||
    earlierOut.inputC["1.1.0"].code !== "unsupported_feature"
  ) {
    process.exitCode = 1;
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
