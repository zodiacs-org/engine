import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIMITS,
  JobValidationError,
  parseJobJson,
  validateJob,
} from "../src/index.js";
import type { ValidationCode, ValidationLimits } from "../src/index.js";

// Every instant and identifier below is invented for these tests.
const person = (id = "synthetic-a") => ({ id, birth: { utc: "2001-02-03T04:05:06Z" } });
const charts = () => ({ version: 1, kind: "charts", births: [person()] });
const grid = (end = "2002-01-01T00:00:03Z", stepMs = 1_000) => ({
  version: 1,
  kind: "transit-grid",
  births: [person(), person("synthetic-b")],
  start: "2002-01-01T00:00:00Z",
  end,
  stepMs,
});

function rejected(
  action: () => unknown,
  code: ValidationCode = "invalid-input",
  path?: string,
): JobValidationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(JobValidationError);
    const validationError = error as JobValidationError;
    expect(validationError.name).toBe("JobValidationError");
    expect(validationError.code).toBe(code);
    if (path !== undefined) expect(validationError.path).toBe(path);
    return validationError;
  }
  throw new Error("Expected job validation to reject");
}

describe("job contracts and canonical snapshots", () => {
  it("counts chart rows without computing astronomical results", () => {
    const births = Array.from({ length: 2_000 }, (_, index) => person(`synthetic-${index}`));
    const result = validateJob({ version: 1, kind: "charts", births });
    expect(result.totalTasks).toBe(births.length);
    expect(result.spec.kind).toBe("charts");
    expect(result).not.toHaveProperty("results");
  });

  it.each([[2, 2], [3, 6], [4, 12]])("counts all directed pairs for %i people", (count, total) => {
    const people = Array.from({ length: count }, (_, index) => person(`synthetic-${index}`));
    const result = validateJob({ version: 1, kind: "synastry-matrix", people });
    expect(result.totalTasks).toBe(total);
    expect(result.spec.kind).toBe("synastry-matrix");
    if (result.spec.kind === "synastry-matrix") {
      expect(result.spec.people.map((row) => row.id)).toEqual(people.map((row) => row.id));
    }
  });

  it.each([
    ["2002-01-01T00:00:03Z", 1_000, 6],
    ["2002-01-01T00:00:03.001Z", 1_000, 8],
    ["2002-01-01T00:00:00.001Z", 1_000, 2],
    ["2002-01-01T00:00:03Z", 3_000, 2],
    ["2002-01-01T00:00:03Z", Number.MAX_SAFE_INTEGER, 2],
  ])("counts a half-open grid ending %s with step %i ms", (end, stepMs, total) => {
    expect(validateJob(grid(end, stepMs)).totalTasks).toBe(total);
  });

  it("takes a deeply frozen snapshot with explicit defaults and canonical instants", () => {
    const input = {
      ...charts(),
      births: [{ id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06.7Z", latitude: -0, longitude: -0 } }],
    };
    const result = validateJob(input);
    expect(result.spec).toEqual({
      version: 1,
      kind: "charts",
      births: [{ id: "synthetic-a", birth: {
        utc: "2001-02-03T04:05:06.700Z", latitude: 0, longitude: 0,
        houseSystem: "whole", timeKnown: true,
      } }],
    });
    if (result.spec.kind !== "charts") throw new Error("Expected charts job");
    const row = result.spec.births[0]!;
    expect([result, result.spec, result.spec.births, row, row.birth].every(Object.isFrozen)).toBe(true);
    expect(Object.is(row.birth.latitude, -0)).toBe(false);
    expect(Object.is(row.birth.longitude, -0)).toBe(false);
    input.births[0]!.id = "changed";
    input.births[0]!.birth.utc = "2005-01-01T00:00:00Z";
    input.births.push({ id: "later", birth: { utc: "2001-01-01T00:00:00Z", latitude: 1, longitude: 1 } });
    expect(row.id).toBe("synthetic-a");
    expect(row.birth.utc).toBe("2001-02-03T04:05:06.700Z");
    expect(result.spec.births).toHaveLength(1);
    expect(validateJob(result.spec)).toEqual(result);
  });

  it.each(["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch",
    "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"])(
    "preserves supported settings for %s", (houseSystem) => {
      const birth = { utc: "2000-02-29T12:00:00Z", latitude: -90, longitude: 180, timeKnown: false, houseSystem };
      const result = validateJob({ ...charts(), births: [{ id: "synthetic-a", birth }] });
      expect(result.spec).toMatchObject({ births: [{ birth: { ...birth, utc: "2000-02-29T12:00:00.000Z" } }] });
    },
  );

  it.each(["0000-01-01T00:00:00Z", "0099-12-31T23:59:59.12Z", "9999-12-31T23:59:59.999Z"])(
    "validates calendar syntax independently of later ephemeris evaluation: %s", (utc) => {
      expect(validateJob({ ...charts(), births: [{ id: "synthetic-a", birth: { utc } }] }).totalTasks).toBe(1);
    },
  );
});

describe("strict JSON input validation", () => {
  it.each([
    "2001-02-03", "2001-02-03T04:05Z", "2001-02-03T04:05:06", "2001-02-03T04:05:06+00:00",
    "2001-02-03T04:05:06-03:00", "2001-02-03t04:05:06z", "2001-02-03T04:05:06.1234Z",
    "2001-02-03T04:05:06Z\n", "2001-02-03T04:05:06Z\r\n", " 2001-02-03T04:05:06Z",
    "2001-02-29T04:05:06Z", "1900-02-29T04:05:06Z", "2001-04-31T04:05:06Z",
    "2001-00-01T00:00:00Z", "2001-13-01T00:00:00Z", "2001-01-00T00:00:00Z",
    "2001-01-01T24:00:00Z", "2001-01-01T23:60:00Z", "2001-01-01T23:59:60Z",
    "+002001-01-01T00:00:00Z", "not-an-instant", 0, NaN, null, new Date("2001-01-01T00:00:00Z"),
  ])("rejects unsupported birth instant %s", (utc) => {
    rejected(() => validateJob({ ...charts(), births: [{ id: "synthetic-a", birth: { utc } }] }),
      "invalid-input", "job.births[0].birth.utc");
  });

  it.each([null, undefined, [], false, 1, "job", new Date(), new Map()])("rejects non-record jobs", (value) => {
    rejected(() => validateJob(value), "invalid-input", "job");
  });

  it.each([{}, { ...charts(), version: "1" }, { ...charts(), version: 2 }])("rejects unsupported versions", (value) => {
    rejected(() => validateJob(value), "unsupported-version", "job.version");
  });

  it.each([
    { ...charts(), kind: "event-search" }, { ...charts(), kind: null },
    { ...charts(), extra: true }, { ...charts(), people: [] }, { ...charts(), stepMs: 1 },
    { ...charts(), births: [] }, { ...charts(), births: null },
    { ...charts(), births: [person(), person()] },
    { version: 1, kind: "synastry-matrix", people: [person()] },
    { version: 1, kind: "synastry-matrix", people: [person(), person("synthetic-b")], births: [] },
  ])("rejects malformed kinds, fields and rows", (value) => { rejected(() => validateJob(value)); });

  it.each([
    { latitude: 0 }, { longitude: 0 }, { latitude: null, longitude: 0 },
    { latitude: "0", longitude: 0 }, { latitude: 90.001, longitude: 0 },
    { latitude: 0, longitude: -180.001 }, { latitude: Infinity, longitude: 0 },
    { latitude: 0, longitude: NaN }, { houseSystem: null }, { houseSystem: "Whole" },
    { houseSystem: "unknown" }, { timeKnown: null }, { timeKnown: 0 }, { timeKnown: "false" },
    { timeScale: "tt" }, { deltaT: 0 }, { flags: [] }, { UTC: "2001-01-01T00:00:00Z" },
    { houseSystem: undefined },
  ])("rejects malformed or unsupported birth fields", (settings) => {
    rejected(() => validateJob({ ...charts(), births: [{ id: "synthetic-a", birth: { ...person().birth, ...settings } }] }));
  });

  it.each(["", "-leading", ".leading", "has space", "synthetic\n", "synthetic\r", "é", "😀", "a".repeat(81), 1, null])(
    "rejects unsupported identifiers", (id) => {
      rejected(() => validateJob({ ...charts(), births: [{ ...person(), id }] }), "invalid-input", "job.births[0].id");
    },
  );

  it("accepts distinct case-sensitive identifiers and the identifier length boundary", () => {
    const births = ["A", "a", "z._:-0", "a".repeat(80)].map(person);
    expect(validateJob({ ...charts(), births }).totalTasks).toBe(births.length);
  });

  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1000", null])("rejects invalid grid steps", (stepMs) => {
    rejected(() => validateJob({ ...grid(), stepMs }), "invalid-input", "job.stepMs");
  });

  it.each(["2002-01-01T00:00:00Z", "2001-12-31T23:59:59Z"])("rejects empty or reversed grids", (end) => {
    rejected(() => validateJob(grid(end)), "invalid-input", "job.end");
  });

  it.each(["start", "end"])("applies instant validation to grid %s", (field) => {
    rejected(() => validateJob({ ...grid(), [field]: "2002-01-01" }), "invalid-input", `job.${field}`);
  });

  it("rejects sparse arrays, accessors and extra array fields without reading getters", () => {
    rejected(() => validateJob({ ...charts(), births: new Array(1) }));
    const getter = vi.fn(() => person());
    const accessorRows: unknown[] = [person()];
    Object.defineProperty(accessorRows, "0", { get: getter, enumerable: true });
    rejected(() => validateJob({ ...charts(), births: accessorRows }));
    expect(getter).not.toHaveBeenCalled();
    const extraRows = [person()];
    Object.defineProperty(extraRows, "extra", { value: true, enumerable: true });
    rejected(() => validateJob({ ...charts(), births: extraRows }));
    const hiddenRows = [person()];
    Object.defineProperty(hiddenRows, "0", { value: person(), enumerable: false });
    rejected(() => validateJob({ ...charts(), births: hiddenRows }));
  });

  it("rejects non-JSON object fields without evaluating them", () => {
    const getter = vi.fn(() => "charts");
    const accessorJob = charts();
    Object.defineProperty(accessorJob, "kind", { get: getter, enumerable: true });
    rejected(() => validateJob(accessorJob));
    expect(getter).not.toHaveBeenCalled();
    const hiddenJob = charts();
    Object.defineProperty(hiddenJob, "kind", { value: "charts", enumerable: false });
    rejected(() => validateJob(hiddenJob));
    rejected(() => validateJob({ ...charts(), [Symbol("extra")]: true }));
    rejected(() => validateJob({ ...charts(), births: [{ ...person(), extra: true }] }));
  });

  it("reports only fixed descriptions and schema paths, excluding supplied values", () => {
    const marker = "PRIVATE_SUBMITTED_VALUE";
    const errors = [
      rejected(() => validateJob({ ...charts(), [marker]: marker })),
      rejected(() => validateJob({ ...charts(), kind: marker })),
      rejected(() => validateJob({ ...charts(), births: [person(marker), person(marker)] })),
      rejected(() => validateJob({ ...charts(), births: [{ id: "synthetic-a", birth: { utc: marker } }] })),
      rejected(() => parseJobJson(`{"${marker}":`)),
    ];
    for (const error of errors) {
      expect(error.message).not.toContain(marker);
      expect(error.path).not.toContain(marker);
      expect(error.cause).toBeUndefined();
    }
  });
});

describe("resource limits and JSON parsing", () => {
  it("enforces input byte limits before attempting JSON parsing", () => {
    const malformed = "😀";
    expect(malformed.length).toBe(2);
    expect(Buffer.byteLength(malformed)).toBe(4);
    rejected(() => parseJobJson(malformed, { maxInputBytes: 3 }), "limit-exceeded", "job");
    rejected(() => parseJobJson(malformed, { maxInputBytes: 4 }), "invalid-input", "job");
  });

  it("accepts the exact byte budget and rejects the next byte", () => {
    const text = JSON.stringify(charts());
    const bytes = Buffer.byteLength(text, "utf8");
    expect(parseJobJson(text, { maxInputBytes: bytes })).toEqual(validateJob(charts()));
    rejected(() => parseJobJson(`${text} `, { maxInputBytes: bytes }), "limit-exceeded");
  });

  it("parses JSON through the same schema checks and hides syntax details", () => {
    rejected(() => parseJobJson(JSON.stringify({ ...charts(), extra: true })));
    rejected(() => parseJobJson("null"));
    rejected(() => parseJobJson("{broken json"));
    rejected(() => parseJobJson(1 as unknown as string));
  });

  it("allows exact row/task limits and rejects work above either", () => {
    const input = { ...charts(), births: [person(), person("synthetic-b")] };
    expect(validateJob(input, { maxPeople: 2, maxTasks: 2 }).totalTasks).toBe(2);
    rejected(() => validateJob(input, { maxPeople: 1 }), "limit-exceeded", "job.births");
    rejected(() => validateJob(input, { maxTasks: 1 }), "limit-exceeded", "job");
    expect(validateJob(grid(), { maxTasks: 6 }).totalTasks).toBe(6);
    rejected(() => validateJob(grid(), { maxTasks: 5 }), "limit-exceeded", "job");
    const matrix = { version: 1, kind: "synastry-matrix", people: [person(), person("synthetic-b"), person("synthetic-c")] };
    expect(validateJob(matrix, { maxTasks: 6 }).totalTasks).toBe(6);
    rejected(() => validateJob(matrix, { maxTasks: 5 }), "limit-exceeded", "job");
  });

  it("enforces default people and task ceilings", () => {
    expect(DEFAULT_LIMITS).toEqual({ maxInputBytes: 1_000_000, maxPeople: 10_000, maxTasks: 1_000_000 });
    const births = Array.from({ length: DEFAULT_LIMITS.maxPeople + 1 }, (_, i) => person(`synthetic-${i}`));
    rejected(() => validateJob({ ...charts(), births }), "limit-exceeded", "job.births");
    expect(validateJob({ ...charts(), births: births.slice(0, DEFAULT_LIMITS.maxPeople) }).totalTasks).toBe(DEFAULT_LIMITS.maxPeople);
    const end = new Date(Date.parse(grid().start) + DEFAULT_LIMITS.maxTasks / 2 * 1_000).toISOString();
    expect(validateJob(grid(end)).totalTasks).toBe(DEFAULT_LIMITS.maxTasks);
    const nextEnd = new Date(Date.parse(end) + 1).toISOString();
    rejected(() => validateJob(grid(nextEnd)), "limit-exceeded", "job");
    rejected(() => validateJob({ ...grid("2003-01-01T00:00:00Z", 1) }), "limit-exceeded", "job");
    expect(Object.isFrozen(DEFAULT_LIMITS)).toBe(true);
  });

  it("enforces the default UTF-8 byte ceiling inclusively", () => {
    const text = JSON.stringify(charts()).padEnd(DEFAULT_LIMITS.maxInputBytes, " ");
    expect(parseJobJson(text).totalTasks).toBe(1);
    rejected(() => parseJobJson(`${text} `), "limit-exceeded", "job");
  });

  it("refuses unsafe total workloads using exact counts without expanding grid samples", () => {
    const input = {
      ...grid(),
      births: Array.from({ length: 32 }, (_, index) => person(`synthetic-${index}`)),
      start: "0000-01-01T00:00:00Z",
      end: "9999-12-31T23:59:59.999Z",
      stepMs: 1,
    };
    rejected(() => validateJob(input, { maxTasks: Number.MAX_SAFE_INTEGER }), "limit-exceeded", "job");
  });

  it.each(["maxInputBytes", "maxPeople", "maxTasks"])("validates override %s", (name) => {
    for (const invalid of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1", null, undefined]) {
      const limits = { [name]: invalid } as unknown as Partial<ValidationLimits>;
      rejected(() => validateJob(charts(), limits));
      rejected(() => parseJobJson(JSON.stringify(charts()), limits));
    }
  });

  it("rejects unknown limits rather than silently omitting them", () => {
    rejected(() => validateJob(charts(), { maxTask: 1 } as unknown as Partial<ValidationLimits>));
  });
});
