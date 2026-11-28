import { describe, expect, it } from "vitest";
import type { ValidatedJob } from "../src/model.js";
import { parseJobJson, validateJob } from "../src/validation.js";
import { workItemAt, workItems } from "../src/work.js";
import type { WorkItem } from "../src/work.js";

// These identities and birth instants are invented test inputs.
const person = (id: string) => ({ id, birth: { utc: "2001-02-03T04:05:06Z" } });
const people = () => [person("synthetic-a"), person("synthetic-b"), person("synthetic-c")];
const charts = () => validateJob({ version: 1, kind: "charts", births: people() });
const matrix = () => validateJob({ version: 1, kind: "synastry-matrix", people: people() });
const grid = (end = "2002-01-01T00:00:02.001Z", stepMs = 1_000) => validateJob({
  version: 1,
  kind: "transit-grid",
  births: people().slice(0, 2),
  start: "2002-01-01T00:00:00Z",
  end,
  stepMs,
});

function personReferences(job: ValidatedJob, item: WorkItem): void {
  expect(Object.isFrozen(item)).toBe(true);
  if (job.spec.kind === "synastry-matrix" && item.kind === "synastry-matrix") {
    expect(job.spec.people).toContain(item.a);
    expect(job.spec.people).toContain(item.b);
    expect(item.a).toBe(job.spec.people.find((person) => person.id === item.a.id));
    expect(item.b).toBe(job.spec.people.find((person) => person.id === item.b.id));
  } else if (job.spec.kind !== "synastry-matrix" && item.kind !== "synastry-matrix") {
    expect(item.person).toBe(job.spec.births.find((person) => person.id === item.person.id));
  } else {
    throw new Error("Work kind did not match the job");
  }
}

describe("deterministic work order", () => {
  it("expands chart rows in input order and reuses frozen people", () => {
    const job = charts();
    expect([...workItems(job)]).toEqual(people().map((person, index) => ({
      kind: "charts", index,
      person: { ...person, birth: { utc: "2001-02-03T04:05:06.000Z", houseSystem: "whole", timeKnown: true } },
    })));
    for (const item of workItems(job)) personReferences(job, item);
  });

  it("expands transit samples within each birth before starting the next", () => {
    const job = grid();
    const result = [...workItems(job)];
    expect(result.map((item) => item.kind === "transit-grid"
      ? [item.index, item.person.id, item.sampleIndex, item.at] : undefined)).toEqual([
      [0, "synthetic-a", 0, "2002-01-01T00:00:00.000Z"],
      [1, "synthetic-a", 1, "2002-01-01T00:00:01.000Z"],
      [2, "synthetic-a", 2, "2002-01-01T00:00:02.000Z"],
      [3, "synthetic-b", 0, "2002-01-01T00:00:00.000Z"],
      [4, "synthetic-b", 1, "2002-01-01T00:00:01.000Z"],
      [5, "synthetic-b", 2, "2002-01-01T00:00:02.000Z"],
    ]);
    for (const item of result) personReferences(job, item);
  });

  it.each([
    ["2002-01-01T00:00:02Z", 1_000, [0, 1_000]],
    ["2002-01-01T00:00:02.001Z", 1_000, [0, 1_000, 2_000]],
    ["2002-01-01T00:00:00.003Z", 1, [0, 1, 2]],
    ["2002-01-01T00:00:00.001Z", 1_000, [0]],
    ["2002-01-01T00:00:02Z", 2_000, [0]],
    ["2002-01-01T00:00:02Z", Number.MAX_SAFE_INTEGER, [0]],
  ])("excludes end %s using step %i ms", (end, stepMs, offsets) => {
    const job = grid(end, stepMs);
    const items = [...workItems(job)];
    expect(items).toHaveLength(offsets.length * 2);
    expect(items.slice(0, offsets.length).map((item) => item.kind === "transit-grid"
      ? Date.parse(item.at) - Date.parse("2002-01-01T00:00:00Z") : undefined)).toEqual(offsets);
  });

  it("keeps millisecond arithmetic across a leap day and a negative epoch", () => {
    const job = validateJob({
      version: 1, kind: "transit-grid", births: [person("synthetic-a")],
      start: "1968-02-28T23:59:59.999Z", end: "1968-02-29T00:00:00.002Z", stepMs: 1,
    });
    expect([...workItems(job)].map((item) => item.kind === "transit-grid" ? item.at : undefined)).toEqual([
      "1968-02-28T23:59:59.999Z", "1968-02-29T00:00:00.000Z", "1968-02-29T00:00:00.001Z",
    ]);
  });

  it("expands each directed matrix row in column order while skipping its diagonal", () => {
    const job = matrix();
    const items = [...workItems(job)];
    expect(items.map((item) => item.kind === "synastry-matrix"
      ? [item.index, item.a.id, item.b.id] : undefined)).toEqual([
      [0, "synthetic-a", "synthetic-b"], [1, "synthetic-a", "synthetic-c"],
      [2, "synthetic-b", "synthetic-a"], [3, "synthetic-b", "synthetic-c"],
      [4, "synthetic-c", "synthetic-a"], [5, "synthetic-c", "synthetic-b"],
    ]);
    for (const item of items) personReferences(job, item);
  });

  it("handles the minimum matrix with both directed pairs", () => {
    const job = validateJob({ version: 1, kind: "synastry-matrix", people: people().slice(0, 2) });
    expect([...workItems(job)].map((item) => item.kind === "synastry-matrix"
      ? [item.a.id, item.b.id] : undefined)).toEqual([
      ["synthetic-a", "synthetic-b"], ["synthetic-b", "synthetic-a"],
    ]);
  });

  it("preserves the canonical JSON parser snapshot", () => {
    const job = parseJobJson(JSON.stringify({ version: 1, kind: "charts", births: people() }));
    for (const item of workItems(job)) personReferences(job, item);
  });
});

describe("resume cursors and direct lookup", () => {
  it.each([charts, grid, matrix])("resumes every boundary without losing or duplicating rows", (makeJob) => {
    const job = makeJob();
    const all = [...workItems(job)];
    for (let cursor = 0; cursor <= job.totalTasks; cursor++) {
      expect([...workItems(job, cursor)]).toEqual(all.slice(cursor));
      expect([...all.slice(0, cursor), ...workItems(job, cursor)]).toEqual(all);
      if (cursor < job.totalTasks) expect(workItemAt(job, cursor)).toEqual(all[cursor]);
    }
  });

  it.each([charts, grid, matrix])("rejects invalid cursors at call time", (makeJob) => {
    const job = makeJob();
    const invalid: unknown[] = [-1, 0.5, NaN, Infinity, -Infinity,
      Number.MAX_SAFE_INTEGER + 1, job.totalTasks + 1, "0", null, 0n, Symbol("cursor")];
    for (const cursor of invalid) {
      expect(() => workItems(job, cursor as number)).toThrow(RangeError);
      expect(() => workItemAt(job, cursor as number)).toThrow(RangeError);
    }
    expect(() => workItemAt(job, job.totalTasks)).toThrow(RangeError);
    expect(() => workItemAt(job, undefined as unknown as number)).toThrow(RangeError);
    expect(workItems(job, job.totalTasks).next()).toEqual({ done: true, value: undefined });
  });

  it("normalizes negative zero and supports independent iterator cursors", () => {
    const job = charts();
    expect(Object.is(workItemAt(job, -0).index, 0)).toBe(true);
    const first = workItems(job, -0);
    const second = workItems(job, 1);
    expect(Object.is(first.next().value?.index, 0)).toBe(true);
    expect(second.next().value?.index).toBe(1);
    expect(first.next().value?.index).toBe(1);
    expect(second.next().value?.index).toBe(2);
  });

  it("seeks the ends of long grids without generating earlier samples", () => {
    const births = people();
    const job = validateJob({
      version: 1, kind: "transit-grid", births,
      start: "0000-01-01T00:00:00Z", end: "9999-12-31T23:59:59.999Z", stepMs: 1,
    }, { maxTasks: Number.MAX_SAFE_INTEGER });
    const samples = job.totalTasks / births.length;
    for (let row = 0; row < births.length; row++) {
      expect(workItemAt(job, row * samples)).toMatchObject({
        person: { id: births[row]!.id }, sampleIndex: 0, at: "0000-01-01T00:00:00.000Z",
      });
      expect(workItemAt(job, (row + 1) * samples - 1)).toMatchObject({
        person: { id: births[row]!.id }, sampleIndex: samples - 1, at: "9999-12-31T23:59:59.998Z",
      });
    }
    expect([...workItems(job, job.totalTasks - 1)]).toEqual([workItemAt(job, job.totalTasks - 1)]);
  });

  it("seeks and finishes a workload at the maximum safe integer count", () => {
    const count = 6_361;
    const samples = Number(BigInt(Number.MAX_SAFE_INTEGER) / BigInt(count));
    expect(BigInt(samples) * BigInt(count)).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    const start = Date.parse("2000-01-01T00:00:00Z");
    const job = validateJob({
      version: 1, kind: "transit-grid",
      births: Array.from({ length: count }, (_, i) => person(`synthetic-${i}`)),
      start: new Date(start).toISOString(), end: new Date(start + samples).toISOString(), stepMs: 1,
    }, { maxTasks: Number.MAX_SAFE_INTEGER });
    expect(job.totalTasks).toBe(Number.MAX_SAFE_INTEGER);
    const last = job.totalTasks - 1;
    expect(workItemAt(job, last)).toMatchObject({
      index: last, person: { id: `synthetic-${count - 1}` }, sampleIndex: samples - 1,
      at: new Date(start + samples - 1).toISOString(),
    });
    expect([...workItems(job, last - 1)].map((item) => item.index)).toEqual([last - 1, last]);
    expect(workItems(job, Number.MAX_SAFE_INTEGER).next().done).toBe(true);
    expect(() => workItemAt(job, Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });

  it("seeks a large matrix directly without traversing preceding pairs", () => {
    const count = 10_000;
    const job = validateJob({
      version: 1, kind: "synastry-matrix",
      people: Array.from({ length: count }, (_, i) => person(`synthetic-${i}`)),
    }, { maxTasks: Number.MAX_SAFE_INTEGER });
    const last = job.totalTasks - 1;
    expect(job.totalTasks).toBe(99_990_000);
    expect(workItemAt(job, last)).toMatchObject({
      index: last, a: { id: "synthetic-9999" }, b: { id: "synthetic-9998" },
    });
    const middle = 5_000 * (count - 1);
    expect(workItemAt(job, middle + 4_999)).toMatchObject({ a: { id: "synthetic-5000" }, b: { id: "synthetic-4999" } });
    expect(workItemAt(job, middle + 5_000)).toMatchObject({ a: { id: "synthetic-5000" }, b: { id: "synthetic-5001" } });
    expect([...workItems(job, last)]).toEqual([workItemAt(job, last)]);
  });
});
