import type { PanchangDay, PanchangDayRefusal } from "./day.js";
import type { LuminarySnapshot } from "./engine.js";
import type { TithiPosition } from "./limbs.js";
import type { LunarMonthInterval } from "./months.js";
import type { CliResult } from "./cli.js";
import type { LimbInterval } from "./transitions.js";

const tithiLabel = (tithi: TithiPosition) => `${tithi.paksha} ${tithi.pakshaNumber} ${tithi.name}`;
const monthLabel = (month: LunarMonthInterval) => `${month.name} (${month.convention}, ${month.kind})` +
  (month.omittedMonths.length ? `; omitted: ${month.omittedMonths.map((row) => row.name).join(", ")}` : "");

function limbLabel(row: LimbInterval): string {
  const state = row.start.after;
  switch (row.kind) {
    case "tithi": return tithiLabel(state.tithi);
    case "karana": return `${state.karana.name} (${state.karana.kind}, half ${state.karana.half})`;
    case "nakshatra": return state.nakshatra.name;
    case "pada": return `${state.nakshatra.name} pada ${state.nakshatra.pada}`;
    case "yoga": return state.yoga.name;
  }
}

function dayText(day: PanchangDay): string[] {
  const lines = [
    `Day ${day.date}; timezone ${day.timeZone}; ayanamsa ${day.ayanamsa}; month convention ${day.monthConvention}`,
    `Observer: latitude ${day.observer.latitude} deg; longitude ${day.observer.longitude} deg; height ${day.observer.height ?? 0} m`,
    `Sunrise day [${day.sunrise.start.utc}, ${day.sunrise.end.utc})`,
    `Vara: ${day.sunrise.vara.name} (${day.sunrise.vara.weekday})`,
    `Month at sunrise: ${monthLabel(day.sunriseMonth)}`,
    `Tithi comparison ${day.tithiComparison.from} to ${day.tithiComparison.to}: ${day.tithiComparison.kind}`
  ];
  for (const row of day.tithiComparison.skipped) lines.push(`Skipped tithi: ${limbLabel(row)} [${row.start.at}, ${row.end.at})`);
  if (day.tithiComparison.repeated) {
    const row = day.tithiComparison.repeated;
    lines.push(`Repeated tithi: ${limbLabel(row)} [${row.start.at}, ${row.end.at})`);
  }
  lines.push("Segments in time order (clipped to sunrise day):");
  for (const row of day.segments) lines.push(
    `[${row.start}, ${row.end}) | ${row.vara.name} | tithi ${tithiLabel(row.tithi)} | ` +
    `nakshatra ${row.nakshatra.name} pada ${row.nakshatra.pada} | yoga ${row.yoga.name} | ` +
    `karana ${row.karana.name} (${row.karana.kind}, half ${row.karana.half}) | month ${monthLabel(row.month)}`
  );
  const intervals = [
    ...day.timeline.intervals.map((row) => ({ start: row.start.at, end: row.end.at, label: `${row.kind}: ${limbLabel(row)}` })),
    ...day.months.intervals.map((row) => ({ start: row.start.at, end: row.end.at, label: `month: ${monthLabel(row)}` }))
  ].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  lines.push("Full intervals in start order (include boundaries outside the day):");
  for (const row of intervals) lines.push(`[${row.start}, ${row.end}) | ${row.label}`);
  lines.push("Month events inside the sunrise day in time order:");
  for (const row of day.months.events) lines.push(`${row.at} | ${row.kind}` +
    (row.sign === undefined ? "" : ` | sign index ${row.sign} (Aries = 0)`));
  return lines;
}

/**
 * Text keeps all original successful snapshot receipts/ayanamsa values in a
 * deduplicated ledger. It does not invent a replacement receipt or round values.
 * Equal serialized snapshots collapse; different same-instant values remain.
 */
function provenance(result: CliResult): string[] {
  const seen = new Set<object>();
  const snapshots = new Map<string, Pick<LuminarySnapshot, "utc" | "ayanamsa" | "sun" | "moon">>();
  const clocks = new Set<string>();
  function visit(value: unknown): void {
    if (!value || typeof value !== "object" || value instanceof Date || seen.has(value)) return;
    seen.add(value);
    const row = value as Record<string, unknown>;
    if (typeof row.utc === "string" && row.sun && row.moon && typeof row.ayanamsa === "object") {
      const { utc, ayanamsa, sun, moon } = row as unknown as LuminarySnapshot;
      const snapshot = { utc, ayanamsa, sun, moon };
      snapshots.set(JSON.stringify(snapshot), snapshot);
      return;
    }
    if (row.resolution) clocks.add(JSON.stringify(row.resolution));
    for (const child of Object.values(value)) visit(child);
  }
  visit(result);
  return ["Civil boundary resolutions (original engine JSON):", ...clocks,
    "Snapshot provenance in instant order (original positions, bounds, receipts and ayanamsa; JSON per line):",
    ...[...snapshots.values()].sort((a, b) => Date.parse(a.utc) - Date.parse(b.utc)).map((row) => JSON.stringify(row))];
}

function refusalReason(day: PanchangDayRefusal): string {
  switch (day.reason) {
    case "sunrise-refused": return `${day.reason}: ${day.sunrise.reason}`;
    case "transitions-refused": return `${day.reason}: ${day.timeline.reason}`;
    case "months-refused": return `${day.reason}: ${day.months.reason}`;
  }
}

export function renderText(result: CliResult): string {
  if (result.status === "refused") {
    const reason = "failedDate" in result
      ? `${result.reason} on ${result.failedDate}` + (result.reason === "day-refused" ? `: ${refusalReason(result.day)}` : `: ${result.stage}`)
      : `${refusalReason(result)} on ${result.date}`;
    return `Refused: ${reason}\nOriginal diagnostics (JSON):\n${JSON.stringify(result)}\n`;
  }
  const days = "days" in result ? result.days : [result];
  const lines = ["Panchang facts; intervals include start and exclude end.",
    "ISO UTC labels follow the engine time basis. Boundaries are computed at whole milliseconds; physical accuracy is not implied."];
  if ("days" in result) lines.push(`Civil range ${result.from} through ${result.to} (inclusive); timezone ${result.timeZone}`,
    `Range conventions: ${JSON.stringify(result.conventions)}`,
    `Range work: ${result.samples} samples (${result.snapshotSamples} snapshots, ${result.skySamples} sky evaluations); budget ${result.maxSamples}`);
  for (const day of days) lines.push(...dayText(day));
  lines.push(`Day conventions: ${JSON.stringify(days[0]!.conventions)}`, ...provenance(result));
  return lines.join("\n") + "\n";
}
