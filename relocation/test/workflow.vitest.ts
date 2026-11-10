import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { natalChart } from "@zodiacs/engine";
import { calc, houses } from "@zodiacs/engine/calc";
import { createNatalEnvelope, natalReplayInput } from "@zodiacs/engine/receipt";
import { runSyntheticWorkflow, syntheticBirth } from "../examples/workflow.js";

const project = fileURLToPath(new URL("../", import.meta.url));

describe("documented synthetic workflow", () => {
  it("runs the compiled tutorial from another cwd and preserves replay through every API family", () => {
    const executed = spawnSync(process.execPath, [project + "scripts/run-example.mjs"], {
      cwd: project + ".cache", encoding: "utf8", timeout: 10_000, maxBuffer: 1_500_000
    });
    expect(executed.error).toBeUndefined();
    expect(executed.status).toBe(0);
    expect(executed.stderr).toBe("");
    const workflow = runSyntheticWorkflow();
    expect(JSON.parse(executed.stdout)).toEqual(workflow);
    expect(workflow.chart.relocated.receipt.houses).toMatchObject({ requested: "placidus", actual: "whole" });
    expect(workflow.returned.relocated.result).toEqual(createNatalEnvelope(natalChart(syntheticBirth)).result);
    expect(workflow.grid.plan).toEqual(workflow.gridPlan);
    expect(workflow.grid.samples).toHaveLength(4);
    for (const sample of workflow.grid.samples) {
      expect(sample.envelope.result).toEqual(createNatalEnvelope(natalChart({ ...syntheticBirth, ...sample.point })).result);
    }
    for (const result of [workflow.angles, workflow.meridians.sampling, workflow.horizons.sampling,
      workflow.crossings.sampling, workflow.path.sampling, workflow.localSpace.sampling]) {
      if (result.status !== "ok") throw new Error(result.reason);
      expect(result.natal).toEqual(workflow.chart.relocated);
      for (const position of result.positions) expect(calc(position.engine.receipt.request)).toEqual(position.engine);
      for (const observer of result.samples) {
        if (observer.status === "undefined") expect(observer.engine).toBeNull();
        else expect(houses(observer.engine.receipt.request)).toEqual(observer.engine);
      }
    }
    if (workflow.angles.status !== "ok") throw new Error(workflow.angles.reason);
    expect(workflow.angles.samples[1]).toMatchObject({ status: "undefined", reason: "geographic-pole" });
    for (const result of [workflow.crossings, workflow.path]) {
      if (result.status !== "ok") throw new Error(result.reason);
      expect(result.crossings.length).toBeGreaterThan(0);
    }
  });

  it("uses a saved chart-grid envelope as CLI source, then relocates an admitted path crossing", () => {
    const workflow = runSyntheticWorkflow();
    const saved = workflow.grid.samples[0]!.envelope;
    const launcher = project + "bin/relocation.mjs";
    const call = (command: string, request: unknown) => {
      const result = spawnSync(process.execPath, [launcher, command], { cwd: project + ".cache",
        input: JSON.stringify(request), encoding: "utf8", timeout: 10_000, maxBuffer: 1_500_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      return JSON.parse(result.stdout);
    };
    const path = call("lines", { source: saved, mode: "path", options: {
      from: { latitude: -10, longitude: 170 }, to: { latitude: 10, longitude: -165 },
      stepDegrees: 20, bodies: ["Moon"], lines: ["ASC"], maxEvaluations: 128,
      maxRefinements: 32, coordinateTolerance: 0.01, residualTolerance: 0.01
    } });
    expect(path.sampling.natal).toEqual(saved);
    expect(path.crossings.length).toBeGreaterThan(0);
    for (const crossing of path.crossings) {
      const observer = path.sampling.samples[crossing.observerIndex];
      expect(houses(observer.engine.receipt.request)).toEqual(observer.engine);
      expect(observer.point).toEqual(crossing.point);
      const chart = call("chart", { source: saved, destination: crossing.point });
      expect(chart.natal).toEqual(saved);
      expect(natalReplayInput(chart.relocated)).toMatchObject({ ...crossing.point, houseSystem: "placidus", deltaT: 65 });
      expect(chart.relocated.result).toEqual(createNatalEnvelope(natalChart(natalReplayInput(chart.relocated))).result);
    }
  });
});
