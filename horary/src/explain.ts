import type { HoraryAnalysis } from "./analyze.js";
import type { RuleSource } from "./policy.js";

export interface HoraryExplanationEntry {
  readonly section: string;
  readonly subject: string;
  readonly status: string;
  readonly source: RuleSource | string | null;
  readonly text: string;
}
export interface HoraryExplanation {
  readonly schema: "horary.explanation/v1";
  readonly questionId: string;
  readonly instant: string;
  readonly entries: readonly HoraryExplanationEntry[];
  readonly limitations: readonly string[];
  readonly text: string;
}

/** Format a trusted typed analysis without recasting, rescanning or choosing a verdict. */
export function explain(report: HoraryAnalysis): HoraryExplanation {
  if (!report || report.schema !== "horary.analysis/v1") {
    throw new RangeError("Explanations require a horary.analysis/v1 report.");
  }
  const entries: HoraryExplanationEntry[] = [];
  function add(section: string, subject: string, status: string, text: string, source: RuleSource | string | null = null) {
    // Detach source records so a JSON-restored report is not frozen or retained.
    entries.push(Object.freeze({ section, subject, status, text,
      source: typeof source === "object" && source !== null ? Object.freeze({ ...source }) : source }));
  }
  add("chart", "house system", "recorded",
    `Requested ${report.input.houseSystem}; actual ${report.chart.houses.system}. ` +
    `Engine ${report.chart.engineVersion}; flags: ${report.chart.flags.join(", ") || "none"}.`);
  for (const row of report.significators.assignments) add("significators", `${row.role}: ${row.planet}`, "assigned", row.explanation, row.basis.source);
  for (const row of report.significators.planets) if (row.shared) add("significators", row.planet, "shared-roles", row.explanation);
  for (const row of report.considerations.observations) {
    add("considerations", row.rule, row.status, row.explanation, row.source);
    if (row.scan) for (const limitation of row.scan.method.limitations) add("considerations", row.rule, "limitation", limitation);
  }
  for (const row of report.essential.conditions) {
    add("essential", row.planet, "score", row.explanation);
    for (const part of row.contributions) add("essential", `${row.planet}: ${part.rule}`, part.status, part.explanation, part.source);
  }
  for (const row of report.essential.directionalReceptions) add("receptions", `${row.host} receives ${row.guest}`, row.status, row.explanation, row.source);
  for (const row of report.essential.mutualReceptions) add("receptions", `${row.a} / ${row.b}`, "mutual", row.explanation, row.source);
  for (const row of report.accidental.conditions) {
    add("accidental", row.planet, "score", row.explanation);
    for (const part of row.contributions) add("accidental", `${row.planet}: ${part.rule}`, part.status, part.explanation, part.source);
  }
  function addLimitations(section: string, subject: string, method: { limitations: readonly string[] }) {
    for (const text of method.limitations) add(section, subject, "limitation", text);
  }
  function search(section: string, scan: { status: string; reason: string | null; from: string; to: string; samples: number;
    method?: { budgetUnit: string; limitations: readonly string[] } }, subject = "search") {
    const reason = scan.reason === null ? "" : ` Reason: ${scan.reason}.`;
    const unit = scan.method ? scan.method.budgetUnit : "this report's budget unit";
    add(section, subject, scan.status, `Search status ${scan.status}; window ${scan.from} to ${scan.to}; ${scan.samples} samples (${unit}).${reason} Sampled searches do not prove completeness.`);
    if (scan.method) addLimitations(section, subject, scan.method);
  }
  search("aspects", report.aspects.search);
  for (const row of report.aspects.aspects) add("aspects", `${row.a.planet} / ${row.b.planet}: ${row.type}`, row.current.motion, row.explanation, report.aspects.source);
  search("direct", report.direct.eventSearch);
  for (const row of report.direct.direct) add("direct", `${row.a.planet} / ${row.b.planet}: ${row.type}`, row.status, row.explanation, report.direct.source);
  for (const row of report.direct.events) add("direct", `${row.planet.planet}: ${row.kind}`, row.transition, row.explanation, report.direct.source);
  add("translation", "mode", report.translation.assessment, report.translation.explanation, report.translation.source);
  search("translation", report.translation.search);
  for (const row of report.translation.translations) {
    const subject = `${row.from.planet} via ${row.carrier.planet} to ${row.to.planet}`;
    add("translation", subject, row.status, row.explanation, report.translation.source);
    for (const part of row.checks) add("translation", `${subject}: ${part.rule}`, !part.enabled ? "disabled" : part.passed === null ? "not-established" : part.passed ? "passed" : "failed", part.explanation, part.source);
  }
  add("collection", "mode", report.collection.assessment, report.collection.explanation, report.collection.source);
  search("collection", report.collection.search);
  for (const row of report.collection.collections) {
    add("collection", row.collector.planet, row.status, row.explanation, report.collection.source);
    for (const part of row.checks) add("collection", `${row.collector.planet}: ${part.rule}`, !part.enabled ? "disabled" : part.passed === null ? "not-established" : part.passed ? "passed" : "failed", part.explanation, part.source);
  }
  add("impediments", "mode", report.impediments.assessment, report.impediments.explanation);
  search("impediments", report.impediments.search);
  addLimitations("impediments", "search", report.impediments.method);
  search("impediments", report.impediments.motion.aspects.search, "principal aspect search");
  search("impediments", report.impediments.motion.eventSearch, "station search");
  for (const row of report.impediments.applications) {
    const subject = `${row.applicant.planet} / ${row.recipient.planet}`;
    add("impediments", subject, "application", row.explanation);
    for (const part of row.observations) add("impediments", `${subject}: ${part.rule}`, part.status, part.explanation, part.source);
  }
  add("timing", "policy", report.timing.policy.enabled ? "enabled" : "disabled", report.timing.policy.enabled
    ? "Symbolic quantities use the caller's modality and house unit table; elapsed UTC days remain separate contact evidence."
    : "The caller has not enabled symbolic timing hints.", report.timing.source);
  addLimitations("timing", "symbolic convention", report.timing.conventions);
  search("timing", report.timing.aspects.search);
  for (const row of report.timing.assessments) {
    const subject = `${row.a.planet} / ${row.b.planet}: ${row.type}`;
    add("timing", subject, row.status, row.explanation, report.timing.source);
    for (const hint of row.hints) add("timing", `${subject}: ${hint.planet.planet}`, hint.status, hint.explanation, report.timing.source);
  }
  const limitations = Object.freeze([...report.limitations]);
  const text = [`Question ${report.input.question.id} at ${report.input.instant}.`, ...entries.map(row => {
    const source = row.source === null ? "" : typeof row.source === "string" ? ` Source: ${row.source}.`
      : ` Source: ${row.source.tradition}; ${row.source.reference}; ${row.source.locator}.`;
    return `[${row.section}] ${row.subject} (${row.status}): ${row.text}${source}`;
  }), ...limitations.map(text => `Limitation: ${text}`)].join("\n");
  return Object.freeze({ schema: "horary.explanation/v1", questionId: report.input.question.id,
    instant: report.input.instant, entries: Object.freeze(entries), limitations, text });
}
