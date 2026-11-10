// Offline measurements against committed independent references. This report
// is evidence of comparisons, never a source of test expectations.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { register } from "node:module";

register(new URL("./source-loader.mjs", import.meta.url), import.meta.url);
const api = await import("../src/index.ts");
const { crescentGeometry } = await import("../src/crescent-geometry.ts");
const project = new URL("../", import.meta.url);
const root = new URL("../../", import.meta.url);
const output = new URL("docs/evidence/reference-results.json", project);
const mode = process.argv.slice(2);
assert(mode.length === 1 && ["--write", "--check"].includes(mode[0]),
  "Usage: node heliacal/scripts/measure-reference-evidence.mjs --write|--check");

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {};
function fixture(path) {
  const bytes = readFileSync(new URL(path, root));
  inputs[path] = digest(bytes);
  return JSON.parse(bytes);
}
function sourceDigest(base) {
  const rows = [];
  function visit(url, prefix) {
    for (const entry of readdirSync(url, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (["fixtures", "node_modules"].includes(entry.name)) continue;
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) visit(new URL(`${entry.name}/`, url), `${path}/`);
      else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        rows.push(`${path}\0${digest(readFileSync(new URL(entry.name, url)))}\n`);
      }
    }
  }
  visit(base, "");
  return digest(rows.join(""));
}

const comparisons = [];
function numeric(reference, id, field, actual, expected, tolerance, unit) {
  assert(Number.isFinite(actual) && Number.isFinite(expected), `${reference}/${id}/${field}: nonfinite value`);
  const absoluteError = Math.abs(actual - expected);
  assert(absoluteError <= tolerance, `${reference}/${id}/${field}: ${absoluteError} > ${tolerance}`);
  comparisons.push({ reference, id, field, actual, expected, absoluteError, tolerance, unit });
}
const classifications = [];
function exact(reference, id, field, actual, expected) {
  assert.deepEqual(actual, expected, `${reference}/${id}/${field}`);
  classifications.push({ reference, id, field, actual, expected });
}
function success(result, expectedStatus = "ok") {
  assert.equal(result.status, expectedStatus, result.detail ?? result.reason);
  return result;
}
const rad = Math.PI / 180;
function directionError(lon, lat, expectedLon, expectedLat) {
  // Haversine comparison metric independent of the API's cross/dot metric.
  const h = Math.sin((lat - expectedLat) * rad / 2) ** 2
    + Math.cos(lat * rad) * Math.cos(expectedLat * rad) * Math.sin((lon - expectedLon) * rad / 2) ** 2;
  return 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h)))) / rad * 3600;
}

const geometry = fixture("heliacal/test/fixtures/geometry-reference.json");
const geometryResult = success(api.sunBodyGeometry("Moon", geometry.horizons.at, geometry.horizons.observer));
for (const row of geometry.horizons.cases) {
  const pair = geometryResult[row.center];
  const body = row.body === "Sun" ? pair.sun : pair.target;
  const e = row.expected;
  const gate = geometry.horizons.tolerance;
  const id = `${row.body}/${row.center}`;
  for (const [frame, lon, lat] of [
    ["equatorial", e.rightAscensionDegrees, e.declinationDegrees],
    ["ecliptic", e.longitudeDegrees, e.latitudeDegrees]
  ]) {
    numeric("horizons-geometry", id, `${frame}DirectionError`,
      directionError(body[frame].lon, body[frame].lat, lon, lat), 0, gate.directionArcsec[row.body], "arcseconds");
    numeric("horizons-geometry", id, `${frame}RelativeDistanceError`,
      body[frame].dist / e.distanceAu - 1, 0, gate.relativeDistance[row.body], "fraction");
  }
  if (e.azimuthDegrees !== undefined) numeric("horizons-geometry", id, "horizontalDirectionError",
    directionError(body.horizontal.azimuthDeg, body.horizontal.altitudeDeg, e.azimuthDegrees, e.altitudeDegrees),
    0, gate.directionArcsec[row.body], "arcseconds");
  if (e.sunSeparationDegrees !== undefined) numeric("horizons-geometry", id, "elongation",
    pair.elongationDeg * 3600, e.sunSeparationDegrees * 3600, gate.sunSeparationArcsec, "arcseconds");
}
const erfa = geometry.erfa;
const horizontal = api.equatorialToHorizontal(0, erfa.inputRadians.declination / rad,
  erfa.inputRadians.latitude / rad, erfa.inputRadians.hourAngle / rad);
for (const field of ["azimuth", "altitude"]) numeric("erfa-hd2ae", "published-transform", field,
  horizontal[`${field}Deg`], erfa.expectedRadians[field] / rad, erfa.toleranceDegrees, "degrees");

const phase = fixture("heliacal/test/fixtures/phase-reference.json");
for (const row of phase.cases) {
  const actual = success(api.phase(row.body, phase.at, phase.observer))[row.center];
  const id = `${row.body}/${row.center}`;
  const e = row.expected;
  const gate = phase.tolerance;
  const angleGate = gate.apparentAngleArcsec[row.body === "Moon" ? "Moon" : "planets"];
  numeric("horizons-phase", id, "elongation", actual.elongationDeg * 3600, e.elongationDeg * 3600, angleGate, "arcseconds");
  numeric("horizons-phase", id, "phaseAngle", actual.illumination.phaseAngleDeg, e.phaseAngleDeg, gate.phaseAngleDeg, "degrees");
  numeric("horizons-phase", id, "illuminatedFraction", actual.illumination.illuminatedFraction,
    e.illuminatedPercent / 100, gate.illuminatedFraction, "fraction");
  const sun = geometry.horizons.cases.find((r) => r.body === "Sun" && r.center === row.center);
  const difference = e.longitudeDeg - sun.expected.longitudeDegrees;
  assert(difference > -180 && difference < 180);
  numeric("horizons-phase", id, "signedSynodicAngle", actual.signedSynodicAngleDeg * 3600,
    difference * 3600, angleGate, "arcseconds");
  exact("horizons-phase", id, "classification", actual.classification, difference > 0 ? "evening-star" : "morning-star");
}

const horizon = fixture("src/sky/fixtures/usno-rstt.json").days[0];
for (const body of ["Sun", "Moon"]) {
  const from = new Date(`${horizon.date}T00:00:00Z`);
  const result = success(api.horizonEvents(body, { latitude: horizon.latitude, longitude: horizon.longitude },
    from, new Date(from.getTime() + 86_400_000)), "complete");
  for (const [listedBody, kind, time] of horizon.events) {
    if (listedBody !== body) continue;
    const expectedAt = Date.parse(`${horizon.date}T${time}:00Z`);
    const candidates = result.events.filter((event) => event.kind === kind);
    assert.equal(candidates.length, 1, `${body} ${kind} should be unique on this reference day`);
    numeric("usno-horizon", `${body}/${kind}`, "epoch", candidates[0].at.getTime(), expectedAt, 60_000, "epoch-milliseconds");
  }
}

const visibility = fixture("heliacal/test/fixtures/visibility-reference.json");
for (const row of visibility.horizonCases) {
  const actual = api.horizonArcusVisionis(row.sunAltitudeDeg, row.requiredSolarDepressionDeg);
  numeric("schoch-criterion", row.id, "margin", actual.marginDeg, row.expected.marginDeg,
    visibility.tolerance.horizonMarginDeg, "degrees");
  exact("schoch-criterion", row.id, "passesCriterion", actual.passesCriterion, row.expected.passesCriterion);
}
for (const row of visibility.airmassCases) numeric("schaefer-airmass", `altitude-${row.apparentAltitudeDeg}`,
  "airmass", api.rozenbergAirmass(row.apparentAltitudeDeg), row.expectedAirmass, visibility.tolerance.tableAirmass, "relative-airmass");
const extinction = visibility.extinctionCase;
const screened = api.evaluateArcusVisibility(extinction.sample, extinction.parameters);
for (const field of ["airmass", "extinctionMagnitude", "magnitudeAtObserver", "marginMagnitude"]) {
  numeric("constructed-extinction", "explicit-refraction", field, screened.photometry[field], extinction.expected[field],
    visibility.tolerance.constructedArithmetic, field === "airmass" ? "relative-airmass" : "magnitudes");
}
exact("constructed-extinction", "explicit-refraction", "photometryPasses", screened.photometry.passesCriterion,
  extinction.expected.passesCriterion);
exact("constructed-extinction", "explicit-refraction", "passesCriterion", screened.passesCriterion,
  extinction.expectedOverallPassesCriterion);

for (const [model, evaluate, bestTime, category, fields] of [
  ["yallop", api.evaluateYallop, api.yallopBestTime, api.yallopCategory, {
    arcOfVisionDeg: "degrees", geocentricSemidiameterArcmin: "arcminutes", topocentricSemidiameterArcmin: "arcminutes",
    crescentWidthArcmin: "arcminutes", referenceArcOfVisionDeg: "degrees", q: "dimensionless"
  }],
  ["odeh", api.evaluateOdeh, api.odehBestTime, api.odehCategory, {
    arcOfVisionDeg: "degrees", crescentWidthArcmin: "arcminutes", referenceArcOfVisionDeg: "degrees", v: "degrees"
  }]
]) {
  const f = fixture(`heliacal/test/fixtures/${model}-reference.json`);
  for (const row of f.criterionCases) {
    const actual = evaluate(row.sample);
    for (const [field, unit] of Object.entries(fields)) numeric(`${model}-decimal`, row.id, field,
      actual[field], row.expected[field], f.tolerance.numericAbsolute, unit);
    if (model === "yallop" && row.expected.crescentWidthArcmin > 0) numeric("yallop-decimal", row.id,
      "relativeWidthError", actual.crescentWidthArcmin / row.expected.crescentWidthArcmin - 1,
      0, f.tolerance.nonzeroWidthRelative, "fraction");
    exact(`${model}-decimal`, row.id, "category", actual.category, row.expected.category);
  }
  for (const row of f.categoryCases) exact(`${model}-boundaries`, row.id, "category",
    category(row[model === "yallop" ? "q" : "v"]), row.category);
  for (const row of f.bestTimeCases) numeric(`${model}-rational-time`, row.id, "bestTime",
    Date.parse(bestTime(row.sunset, row.moonset).at), Date.parse(row.expected.at), 0, "epoch-milliseconds");
  for (const row of f.publishedBoundaries ?? []) {
    const actual = evaluate({ moonAltitudeTopocentricDeg: 0, sunAltitudeTopocentricDeg: 0, crescentWidthTopocentricArcmin: row.widthArcmin });
    for (const [field, offset] of Object.entries({ arcv1Deg: -0.96, arcv2Deg: 2, arcv3Deg: 5.65 })) {
      numeric("odeh-table-v", `width-${row.widthArcmin}`, field, actual.referenceArcOfVisionDeg + offset,
        row[field], f.tolerance.publishedBoundaryAbsoluteDeg, "degrees");
    }
  }
}

const published = fixture("heliacal/test/fixtures/yallop-published.json");
for (const group of published.groups) {
  const result = success(api.crescentEvents(published.observer, group.from, group.to, {
    model: "yallop-1997/1", lastAcceptedCategory: "B", maxElongationDeg: 30
  }), "complete");
  for (const row of group.rows) {
    numeric("yallop-appendix-a-rounded-time", row.date, "bestTime",
      Date.parse(api.yallopBestTime(row.sunset, row.moonset).at), Date.parse(row.bestTime),
      published.tolerance.roundedSourceBestTimeAbsoluteSeconds * 1000, "epoch-milliseconds");
    const pair = success(api.sunBodyGeometry("Moon", row.bestTime, published.observer));
    exact("yallop-appendix-a-printed-time", row.date, "category",
      api.evaluateYallop(crescentGeometry(pair).yallop).category, row.category);
    const opportunities = result.opportunities.filter((o) => o.status === "evaluated" && o.bestTime.at.startsWith(row.date));
    assert.equal(opportunities.length, 1);
    const opportunity = opportunities[0];
    for (const [field, actual] of [["sunset", opportunity.sunCrossing.at.getTime()],
      ["moonset", opportunity.moonCrossing.at.getTime()], ["bestTime", Date.parse(opportunity.bestTime.at)]]) {
      numeric("yallop-appendix-a-search", row.date, field, actual, Date.parse(row[field]),
        published.tolerance.engineTimeAbsoluteSeconds * 1000, "epoch-milliseconds");
    }
    exact("yallop-appendix-a-search", row.date, "category", opportunity.criterion.category, row.category);
  }
  assert.equal(result.events.length, 1);
  exact("yallop-appendix-a-search", group.id, "appearance", result.events[0].appearance, "first-evening");
  const passing = group.rows.find((row) => row.category === "A" || row.category === "B");
  numeric("yallop-appendix-a-search", group.id, "eventBestTime", Date.parse(result.events[0].at),
    Date.parse(passing.bestTime), published.tolerance.engineTimeAbsoluteSeconds * 1000, "epoch-milliseconds");
}

const summaries = [];
for (const row of comparisons) {
  let summary = summaries.find((s) => s.reference === row.reference && s.field === row.field);
  if (!summary) {
    summary = { reference: row.reference, field: row.field, unit: row.unit, cases: 0, maximumAbsoluteError: 0 };
    summaries.push(summary);
  }
  summary.cases++;
  summary.maximumAbsoluteError = Math.max(summary.maximumAbsoluteError, row.absoluteError);
}
const report = {
  schema: "heliacal.reference-evidence/1",
  scope: "Offline comparison of selected independent reference examples; no whole-span error bound or sighting-performance claim. This output is not a test oracle.",
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  engine: geometryResult.geocentric.sun.equatorial.receipt.engine,
  sourceSha256: {
    algorithm: "Sorted relative path, NUL, SHA-256, newline for each non-test .ts file, excluding fixture directories.",
    heliacal: sourceDigest(new URL("src/", project)),
    engine: sourceDigest(new URL("src/", root)),
    measurementScript: digest(readFileSync(new URL(import.meta.url)))
  },
  inputSha256: inputs,
  coverage: {
    geometry: { at: geometry.horizons.at, observer: geometry.horizons.observer },
    phase: { at: phase.at, observer: phase.observer },
    horizon: { date: horizon.date, latitude: horizon.latitude, longitude: horizon.longitude },
    criteria: "Only the listed published constants, table boundaries and independently constructed Decimal/rational worked inputs.",
    publishedCrescents: { observer: published.observer, groups: published.groups.map(({ id, from, to }) => ({ id, from, to })),
      source: published.source, scope: "Selected published predictions, not observed sightings; no morning or Odeh comparison." }
  },
  summaries,
  comparisons,
  classifications
};
const encoded = `${JSON.stringify(report, null, 2)}\n`;
if (mode[0] === "--write") {
  mkdirSync(new URL("docs/evidence/", project), { recursive: true });
  writeFileSync(output, encoded);
  console.log("Wrote heliacal/docs/evidence/reference-results.json; all independent comparison gates passed.");
} else {
  assert.equal(readFileSync(output, "utf8"), encoded,
    "Evidence is stale or the runtime/platform differs. Review the difference; regenerate with --write on the documented runtime.");
  console.log("Reference evidence matches the current sources, fixtures, runtime and measured comparisons.");
}
