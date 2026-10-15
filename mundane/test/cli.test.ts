import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchIngresses, searchLunations, searchMundaneReport } from "../src/index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const executable = fileURLToPath(new URL("../bin/mundane.mjs", import.meta.url));
const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const coordinates = ["--latitude", "12.5", "--longitude", "-31.25", "--name", place.name];
const annual = [...coordinates, "--year", "2024"];
const range = [...coordinates, "--from", "2024-03-01", "--to", "2024-04-01"];
let scratch: string;

function cli(args: string[], entry = executable, cwd = project, tz = "UTC") {
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, TZ: tz, NO_COLOR: "1" }
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

beforeAll(() => {
  execFileSync(process.execPath, ["scripts/build-cli.mjs"], { cwd: project, stdio: "pipe" });
  mkdirSync(`${project}/generated`, { recursive: true });
  scratch = mkdtempSync(`${project}/generated/cli-test-`);
}, 30_000);
afterAll(() => { if (scratch) rmSync(scratch, { recursive: true, force: true }); });

describe("built CLI process", () => {
  it.each([[], ["--help"], ["-h"], ["ingresses", "--help"], ["lunations", "-h"], ["year", "--help"]])(
    "prints help without requiring calculation inputs: %j", (...args) => {
      const result = cli(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage: mundane");
      expect(result.stdout).toContain("traditional conventions, not predictions");
      expect(result.stdout).toContain("(from, to]");
    }
  );

  it.each(["ingresses", "lunations", "year"] as const)("%s JSON preserves the complete library result", command => {
    const result = cli([command, ...annual, "--house-system", "regiomontanus", "--format=json"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const request = { year: 2024, place, houseSystem: "regiomontanus" as const };
    const expected = command === "ingresses" ? searchIngresses(request) : command === "lunations" ?
      searchLunations(request) : searchMundaneReport(request);
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(result.stdout.endsWith("\n")).toBe(true);
  });

  it.each(["ingresses", "lunations", "year"])("%s text includes chart factors and conventions", command => {
    const result = cli([command, ...range, "--house-system", "placidus"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`Mundane ${command}: complete`);
    expect(result.stdout).toContain("traditional conventions, not predictions");
    expect(result.stdout).toContain("not-proven");
    expect(result.stdout).toContain("Angles (degrees):");
    expect(result.stdout).toContain("requested=placidus; actual=placidus");
    expect(result.stdout).toContain("Cusps (degrees, house order):");
    expect(result.stdout).toContain("Sun: longitude=");
    expect(result.stdout).toContain("speed=");
    expect(result.stdout).toContain("deg/day");
    expect(result.stdout).toContain("Angular classical planets:");
    expect(result.stdout).toContain("is ruled by");
    expect(result.stdout).toContain("dignities");
    expect(result.stdout).toContain("debilities");
    expect(result.stdout).toContain("Time basis:");
    expect(result.stdout).toContain("Engine:");
  });

  it("retains polar fallback in text output", () => {
    const result = cli(["ingresses", "--latitude=78", "--longitude=-31.25", "--year=2024", "--house-system=placidus"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("requested=placidus; actual=whole");
    expect(result.stdout).toContain("polar-fallback");
  });

  it("reports an empty completed window as distinct from refusal", () => {
    const result = cli(["year", ...coordinates, "--from=2024-01-01", "--to=2024-01-02"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("No events in this window.");
    expect(result.stdout).not.toContain("Refused:");
  });

  it.each(["ingresses", "lunations"])("passes a positive custom budget to %s", command => {
    const result = cli([command, ...annual, "--max-samples=5000", "--format=json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).search.maxSamples).toBe(5000);
  });

  it.each([
    ["ingresses", "--max-samples=1"], ["lunations", "--max-samples=1"],
    ["year", "--ingress-max-samples=1"], ["year", "--lunation-max-samples=1"]
  ])("returns atomic JSON refusal with a distinct exit code: %s %s", (command, option) => {
    const result = cli([command!, ...annual, option!, "--format=json"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    expect(output.status).toBe("refused");
    expect(output.reason).toBe("sample-budget");
    expect(output.events ?? output.ingresses ?? output.lunations).toEqual([]);
  });

  it("prints the refusal reason in text and preserves per-component budgets", () => {
    const result = cli(["year", ...annual, "--ingress-max-samples=1", "--lunation-max-samples=2"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"maxSamples":1');
    expect(result.stdout).toContain('"maxSamples":2');
    expect(result.stdout).toContain("Refused: sample-budget; no partial events returned.");
  });

  it("normalizes explicit offsets independently of cwd and host time zone", () => {
    const args = ["lunations", ...coordinates, "--from=2024-03-01T03:00:00+03:00",
      "--to=2024-04-01T03:00:00+03:00", "--format=json"];
    const utc = cli(args, executable, scratch, "UTC");
    const west = cli(args, executable, scratch, "America/Los_Angeles");
    expect(utc.status).toBe(0);
    expect(west.status).toBe(0);
    expect(west.stdout).toBe(utc.stdout);
    expect(JSON.parse(utc.stdout).request.range).toEqual({ from: "2024-03-01T00:00:00.000Z", to: "2024-04-01T00:00:00.000Z" });
  });

  it("preserves the astronomical year rather than shifting early years into the twentieth century", () => {
    const result = cli(["ingresses", ...coordinates, "--year=50", "--max-samples=1", "--format=json"]);
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).request.range.from).toBe("0050-01-01T00:00:00.000Z");
  });

  // These compare executable output with committed independent USNO references,
  // using their previously declared threshold and clock caveats, not a golden
  // snapshot of a prior engine run. Full derivations remain in M6/M8 records.
  it.each(["ingresses", "lunations"] as const)("%s output agrees with existing independent March references", command => {
    const result = cli([command, ...range, "--format=json"]);
    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    const root = new URL("./fixtures/usno/", import.meta.url);
    const sources = JSON.parse(readFileSync(new URL(`${command === "ingresses" ? "ingress" : "lunation"}-sources.json`, root), "utf8"));
    const raw = JSON.parse(readFileSync(new URL(`${command === "ingresses" ? "seasons" : "phases"}-2024.json`, root), "utf8"));
    const rows = command === "ingresses" ? raw.data.filter((row: { month: number; phenom: string }) => row.month === 3 && row.phenom === "Equinox") :
      raw.phasedata.filter((row: { month: number; phase: string }) => row.month === 3 && ["New Moon", "Full Moon"].includes(row.phase));
    const events = output.ingresses ?? output.lunations;
    expect(events).toHaveLength(rows.length);
    for (const [index, row] of rows.entries()) {
      const label = `2024-03-${String(row.day).padStart(2, "0")}T${row.time}:00Z`;
      expect(Math.abs(Date.parse(events[index].at) - Date.parse(label)) / 1000)
        .toBeLessThanOrEqual(sources.comparison.maximumAbsoluteDifferenceSeconds);
      expect(events[index].kind).toBe(command === "ingresses" ? "solar-ingress" : "lunation");
      if (command === "ingresses") expect(events[index].sign).toBe("Aries");
      else expect(events[index].phase).toBe(row.phase === "New Moon" ? "new" : "full");
    }
  });
});

describe("strict CLI arguments", () => {
  const invalid = [
    ["unknown"], ["--help", "--unknown"], ["year", "--help", "--unknown"], ["year", ...annual, "--help"],
    ["year", ...annual, "--lat=10"], ["year", ...annual, "extra"], ["year", ...annual, "--"],
    ["year", ...annual, "--name=Second"], ["year", ...annual, "--latitude=1"],
    ["year", ...annual, "--format"], ["year", ...annual, "--format="],
    ["year", ...annual, "--format=xml"], ["year", ...annual, "--format=json", "--format=text"],
    ["year", ...annual, "--format", "--house-system=whole"],
    ["year", ...annual, "--from=2024-01-01"], ["year", ...annual, "--to=2024-12-01"],
    ["year", ...coordinates, "--from=2024-01-01"], ["year", ...coordinates, "--to=2024-01-02"],
    ["year", "--year=2024", "--latitude=1"], ["year", "--year=2024", "--longitude=1"],
    ...["0x20", "1e1", "Infinity", "NaN", " 12", "12deg", "90", "-90", "91"].map(value => ["year", "--year=2024", "--latitude", value, "--longitude=1"]),
    ["year", "--year=2024", "--latitude=1", "--longitude=181"],
    ...["2024.5", "2e3", "0x7e8", "9007199254740992", " 2024"].map(value => ["year", ...coordinates, `--year=${value}`]),
    ["year", ...annual, "--house-system=invalid"],
    ["year", ...coordinates, "--from=2024-02-30", "--to=2024-03-01"],
    ["year", ...coordinates, "--from=2024-01-01T00:00", "--to=2024-02-01"],
    ["year", ...coordinates, "--from=2024-02-01", "--to=2024-01-01"],
    ["year", ...coordinates, "--from=2024-01-01", "--to=2024-01-01"],
    ["ingresses", ...coordinates, "--year=5000", "--max-samples=1"],
    ...["0", "-1", "1.5", "Infinity", "1e2", "9007199254740992"].map(value => ["lunations", ...annual, `--max-samples=${value}`]),
    ["year", ...annual, "--max-samples=1"], ["year", ...annual, "--ingress-max-samples=0"],
    ["year", ...annual, "--lunation-max-samples=0"],
    ["ingresses", ...annual, "--lunation-max-samples=1"],
    ["lunations", ...annual, "--eclipse-settings=missing.json"],
    ["year", ...annual, "--eclipse-settings=missing.json"]
  ];
  it.each(invalid.map(args => [JSON.stringify(args), args] as const))("rejects %s", (_label, args) => {
    const result = cli([...args]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/^mundane: .+\n$/u);
    expect(result.stderr).not.toContain("at runCli");
  });
});

describe("optional events loading from the built CLI", () => {
  it("distinguishes unavailable, supplied minima, refusal, and malformed settings", () => {
    // Keep the built CLI at the production relative depth. Both the absence
    // case and the fake sibling module are independent of actual events/.
    const isolated = `${scratch}/isolated`;
    mkdirSync(`${isolated}/mundane/build`, { recursive: true });
    mkdirSync(`${isolated}/mundane/bin`, { recursive: true });
    copyFileSync(`${project}/build/cli.mjs`, `${isolated}/mundane/build/cli.mjs`);
    copyFileSync(executable, `${isolated}/mundane/bin/mundane.mjs`);
    const entry = `${isolated}/mundane/bin/mundane.mjs`;
    const settings = { model: { sunRadiusAu: 4, moonRadiusAu: 1, earthRadiusAu: 2 },
      stepMs: 1000, derivativeStepMs: 10, maxEvaluations: 100 };
    const path = `${isolated}/settings.json`;
    writeFileSync(path, JSON.stringify(settings));
    const args = ["year", ...coordinates, "--from=2024-01-01", "--to=2024-01-02", "--eclipse-settings=settings.json", "--format=json"];
    const missing = cli(args, entry, isolated);
    expect(missing.status).toBe(2);
    const absent = JSON.parse(missing.stdout);
    expect(absent.reason).toBe("eclipse-adapter-unavailable");
    expect(absent.searches.eclipses.reason).toBe("not-installed");
    expect(absent.events).toEqual([]);

    mkdirSync(`${isolated}/events/build/src`, { recursive: true });
    writeFileSync(`${isolated}/events/build/src/index.js`, `
      export class EvaluationContext {
        constructor(window, options) { this.window = window; this.options = options; }
      }
      export function searchEclipses(context, kind) {
        const evaluations = kind === "solar" ? 1 : 2;
        if (context.options.maxEvaluations < evaluations) return {
          status: "refused", reason: "evaluation-budget", evaluations: 1, events: []
        };
        return { status: "complete", evaluations, events: kind === "solar" ? [{
          kind, atMs: context.window.startMs + 43200000, clock: "utc",
          definition: "minimum-shadow-axis-distance", source: "synthetic CLI module"
        }] : [] };
      }
    `);
    const complete = cli(args, entry, isolated);
    expect(complete.stderr).toBe("");
    expect(complete.status).toBe(0);
    const output = JSON.parse(complete.stdout);
    expect(output.events).toHaveLength(1);
    expect(output.events[0]).toMatchObject({ kind: "eclipse", at: "2024-01-01T12:00:00.000Z",
      contactKind: "minimum-shadow-axis-distance", eclipseKind: "solar" });
    expect(output.events[0].supplied.provenance.source).toBe("synthetic CLI module");
    expect(output.searches.eclipses.evaluations).toBe(2);
    const text = cli(args.slice(0, -1), entry, isolated);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain("solar eclipse: minimum-shadow-axis-distance");
    writeFileSync(path, JSON.stringify({ ...settings, maxEvaluations: 1 }));
    const refused = cli(args, entry, isolated);
    expect(refused.status).toBe(2);
    expect(JSON.parse(refused.stdout)).toMatchObject({ reason: "evaluation-budget", events: [] });
    writeFileSync(path, JSON.stringify({ ...settings, extra: true }));
    expect(cli(args, entry, isolated).status).toBe(1);
    writeFileSync(path, "not JSON");
    const malformed = cli(args, entry, isolated);
    expect(malformed.status).toBe(1);
    expect(malformed.stdout).toBe("");
    expect(malformed.stderr).toContain("mundane:");
  });
});
