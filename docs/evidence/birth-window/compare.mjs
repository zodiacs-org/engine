/*
 * The preregistered matching rule (PREREGISTRATION.md). Pure functions over a
 * birthWindow result and the checker's samples; the only engine access is
 * through the `probe` callback the harness passes in, which is the checker's.
 */

/** A partition cell's features, keyed as checker.mjs keys natalChart's. */
export function cellFeatures(cell) {
  const features = {};
  for (const [body, sign] of Object.entries(cell.features.signs)) features[`sign:${body}`] = sign;
  for (const [body, house] of Object.entries(cell.features.houses)) features[`house:${body}`] = house;
  features.ascendant = cell.features.ascendant;
  features.midheaven = cell.features.midheaven;
  features["house-system"] = cell.features.houseSystem;
  return { features, aspects: new Map(cell.features.aspects.map((a) => [`aspect:${a.a}|${a.b}`, a.type])) };
}

export function componentOf(change) {
  switch (change.feature) {
    case "sign":
    case "house":
      return `${change.feature}:${change.body}`;
    case "aspect":
      return `aspect:${change.a}|${change.b}`;
    default:
      return change.feature;
  }
}

function valueIn(cell, component) {
  return component.startsWith("aspect:") ? (cell.aspects.get(component) ?? null) : cell.features[component];
}

/**
 * Compare one window. `samples` are the checker's {time, features} at every
 * sample instant; `probe(times)` returns the checker's features at arbitrary
 * instants. Returns counts and, for any failure, its details.
 */
export function compareWindow(window, result, samples, components, probe) {
  const cells = result.cells.map((cell) => ({
    start: new Date(cell.start).getTime(),
    end: new Date(cell.end).getTime(),
    ...cellFeatures(cell)
  }));
  const switches = result.switches.map((entry) => ({
    at: new Date(entry.at).getTime(),
    changes: entry.changes.map((change) => ({ component: componentOf(change), from: change.from, to: change.to }))
  }));
  const failures = [];

  // (A) The partition, read at every sample instant, equals natalChart there.
  let disagreements = 0;
  let cellIndex = 0;
  for (const { time, features } of samples) {
    while (cellIndex < cells.length && cells[cellIndex].end <= time) cellIndex += 1;
    const cell = cells[cellIndex];
    for (const component of components) {
      const found = cell && cell.start <= time ? valueIn(cell, component) : undefined;
      if (found !== features[component]) {
        disagreements += 1;
        if (failures.length < 20) failures.push({ kind: "sample", time, component, sampled: features[component], partition: found });
      }
    }
  }

  // (B) Transitions per 1 s step (t[k-1], t[k]] and component.
  const byStep = new Map();
  let outside = 0;
  let stepIndex = 1;
  for (const entry of switches) {
    while (stepIndex < samples.length && samples[stepIndex].time < entry.at) stepIndex += 1;
    if (entry.at <= samples[0].time || stepIndex >= samples.length) {
      outside += 1;
      if (failures.length < 20) failures.push({ kind: "outside", at: entry.at });
      continue;
    }
    for (const change of entry.changes) {
      const key = `${stepIndex} ${change.component}`;
      if (!byStep.has(key)) byStep.set(key, []);
      byStep.get(key).push({ at: entry.at, ...change });
    }
  }
  let sampledTransitions = 0;
  let matched = 0;
  let missed = 0;
  for (let k = 1; k < samples.length; k += 1) {
    const before = samples[k - 1].features;
    const after = samples[k].features;
    for (const component of components) {
      if (before[component] === after[component]) continue;
      sampledTransitions += 1;
      if (byStep.has(`${k} ${component}`)) matched += 1;
      else {
        missed += 1;
        if (failures.length < 20) failures.push({ kind: "missed", step: [samples[k - 1].time, samples[k].time], component, from: before[component], to: after[component] });
      }
    }
  }
  let extra = outside;
  const excursions = [];
  for (const [key, list] of byStep) {
    const [k, component] = [Number(key.slice(0, key.indexOf(" "))), key.slice(key.indexOf(" ") + 1)];
    const before = samples[k - 1].features[component];
    const after = samples[k].features[component];
    if (before !== after) continue;
    if (list[0].from === list.at(-1).to) excursions.push(...list);
    else {
      extra += list.length;
      if (failures.length < 20) failures.push({ kind: "extra", component, changes: list });
    }
  }

  // Sub-second excursions (a change and its return inside one step) cannot be
  // seen at 1 s; each is confirmed by natalChart at its own two milliseconds.
  // (C) Every switch: natalChart at (at − 1 ms, at) differs exactly as stated.
  const instants = new Set();
  for (const entry of switches) {
    instants.add(entry.at - 1);
    instants.add(entry.at);
  }
  const probed = new Map(probe([...instants].sort((a, b) => a - b)).map(({ time, features }) => [time, features]));
  const confirms = (at, component, from, to) =>
    probed.get(at - 1)[component] === from && probed.get(at)[component] === to;
  let excursionsConfirmed = 0;
  for (const change of excursions) {
    if (confirms(change.at, change.component, change.from, change.to)) excursionsConfirmed += 1;
    else {
      extra += 1;
      if (failures.length < 20) failures.push({ kind: "unconfirmed-excursion", ...change });
    }
  }
  let millisecondChecks = 0;
  let millisecondFailures = 0;
  for (const entry of switches) {
    const listed = new Map(entry.changes.map((change) => [change.component, change]));
    for (const component of components) {
      millisecondChecks += 1;
      const change = listed.get(component);
      const ok = change
        ? confirms(entry.at, component, change.from, change.to)
        : probed.get(entry.at - 1)[component] === probed.get(entry.at)[component];
      if (!ok) {
        millisecondFailures += 1;
        if (failures.length < 20) failures.push({ kind: "millisecond", at: entry.at, component, listed: change ?? null, before: probed.get(entry.at - 1)[component], after: probed.get(entry.at)[component] });
      }
    }
  }
  const changes = switches.reduce((sum, entry) => sum + entry.changes.length, 0);
  return {
    samples: samples.length,
    switches: switches.length,
    changes,
    sampledTransitions,
    matched,
    missed,
    extra,
    excursions: excursions.length,
    excursionsConfirmed,
    sampleDisagreements: disagreements,
    millisecondChecks,
    millisecondFailures,
    pass: missed === 0 && extra === 0 && disagreements === 0,
    failures
  };
}
