import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { crescentEvents, heliacalEvents, horizonPhenomena, phase } from "../src/index.js";
import type { BodyPhase, Observer, VisibilityBody } from "../src/index.js";

const LAUNCHER = fileURLToPath(new URL("../bin/heliacal.mjs", import.meta.url));
const SITE = { latitude: 13, longitude: -42, height: 120 };
const SITE_ARGS = ["--latitude", "13", "--longitude", "-42", "--height", "120"];
const FROM = "2001-02-03";
const TO = "2001-02-06";
const RANGE_ARGS = ["--from", FROM, "--to", TO];
const fixture = JSON.parse(readFileSync(new URL("./fixtures/phase-reference.json", import.meta.url), "utf8")) as {
  at: string;
  observer: Observer;
  tolerance: {
    phaseAngleDeg: number;
    illuminatedFraction: number;
    apparentAngleArcsec: { Moon: number; planets: number };
  };
  cases: {
    body: VisibilityBody;
    center: "geocentric" | "topocentric";
    expected: { illuminatedPercent: number; elongationDeg: number; phaseAngleDeg: number };
  }[];
};

function launch(args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, [LAUNCHER, ...args], {
    cwd: tmpdir(), env: { ...process.env, ...env }, encoding: "utf8",
    timeout: 30_000, maxBuffer: 16 * 1024 * 1024
  });
  expect(result.error, "CLI must launch from outside the checkout").toBeUndefined();
  expect(result.signal, "CLI must finish within its process timeout").toBeNull();
  return result;
}

function jsonResult<T>(args: readonly string[], exitCode = 0): T {
  const result = launch(args);
  expect(result.status, result.stderr).toBe(exitCode);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  const document = JSON.parse(result.stdout) as { schema: string; command: string; units: unknown; result: T };
  expect(document.schema).toBe("heliacal-cli/1");
  expect(document.command).toBe(args[0]);
  expect(document.units).toMatchObject({ angles: "degrees", observerHeight: "metres", instants: "ISO-8601 UTC" });
  return document.result;
}

function jsonCopy(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function phaseArgs(body: VisibilityBody): string[] {
  return ["phase", "--body", body, "--at", fixture.at,
    "--latitude", String(fixture.observer.latitude), "--longitude", String(fixture.observer.longitude),
    "--height", String(fixture.observer.height ?? 0)];
}

describe("CLI launched as a separate process", () => {
  // Existing independent NASA/JPL Horizons numerical examples and their declared
  // gates check the values. Live library equality below checks transport only.
  it.each(["Moon", "Venus"] as const)("preserves %s phase and receipts and passes the cited Horizons examples", (body) => {
    const actual = jsonResult<BodyPhase>(phaseArgs(body));
    expect(actual.status).toBe("ok");
    expect(actual).toEqual(jsonCopy(phase(body, fixture.at, fixture.observer)));
    const rows = fixture.cases.filter((row) => row.body === body);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const value = actual[row.center];
      const gate = fixture.tolerance.apparentAngleArcsec[body === "Moon" ? "Moon" : "planets"];
      expect(Math.abs(value.elongationDeg - row.expected.elongationDeg) * 3600).toBeLessThanOrEqual(gate);
      expect(Math.abs(value.illumination.phaseAngleDeg - row.expected.phaseAngleDeg))
        .toBeLessThanOrEqual(fixture.tolerance.phaseAngleDeg);
      expect(Math.abs(value.illumination.illuminatedFraction - row.expected.illuminatedPercent / 100))
        .toBeLessThanOrEqual(fixture.tolerance.illuminatedFraction);
      expect(value.illumination.positions.target.receipt).toMatchObject({
        schema: "zodiacs.calc-receipt.v1", engine: { name: "@zodiacs/engine" }
      });
    }
  }, 30_000);

  it("transports heliacal model parameters, opportunities and complete engine receipts", () => {
    const model = { model: "horizon-arcus-visionis/1", thresholds: { "first-morning": 10.5, "last-evening": 9.5 } } as const;
    const actual = jsonResult<ReturnType<typeof heliacalEvents>>([
      "events", "--mode", "heliacal", "--body", "Venus", ...SITE_ARGS, ...RANGE_ARGS,
      "--model", model.model, "--last-evening-deg", "9.5", "--first-morning-deg", "10.5"
    ]);
    expect(actual).toEqual(jsonCopy(heliacalEvents("Venus", SITE, FROM, TO, model)));
    expect(actual.status).toBe("complete");
    expect(actual.opportunities.length).toBeGreaterThan(0);
    const source = actual.observing.horizons.sun;
    expect(source?.status).toBe("complete");
    if (!source || source.status !== "complete") throw new Error("Missing complete source search");
    expect(source.events.length).toBeGreaterThan(0);
    for (const event of source.events) {
      expect(typeof event.at).toBe("string");
      expect(event.at).toMatch(/Z$/);
      expect(event.position).toMatchObject({ receipt: { schema: "zodiacs.calc-receipt.v1" } });
    }
  }, 30_000);

  it("transports geometric horizon phenomena with the selected terminology and kinds", () => {
    const kinds = ["acronychal-setting", "cosmical-rising"] as const;
    const actual = jsonResult<ReturnType<typeof horizonPhenomena>>([
      "events", "--mode=horizon", "--body", "Moon", ...SITE_ARGS, ...RANGE_ARGS,
      "--kinds", kinds.join(",")
    ]);
    expect(actual).toEqual(jsonCopy(horizonPhenomena("Moon", SITE, FROM, TO, { kinds })));
    expect(actual.status).toBe("complete");
    expect(actual.kinds).toEqual(["cosmical-rising", "acronychal-setting"]);
    expect(actual.opportunities.length).toBeGreaterThan(0);
    expect(actual.terminology.id).toBe("sunrise-cosmical-sunset-acronychal/1");
  }, 30_000);

  it.each(["heliacal", "horizon"] as const)("returns structured %s budget refusals with a nonzero exit", (mode) => {
    const actual = jsonResult<ReturnType<typeof horizonPhenomena> | ReturnType<typeof heliacalEvents>>([
      "events", "--mode", mode, "--body", "Venus", ...SITE_ARGS, ...RANGE_ARGS,
      ...(mode === "heliacal" ? ["--model", "horizon-arcus-visionis/1", "--first-morning-deg", "10"] : []),
      "--max-samples", "1"
    ], 2);
    expect(actual).toMatchObject({ status: "refused", reason: "sample-budget", events: [], opportunities: [] });
    expect(actual.observing).toMatchObject({ status: "refused", maxSamples: 1 });
  }, 30_000);

  it.each(["yallop-1997/1", "odeh-2006/1"] as const)("preserves %s crescent selection with explicit morning extension", (model) => {
    const policy = { model, lastAcceptedCategory: "B", maxElongationDeg: 30, morningTiming: "mirror-evening" } as const;
    const actual = jsonResult<ReturnType<typeof crescentEvents>>([
      "crescent", ...SITE_ARGS, ...RANGE_ARGS, "--model", model, "--last-category", "B",
      "--max-elongation-deg", "30", "--morning-timing", "mirror-evening"
    ]);
    expect(actual).toEqual(jsonCopy(crescentEvents(SITE, FROM, TO, policy)));
    expect(actual.status).toBe("complete");
    expect(actual.policy).toMatchObject(policy);
    expect(actual.modelParameters.id).toBe(model);
    expect(actual.diagnostics).toContainEqual({ code: "morning-symmetry-extension" });
    expect(actual.opportunities.some((row) => row.period === "morning")).toBe(true);
    expect(actual.opportunities.some((row) => row.period === "evening")).toBe(true);
  }, 30_000);

  it("leaves crescent morning timing disabled unless explicitly selected", () => {
    const actual = jsonResult<ReturnType<typeof crescentEvents>>([
      "crescent", ...SITE_ARGS, ...RANGE_ARGS, "--model", "odeh-2006/1", "--last-category", "C",
      "--max-elongation-deg", "30"
    ]);
    expect(actual.status).toBe("complete");
    expect(actual.policy).toMatchObject({ morningTiming: "disabled", acceptedCategories: ["A", "B", "C"] });
    expect(actual.opportunities.length).toBeGreaterThan(0);
    expect(actual.opportunities.every((row) => row.period === "evening")).toBe(true);
    expect(actual.diagnostics).not.toContainEqual({ code: "morning-symmetry-extension" });
  }, 30_000);

  it("passes literal argv through to strict validation with no result on stdout", () => {
    const result = launch([...phaseArgs("Moon"), "--", "--body", "Venus"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({
      schema: "heliacal-cli/1", command: "phase", error: { code: "invalid-input" }
    });
  }, 30_000);

  it("shows command help from an unrelated working directory", () => {
    const result = launch(["crescent", "--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: heliacal crescent");
    expect(result.stdout).toContain("mirror-evening");
    expect(result.stdout).toContain("yallop-1997/1");
    expect(result.stdout).toContain("odeh-2006/1");
  }, 30_000);

  it("emits identical phase bytes across host timezones and option order", () => {
    const ordinary = launch(phaseArgs("Moon"), { TZ: "UTC" });
    const reordered = launch([
      "phase", "--longitude=10", "--height=0", "--body=Moon", "--latitude=45", "--at=2020-01-01"
    ], { TZ: "America/Los_Angeles" });
    expect(ordinary.status, ordinary.stderr).toBe(0);
    expect(reordered.status, reordered.stderr).toBe(0);
    expect(ordinary.stderr).toBe("");
    expect(reordered.stderr).toBe("");
    expect(reordered.stdout).toBe(ordinary.stdout);
  }, 30_000);
});
