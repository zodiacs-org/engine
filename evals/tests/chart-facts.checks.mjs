import assert from "node:assert/strict";
import test from "node:test";
import { computeChartFacts, validateSyntheticChart } from "../lib/chart-facts.mjs";
import { loadLocalEngine } from "../lib/local-engine.mjs";
import { validateEntry } from "../lib/validate-entry.mjs";

// Invented inputs only. These check adapter consistency, not ephemeris accuracy.
const birth = { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12 };
const synthetic = (settings = {}, id = "synthetic-example") => ({
  schemaVersion: "1.0.0", id, synthetic: true, birth: { ...birth, ...settings }
});
const systems = [
  "whole", "placidus", "koch", "porphyry", "regiomontanus", "campanus",
  "topocentric", "alcabitius", "equal", "equal-mc", "vehlow", "meridian", "morinus"
];
const byKind = (result, kind) => result.facts.filter((factor) => factor.kind === kind);

function checkReference(result, chart) {
  assert.deepEqual(result.reference.bodies, chart.bodies);
  assert.deepEqual(result.reference.aspects, chart.aspects);
  assert.deepEqual(result.reference.houses, chart.houses);
  assert.deepEqual(result.reference.angles, chart.angles);
  assert.deepEqual(result.flags, chart.flags);
  assert.deepEqual(result.time.deltaT, chart.deltaT);
  assert.deepEqual(result.time.timeScale, chart.timeScale);
}

function assertWholeSignHouses(result) {
  const ascendantSign = Math.floor(result.reference.angles.asc / 30);
  const placements = new Map(result.reference.bodies.map((row) => [row.body, row]));
  for (const fact of byKind(result, "house")) {
    const signIndex = Math.floor(placements.get(fact.body).lon / 30);
    assert.equal(fact.house, (signIndex - ascendantSign + 12) % 12 + 1);
    assert.equal(fact.houseSystem, "whole");
  }
}

test("the documented synthetic example preserves public engine results and emits schema-compatible factors", async () => {
  const input = synthetic();
  const { api } = await loadLocalEngine();
  const chart = api.natalChart(input.birth);
  const result = await computeChartFacts(input);
  checkReference(result, chart);
  assert.equal(result.caseId, input.id);
  assert.equal(result.synthetic, true);
  assert.equal(result.schemaVersion, "1.0.0");
  assert.equal(result.input.utc, "2003-05-17T08:13:00.000Z");
  assert.equal(result.input.timeScale, "utc");
  assert.equal(result.input.timeKnown, true);
  assert.equal(result.input.houseSystem, "whole");
  assert.deepEqual(result.availability.houses, {
    status: "available", reasons: [], requestedSystem: "whole", actualSystem: "whole", fallback: false
  });
  assert.equal(result.availability.temporalScope, "known-instant");
  assertWholeSignHouses(result);

  const placements = byKind(result, "placement");
  assert.equal(placements.length, chart.bodies.length);
  assert.equal(new Set(placements.map(({ body }) => body)).size, chart.bodies.length);
  for (const row of chart.bodies) {
    assert.deepEqual(placements.find(({ body }) => body === row.body), {
      kind: "placement", body: row.body, sign: row.sign
    });
  }
  assert.equal(byKind(result, "house").length, chart.bodies.length);
  assert.equal(byKind(result, "aspect").length, chart.aspects.length);
  for (const factor of result.facts) {
    const checked = validateEntry({
      schemaVersion: "1.0.0", id: "synthetic-factor", language: "en", tradition: "western-tropical",
      factor, meaning: { summary: "Original test interpretation.", themes: ["test"], epistemicStatus: "symbolic-interpretation" },
      provenance: { kind: "authored", authors: ["OpenAI Codex"], note: "Original synthetic test data." },
      license: { spdxId: "MIT", attribution: "OpenAI Codex, original test data." }
    });
    assert.equal(checked.valid, true, JSON.stringify(checked.errors));
  }
});

test("all supported house systems use the actual engine cusps for body membership", async () => {
  const { api } = await loadLocalEngine();
  for (const houseSystem of systems) {
    const input = synthetic({ houseSystem });
    const result = await computeChartFacts(input);
    const chart = api.natalChart(input.birth);
    checkReference(result, chart);
    assert.equal(result.availability.houses.requestedSystem, houseSystem);
    assert.equal(result.availability.houses.actualSystem, houseSystem);
    assert.equal(result.availability.houses.fallback, false);
    const houses = byKind(result, "house");
    assert.equal(houses.length, chart.bodies.length);
    for (const row of chart.bodies) {
      assert.deepEqual(houses.find(({ body }) => body === row.body), {
        kind: "house", body: row.body,
        house: api.houseOf(row.lon, chart.houses.cusps), houseSystem
      });
    }
  }
});

test("Placidus and Koch fallback preserve requested systems and emit whole-sign facts in either hemisphere", async () => {
  for (const houseSystem of ["placidus", "koch"]) {
    for (const latitude of [-78, 78]) {
      const result = await computeChartFacts(synthetic({ latitude, houseSystem }));
      assert.deepEqual(result.availability.houses, {
        status: "available", reasons: [], requestedSystem: houseSystem, actualSystem: "whole", fallback: true
      });
      assert.ok(result.flags.includes("polar-fallback"));
      assert.equal(result.input.houseSystem, houseSystem);
      assert.equal(result.reference.houses.system, "whole");
      assertWholeSignHouses(result);
      assert.equal(byKind(result, "house").length, result.reference.bodies.length);
    }
  }
});

test("unknown time keeps the caller's non-noon reference and suppresses houses even in polar regions", async () => {
  const input = synthetic({ utc: "2003-05-17T08:13:00+03:00", timeKnown: false, latitude: 78, houseSystem: "placidus" });
  const { api } = await loadLocalEngine();
  const result = await computeChartFacts(input);
  checkReference(result, api.natalChart(input.birth));
  assert.equal(result.time.sourceInstant, input.birth.utc);
  assert.equal(result.input.utc, "2003-05-17T05:13:00.000Z");
  assert.equal(result.availability.temporalScope, "reference-instant");
  assert.deepEqual(result.availability.houses, {
    status: "unavailable", reasons: ["unknown-time"], requestedSystem: "placidus", actualSystem: null, fallback: false
  });
  assert.equal(result.reference.houses, null);
  assert.equal(result.reference.angles, null);
  assert.equal(byKind(result, "house").length, 0);
  assert.ok(byKind(result, "placement").length > 0);
  assert.ok(byKind(result, "aspect").length > 0);
  assert.ok(result.flags.includes("no-time"));
  assert.ok(!result.flags.includes("polar-fallback"));
});

test("missing coordinates are distinct from unknown time, and both absence reasons can be retained", async () => {
  for (const timeKnown of [true, false]) {
    const input = synthetic();
    input.birth = { utc: birth.utc, timeKnown, houseSystem: "koch" };
    const result = await computeChartFacts(input);
    assert.equal(result.availability.temporalScope, timeKnown ? "known-instant" : "reference-instant");
    assert.deepEqual(result.availability.houses, {
      status: "unavailable",
      reasons: timeKnown ? ["missing-coordinates"] : ["unknown-time", "missing-coordinates"],
      requestedSystem: "koch", actualSystem: null, fallback: false
    });
    assert.equal(result.reference.angles, null);
    assert.equal(result.reference.houses, null);
    assert.equal(byKind(result, "house").length, 0);
    assert.equal(result.flags.includes("no-time"), !timeKnown);
  }
});

test("natal aspect facts retain the engine policy and never add node aspects", async () => {
  const { api } = await loadLocalEngine();
  const result = await computeChartFacts(synthetic());
  const aspects = byKind(result, "aspect");
  assert.ok(aspects.length > 0);
  for (const row of result.reference.aspects) {
    assert.ok(aspects.some((factor) => factor.a === row.a && factor.b === row.b && factor.aspect === row.type));
  }
  assert.ok(aspects.every(({ a, b, policy }) => !a.includes("Node") && !b.includes("Node") && policy === "natal-major-defaults"));
  assert.ok(byKind(result, "placement").some(({ body }) => body === "North Node"));
  assert.ok(byKind(result, "house").some(({ body }) => body === "South Node"));
  assert.deepEqual(result.conventions.aspects.definitions, api.ASPECTS);
  assert.deepEqual(result.conventions.aspects.bodies, [...api.ASPECT_BODIES]);
  assert.equal(result.conventions.aspects.arithmetic, "engine-natal-floating-point");
  assert.equal(result.conventions.aspects.stationaryRelativeSpeedDegreesPerDay, api.STATIONARY_RELATIVE_SPEED);
  assert.deepEqual(result.conventions.natal, api.NATAL_RECEIPT_CONVENTION_SETS[0]);
});

test("Mercury dual sign conditions remain separate facts, discovered from synthetic instants", async () => {
  const { api } = await loadLocalEngine();
  const examples = new Map();
  for (let month = 1; month <= 12 && examples.size < 2; month += 1) {
    for (const day of [1, 11, 21]) {
      const utc = `2004-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T08:13:00Z`;
      const mercury = api.natalChart({ utc }).bodies.find(({ body }) => body === "Mercury");
      if (["virgo", "pisces"].includes(mercury.sign) && !examples.has(mercury.sign)) examples.set(mercury.sign, utc);
    }
  }
  assert.equal(examples.size, 2, "synthetic search must encounter both Mercury conditions");
  for (const [sign, utc] of examples) {
    const result = await computeChartFacts(synthetic({ utc }));
    const expected = sign === "virgo" ? ["domicile", "exaltation"] : ["detriment", "fall"];
    const row = result.reference.dignities.find(({ body }) => body === "Mercury");
    assert.deepEqual(row, { body: "Mercury", sign, labels: expected });
    const facts = byKind(result, "dignity").filter(({ body }) => body === "Mercury");
    assert.deepEqual(facts.map(({ dignity }) => dignity), expected);
    assert.ok(facts.every((factor) => factor.sign === sign && factor.system === "classical-sign"));
  }
});

test("empty classical sign dignity labels remain distinguishable from unsupported bodies", async () => {
  const { api } = await loadLocalEngine();
  const result = await computeChartFacts(synthetic());
  assert.deepEqual(result.availability.dignities.supportedBodies, [...api.CLASSICAL_PLANETS]);
  assert.deepEqual(result.availability.dignities.unsupportedBodies, ["Uranus", "Neptune", "Pluto", "North Node", "South Node"]);
  assert.deepEqual(result.reference.dignities.map(({ body }) => body), [...api.CLASSICAL_PLANETS]);
  assert.ok(result.reference.dignities.some(({ labels }) => labels.length === 0));
  for (const row of result.reference.dignities) {
    assert.deepEqual(row.labels, api.dignitiesFor(row.body, row.sign));
    assert.equal(byKind(result, "dignity").filter(({ body }) => body === row.body).length, row.labels.length);
    assert.ok(!Object.hasOwn(row, "peregrine"));
  }
  assert.ok(byKind(result, "dignity").every(({ body }) => api.CLASSICAL_PLANETS.includes(body)));
});

test("explicit time scales and pinned delta T reach the engine and survive serialization", async () => {
  const { api } = await loadLocalEngine();
  for (const timeScale of ["utc", "ut1", "tt"]) {
    for (const pin of [undefined, 75.25]) {
      const input = synthetic({ utc: "1901-02-03T04:05:06Z", timeScale });
      if (pin !== undefined) input.birth.deltaT = pin;
      const result = await computeChartFacts(input);
      checkReference(result, api.natalChart(input.birth));
      assert.equal(result.input.timeScale, timeScale);
      assert.equal(result.time.timeScale.input, timeScale);
      assert.equal(result.time.sourceInstant, input.birth.utc);
      if (pin !== undefined) {
        assert.equal(result.input.deltaT, pin);
        assert.equal(result.time.deltaT.model, "pinned");
        assert.equal(result.time.deltaT.seconds, pin);
      }
      assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    }
  }
});

test("computed instants outside the reference span retain the engine coverage flag", async () => {
  const result = await computeChartFacts(synthetic({ utc: "1601-02-03T04:05:06Z" }));
  const { api } = await loadLocalEngine();
  assert.equal(result.coverage.outsideReferenceSpan, true);
  assert.deepEqual(result.coverage.referenceSpan, api.REFERENCE_SPAN);
  assert.ok(result.flags.includes("outside-reference-span"));
  assert.ok(result.reference.bodies.length > 0);
});

test("case validation rejects malformed, non-synthetic and unsupported inputs without coercion", async () => {
  const invalid = [null, [], {}, { ...synthetic(), synthetic: false }, { ...synthetic(), extra: true }];
  for (const settings of [
    { utc: "2003-05-17" }, { utc: "2003-05-17T08:13:00" }, { utc: new Date(birth.utc) },
    { utc: "2003-05-17T08:13:00Z\n" }, { timeKnown: null }, { timeKnown: "false" },
    { timeScale: "local" }, { houseSystem: "unknown" }, { houseSystem: null },
    { latitude: 90 }, { latitude: -90 }, { latitude: "35" }, { latitude: NaN },
    { longitude: 181 }, { longitude: -181 }, { deltaT: Infinity }, { deltaT: 10000000001 },
    { zodiac: "sidereal" }, { flags: ["no-time"] }
  ]) invalid.push(synthetic(settings));
  for (const missing of ["latitude", "longitude"]) {
    const input = synthetic();
    delete input.birth[missing];
    invalid.push(input);
  }
  for (const input of invalid) {
    const report = validateSyntheticChart(input);
    assert.equal(report.valid, false);
    assert.ok(report.errors.length > 0);
    await assert.rejects(computeChartFacts(input), (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "Invalid synthetic chart case.");
      assert.deepEqual(error.errors, report.errors);
      return true;
    });
  }
  const accepted = synthetic();
  const before = structuredClone(accepted);
  assert.deepEqual(validateSyntheticChart(accepted), { valid: true, errors: [] });
  assert.deepEqual(accepted, before);
  assert.ok(!Object.hasOwn(accepted.birth, "timeKnown"));
});

test("the engine rejects invalid calendar dates and unsupported ephemeris instants after structural validation", async () => {
  for (const utc of [
    "2001-02-29T08:13:00Z", "2003-04-31T08:13:00Z", "2003-05-17T24:00:00Z",
    "2003-05-17T08:13:60Z", "2003-05-17T08:13:00+24:00",
    "0000-01-01T08:13:00Z", "9999-01-01T08:13:00Z"
  ]) {
    const input = synthetic({ utc });
    assert.equal(validateSyntheticChart(input).valid, true);
    await assert.rejects(computeChartFacts(input), RangeError);
  }
});

test("facts have stable provenance, JSON values, frozen output and a pre-await snapshot of caller input", async () => {
  const input = synthetic();
  const original = structuredClone(input);
  const pending = computeChartFacts(input);
  input.id = "synthetic-changed";
  input.birth.utc = "2007-11-23T21:09:00Z";
  input.birth.latitude = -45;
  const result = await pending;
  assert.equal(result.caseId, original.id);
  assert.equal(result.time.sourceInstant, original.birth.utc);
  assert.equal(result.input.latitude, original.birth.latitude);
  assert.deepEqual(await computeChartFacts(original), result);
  assert.deepEqual(original, synthetic());
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  assert.equal(result.provenance.engine.name, "@zodiacs/engine");
  assert.equal(result.provenance.engine.source, "local-source");
  assert.equal(result.provenance.ephemeris.name, "astronomy-engine");
  assert.equal(result.provenance.runtime.node, process.versions.node);
  assert.equal(result.provenance.runtime.v8, process.versions.v8);
  assert.match(result.provenance.bundle.digest, /^sha256:[a-f0-9]{64}$/);
  assert.match(result.provenance.adapter.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.provenance.adapter.id, "local-engine-facts");
  function checkFrozen(value) {
    if (value && typeof value === "object") {
      assert.ok(Object.isFrozen(value));
      for (const child of Object.values(value)) checkFrozen(child);
    }
  }
  checkFrozen(result);
  assert.throws(() => { result.reference.bodies[0].sign = "pisces"; }, TypeError);
  assert.throws(() => { result.facts.push({ kind: "invalid" }); }, TypeError);
  assert.throws(() => { result.provenance.engine.version = "invalid"; }, TypeError);
  assert.deepEqual(await computeChartFacts(original), result);
});
