import assert from "node:assert/strict";
import test from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";
import { scoreReading } from "../lib/score-reading.mjs";
import {
  assertMetric, assertTotals, byKind, categories, expectedCounts,
  readingFor, resolved, resolveEvidencePointer, syntheticCase, unresolved
} from "./scoring-helpers.mjs";

const input = syntheticCase();
let pendingReference;
const referenceForExample = () => pendingReference ??= computeChartFacts(input);
const otherSign = (sign) => sign === "aries" ? "taurus" : "aries";

function absentVariant(factor) {
  if (factor.kind === "house") return { ...factor, house: factor.house % 12 + 1 };
  if (factor.kind === "aspect") return { ...factor, aspect: factor.aspect === "trine" ? "square" : "trine" };
  return { ...factor, sign: otherSign(factor.sign) };
}

function assertEvidence(report, unit, membership) {
  assert.equal(unit.eligibility.assessed, true);
  assert.deepEqual(unit.eligibility.reasons, []);
  assert.deepEqual(unit.eligibility.availabilityReasons, []);
  assert.equal(unit.evidence.membership, membership);
  assert.equal(typeof unit.evidence.domain, "object");
  assert.ok(unit.evidence.rows.length > 0);
  for (const pointer of unit.evidence.rows) resolveEvidencePointer(report.reference, pointer);
  if (membership === "present") {
    assert.ok(Number.isInteger(unit.evidence.referenceFactorIndex));
    const factor = report.reference.facts[unit.evidence.referenceFactorIndex];
    assert.ok(factor);
    assert.equal(factor.kind, unit.category);
  } else {
    assert.equal(unit.evidence.referenceFactorIndex, null);
  }
}

for (const kind of categories) {
  for (const [polarity, membership, verdict, coveredFactors] of [
    ["affirmed", "present", "correct", 1], ["affirmed", "absent", "incorrect", 0],
    ["negated", "present", "incorrect", 0], ["negated", "absent", "correct", 0]
  ]) {
    test(`${kind}: ${polarity} ${membership} factor is ${verdict} with explicit denominators`, async () => {
      const reference = await referenceForExample();
      const present = byKind(reference, kind)[0];
      assert.ok(present, `synthetic fixture must supply a positive ${kind}`);
      const factor = membership === "present" ? present : absentVariant(present);
      const reading = readingFor(input, [resolved(factor, { polarity })]);
      const report = await scoreReading(input, reading);
      assert.equal(report.status, "completed");
      assert.deepEqual(report.reference, reference);
      assert.deepEqual(report.reading, reading);
      assert.equal(report.units.length, 1);
      const unit = report.units[0];
      assert.equal(unit.verdict, verdict);
      assert.equal(unit.category, kind);
      assert.equal(unit.coverage.credited, coveredFactors === 1);
      assert.equal(unit.coverage.reason, coveredFactors ? "covered" : verdict === "incorrect" ? "incorrect" : "negated");
      assertEvidence(report, unit, membership);
      assertTotals(report.categories[kind], expectedCounts(reference, kind, {
        correct: verdict === "correct" ? 1 : 0, incorrect: verdict === "incorrect" ? 1 : 0, coveredFactors
      }));
      assertTotals(report.overall, expectedCounts(reference, null, {
        correct: verdict === "correct" ? 1 : 0, incorrect: verdict === "incorrect" ? 1 : 0, coveredFactors
      }));
      for (const omitted of categories.filter((category) => category !== kind)) {
        assertTotals(report.categories[omitted], expectedCounts(reference, omitted));
      }
    });
  }
}

test("all positive reference factors earn complete coverage without rounding or implied extras", async () => {
  const reference = await referenceForExample();
  const report = await scoreReading(input, readingFor(input, reference.facts.map((factor) => resolved(factor))));
  assert.equal(report.units.length, reference.facts.length);
  assert.deepEqual(report.contradictions, []);
  for (const kind of [...categories, null]) {
    const count = kind ? byKind(reference, kind).length : reference.facts.length;
    assertTotals(kind ? report.categories[kind] : report.overall,
      expectedCounts(reference, kind, { correct: count, coveredFactors: count }));
  }
  for (const unit of report.units) {
    assertEvidence(report, unit, "present");
    assert.deepEqual(unit.coverage, { credited: true, reason: "covered" });
  }
});

test("repetitions, JSON key order and reversed aspect bodies preserve every occurrence but share one unit", async () => {
  const reference = await referenceForExample();
  const aspect = byKind(reference, "aspect")[0];
  const reversed = {
    policy: aspect.policy, aspect: aspect.aspect, b: aspect.a, a: aspect.b, kind: "aspect"
  };
  const reading = readingFor(input, [resolved(aspect), resolved(reversed), resolved(aspect)]);
  const report = await scoreReading(input, reading);
  assert.equal(report.units.length, 1);
  const [a, b] = [aspect.a, aspect.b].sort();
  const tuple = ["aspect", a, b, aspect.aspect, aspect.policy];
  const unit = report.units[0];
  assert.equal(unit.id, "claim-1");
  assert.deepEqual(unit.factor, { kind: "aspect", a, b, aspect: aspect.aspect, policy: aspect.policy });
  assert.equal(unit.factorKey, JSON.stringify(tuple));
  assert.equal(unit.key, JSON.stringify([tuple, "affirmed", "unqualified", "reference-instant"]));
  assert.deepEqual(unit.claimIds, ["claim-1", "claim-2", "claim-3"]);
  assert.deepEqual(report.occurrences, [
    { claimId: "claim-1", index: 0, category: "aspect", unitId: "claim-1", duplicateOf: null },
    { claimId: "claim-2", index: 1, category: "aspect", unitId: "claim-1", duplicateOf: "claim-1" },
    { claimId: "claim-3", index: 2, category: "aspect", unitId: "claim-1", duplicateOf: "claim-1" }
  ]);
  assert.deepEqual(report.diagnostics.resolvedByCategory.aspect, { occurrences: 3, unique: 1, duplicates: 2 });
  assert.equal(report.diagnostics.uniqueResolved, 1);
  assert.equal(report.diagnostics.duplicateResolved, 2);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, coveredFactors: 1 }));
  assert.deepEqual(report.reading, reading);
});

test("certainty and temporal scope stay distinct while repeated qualified assertions deduplicate", async () => {
  const reference = await referenceForExample();
  const factor = byKind(reference, "placement")[0];
  const specs = [
    resolved(factor), resolved(factor, { certainty: "hedged" }),
    resolved(factor, { certainty: "conditional" }),
    resolved(factor, { temporalScope: "whole-day" }),
    resolved(factor, { temporalScope: "unspecified" }),
    resolved(factor, { certainty: "hedged" })
  ];
  const report = await scoreReading(input, readingFor(input, specs));
  assert.equal(report.units.length, 5);
  assert.deepEqual(report.units.map((unit) => unit.eligibility.reasons), [
    [], ["hedged"], ["conditional"], ["whole-day"], ["unspecified-temporal-scope"]
  ]);
  for (const unit of report.units.slice(1)) {
    assert.equal(unit.verdict, "unassessed");
    assert.equal(unit.evidence, null);
    assert.deepEqual(unit.coverage, { credited: false, reason: "unassessed" });
  }
  assert.deepEqual(report.units[1].claimIds, ["claim-2", "claim-6"]);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, unassessedResolved: 4, coveredFactors: 1 }));
});

test("opposite polarity keeps membership verdicts and withholds coverage from both units", async () => {
  const reference = await referenceForExample();
  for (const kind of categories) {
    const factor = byKind(reference, kind)[0];
    const report = await scoreReading(input, readingFor(input, [
      resolved(factor), resolved(factor, { polarity: "negated" }), resolved(factor)
    ]));
    assert.deepEqual(report.units.map((unit) => unit.verdict), ["correct", "incorrect"]);
    assert.deepEqual(report.contradictions, [{
      id: "contradiction-1", unitIds: ["claim-1", "claim-2"], rules: ["same-factor-opposite-polarity"]
    }]);
    assert.deepEqual(report.units.map((unit) => unit.contradictionIds), [["contradiction-1"], ["contradiction-1"]]);
    assert.ok(report.units.every((unit) => !unit.coverage.credited));
    assert.equal(report.units[0].coverage.reason, "contradicted");
    assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, incorrect: 1, contradicted: 2 }));
  }
});

for (const [kind, rule] of [
  ["placement", "affirmed-exclusive-placement-signs"],
  ["house", "affirmed-exclusive-house-numbers"],
  ["aspect", "affirmed-exclusive-aspect-types"]
]) {
  test(`${kind} competing positive answers form an exclusive contradiction`, async () => {
    const reference = await referenceForExample();
    const factor = byKind(reference, kind)[0];
    const report = await scoreReading(input, readingFor(input, [resolved(factor), resolved(absentVariant(factor))]));
    assert.deepEqual(report.contradictions, [{
      id: "contradiction-1", unitIds: ["claim-1", "claim-2"], rules: [rule]
    }]);
    assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, incorrect: 1, contradicted: 2 }));
  });
}

test("multiple contradiction edges count participants once and retained duplicates do not add edges", async () => {
  const reference = await referenceForExample();
  const actual = byKind(reference, "placement")[0];
  const wrong = absentVariant(actual);
  const wrongAgain = { ...wrong, sign: ["aries", "taurus", "gemini"].find((sign) => sign !== actual.sign && sign !== wrong.sign) };
  const report = await scoreReading(input, readingFor(input, [
    resolved(actual), resolved(wrong), resolved(wrongAgain), resolved(actual)
  ]));
  assert.equal(report.contradictions.length, 3);
  assert.ok(report.units.every((unit) => unit.contradictionIds.length === 2));
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, incorrect: 2, contradicted: 3 }));
});

test("dignity assertions imply their sign for conflicts but do not earn implied placement coverage", async () => {
  const reference = await referenceForExample();
  const dignity = byKind(reference, "dignity")[0];
  const placement = { kind: "placement", body: dignity.body, sign: dignity.sign };
  for (const counterpart of [
    resolved(absentVariant(placement)), resolved(placement, { polarity: "negated" }),
    resolved(absentVariant(dignity))
  ]) {
    const report = await scoreReading(input, readingFor(input, [resolved(dignity), counterpart]));
    assert.deepEqual(report.contradictions, [{
      id: "contradiction-1", unitIds: ["claim-1", "claim-2"], rules: ["incompatible-placement-and-dignity-signs"]
    }]);
    assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, incorrect: 1, contradicted: 2 }));
  }
  const alone = await scoreReading(input, readingFor(input, [resolved(dignity)]));
  assertTotals(alone.categories.placement, expectedCounts(reference, "placement"));
  assertTotals(alone.categories.dignity, expectedCounts(reference, "dignity", { correct: 1, coveredFactors: 1 }));
});

test("negative dignity tuples imply no sign and a wrong sign can make their complete negation correct", async () => {
  const reference = await referenceForExample();
  const dignity = byKind(reference, "dignity")[0];
  const placement = { kind: "placement", body: dignity.body, sign: dignity.sign };
  const report = await scoreReading(input, readingFor(input, [
    resolved(absentVariant(dignity), { polarity: "negated" }), resolved(placement)
  ]));
  assert.deepEqual(report.contradictions, []);
  assert.deepEqual(report.units.map((unit) => unit.verdict), ["correct", "correct"]);
  assert.equal(report.units[0].evidence.membership, "absent");
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 2, coveredFactors: 1 }));
});

test("coexisting Mercury sign dignities each earn coverage with no label exclusivity", async () => {
  const examples = new Map();
  for (let month = 1; month <= 12 && examples.size < 2; month += 1) {
    for (const day of [1, 11, 21]) {
      const utc = `2004-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T08:13:00Z`;
      const synthetic = syntheticCase({ utc });
      const reference = await computeChartFacts(synthetic);
      const factors = byKind(reference, "dignity").filter(({ body }) => body === "Mercury");
      if (factors.length === 2 && !examples.has(factors[0].sign)) examples.set(factors[0].sign, { synthetic, reference, factors });
    }
  }
  assert.deepEqual([...examples.keys()].sort(), ["pisces", "virgo"]);
  for (const { synthetic, reference, factors } of examples.values()) {
    const report = await scoreReading(synthetic, readingFor(synthetic, factors.map((factor) => resolved(factor))));
    assert.deepEqual(report.contradictions, []);
    assertTotals(report.categories.dignity, expectedCounts(reference, "dignity", { correct: 2, coveredFactors: 2 }));
    assertTotals(report.categories.placement, expectedCounts(reference, "placement"));
    assertTotals(report.overall, expectedCounts(reference, null, { correct: 2, coveredFactors: 2 }));
  }
});

test("an empty classical dignity row is valid negative evidence and never supplies a positive factor", async () => {
  const reference = await referenceForExample();
  const row = reference.reference.dignities.find(({ labels }) => labels.length === 0);
  assert.ok(row, "synthetic fixture needs a classical body without sign dignities");
  const factor = { kind: "dignity", body: row.body, sign: row.sign, dignity: "domicile", system: "classical-sign" };
  const report = await scoreReading(input, readingFor(input, [resolved(factor, { polarity: "negated" })]));
  assertEvidence(report, report.units[0], "absent");
  assert.ok(report.units[0].evidence.rows.some((pointer) =>
    JSON.stringify(resolveEvidencePointer(report.reference, pointer)) === JSON.stringify(row)));
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1 }));
});

test("negative aspect evidence covers a supported pair with no natal aspect row", async () => {
  const reference = await referenceForExample();
  const bodies = reference.conventions.aspects.bodies;
  let factor;
  for (let a = 0; a < bodies.length && !factor; a += 1) {
    for (let b = a + 1; b < bodies.length && !factor; b += 1) {
      if (!byKind(reference, "aspect").some((row) =>
        [row.a, row.b].includes(bodies[a]) && [row.a, row.b].includes(bodies[b]))) {
        factor = { kind: "aspect", a: bodies[a], b: bodies[b], aspect: "trine", policy: "natal-major-defaults" };
      }
    }
  }
  assert.ok(factor);
  const report = await scoreReading(input, readingFor(input, [resolved(factor, { polarity: "negated" })]));
  assertEvidence(report, report.units[0], "absent");
  const bodyRows = report.units[0].evidence.rows.map((pointer) => resolveEvidencePointer(report.reference, pointer));
  assert.ok(bodyRows.some((row) => row?.body === factor.a));
  assert.ok(bodyRows.some((row) => row?.body === factor.b));
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1 }));
});

test("unresolved occurrences stay unassigned and repeated prose never earns factual credit", async () => {
  const reference = await referenceForExample();
  const statuses = ["ambiguous", "unsupported", "abstained", "interpretive"];
  const reading = readingFor(input, statuses.flatMap((status) => [unresolved(status), unresolved(status)]));
  const report = await scoreReading(input, reading);
  assert.deepEqual(report.reading, reading);
  assert.deepEqual(report.units, []);
  assert.deepEqual(report.contradictions, []);
  assert.deepEqual(report.diagnostics.occurrences, { resolved: 0, ambiguous: 2, unsupported: 2, abstained: 2, interpretive: 2 });
  assert.equal(report.diagnostics.unassigned, 8);
  assert.equal(report.diagnostics.uniqueResolved, 0);
  assert.equal(report.diagnostics.duplicateResolved, 0);
  assert.equal(report.occurrences.length, 8);
  for (const [index, occurrence] of report.occurrences.entries()) {
    assert.deepEqual(occurrence, {
      claimId: reading.claims[index].id, index, category: "unassigned", unitId: null, duplicateOf: null
    });
  }
  assertTotals(report.overall, expectedCounts(reference));
});

test("empty extraction of nonempty prose remains visible with null correctness and zero coverage", async () => {
  const reference = await referenceForExample();
  const reading = readingFor(input);
  reading.text = "The Sun is in Aries. This text has not been extracted.";
  reading.extraction.method = "none";
  const report = await scoreReading(input, reading);
  assert.equal(report.reading.text, reading.text);
  assert.equal(report.reading.extraction.coverage, "unverified");
  assert.deepEqual(report.limits, {
    extractionCoverage: "unverified", interpretiveQuality: "not-scored", exhaustiveLogicalConsistency: false
  });
  assertTotals(report.overall, expectedCounts(reference));
});

test("category convention requirements are explicit and irrelevant conventions do not block placements", async () => {
  const reference = await referenceForExample();
  const factors = categories.map((kind) => byKind(reference, kind)[0]);
  for (const [conventions, reasons] of [
    [{ zodiac: "sidereal" }, ["convention-mismatch"]],
    [{ zodiac: "unspecified" }, ["unspecified-convention"]]
  ]) {
    const report = await scoreReading(input, readingFor(input, factors.map((factor) => resolved(factor)), conventions));
    assert.ok(report.units.every((unit) => unit.verdict === "unassessed"));
    assert.ok(report.units.every((unit) => JSON.stringify(unit.eligibility.reasons) === JSON.stringify(reasons)));
    assertTotals(report.overall, expectedCounts(reference, null, { unassessedResolved: 4 }));
    assert.deepEqual(report.contradictions, []);
  }
  const report = await scoreReading(input, readingFor(input, factors.map((factor) => resolved(factor)), {
    houseSystem: "unspecified", aspectPolicy: "unspecified", dignitySystem: "unspecified"
  }));
  assert.deepEqual(report.units.map((unit) => unit.verdict), ["correct", "unassessed", "unassessed", "unassessed"]);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, unassessedResolved: 3, coveredFactors: 1 }));
});

test("convention diagnostics retain declared, factor and reference values and ordered reasons", async () => {
  const reference = await referenceForExample();
  const factor = byKind(reference, "house")[0];
  const report = await scoreReading(input, readingFor(input, [resolved(factor, {
    certainty: "hedged", temporalScope: "whole-day"
  })], { zodiac: "unspecified", houseSystem: "placidus" }));
  const unit = report.units[0];
  assert.deepEqual(unit.eligibility.reasons, [
    "hedged", "whole-day", "unspecified-convention", "convention-mismatch", "factor-context-conflict"
  ]);
  const houseContext = unit.eligibility.conventions.find(({ field }) => field === "houseSystem");
  assert.deepEqual(houseContext, {
    field: "houseSystem", declared: "placidus", factor: "whole", reference: "whole",
    reasons: ["convention-mismatch", "factor-context-conflict"]
  });
  const zodiacContext = unit.eligibility.conventions.find(({ field }) => field === "zodiac");
  assert.deepEqual(zodiacContext, {
    field: "zodiac", declared: "unspecified", factor: null, reference: "tropical", reasons: ["unspecified-convention"]
  });
  assert.equal(unit.evidence, null);
  assertTotals(report.overall, expectedCounts(reference, null, { unassessedResolved: 1 }));
});

test("unassessed alternatives cannot manufacture contradictions against an assessed assertion", async () => {
  const reference = await referenceForExample();
  const factor = byKind(reference, "placement")[0];
  const report = await scoreReading(input, readingFor(input, [
    resolved(factor), resolved(factor, { polarity: "negated", certainty: "hedged" }),
    resolved(absentVariant(factor), { temporalScope: "whole-day" })
  ]));
  assert.deepEqual(report.contradictions, []);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, unassessedResolved: 2, coveredFactors: 1 }));
});

test("other aspect and dignity conventions block only their category and expose factor-context conflicts", async () => {
  const reference = await referenceForExample();
  for (const [kind, field, supported] of [
    ["aspect", "aspectPolicy", "natal-major-defaults"], ["dignity", "dignitySystem", "classical-sign"]
  ]) {
    const factors = [byKind(reference, "placement")[0], byKind(reference, kind)[0]];
    const report = await scoreReading(input, readingFor(input, factors.map((factor) => resolved(factor)), { [field]: "other" }));
    assert.equal(report.units[0].verdict, "correct");
    assert.equal(report.units[1].verdict, "unassessed");
    assert.deepEqual(report.units[1].eligibility.reasons, ["convention-mismatch", "factor-context-conflict"]);
    assert.deepEqual(report.units[1].eligibility.conventions.find((record) => record.field === field), {
      field, declared: "other", factor: supported, reference: supported,
      reasons: ["convention-mismatch", "factor-context-conflict"]
    });
    assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, unassessedResolved: 1, coveredFactors: 1 }));
  }
});

test("unknown birth time and missing coordinates give neither positive nor negative house evidence", async () => {
  for (const [settings, removeCoordinates, reasons] of [
    [{ timeKnown: false }, false, ["unknown-time"]],
    [{ timeKnown: true }, true, ["missing-coordinates"]],
    [{ timeKnown: false }, true, ["unknown-time", "missing-coordinates"]]
  ]) {
    const synthetic = syntheticCase(settings);
    if (removeCoordinates) {
      delete synthetic.birth.latitude;
      delete synthetic.birth.longitude;
    }
    const reference = await computeChartFacts(synthetic);
    const factor = { kind: "house", body: "Moon", house: 1, houseSystem: "whole" };
    const report = await scoreReading(synthetic, readingFor(synthetic, [resolved(factor), resolved(factor, { polarity: "negated" })]));
    assert.deepEqual(report.contradictions, []);
    for (const unit of report.units) {
      assert.equal(unit.verdict, "unassessed");
      assert.equal(unit.evidence, null);
      assert.deepEqual(unit.eligibility.reasons, ["unavailable-houses"]);
      assert.deepEqual(unit.eligibility.availabilityReasons, reasons);
      assert.ok(unit.eligibility.conventions.every((record) => !record.reasons.includes("convention-mismatch")));
    }
    assertTotals(report.categories.house, expectedCounts(reference, "house", { unassessedResolved: 2 }));
    assertMetric(report.categories.house.metrics.coverage, 0, 0);
    assertTotals(report.overall, expectedCounts(reference, null, { unassessedResolved: 2 }));
  }
});

test("unavailable house systems still report a factor-context conflict without comparing to a null system", async () => {
  const synthetic = syntheticCase({ timeKnown: false, houseSystem: "placidus" });
  const reference = await computeChartFacts(synthetic);
  const factor = { kind: "house", body: "Moon", house: 1, houseSystem: "whole" };
  const report = await scoreReading(synthetic, readingFor(synthetic, [resolved(factor)], { houseSystem: "placidus" }));
  assert.deepEqual(report.units[0].eligibility.reasons, ["factor-context-conflict", "unavailable-houses"]);
  assert.deepEqual(report.units[0].eligibility.availabilityReasons, ["unknown-time"]);
  assert.deepEqual(report.units[0].eligibility.conventions.find(({ field }) => field === "houseSystem"), {
    field: "houseSystem", declared: "placidus", factor: "whole", reference: null,
    reasons: ["factor-context-conflict"]
  });
  assert.equal(report.units[0].evidence, null);
  assertTotals(report.overall, expectedCounts(reference, null, { unassessedResolved: 1 }));
});

test("unknown time keeps the supplied reference instant eligible while whole-day claims remain unassessed", async () => {
  const synthetic = syntheticCase({ timeKnown: false, utc: "2003-05-17T08:13:00+03:00" });
  const reference = await computeChartFacts(synthetic);
  const factors = ["placement", "aspect", "dignity"].map((kind) => byKind(reference, kind)[0]);
  const report = await scoreReading(synthetic, readingFor(synthetic, factors.flatMap((factor) => [
    resolved(factor), resolved(factor, { temporalScope: "whole-day" })
  ])));
  assert.equal(report.reference.time.sourceInstant, synthetic.birth.utc);
  assert.equal(report.reference.input.utc, "2003-05-17T05:13:00.000Z");
  assert.equal(report.reference.availability.temporalScope, "reference-instant");
  assert.deepEqual(report.units.map((unit) => unit.verdict), ["correct", "unassessed", "correct", "unassessed", "correct", "unassessed"]);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 3, unassessedResolved: 3, coveredFactors: 3 }));
});

test("polar fallback only scores houses in the actual system and retains requested context", async () => {
  for (const houseSystem of ["placidus", "koch"]) {
    const synthetic = syntheticCase({ latitude: 78, houseSystem });
    const reference = await computeChartFacts(synthetic);
    const actual = byKind(reference, "house")[0];
    assert.equal(actual.houseSystem, "whole");
    const requested = { ...actual, houseSystem };
    for (const readingSystem of ["whole", houseSystem]) {
      const report = await scoreReading(synthetic, readingFor(synthetic, [resolved(actual), resolved(requested)], { houseSystem: readingSystem }));
      assert.equal(report.reference.availability.houses.requestedSystem, houseSystem);
      assert.equal(report.reference.availability.houses.actualSystem, "whole");
      assert.equal(report.reference.availability.houses.fallback, true);
      assert.ok(report.reference.flags.includes("polar-fallback"));
      assert.equal(report.units[1].verdict, "unassessed");
      assert.equal(report.units[1].evidence, null);
      assert.deepEqual(report.contradictions, []);
      if (readingSystem === "whole") {
        assert.equal(report.units[0].verdict, "correct");
        assert.deepEqual(report.units[1].eligibility.reasons, ["convention-mismatch", "factor-context-conflict"]);
        assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, unassessedResolved: 1, coveredFactors: 1 }));
      } else {
        assert.equal(report.units[0].verdict, "unassessed");
        assertTotals(report.overall, expectedCounts(reference, null, { unassessedResolved: 2 }));
      }
    }
  }
});

test("house evidence retains longitude and computed cusps without rounding", async () => {
  const synthetic = syntheticCase({ houseSystem: "placidus", deltaT: 75.25, timeScale: "ut1" });
  const reference = await computeChartFacts(synthetic);
  const factor = byKind(reference, "house")[0];
  const report = await scoreReading(synthetic, readingFor(synthetic, [resolved(factor)], { houseSystem: "placidus" }));
  const rows = report.units[0].evidence.rows.map((pointer) => resolveEvidencePointer(report.reference, pointer));
  assert.ok(rows.some((row) => row?.body === factor.body && typeof row.lon === "number"));
  assert.ok(rows.some((row) => JSON.stringify(row) === JSON.stringify(reference.reference.houses) ||
    JSON.stringify(row) === JSON.stringify(reference.reference.houses.cusps)));
  assert.deepEqual(report.reference.time, reference.time);
  assert.equal(report.reference.time.deltaT.seconds, 75.25);
  assert.equal(report.reference.time.timeScale.input, "ut1");
});

test("outside-reference-span flags remain visible without blocking agreement with computed factors", async () => {
  const synthetic = syntheticCase({ utc: "1601-02-03T04:05:06Z" });
  const reference = await computeChartFacts(synthetic);
  const report = await scoreReading(synthetic, readingFor(synthetic, [resolved(byKind(reference, "placement")[0])]));
  assert.equal(report.reference.coverage.outsideReferenceSpan, true);
  assert.ok(report.reference.flags.includes("outside-reference-span"));
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 1, coveredFactors: 1 }));
});

test("overall rates sum category counts and never average unequal category rates", async () => {
  const reference = await referenceForExample();
  const placements = byKind(reference, "placement").slice(0, 3);
  const wrongHouse = absentVariant(byKind(reference, "house")[0]);
  const report = await scoreReading(input, readingFor(input, [
    ...placements.map((factor) => resolved(factor)), resolved(wrongHouse)
  ]));
  assertMetric(report.categories.placement.metrics.correctness, 3, 3);
  assertMetric(report.categories.house.metrics.correctness, 0, 1);
  assertMetric(report.overall.metrics.correctness, 3, 4);
  assertTotals(report.overall, expectedCounts(reference, null, { correct: 3, incorrect: 1, coveredFactors: 3 }));
});
