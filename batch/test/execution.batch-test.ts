import { afterEach, describe, expect, it, vi } from "vitest";
import { natalChart, synastry, transits } from "../../src/index.js";
import * as engine from "../src/engine.js";
import {
  executeSerial, executeWorkItem, validateJob, workItemAt, WorkExecutionError,
} from "../src/index.js";
import type { BatchBirth, Person, ValidatedJob } from "../src/index.js";

// Invented people, instants and coordinates, with no external birth records.
const people: readonly Person[] = [
  { id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06Z", latitude: 12, longitude: 34, houseSystem: "placidus" } },
  { id: "synthetic-b", birth: { utc: "1998-07-08T09:10:11Z", timeKnown: false } },
  { id: "synthetic-c", birth: { utc: "1904-05-06T07:08:09Z", latitude: -23, longitude: 45 } },
];
const charts = () => validateJob({ version: 1, kind: "charts", births: people });
const grid = () => validateJob({
  version: 1, kind: "transit-grid", births: people.slice(0, 2),
  start: "2005-06-07T08:09:10.001Z", end: "2005-06-07T08:09:10.005Z", stepMs: 2,
});
const matrix = () => validateJob({ version: 1, kind: "synastry-matrix", people });
const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

afterEach(() => { vi.restoreAllMocks(); });

describe("serial engine execution", () => {
  it("returns chart rows with the direct engine JSON shape and cursor metadata", () => {
    const job = charts();
    const rows = [...executeSerial(job)];
    expect(rows).toHaveLength(job.totalTasks);
    rows.forEach((row, index) => {
      expect(row).toEqual({
        version: 1, index, nextCursor: index + 1, kind: "charts",
        personId: people[index]!.id, value: json(natalChart(people[index]!.birth)),
      });
      expect(row).toEqual(json(row));
    });
    expect(rows[1]).toMatchObject({ value: { flags: ["no-time"], angles: null, houses: null } });
  });

  it("preserves engine flags for synthetic polar and outside-reference charts", () => {
    const births: Person[] = [
      { id: "synthetic-polar", birth: { utc: "2003-04-05T06:07:08Z", latitude: 78, longitude: 20, houseSystem: "placidus" } },
      { id: "synthetic-historical", birth: { utc: "1703-04-05T06:07:08Z" } },
    ];
    const rows = [...executeSerial(validateJob({ version: 1, kind: "charts", births }))];
    expect(rows[0]).toMatchObject({ value: { flags: ["polar-fallback"], houses: { system: "whole" } } });
    expect(rows[1]).toMatchObject({ value: { flags: ["outside-reference-span"] } });
    rows.forEach((row, i) => { expect(row.value).toEqual(json(natalChart(births[i]!.birth))); });
  });

  it("executes transit snapshots in birth-first order with exact sampled instants", () => {
    const rows = [...executeSerial(grid())];
    const times = ["2005-06-07T08:09:10.001Z", "2005-06-07T08:09:10.003Z"];
    const expected = people.slice(0, 2).flatMap((person, personIndex) => times.map((at, sampleIndex) => ({
      version: 1, kind: "transit-grid", index: personIndex * times.length + sampleIndex,
      nextCursor: personIndex * times.length + sampleIndex + 1,
      personId: person.id, sampleIndex, at, value: json(transits(person.birth, at)),
    })));
    expect(rows).toEqual(expected);
    expect(rows).toEqual(json(rows));
  });

  it("keeps both directions of each synastry pair and preserves argument orientation", () => {
    const rows = [...executeSerial(matrix())];
    const pairs = [[0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1]] as const;
    expect(rows).toEqual(pairs.map(([a, b], index) => ({
      version: 1, kind: "synastry-matrix", index, nextCursor: index + 1,
      aId: people[a]!.id, bId: people[b]!.id,
      value: json(synastry(people[a]!.birth, people[b]!.birth)),
    })));
    expect(rows).toEqual(json(rows));
  });

  it.each([charts, grid, matrix])("resumes a result suffix without changing row identity", (createJob) => {
    const job = createJob();
    const rows = [...executeSerial(job)];
    for (let cursor = 0; cursor <= job.totalTasks; cursor++) {
      expect([...executeSerial(job, cursor)]).toEqual(rows.slice(cursor));
    }
    for (const row of rows) {
      expect(executeWorkItem(workItemAt(job, row.index))).toEqual(row);
    }
  });

  it("does no calculation until pulled and does not precompute the next result", () => {
    const calculate = vi.spyOn(engine, "natalChart");
    const results = executeSerial(charts());
    expect(calculate).not.toHaveBeenCalled();
    expect(results.next().value).toMatchObject({ index: 0 });
    expect(calculate).toHaveBeenCalledTimes(1);
    results.return();
    expect(results.next().done).toBe(true);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it("skips all earlier computations when starting from a cursor", () => {
    const calculate = vi.spyOn(engine, "synastry");
    const job = matrix();
    const rows = [...executeSerial(job, job.totalTasks - 1)];
    expect(rows).toHaveLength(1);
    expect(calculate).toHaveBeenCalledTimes(1);
    if (job.spec.kind !== "synastry-matrix") throw new Error("Expected matrix");
    expect(calculate).toHaveBeenCalledWith(job.spec.people[2]!.birth, job.spec.people[1]!.birth);
  });

  it("isolates returned JSON objects from input snapshots and subsequent results", () => {
    const job = grid();
    const originalJob = json(job);
    const results = executeSerial(job);
    const first = results.next().value;
    if (!first || first.kind !== "transit-grid") throw new Error("Expected transit result");
    first.value.natal.bodies[0]!.lon = -1;
    first.value.natal.input.utc = "changed";
    first.value.positions.length = 0;
    expect(job).toEqual(originalJob);
    const second = results.next().value;
    expect(second).toEqual(executeWorkItem(workItemAt(job, 1)));
  });
});

describe("execution boundaries and failures", () => {
  it("validates resume cursors before returning an iterator, even before calculation", () => {
    const calculate = vi.spyOn(engine, "natalChart");
    const job = charts();
    for (const cursor of [-1, 0.5, NaN, Infinity, job.totalTasks + 1, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => executeSerial(job, cursor)).toThrow(RangeError);
    }
    expect([...executeSerial(job, job.totalTasks)]).toEqual([]);
    expect(calculate).not.toHaveBeenCalled();
  });

  it("reports an unsupported engine instant at its row without advancing past it", () => {
    const births: Person[] = [people[0]!, { id: "synthetic-unsupported", birth: { utc: "0000-01-01T00:00:00Z" } }, people[2]!];
    const job = validateJob({ version: 1, kind: "charts", births });
    const results = executeSerial(job);
    expect(results.next().value).toMatchObject({ index: 0, nextCursor: 1 });
    expect(() => results.next()).toThrow(WorkExecutionError);
    expect(results.next().done).toBe(true);
    expect(() => executeSerial(job, 1).next()).toThrow(expect.objectContaining({
      index: 1, kind: "charts", code: "calculation-failed",
    }));
    expect(executeSerial(job, 2).next().value).toMatchObject({ index: 2, personId: people[2]!.id });
  });

  it.each([grid, matrix])("applies engine range failures to every workload", (createJob) => {
    const original = createJob();
    let job: ValidatedJob;
    if (original.spec.kind === "transit-grid") {
      job = validateJob({ ...original.spec, start: "9999-01-01T00:00:00Z", end: "9999-01-01T00:00:00.001Z" });
    } else if (original.spec.kind === "synastry-matrix") {
      job = validateJob({ ...original.spec, people: [
        { id: "synthetic-unsupported", birth: { utc: "0000-01-01T00:00:00Z" } }, people[1]!,
      ] });
    } else throw new Error("Expected grid or matrix");
    expect(() => executeSerial(job).next()).toThrow(WorkExecutionError);
  });

  it("keeps raw engine errors and submitted birth details out of diagnostics", () => {
    vi.spyOn(engine, "natalChart").mockImplementation(() => { throw new Error("PRIVATE_BIRTH_VALUE"); });
    try {
      executeWorkItem(workItemAt(charts(), 1));
      throw new Error("Expected calculation failure");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkExecutionError);
      expect(error).toMatchObject({ code: "calculation-failed", kind: "charts", index: 1 });
      expect((error as Error).message).toBe("Calculation failed at work item 1 (charts).");
      expect((error as Error).cause).toBeUndefined();
    }
  });

  it.each([NaN, Infinity, -Infinity])("refuses non-finite engine results instead of serializing null", (lon) => {
    const birth: BatchBirth = people[0]!.birth;
    const invalid = natalChart(birth);
    invalid.bodies[0]!.lon = lon;
    vi.spyOn(engine, "natalChart").mockReturnValue(invalid);
    expect(() => executeWorkItem(workItemAt(charts(), 0))).toThrow(WorkExecutionError);
  });
});
