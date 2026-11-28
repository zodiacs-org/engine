import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { ENGINE_VERSION } from "@zodiacs/engine";
import { TZDB } from "@zodiacs/engine/geo";
import { createServer } from "../src/server.js";
import { civilTimeSchema } from "../src/contracts.js";
import { civilTimeOutputSchema, resolveCivilTimeTool } from "../src/tools/civil-time.js";

type Output = z.infer<typeof civilTimeOutputSchema>;
const vectors = JSON.parse(readFileSync(new URL("../../conformance/vectors/L3-time-calendars.json", import.meta.url), "utf8")) as {
  vectors: { id: string; kind: string; input: { zone: string; local: string };
    expected: { status: string; utc_offset_s?: number; utc_offsets_s?: number[] } }[];
};
// The engine resolves wall times to the minute, as the conformance adapter does.
const applicable = vectors.vectors.filter((vector) => vector.kind === "time.zone-offset" && vector.input.local.endsWith(":00"));
const seconds = (minutes: number) => {
  const value = minutes * 60;
  expect(Math.abs(value - Math.round(value))).toBeLessThan(1e-6);
  return Math.round(value);
};

describe("resolve_civil_time", () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;
  const fetchSpy = vi.fn(() => { throw new Error("network access in a civil time test"); });
  beforeEach(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    server = createServer();
    client = new Client({ name: "synthetic-civil-time-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    // Listing caches the advertised output schema, which the client then validates against.
    await client.listTools();
  });
  afterEach(async () => {
    await client.close(); await server.close();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  async function call(args: Record<string, unknown>) {
    const result = await client.callTool({ name: "resolve_civil_time", arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    const text = result.content?.find((item) => item.type === "text");
    if (text?.type !== "text") throw new Error("Missing JSON text content.");
    expect(JSON.parse(text.text)).toEqual(result.structuredContent);
    return civilTimeOutputSchema.parse(result.structuredContent);
  }

  it("advertises nine tools and strict schemas for the civil time tool", async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(9);
    const tool = tools.find((entry) => entry.name === "resolve_civil_time")!;
    expect(tool.description).toContain("ask the person");
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    expect(tool.inputSchema).toMatchObject(z.toJSONSchema(civilTimeSchema));
    expect(tool.inputSchema).toMatchObject({ additionalProperties: false, required: ["date", "time", "timeZone"] });
    expect(tool.outputSchema).toMatchObject(z.toJSONSchema(civilTimeOutputSchema));
    expect(tool.outputSchema).toMatchObject({ additionalProperties: false });
  });

  it("reports a skipped wall time as a gap, moved forward by the jump", async () => {
    const output = await call({ date: "2026-03-08", time: "02:30", timeZone: "America/New_York" });
    expect(output.data.status).toBe("gap");
    expect(output.data.resolution).toMatchObject({
      utc: "2026-03-08T07:30:00.000Z", offsetMinutes: -240, flags: ["dst-gap"], jump: { kind: "gap", cause: "dst" },
      transition: { at: "2026-03-08T07:00:00.000Z", offsetBeforeMinutes: -300, offsetAfterMinutes: -240 },
      localResolution: { gapShiftMinutes: 60, policy: { fold: "earlier", gap: "shift-forward" } }
    });
  });

  it("reports a repeated wall time as a fold, giving the earlier instant", async () => {
    const output = await call({ date: "2026-11-01", time: "01:30:00", timeZone: "America/New_York" });
    expect(output.data.status).toBe("fold");
    expect(output.data.request.time).toBe("01:30:00");
    expect(output.data.resolution).toMatchObject({
      utc: "2026-11-01T05:30:00.000Z", offsetMinutes: -240, flags: ["dst-fold"], jump: { kind: "fold", cause: "dst" },
      transition: { offsetBeforeMinutes: -240, offsetAfterMinutes: -300 }
    });
  });

  it("reads a 19th century wall time on the birthplace's local mean time", async () => {
    const output = await call({ date: "1870-06-15", time: "12:00", timeZone: "America/New_York", longitude: -78.88 });
    expect(output.data.status).toBe("resolved");
    expect(output.data.resolution).toMatchObject({
      utc: "1870-06-15T17:15:31.000Z", flags: ["lmt"], jump: null,
      localMeanTime: { longitude: -78.88 }, zone: { source: "tzdb", tzdbVersion: TZDB.version, dataForm: "main+backzone" },
      localResolution: { clock: "local-mean-time" }
    });
    expect(output.record).toEqual({
      role: "time-resolution", engine: { name: "@zodiacs/engine", version: ENGINE_VERSION },
      shippedTzdb: { version: TZDB.version, sha256: TZDB.sha256, form: TZDB.form },
      answeredBy: { source: "tzdb", tzdbVersion: TZDB.version, dataForm: "main+backzone" }
    });
  });

  it("converts a Julian date and notes a New Style country", async () => {
    // Julian and Gregorian dates differ by 12 days from 1700-03-01 to 1800-02-28 Julian.
    const output = await call({ date: "1800-01-01", time: "12:00", timeZone: "Europe/London", calendar: "julian", country: "GB" });
    expect(output.data.resolution).toMatchObject({
      date: "1800-01-12", writtenDate: "1800-01-01", calendar: "julian",
      calendarNote: { kind: "new-style", adoption: { code: "GB", firstGregorian: "1752-09-14" } }
    });
    const gregorian = await call({ date: "1700-03-01", time: "12:00", timeZone: "Europe/London", country: "GB" });
    expect(gregorian.data.resolution.calendarNote?.kind).toBe("old-style");
    const leap = await call({ date: "1700-02-29", time: "12:00", timeZone: "Europe/London", calendar: "julian" });
    expect(leap.data.resolution.date).toBe("1700-03-11");
  });

  it("returns unknown zones, malformed dates and times, and extra keys as tool errors", async () => {
    for (const args of [
      { date: "2026-03-08", time: "02:30", timeZone: "Mars/Olympus_Mons" },
      { date: "2026-13-01", time: "12:00", timeZone: "UTC" },
      { date: "2026-02-30", time: "12:00", timeZone: "UTC" },
      { date: "1700-02-29", time: "12:00", timeZone: "Europe/London" },
      { date: "26-03-08", time: "12:00", timeZone: "UTC" },
      { date: "2026-03-08", time: "24:00", timeZone: "UTC" },
      { date: "2026-03-08", time: "12:00:30", timeZone: "UTC" },
      { date: "2026-03-08", time: "12:00", timeZone: "../UTC" },
      { date: "2026-03-08", time: "12:00", timeZone: "UTC", longitude: 181 },
      { date: "2026-03-08", time: "12:00", timeZone: "UTC", place: "Paris" },
      { date: "2026-03-08", time: "12:00" }
    ]) {
      const result = await client.callTool({ name: "resolve_civil_time", arguments: args });
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    }
    expect((await call({ date: "2026-03-08", time: "12:00", timeZone: "UTC" })).data.status).toBe("resolved");
  });

  it(`matches all ${applicable.length} applicable L3 zone offset conformance vectors`, async () => {
    expect(applicable).toHaveLength(45);
    for (const vector of applicable) {
      const [date, time] = vector.input.local.split("T") as [string, string];
      const { data } = await call({ date, time, timeZone: vector.input.zone });
      const { resolution } = data;
      let actual: Record<string, unknown>;
      if (data.status === "gap") actual = { status: "nonexistent" };
      else if (data.status === "fold") {
        expect(resolution.transition?.offsetBeforeMinutes, vector.id).toBe(resolution.offsetMinutes);
        actual = { status: "ambiguous", utc_offsets_s: [seconds(resolution.transition!.offsetBeforeMinutes),
          seconds(resolution.transition!.offsetAfterMinutes)] };
      } else actual = { status: "ok", utc_offset_s: seconds(resolution.offsetMinutes) };
      expect(actual, vector.id).toEqual(vector.expected);
    }
  });

  it("returns the same result through the protocol as the handler", async () => {
    const args = { date: "1883-11-18", time: "12:02", timeZone: "America/New_York", longitude: -74.006 };
    const result = await client.callTool({ name: "resolve_civil_time", arguments: args });
    expect(result).toMatchObject(await resolveCivilTimeTool(args));
    expect((result.structuredContent as Output).data).toMatchObject({ status: "fold", resolution: { flags: ["dst-fold", "lmt"] } });
  });
});
