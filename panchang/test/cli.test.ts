import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as sky from "../../src/sky/riseset.js";
import * as dayModule from "../src/day.js";
import * as rangeModule from "../src/range.js";
import * as sunriseModule from "../src/sunrise.js";
import { CLI_HELP, parseCliArgs, runCli } from "../src/cli.js";
import { renderText } from "../src/cli-text.js";
import { PANCHANG_AYANAMSAS, panchangDay, panchangRange, resolveSunriseDay } from "../src/index.js";
import type { PanchangDay, LuminarySnapshot } from "../src/index.js";
import { analyticalSource } from "./analytical.js";

const common = ["--latitude", "12.5", "--longitude", "75.25", "--time-zone", "Asia/Kolkata", "--month-convention", "amanta"];
const dayArgs = ["day", "--date", "2024-03-20", ...common];
const rangeArgs = ["range", "--from", "2024-03-20", "--to", "2024-03-21", ...common];
const input = { date: "2024-03-20", timeZone: "Asia/Kolkata", observer: { latitude: 12.5, longitude: 75.25 } };
const options = { monthConvention: "amanta" } as const;
const binary = fileURLToPath(new URL("../bin/panchang.mjs", import.meta.url));

function replace(args: readonly string[], option: string, value: string): string[] {
  const result = [...args];
  result[result.indexOf(option) + 1] = value;
  return result;
}
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, stdout: { write: (text: string) => out.push(text) }, stderr: { write: (text: string) => err.push(text) } };
}
function okDay(): PanchangDay {
  const day = panchangDay(input, options);
  if (day.status !== "ok") throw new Error(day.reason);
  return day;
}
function constructedSource() {
  const seed = resolveSunriseDay(input);
  if (seed.status !== "ok") throw new Error(seed.reason);
  analyticalSource(1, false, true);
  vi.spyOn(sky, "skyEvents").mockImplementation((body, observer, from, to) => ({ ...seed.searches[0],
    body, observer: { ...observer, height: observer.height ?? 0 }, from: new Date(from), to: new Date(to), samples: 7,
    status: "complete", events: [{ ...seed.start.event, at: new Date(new Date(from).getTime() + 6 * 3_600_000) }] }));
}
afterEach(() => vi.restoreAllMocks());

describe("strict CLI parsing before I/O or calculation", () => {
  it.each([["--help"], ["day", "--help"], ["range", "--help"]])("accepts standalone help: %j", (...args) => {
    expect(parseCliArgs(args)).toEqual({ command: "help" });
  });
  it("uses Lahiri, text and zero height defaults with explicit place/zone/month", () => {
    expect(parseCliArgs(dayArgs)).toEqual({ command: "day", format: "text", input: { ...input, observer: { ...input.observer, height: 0 } },
      options: { ...options, ayanamsa: "lahiri" } });
  });
  it.each(PANCHANG_AYANAMSAS)("accepts engine ayanamsa %s", (name) => {
    expect(parseCliArgs([...dayArgs, "--ayanamsa", name])).toMatchObject({ options: { ayanamsa: name } });
  });
  it("accepts explicit purnimanta, signed decimal coordinates, height and finite search budgets", () => {
    const args = replace(replace(replace(dayArgs, "--latitude", "-12.5"), "--longitude", "+75.25"), "--month-convention", "purnimanta");
    expect(parseCliArgs([...args, "--height", "-25.5", "--format", "json", "--sunrise-max-samples", "100",
      "--transition-max-samples", "200", "--month-max-samples", "300"])).toMatchObject({ format: "json",
      input: { observer: { latitude: -12.5, longitude: 75.25, height: -25.5 } }, options: { monthConvention: "purnimanta",
        sunriseMaxSamples: 100, transitionMaxSamples: 200, monthMaxSamples: 300 } });
    expect(parseCliArgs([...rangeArgs, "--max-samples", "500"])).toMatchObject({ command: "range",
      input: { from: "2024-03-20", to: "2024-03-21" }, options: { maxSamples: 500 } });
  });
  it.each(["--latitude", "--longitude", "--time-zone", "--month-convention", "--date"])("requires %s", (key) => {
    const args = [...dayArgs];
    args.splice(args.indexOf(key), 2);
    expect(() => parseCliArgs(args)).toThrow(RangeError);
  });
  it.each([
    [], ["help"], ["unknown"], [...dayArgs, "extra"], [...dayArgs, "--unknown", "value"],
    [...dayArgs, "--date", "2024-03-21"], [...dayArgs, "--format"], [...dayArgs, "--format", ""],
    [...dayArgs, "--format", "yaml"], [...dayArgs, "--ayanamsa", "unknown"], [...dayArgs, "--date=2024-03-20"],
    [...dayArgs, "--help"], [...dayArgs, "--from", "2024-03-20"], [...dayArgs, "--max-samples", "1"],
    [...rangeArgs, "--date", "2024-03-20"], [...rangeArgs, "--format", "json", "--format", "json"]
  ])("rejects malformed structure: %j", (...args) => {
    expect(() => parseCliArgs(args)).toThrow(RangeError);
  });
  it.each(["NaN", "Infinity", "1e1", "0x10", "1_000", " 12", "12 ", "12\n", "12\u001b[0m", "91"])("rejects latitude %j", (value) => {
    expect(() => parseCliArgs(replace(dayArgs, "--latitude", value))).toThrow(RangeError);
  });
  it.each([
    ["--date", "2024-02-30"], ["--date", "2024-3-20"], ["--date", "9999-12-30"],
    ["--longitude", "-181"], ["--time-zone", "+05:30"], ["--time-zone", "Invalid/Zone"],
    ["--time-zone", "Asia/Kolkata\n"], ["--month-convention", "automatic"]
  ])("rejects invalid %s %j", (key, value) => {
    expect(() => parseCliArgs(replace(dayArgs, key, value))).toThrow(RangeError);
  });
  it.each(["0", "-1", "1.5", "Infinity", "NaN", "1e3", "9007199254740992"])("rejects unsafe budget %j", (value) => {
    expect(() => parseCliArgs([...rangeArgs, "--max-samples", value])).toThrow(RangeError);
    expect(() => parseCliArgs([...dayArgs, "--month-max-samples", value])).toThrow(RangeError);
  });
  it.each([["--from", "2024-03-22"], ["--to", "2024-04-20"], ["--to", "2024-02-30"]])("rejects invalid range %s %j", (key, value) => {
    expect(() => parseCliArgs(replace(rangeArgs, key, value))).toThrow(RangeError);
  });
  it("does no history loading or astronomical work for an invalid request", async () => {
    const history = vi.spyOn(sunriseModule, "prepareSunriseDay");
    const work = vi.spyOn(dayModule, "panchangDay");
    const io = capture();
    expect(await runCli([...dayArgs, "--format", "json", "--ayanamsa", "bad"], io.stdout, io.stderr)).toBe(2);
    expect(io.out).toEqual([]);
    expect(JSON.parse(io.err.join(""))).toMatchObject({ status: "error", reason: "invalid-input" });
    expect(history).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });
});

describe("CLI output and status contracts", () => {
  it("writes help without calculations or stderr", async () => {
    const work = vi.spyOn(dayModule, "panchangDay");
    const io = capture();
    expect(await runCli(["--help"], io.stdout, io.stderr)).toBe(0);
    expect(io.out).toEqual([CLI_HELP]);
    expect(io.err).toEqual([]);
    expect(work).not.toHaveBeenCalled();
  });
  it("serializes the whole original library day with receipts and no replacement envelope", async () => {
    constructedSource();
    const expected = okDay();
    const io = capture();
    expect(await runCli([...dayArgs, "--format", "json"], io.stdout, io.stderr)).toBe(0);
    expect(JSON.parse(io.out.join(""))).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(io.err).toEqual([]);
  });
  it("preserves the inclusive range and complete day results in chronological order", async () => {
    constructedSource();
    const expected = panchangRange({ from: input.date, to: "2024-03-21", timeZone: input.timeZone, observer: input.observer }, options);
    const io = capture();
    expect(await runCli([...rangeArgs, "--format", "json"], io.stdout, io.stderr)).toBe(0);
    const output = JSON.parse(io.out.join(""));
    expect(output).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(output.days.map((day: PanchangDay) => day.date)).toEqual(["2024-03-20", "2024-03-21"]);
    expect(io.err).toEqual([]);
  });
  it("renders independent constructed labels and complete boundaries in chronological sections", () => {
    constructedSource();
    const day = okDay();
    const lines = renderText(day).split("\n");
    // Artificial sunrise: March 20 local midnight + 6h = 00:30Z,
    // below the first positive rational sector root. All sectors are zero.
    expect(lines).toContain("Vara: Budhavara (Wednesday)");
    const segmentLines = lines.slice(lines.indexOf("Segments in time order (clipped to sunrise day):") + 1,
      lines.indexOf("Full intervals in start order (include boundaries outside the day):"));
    expect(segmentLines[0]).toContain("[2024-03-20T00:30:00.000Z,");
    expect(segmentLines[0]).toContain("tithi shukla 1 Pratipada | nakshatra Ashwini pada 1 | yoga Vishkambha | karana Kimstughna (fixed, half 1)");
    const starts = segmentLines.map((line) => Date.parse(line.slice(1, line.indexOf(","))));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(new Set(starts).size).toBe(starts.length);
    const fullLines = lines.slice(lines.indexOf("Full intervals in start order (include boundaries outside the day):") + 1,
      lines.indexOf("Month events inside the sunrise day in time order:"));
    const fullStarts = fullLines.map((line) => Date.parse(line.slice(1, line.indexOf(","))));
    expect(fullStarts).toEqual([...fullStarts].sort((a, b) => a - b));
    expect(fullStarts[0]).toBeLessThan(Date.parse(day.sunrise.start.utc));
    expect(lines).toContain(`[${day.sunriseMonth.start.at}, ${day.sunriseMonth.end.at}) | month: ${day.sunriseMonth.name} (amanta, ${day.sunriseMonth.kind})`);
  });
  it("keeps exact original receipts, timescales, bounds and instantaneous ayanamsa values in the text ledger", () => {
    const day = okDay();
    const lines = renderText(day).split("\n");
    const marker = lines.findIndex((line) => line.startsWith("Snapshot provenance in instant order"));
    const ledger = lines.slice(marker + 1).filter(Boolean).map((line) => JSON.parse(line) as LuminarySnapshot);
    const originals: LuminarySnapshot[] = [day.sunrise.start.snapshot, day.sunrise.end.snapshot, day.sunriseState,
      ...day.timeline.intervals.flatMap((row) => [row.start.before, row.start.after, row.end.before, row.end.after]),
      ...day.months.intervals.flatMap((row) => [row.start.before, row.start.after, row.end.before, row.end.after,
        row.namingLunation.start.before, row.namingLunation.start.after, row.namingLunation.end.before, row.namingLunation.end.after,
        row.namingLunation.fullMoon.before, row.namingLunation.fullMoon.after,
        ...row.namingLunation.ingresses.flatMap((event) => [event.before, event.after])])];
    for (const original of originals) {
      const found = ledger.find((row) => row.utc === original.utc);
      expect(found).toEqual({ utc: original.utc, sun: original.sun, moon: original.moon, ayanamsa: original.ayanamsa });
    }
    expect(ledger.map((row) => row.utc)).toEqual(ledger.map((row) => row.utc).sort());
    expect(new Set(ledger.map((row) => JSON.stringify(row))).size).toBe(ledger.length);
    expect(lines).toContain(JSON.stringify(day.sunrise.civilDays[0].start.resolution));
    expect(lines).toContain(`Day conventions: ${JSON.stringify(day.conventions)}`);
  });
  it("shows adhika, omitted kshaya month names and forward tithi anomaly intervals in neutral text", () => {
    const day = okDay();
    const interval = day.timeline.intervals.find((row) => row.kind === "tithi")!;
    // Construct labels to exercise formatting only, with no astronomical claim.
    const month = { ...day.sunriseMonth, kind: "kshaya", omittedMonths: [{ index: 10, name: "Magha" }] } as const;
    const text = renderText({ ...day, sunriseMonth: month,
      segments: day.segments.map((row) => ({ ...row, month: { ...row.month, kind: "adhika" } })),
      tithiComparison: { ...day.tithiComparison, kind: "kshaya", skipped: [interval], repeated: interval } });
    expect(text).toContain("(amanta, kshaya); omitted: Magha");
    expect(text).toContain("(amanta, adhika)");
    expect(text).toContain(`Skipped tithi: ${interval.start.after.tithi.paksha}`);
    expect(text).toContain(`Repeated tithi: ${interval.start.after.tithi.paksha}`);
    expect(text).not.toMatch(/auspicious|inauspicious|muhurta|rahu|recommend|prediction/iu);
  });
  it("prints range dates in order and deduplicates shared provenance", () => {
    const result = panchangRange({ from: input.date, to: "2024-03-21", timeZone: input.timeZone, observer: input.observer }, options);
    if (result.status !== "ok") throw new Error(result.reason);
    const output = renderText(result);
    expect(output.indexOf("Day 2024-03-20;")).toBeLessThan(output.indexOf("Day 2024-03-21;"));
    expect(output).toContain(`Range conventions: ${JSON.stringify(result.conventions)}`);
    const snapshot = result.days[0]!.sunrise.end.snapshot;
    const ledgerLine = JSON.stringify({ utc: snapshot.utc, ayanamsa: snapshot.ayanamsa, sun: snapshot.sun, moon: snapshot.moon });
    expect(output.split("\n").filter((line) => line === ledgerLine)).toHaveLength(1);
  });
  it.each(["json", "text"])("returns missing-sunrise refusal and original diagnostics in %s", async (format) => {
    const args = replace(replace(dayArgs, "--date", "2024-06-21"), "--latitude", "89");
    const io = capture();
    expect(await runCli([...args, "--format", format], io.stdout, io.stderr)).toBe(3);
    const output = io.out.join("");
    const diagnostics = JSON.parse(format === "json" ? output : output.split("Original diagnostics (JSON):\n")[1]!);
    expect(diagnostics).toMatchObject({ status: "refused", reason: "sunrise-refused", sunrise: { reason: "missing-sunrise" } });
    expect(diagnostics).not.toHaveProperty("segments");
    expect(io.err).toEqual([]);
  });
  it("refuses an entire range when the total budget is exhausted", async () => {
    const io = capture();
    expect(await runCli([...rangeArgs, "--format", "json", "--max-samples", "1"], io.stdout, io.stderr)).toBe(3);
    expect(JSON.parse(io.out.join(""))).toMatchObject({ status: "refused", reason: "sample-budget", failedDate: input.date });
    expect(JSON.parse(io.out.join(""))).not.toHaveProperty("days");
    expect(io.err).toEqual([]);
  });
  it.each([
    ["--transition-max-samples", "transitions-refused"],
    ["--month-max-samples", "months-refused"]
  ])("preserves per-day refusal from %s", async (flag, reason) => {
    const io = capture();
    expect(await runCli([...dayArgs, flag, "1"], io.stdout, io.stderr)).toBe(3);
    expect(io.out.join("")).toContain(`Refused: ${reason}: sample-budget on ${input.date}`);
    const result = JSON.parse(io.out.join("").split("Original diagnostics (JSON):\n")[1]!);
    expect(result).toMatchObject({ status: "refused", reason });
    expect(result).not.toHaveProperty("segments");
    expect(io.err).toEqual([]);
  });
  it("retains engine coverage refusals without attempting to fabricate labels", async () => {
    const io = capture();
    expect(await runCli([...replace(dayArgs, "--date", "1700-03-20"), "--format", "json"], io.stdout, io.stderr)).toBe(3);
    expect(JSON.parse(io.out.join(""))).toMatchObject({ status: "refused", reason: "sunrise-refused", sunrise: { reason: "engine-refused" } });
    expect(io.err).toEqual([]);
  });
  it("does not expose partial days after a later refused date in a range", async () => {
    constructedSource();
    const args = replace(replace(rangeArgs, "--from", "2016-10-27"), "--to", "2016-10-29");
    const io = capture();
    expect(await runCli(args, io.stdout, io.stderr)).toBe(3);
    const output = io.out.join("");
    expect(output).toContain("Refused: day-refused on 2016-10-28: months-refused: time-basis-discontinuity");
    const diagnostics = JSON.parse(output.split("Original diagnostics (JSON):\n")[1]!);
    expect(diagnostics).not.toHaveProperty("days");
    expect(output).not.toContain("Segments in time order");
    expect(io.err).toEqual([]);
  });
  it("uses stderr and status 1 for unexpected failures without partial output or raw error data", async () => {
    vi.spyOn(rangeModule, "preparePanchangRange").mockRejectedValue(new Error("private runtime detail"));
    const io = capture();
    expect(await runCli([...rangeArgs, "--format", "json"], io.stdout, io.stderr)).toBe(1);
    expect(io.out).toEqual([]);
    expect(JSON.parse(io.err.join(""))).toEqual({ status: "error", reason: "internal-error", message: "Unexpected calculation or runtime error." });
    expect(io.err.join("")).not.toContain("private runtime detail");
  });
});

describe("actual source-checkout command from another directory", () => {
  const launch = (args: readonly string[]) => spawnSync(process.execPath, [binary, ...args], {
    cwd: tmpdir(), encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30_000
  });
  it("loads its local tsconfig and dependency and drains the full JSON output", () => {
    const process = launch([...dayArgs, "--format", "json", "--ayanamsa", "raman"]);
    expect(process.error).toBeUndefined();
    expect(process.status).toBe(0);
    expect(process.stderr).toBe("");
    const output = JSON.parse(process.stdout);
    expect(output).toMatchObject({ status: "ok", ayanamsa: "raman", date: input.date });
    expect(output.sunriseState.sun.sidereal.receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    expect(output.sunriseState.ayanamsa.name).toBe("raman");
  });
  it("prepares historical dynamic timezone imports before a range", () => {
    const args = replace(replace(replace(replace(replace(rangeArgs, "--from", "1880-06-01"), "--to", "1880-06-02"),
      "--time-zone", "America/New_York"), "--latitude", "40.25"), "--longitude", "-73.25");
    const process = launch([...args, "--format", "json", "--month-max-samples", "5000"]);
    expect(process.error).toBeUndefined();
    expect(process.status).toBe(0);
    expect(process.stderr).toBe("");
    const result = JSON.parse(process.stdout);
    expect(result.days.map((day: PanchangDay) => day.date)).toEqual(["1880-06-01", "1880-06-02"]);
    expect(result.days[0].sunrise.civilDays[0].start).toMatchObject({ utc: "1880-06-01T04:53:00.000Z", resolution: { zone: { source: "tzdb" } } });
  });
  it("launches the default plain text command", () => {
    const process = launch(dayArgs);
    expect(process.status).toBe(0);
    expect(process.stderr).toBe("");
    expect(process.stdout).toContain("Day 2024-03-20; timezone Asia/Kolkata; ayanamsa lahiri;");
    expect(process.stdout).toContain('"schema":"zodiacs.calc-receipt.v1"');
  });
  it.each([
    [[...dayArgs, "--format", "json", "--month-convention", "amanta"], 2, "stderr"],
    [[...rangeArgs, "--format", "json", "--max-samples", "1"], 3, "stdout"],
    [["--help"], 0, "stdout"]
  ] as const)("returns actual process exit status for %j", (args, status, stream) => {
    const process = launch(args);
    expect(process.status).toBe(status);
    expect(process[stream].length).toBeGreaterThan(0);
    expect(process[stream === "stdout" ? "stderr" : "stdout"]).toBe("");
  });
});
