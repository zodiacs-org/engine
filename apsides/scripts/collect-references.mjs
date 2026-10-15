import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchHorizons, horizonsParameters, parseHorizons } from "./horizons.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const daySeconds = 86_400;
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const encode = (value) => `${JSON.stringify(value, null, 2)}\n`;
const roundedJd = (jd) => Number(jd.toFixed(9));

/** Calendar arithmetic only: the label denotes TT, with no UTC conversion. */
export function calendarTtToJd(label) {
  if (typeof label !== "string" || !/^\d{4}-\d\d-\d\d$/u.test(label)) {
    throw new RangeError("Expected a Gregorian TT date label.");
  }
  const ms = Date.parse(`${label}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== label) {
    throw new RangeError("Invalid Gregorian TT date label.");
  }
  return ms / 86_400_000 + 2_440_587.5;
}

export function gridForCase(entry) {
  const from = calendarTtToJd(entry.fromTt);
  const to = calendarTtToJd(entry.toTt);
  const step = entry.stepDays;
  if (!(from < to) || !Number.isFinite(step) || step <= 0 || (to - from) / step > 10_000) {
    throw new RangeError("Invalid or oversized reference grid.");
  }
  const grid = [];
  for (let index = 0; from + index * step < to; index++) grid.push(roundedJd(from + index * step));
  grid.push(to);
  return grid;
}

/** Independent reference bracketing, using only Horizons signed range rates. */
export function rateBrackets(rows) {
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!Number.isFinite(row.jdTt) || !Number.isFinite(row.radialSpeedKmPerSecond) ||
        (index > 0 && row.jdTt <= rows[index - 1].jdTt)) {
      throw new RangeError("Invalid reference rate samples.");
    }
    if (row.radialSpeedKmPerSecond === 0) {
      // An exact zero cannot be classified by its value alone. Do not discard
      // it, guess its kind, or silently claim a complete reference scan.
      throw new Error("Exact zero reference rate needs a separately registered finer grid.");
    }
  }
  const brackets = [];
  for (let index = 1; index < rows.length; index++) {
    const left = rows[index - 1];
    const right = rows[index];
    if (Math.sign(left.radialSpeedKmPerSecond) !== Math.sign(right.radialSpeedKmPerSecond)) {
      brackets.push({ left, right, turn: left.radialSpeedKmPerSecond < 0 ? "minimum" : "maximum" });
    }
  }
  return brackets;
}

export function subdivideBracket(bracket, subdivisions) {
  if (!Number.isSafeInteger(subdivisions) || subdivisions < 2 || subdivisions > 32 ||
      !Number.isFinite(bracket.left.jdTt) || !Number.isFinite(bracket.right.jdTt) ||
      bracket.right.jdTt <= bracket.left.jdTt) throw new RangeError("Invalid reference bracket.");
  return Array.from({ length: subdivisions - 1 }, (_, index) => roundedJd(
    bracket.left.jdTt + (bracket.right.jdTt - bracket.left.jdTt) * (index + 1) / subdivisions
  ));
}

async function writeOnce(path, bytes) {
  try {
    const existing = await readFile(path, "utf8");
    if (existing !== bytes) throw new Error(`Refusing to replace existing reference identity: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(path, bytes, { flag: "wx" });
  }
}

export function validateReferencePlan(plan) {
  const ref = plan?.reference;
  if (plan?.schema !== "apsides-reference-plan/1" || plan.timeScale !== "TT" ||
      ref?.endpoint !== "https://ssd.jpl.nasa.gov/api/horizons.api" ||
      ref.frame !== "ICRF" || ref.correction !== "NONE" || ref.units !== "KM-S" || ref.table !== 3 ||
      !Number.isSafeInteger(ref.maxBatchEpochs) || ref.maxBatchEpochs < 1 || ref.maxBatchEpochs > 32 ||
      !Number.isSafeInteger(ref.maxResponseBytes) || ref.maxResponseBytes < 1 || ref.maxResponseBytes > 1_900_000 ||
      !Number.isFinite(ref.finalBracketSeconds) || ref.finalBracketSeconds <= 0 || ref.finalBracketSeconds > 1 ||
      !Number.isSafeInteger(ref.subdivisions) || ref.subdivisions < 2 || ref.subdivisions > 32 ||
      !Number.isSafeInteger(ref.maxRefinementRounds) || ref.maxRefinementRounds < 1 || ref.maxRefinementRounds > 12 ||
      !Array.isArray(plan.cases) || !plan.targets) {
    throw new RangeError("Invalid reference plan conventions or numerical controls.");
  }
  if (plan.cases.some((entry) => !/^(?:dev|held)-[a-z0-9-]+$/u.test(entry.id)) ||
      new Set(plan.cases.map((entry) => entry.id)).size !== plan.cases.length) {
    throw new RangeError("Invalid or duplicate reference case identity.");
  }
}

/** Fetches reference data only; never imports the engine or the apsides sampler. */
export async function collectCase(plan, planSha256, entry, { offline = false } = {}) {
  validateReferencePlan(plan);
  if (!/^[a-f0-9]{64}$/u.test(planSha256) ||
      !plan.cases.some((item) => JSON.stringify(item) === JSON.stringify(entry))) {
    throw new Error("Unregistered reference case or plan identity.");
  }
  if (entry.split !== "development") throw new Error("Held-out cases are reserved until M10.");
  const target = plan.targets[entry.body];
  if (!target) throw new Error("Unknown reference target.");
  const sources = [];
  const samples = new Map();
  const sampleKey = (jd) => jd.toFixed(9);
  let solutions;
  async function query(jds) {
    const unique = [...new Set(jds.map(roundedJd))].sort((a, b) => a - b);
    const missing = unique.filter((jd) => !samples.has(sampleKey(jd)));
    for (let index = 0; index < missing.length; index += plan.reference.maxBatchEpochs) {
      const requested = missing.slice(index, index + plan.reference.maxBatchEpochs);
      const params = horizonsParameters(target.targetId, target.centerId, requested);
      const response = await fetchHorizons(params, {
        cacheDirectory: join(project, ".cache/horizons-v1"), offline
      });
      const { header: { raw: _raw, ...header }, rows } = parseHorizons(response.text, {
        targetId: target.targetId, centerId: target.centerId, jdList: requested
      });
      const identity = JSON.stringify([header.target, header.center]);
      if (solutions !== undefined && solutions !== identity) throw new Error("Solution changed during reference collection.");
      solutions = identity;
      const sourceIndex = sources.length;
      sources.push({ ...response.source, header });
      rows.forEach((row, rowIndex) => {
        samples.set(sampleKey(requested[rowIndex]), { ...row, sourceIndex });
      });
    }
    return unique.map((jd) => samples.get(sampleKey(jd)));
  }

  const coarse = await query(gridForCase(entry));
  const discovered = rateBrackets(coarse);
  // Keep all candidates, including any unexpected turns caused by perturbations.
  const brackets = discovered.map((bracket) => ({ ...bracket }));
  for (let round = 0; brackets.some((b) => (b.right.jdTt - b.left.jdTt) * daySeconds > plan.reference.finalBracketSeconds); round++) {
    if (round >= plan.reference.maxRefinementRounds) throw new Error("Reference refinement exhausted its registered budget.");
    const active = brackets.filter((b) => (b.right.jdTt - b.left.jdTt) * daySeconds > plan.reference.finalBracketSeconds);
    const subdivisions = active.map((bracket) => subdivideBracket(bracket, plan.reference.subdivisions));
    await query(subdivisions.flat());
    for (let index = 0; index < active.length; index++) {
      const bracket = active[index];
      const inside = await query(subdivisions[index]);
      const turns = rateBrackets([bracket.left, ...inside, bracket.right]);
      if (turns.length !== 1 || turns[0].turn !== bracket.turn) {
        throw new Error("Ambiguous reference bracket: register a finer discovery grid, retaining this failure.");
      }
      bracket.left = turns[0].left;
      bracket.right = turns[0].right;
    }
  }

  const midpoints = brackets.map((b) => roundedJd((b.left.jdTt + b.right.jdTt) / 2));
  const probeDays = entry.stepDays / plan.reference.subdivisions;
  await query(midpoints.flatMap((jd) => [jd - probeDays, jd, jd + probeDays]));
  const events = [];
  for (let index = 0; index < brackets.length; index++) {
    const bracket = brackets[index];
    const midpoint = midpoints[index];
    const [before, at, after] = await query([midpoint - probeDays, midpoint, midpoint + probeDays]);
    const direction = bracket.turn === "minimum" ? 1 : -1;
    if (!(direction * (before.distanceKm - at.distanceKm) > 0 &&
          direction * (after.distanceKm - at.distanceKm) > 0 &&
          direction * before.radialSpeedKmPerSecond < 0 && direction * after.radialSpeedKmPerSecond > 0)) {
      throw new Error("Reference neighborhood does not confirm the distance turn.");
    }
    const kind = entry.body === "Moon"
      ? (bracket.turn === "minimum" ? "perigee" : "apogee")
      : (bracket.turn === "minimum" ? "perihelion" : "aphelion");
    events.push({
      id: `${entry.id}-${String(index + 1).padStart(2, "0")}`,
      kind, jdTt: at.jdTt, distanceKm: at.distanceKm,
      orbitalSpeedKmPerSecond: Math.hypot(...at.velocityKmPerSecond),
      radialSpeedKmPerSecond: at.radialSpeedKmPerSecond,
      bracketSeconds: (bracket.right.jdTt - bracket.left.jdTt) * daySeconds,
      discoveryBracket: [discovered[index].left.jdTt, discovered[index].right.jdTt],
      samples: { before, left: bracket.left, at, right: bracket.right, after }
    });
  }
  return {
    schema: "apsides-horizons-reference/1", planSha256, case: entry, target,
    method: "Horizons range-rate sign brackets, uniform subdivision, final midpoint sampled directly; no engine inputs",
    completeness: "All sign changes on the registered discovery grid; sub-grid pairs of extrema are not excluded",
    // Small scalar extracts retain the discovery evidence without copying prose.
    gridColumns: ["jdTt", "distanceKm", "radialSpeedKmPerSecond", "sourceIndex"],
    grid: coarse.map((row) => [row.jdTt, row.distanceKm, row.radialSpeedKmPerSecond, row.sourceIndex]),
    events, sources
  };
}

export async function main(args) {
  const bytes = await readFile(join(project, "references/plan.json"));
  const plan = JSON.parse(bytes.toString("utf8"));
  validateReferencePlan(plan);
  if (args.length === 1 && args[0] === "--manifest") {
    const fixtures = [];
    for (const entry of plan.cases.filter((item) => item.split === "development")) {
      const path = `fixtures/${entry.id}.json`;
      const content = await readFile(join(project, "references", path));
      const fixture = JSON.parse(content.toString("utf8"));
      if (fixture.schema !== "apsides-horizons-reference/1" || fixture.planSha256 !== digest(bytes) ||
          JSON.stringify(fixture.case) !== JSON.stringify(entry)) throw new Error("Fixture registration mismatch.");
      fixtures.push({ path, sha256: digest(content) });
    }
    await writeOnce(join(project, "references/manifest.json"), encode({
      schema: "apsides-reference-manifest/1", planSha256: digest(bytes), fixtures
    }));
    console.log("Reference manifest matches the frozen development fixtures.");
    return;
  }
  let caseId;
  let offline = false;
  let freeze = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--case" && caseId === undefined && args[index + 1] && !args[index + 1].startsWith("--")) caseId = args[++index];
    else if (arg === "--offline" && !offline) offline = true;
    else if (arg === "--freeze" && !freeze) freeze = true;
    else throw new Error("Usage: node scripts/collect-references.mjs --case ID [--offline] [--freeze], or --manifest");
  }
  const entry = plan.cases.find((item) => item.id === caseId);
  if (!entry) throw new Error("Choose an exact registered --case ID.");
  const fixture = await collectCase(plan, digest(bytes), entry, { offline });
  const directory = join(project, freeze ? "references/fixtures" : ".generated/references");
  await mkdir(directory, { recursive: true });
  const output = encode(fixture);
  if (Buffer.byteLength(output) >= plan.reference.maxResponseBytes) throw new Error("Fixture exceeds size budget.");
  await writeOnce(join(directory, `${entry.id}.json`), output);
  console.log(`${entry.id}: ${fixture.grid.length} discovery samples, ${fixture.events.length} reference extrema; ${digest(output)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
