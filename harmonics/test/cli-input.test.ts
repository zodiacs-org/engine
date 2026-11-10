import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { CliError, MAX_INPUT_BYTES, MAX_JSON_DEPTH, parseChartRequest } from "../src/cli-input.js";
import { parseChartArguments, readInput } from "../src/cli.js";

const points = { points: [{ body: "A", lon: -0.5 }, { body: "B", lon: 360.25, speed: -0.25 }] };
const birth = { utc: "2002-04-06T05:00:00+02:00", latitude: 12, longitude: 24 };
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));

describe("CLI JSON boundary", () => {
  it("accepts supplied longitudes and preserves optional speeds without inventing them", () => {
    const request = parseChartRequest(bytes(points));
    expect(request).toEqual({ mode: "points", points: points.points });
    if (request.mode === "points") expect(Object.hasOwn(request.points[0]!, "speed")).toBe(false);
  });

  it("preserves original instant spelling, explicit settings and flags", () => {
    const input = { ...birth, timeScale: "tt", deltaT: 64, houseSystem: "placidus",
      timeKnown: false, flags: ["lmt", "lmt", "no-time"] };
    expect(parseChartRequest(bytes({ birth: input }))).toEqual({ mode: "birth", birth: input });
    // Numeric dates remain epoch milliseconds, without manufacturing an ISO source spelling.
    expect(parseChartRequest(bytes({ birth: { utc: 1018062000000 } })))
      .toEqual({ mode: "birth", birth: { utc: 1018062000000 } });
  });

  it.each([
    null, [], {}, { points: [] }, { points: null }, { birth: null },
    { points: points.points, birth }, { Points: points.points }, { points: points.points, note: "extra" },
    { points: [{ body: "A", lon: 0, latitude: 0 }] },
    { points: [{ body: "A", lon: "0" }] }, { points: [{ body: " A", lon: 0 }] },
    { points: [{ body: "A", lon: null }] }, { points: [null] },
    { points: [{ body: "A", lon: 0 }, { body: "A", lon: 1 }] },
    { points: [{ body: "A", lon: 0, speed: null }] },
    { points: [{ body: "A", lon: 0, speed: "1" }] },
    { birth: { ...birth, UTC: birth.utc } }, { birth: { ...birth, timeZone: "UTC" } },
    { birth: { ...birth, timeScale: null } }, { birth: { ...birth, timeScale: "TT" } },
    { birth: { ...birth, houseSystem: null } }, { birth: { ...birth, timeKnown: null } },
    { birth: { ...birth, latitude: null } }, { birth: { ...birth, longitude: 181 } },
    { birth: { utc: birth.utc, latitude: 12 } }, { birth: { utc: {} } },
    { birth: { utc: "2002-02-30T00:00:00Z" } }, { birth: { utc: "2002-04-06T03:00" } },
    { birth: { ...birth, deltaT: null } }, { birth: { ...birth, deltaT: 1e11 } },
    { birth: { ...birth, flags: ["other"] } }, { birth: { ...birth, flags: null } },
    { birth: { ...birth, flags: ["dst-gap", "dst-fold"] } }
  ].map((input) => ({ input })))("rejects malformed or unsupported input $input", ({ input }) => {
    expect(() => parseChartRequest(bytes(input))).toThrow(CliError);
  });

  it.each([
    "", "{", '{"points":[]} extra', '{"points":[],}',
    '{"points":[{"body":"A","lon":0}],"points":[{"body":"B","lon":1}]}',
    '{"points":[{"body":"A","lon":0,"\\u006con":1}]}',
    '{"birth":{"utc":"2002-04-06","utc":"2003-04-06"}}',
    '{"points":[{"body":"A","lon":1e400}]}',
    '{"points":[{"body":"A","lon":0,"speed":1e400}]}',
    '\ufeff{"points":[]}'
  ])("rejects invalid, ambiguous or non-finite JSON %j", (input) => {
    expect(() => parseChartRequest(Buffer.from(input))).toThrow(CliError);
  });

  it("scopes duplicate checks to each object and decodes string escapes", () => {
    const input = '{"points":[{"body":"{\\\"A\\\"}","lon":0},{"body":"\\u0042","lon":1}]}';
    expect(parseChartRequest(Buffer.from(input))).toEqual({ mode: "points", points: [
      { body: '{"A"}', lon: 0 }, { body: "B", lon: 1 }
    ] });
  });

  it("counts bytes including whitespace and rejects invalid UTF-8 and excessive depth", () => {
    expect(MAX_INPUT_BYTES).toBe(65536);
    expect(MAX_JSON_DEPTH).toBe(16);
    const input = bytes(points);
    const atLimit = Buffer.concat([input, Buffer.alloc(MAX_INPUT_BYTES - input.length, 32)]);
    expect(parseChartRequest(atLimit).mode).toBe("points");
    expect(() => parseChartRequest(Buffer.concat([atLimit, Buffer.from(" ")]))).toThrow(/byte limit/u);
    expect(() => parseChartRequest(Buffer.from([0xff]))).toThrow(/UTF-8/u);
    const nested = "[".repeat(MAX_JSON_DEPTH + 1) + "0" + "]".repeat(MAX_JSON_DEPTH + 1);
    expect(() => parseChartRequest(Buffer.from(nested))).toThrow(/nesting limit/u);
  });

  it("bounds stream input and rejoins split UTF-8 bytes before decoding", async () => {
    const input = bytes({ points: [{ body: "α", lon: 0 }] });
    const split = input.indexOf(Buffer.from("α")) + 1;
    const loaded = await readInput("-", Readable.from([input.subarray(0, split), input.subarray(split)]));
    expect(parseChartRequest(loaded)).toEqual({ mode: "points", points: [{ body: "α", lon: 0 }] });
    await expect(readInput("-", Readable.from([Buffer.alloc(MAX_INPUT_BYTES), Buffer.from("x")])))
      .rejects.toMatchObject({ code: "invalid-input" });
    const failing = new Readable({ read() { this.destroy(new Error("Private input detail")); } });
    await expect(readInput("-", failing)).rejects.toMatchObject({
      code: "input-read", message: "Could not read the local input file or stdin."
    });
  });
});

describe("CLI argument boundary", () => {
  it("requires input explicitly, resolves defaults and handles help without reading", () => {
    expect(parseChartArguments(["chart", "--input", "-"])).toEqual({
      input: "-", harmonic: 1, maxHarmonic: 180, includeAngles: false, includeChartPoints: false
    });
    expect(parseChartArguments(["--help"])).toBe("help");
    expect(parseChartArguments(["chart", "--help"])).toBe("help");
    expect(parseChartArguments(["chart", "--include-angles", "--max-harmonic", "720",
      "--input", "file name.json", "--harmonic", "720", "--include-chart-points"]))
      .toMatchObject({ input: "file name.json", harmonic: 720, maxHarmonic: 720,
        includeAngles: true, includeChartPoints: true });
  });

  it.each([
    [], ["spectrum"], ["chart"], ["chart", "--input"], ["chart", "--input", ""],
    ["chart", "--input", "-", "--input", "other"], ["chart", "--input", "-", "extra"],
    ["chart", "--input", "-", "--help"], ["chart", "--input", "-", "--harmonic"],
    ["chart", "--input", "-", "--harmonic", "--include-angles"],
    ["chart", "--input", "-", "--include-angles", "--include-angles"],
    ["chart", "--input", "-", "--unknown"], ["chart", "--input=-"],
    ...["0", "-1", "+1", "1.5", "01", "1e2", "0x4", "NaN", "Infinity", " 2", "2\n",
      "9007199254740992", "181"].map((n) => ["chart", "--input", "-", "--harmonic", n]),
    ["chart", "--input", "-", "--max-harmonic", "0"],
    ["chart", "--input", "-", "--harmonic", "3", "--max-harmonic", "2"]
  ].map((args) => ({ args })))("rejects ambiguous or unsupported arguments $args", ({ args }) => {
    expect(() => parseChartArguments(args)).toThrow(CliError);
  });
});
