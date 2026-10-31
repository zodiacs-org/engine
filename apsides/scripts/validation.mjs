const DAY_SECONDS = 86_400;
const metrics = ["eventTimeSeconds", "eventDistanceKm", "sameTtDistanceKm",
  "sameTtRadialSpeedKmPerSecond", "sameTtOrbitalSpeedKmPerSecond"];

/** Pair only unique, same-body/kind events in disjoint reference neighborhoods.
 * Neighborhood edges are midpoints between adjacent reference events, clipped
 * to the case window. They do not depend on the acceptance budget or engine.
 * A timing failure therefore remains measurable instead of disappearing solely
 * because it exceeds the event-time allowance. Ambiguities are never guessed.
 */
export function matchEvents(references, actual, body, fromJdTt, toJdTt) {
  if (!(Number.isFinite(fromJdTt) && Number.isFinite(toJdTt) && fromJdTt < toJdTt)) {
    throw new RangeError("Invalid matching window.");
  }
  for (let index = 0; index < references.length; index++) {
    const event = references[index];
    if (!Number.isFinite(event.jdTt) || event.jdTt <= fromJdTt || event.jdTt > toJdTt ||
        (index > 0 && event.jdTt <= references[index - 1].jdTt)) {
      throw new RangeError("Invalid reference chronology.");
    }
  }
  if (actual.some((event) => !Number.isFinite(event.instant.jdTt))) {
    throw new RangeError("Non-finite engine event time.");
  }
  const matches = [], missing = [], ambiguous = [];
  const assigned = new Set();
  const ambiguousActual = new Set();
  for (let index = 0; index < references.length; index++) {
    const reference = references[index];
    const lower = index === 0 ? fromJdTt : (references[index - 1].jdTt + reference.jdTt) / 2;
    const upper = index === references.length - 1 ? toJdTt : (reference.jdTt + references[index + 1].jdTt) / 2;
    const candidates = actual.flatMap((event, actualIndex) => event.body === body &&
      event.kind === reference.kind && event.instant.jdTt > lower && event.instant.jdTt <= upper
      ? [actualIndex] : []);
    if (candidates.length === 1) {
      assigned.add(candidates[0]);
      matches.push({ referenceIndex: index, actualIndex: candidates[0], neighborhoodJdTt: [lower, upper] });
    } else if (candidates.length === 0) missing.push(reference.id);
    else {
      candidates.forEach((candidate) => ambiguousActual.add(candidate));
      ambiguous.push({ referenceId: reference.id, actualIndices: candidates, neighborhoodJdTt: [lower, upper] });
    }
  }
  const extra = actual.flatMap((_event, index) => !assigned.has(index) && !ambiguousActual.has(index) ? [index] : []);
  return { matches, missing, extra, ambiguous };
}

export function measureCase(fixture, budget, numericalBudgetSeconds, result, sampleDistance) {
  const { body, id } = fixture.case;
  const fromJdTt = fixture.grid[0][0], toJdTt = fixture.grid.at(-1)[0];
  const failures = [];
  const measured = Object.fromEntries(metrics.map((key) => [key, []]));
  function compare(metric, actual, reference, limit, context) {
    if (!Number.isFinite(actual) || !Number.isFinite(reference)) {
      failures.push({ check: metric, ...context, reason: "non-finite-measurement" });
      return null;
    }
    const error = actual - reference;
    measured[metric].push(Math.abs(error));
    if (Math.abs(error) > limit) failures.push({ check: metric, ...context, signedError: error, limit });
    return error;
  }
  let pairing = null;
  const events = [];
  if (result.status === "complete") {
    pairing = matchEvents(fixture.events, result.events, body, fromJdTt, toJdTt);
    for (const referenceId of pairing.missing) failures.push({ check: "missed-event", referenceId });
    for (const actualIndex of pairing.extra) failures.push({ check: "extra-event", actualIndex });
    for (const ambiguity of pairing.ambiguous) failures.push({ check: "ambiguous-match", ...ambiguity });
    for (const { referenceIndex, actualIndex, neighborhoodJdTt } of pairing.matches) {
      const reference = fixture.events[referenceIndex], event = result.events[actualIndex];
      const context = { referenceId: reference.id };
      const timeError = (event.instant.jdTt - reference.jdTt) * DAY_SECONDS;
      // Subtract Julian dates before converting to seconds to avoid cancellation
      // between two unnecessarily large epoch-second values.
      const eventTimeSeconds = compare("eventTimeSeconds", timeError, 0, budget.eventTimeSeconds, context);
      const eventDistanceKm = compare("eventDistanceKm", event.distanceKm, reference.distanceKm, budget.distanceKm, context);
      const width = (event.refinement.upper.jdTt - event.refinement.lower.jdTt) * DAY_SECONDS;
      if (!(width >= 0 && width <= numericalBudgetSeconds &&
          event.instant.jdTt >= event.refinement.lower.jdTt && event.instant.jdTt <= event.refinement.upper.jdTt)) {
        failures.push({ check: "numerical-interval", ...context, widthSeconds: width, limit: numericalBudgetSeconds });
      }
      events.push({ referenceId: reference.id, kind: reference.kind, referenceJdTt: reference.jdTt,
        actualJdTt: event.instant.jdTt, referenceDistanceKm: reference.distanceKm,
        actualDistanceKm: event.distanceKm, neighborhoodJdTt,
        signedErrors: { eventTimeSeconds, eventDistanceKm }, numericalIntervalSeconds: width,
        referenceBracketSeconds: reference.bracketSeconds });
    }
  } else failures.push({ check: "search-completion", status: result.status, reason: result.reason, detail: result.detail });

  // Independent point checks run even when search is refused or finds no events.
  const samples = [];
  for (const reference of fixture.events) for (const point of ["before", "at", "after"]) {
    const expected = reference.samples[point];
    const context = { referenceId: reference.id, point, jdTt: expected.jdTt };
    let actual;
    try { actual = sampleDistance(body, { jd: expected.jdTt, scale: "tt" }); }
    catch (error) {
      failures.push({ check: "sample-completion", ...context, reason: "exception", detail: String(error) });
      continue;
    }
    if (actual.status !== "ok" || actual.instant.jdTt !== expected.jdTt) {
      failures.push({ check: "sample-completion", ...context, reason: actual.status !== "ok" ? actual.reason : "different-TT" });
      continue;
    }
    samples.push({ ...context, signedErrors: {
      sameTtDistanceKm: compare("sameTtDistanceKm", actual.distanceKm, expected.distanceKm, budget.distanceKm, context),
      sameTtRadialSpeedKmPerSecond: compare("sameTtRadialSpeedKmPerSecond", actual.radialSpeedKmPerSecond,
        expected.radialSpeedKmPerSecond, budget.radialSpeedKmPerSecond, context),
      sameTtOrbitalSpeedKmPerSecond: compare("sameTtOrbitalSpeedKmPerSecond", actual.orbitalSpeedKmPerSecond,
        Math.hypot(...expected.velocityKmPerSecond), budget.orbitalSpeedKmPerSecond, context)
    } });
  }
  return {
    id, body, split: fixture.case.split, window: { fromTt: fixture.case.fromTt, toTt: fixture.case.toTt, fromJdTt, toJdTt },
    target: fixture.target, referenceStepDays: fixture.case.stepDays, referenceGridSamples: fixture.grid.length,
    referenceSolutions: fixture.sources[0].header, budget,
    search: { status: result.status, reason: result.reason ?? null, detail: result.detail ?? null,
      diagnostics: result.diagnostics ?? null },
    counts: { reference: fixture.events.length, returned: result.status === "complete" ? result.events.length : null,
      matched: pairing?.matches.length ?? 0, missed: pairing?.missing.length ?? null,
      extra: pairing?.extra.length ?? null, ambiguous: pairing?.ambiguous.length ?? null,
      expectedSamples: fixture.events.length * 3, comparedSamples: samples.length },
    unmatched: pairing === null ? null : { missing: pairing.missing, extra: pairing.extra,
      ambiguous: pairing.ambiguous, extraEvents: pairing.extra.map((index) => ({ index, body: result.events[index].body,
        kind: result.events[index].kind, jdTt: result.events[index].instant.jdTt })) },
    maximumAbsoluteErrors: Object.fromEntries(metrics.map((key) => [key,
      measured[key].length ? Math.max(...measured[key]) : null])),
    events, samples, failures, pass: failures.length === 0
  };
}

/** These are center-convention spot comparisons, without acceptance verdicts. */
export function measurePhysicalCenters(fixture, sampleDistance) {
  return fixture.cases.flatMap(({ body, target, samples }) => samples.map(({ jdTt, barycenter, physicalCenter }) => {
    const actual = sampleDistance(body, { jd: jdTt, scale: "tt" });
    if (actual.status !== "ok" || actual.instant.jdTt !== jdTt) throw new Error(`Physical spot sample refused for ${body}.`);
    const difference = (left, right) => ({
      distanceKm: left.distanceKm - right.distanceKm,
      radialSpeedKmPerSecond: left.radialSpeedKmPerSecond - right.radialSpeedKmPerSecond,
      orbitalSpeedKmPerSecond: left.orbitalSpeedKmPerSecond - right.orbitalSpeedKmPerSecond
    });
    const withSpeed = (sample) => ({ ...sample, orbitalSpeedKmPerSecond: Math.hypot(...sample.velocityKmPerSecond) });
    const bary = withSpeed(barycenter), physical = withSpeed(physicalCenter);
    return { body, target, jdTt, signedDifferences: {
      physicalMinusBarycenter: difference(physical, bary), engineMinusBarycenter: difference(actual, bary),
      engineMinusPhysical: difference(actual, physical)
    } };
  }));
}

// Conservative presentation only. Raw comparisons always use full precision.
function upper(value) {
  if (value === null) return "unavailable";
  if (value === 0) return "0";
  const unit = 10 ** (Math.floor(Math.log10(value)) - 5);
  return (Math.ceil(value / unit) * unit).toPrecision(6);
}
const signed = (value) => String(value);

export function renderReport(report) {
  const lines = ["# Independent apsis validation", "",
    `Acceptance status: **${report.pass ? "PASS" : "FAIL"}**. Limits are the unchanged M2 registration.`, "",
    "This report is reproduced by `scripts/validate-references.mjs` and checked by",
    "`test/validation-evidence.vitest.ts`. Its inputs are independent Horizons fixtures,",
    "not stored engine expectations. Raw measurements go to ignored `.generated/validation/`.", "",
    `Runtime: Node ${report.runtime.node}, ${report.runtime.platform}, ${report.runtime.arch}.`, "",
    "| Input | SHA-256 |", "| --- | --- |",
    ...Object.entries(report.identities).map(([name, value]) => `| ${name} | \`${value}\` |`), "",
    "The implementation digest binds sorted source paths and byte digests. The tool",
    "digest binds the validation scripts. The engine archive records the ephemeris",
    "dependency pin; the lock records dependency versions and integrity.", "",
    "## Event searches and same-instant measurements", "",
    "Windows are Gregorian TT, with `(from,to]` ownership. Moon is geocentric; all",
    "other targets are heliocentric. Mars through Pluto use system barycenters.",
    "Reference and engine events are paired uniquely by body and kind within",
    "neighborhoods bounded by midpoints between adjacent reference events and by",
    "the window edges. Matching does not use the time allowance. Multiple candidates",
    "are ambiguous, not arbitrarily paired. Counts are relative to reference grid",
    "turns, not proof of continuous completeness. A refusal leaves missing/extra",
    "counts unavailable. Same-TT probes are still compared after a refusal.", "",
    "Error maxima below are absolute and rounded upward to six significant digits.",
    "Event distance compares the two independently located extrema. Same-TT errors",
    "compare the engine at each reference before/at/after epoch with that Horizons",
    "sample. Speeds are signed radial rate and total velocity magnitude, in km/s.",
    "The reference grid, solution IDs and complete requests are in each fixture,",
    "indexed by [development](../../../references/manifest.json) and",
    "[held-out](../../../references/held-out/manifest.json) manifests.", ""];
  for (const split of ["development", "held-out"]) {
    lines.push(`### ${split}`, "",
      "| Case | TT window | Search | Reference/returned | Matched/missed/extra/ambiguous | Compared probes | Verdict |",
      "| --- | --- | --- | --- | --- | --- | --- |");
    for (const item of report.cases.filter((row) => row.split === split)) {
      const c = item.counts, n = (v) => v === null ? "unavailable" : v;
      lines.push(`| ${item.id} | ${item.window.fromTt} to ${item.window.toTt} | ${item.search.status} | ${c.reference}/${n(c.returned)} | ${c.matched}/${n(c.missed)}/${n(c.extra)}/${n(c.ambiguous)} | ${c.comparedSamples}/${c.expectedSamples} | ${item.pass ? "PASS" : "FAIL"} |`);
    }
    lines.push("", "| Case | Event time, s | Event distance, km | Same-TT distance, km | Same-TT radial speed, km/s | Same-TT total speed, km/s |",
      "| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const item of report.cases.filter((row) => row.split === split)) {
      lines.push(`| ${item.id} | ${metrics.map((key) => upper(item.maximumAbsoluteErrors[key])).join(" | ")} |`);
    }
    lines.push("");
  }
  lines.push("## Acceptance failures", "",
    "Every failed metric is retained below. Numeric error magnitudes are rounded",
    "upward; acceptance is evaluated on full-precision values with no added slack.", "",
    "| Case | Check | Reference or index | Point | Error magnitude | Limit |",
    "| --- | --- | --- | --- | ---: | ---: |");
  for (const item of report.cases) for (const failure of item.failures) {
    lines.push(`| ${item.id} | ${failure.check}${failure.reason ? `: ${failure.reason}` : ""} | ${failure.referenceId ?? failure.actualIndex ?? "-"} | ${failure.point ?? "-"} | ${failure.signedError === undefined ? "unavailable" : upper(Math.abs(failure.signedError))} | ${failure.limit ?? "-"} |`);
  }
  if (report.pass) lines.push("| None | - | - | - | - | - |");
  for (const item of report.cases.filter((row) => row.search.status !== "complete")) {
    lines.push("", `Search detail for ${item.id}: ${item.search.detail}`);
  }
  lines.push("", "## Physical-center spot comparisons", "",
    "These are signed differences at the preregistered TT epochs, retaining full",
    "binary64 precision; printed digits do not establish physical accuracy.",
    "No physical-center acceptance limits or event-time checks were registered.",
    "They neither replace the barycenter targets nor validate physical-center apsides.",
    "The [physical-center fixture](../../../references/held-out/physical-centers.json)",
    "retains the returned satellite-system solutions separately from DE441 barycenters.", "",
    "| Body | JD TT | Comparison | Distance, km | Radial speed, km/s | Total speed, km/s |",
    "| --- | ---: | --- | ---: | ---: | ---: |");
  for (const row of report.physicalCenters) for (const [label, values] of Object.entries(row.signedDifferences)) {
    lines.push(`| ${row.body} | ${row.jdTt} | ${label} | ${signed(values.distanceKm)} | ${signed(values.radialSpeedKmPerSecond)} | ${signed(values.orbitalSpeedKmPerSecond)} |`);
  }
  lines.push("", "## Coverage limits", "",
    "The held-out cases were first evaluated in M10 after fixing the M1-M9 search.",
    "No search policy, sampler, ephemeris, original fixture or allowance was tuned",
    "using these cases. They are now consumed validation data; future tuning requires",
    "a new registration and new held-out cases. Development and held-out results",
    "stay separate. All selected cases remain visible, including failures.", "",
    "The Moon's held-out reference grid is finer than its search grid; planetary",
    "reference grids are as fine as their search grids, except Earth's finer search",
    "grid. Neither sampling proves that hidden pairs of extrema are absent.",
    "The reference rate brackets localize roots of the returned Horizons solution.",
    "Their numerical widths do not bound that solution's physical uncertainty.",
    "These measurements do not extend beyond the listed windows, target centers",
    "and independent sample epochs, validate civil-time conversion, or validate",
    "the optional lunar phase annotation. No dates are ranked.", "");
  return lines.join("\n");
}
