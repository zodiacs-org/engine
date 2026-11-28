import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { z } from "zod";
import { parseNatalEnvelope } from "@zodiacs/engine/receipt";
import { createServer } from "../src/server.js";
import { inputSchemas, type ToolName } from "../src/contracts.js";
import { natalChartTool, natalOutputSchema } from "../src/tools/natal.js";
import { transitsAtTool, transitsNowTool, transitOutputSchema } from "../src/tools/transits.js";
import { synastryTool, synastryOutputSchema } from "../src/tools/synastry.js";
import { solarReturnTool, lunarReturnTool, solarReturnOutputSchema, lunarReturnOutputSchema } from "../src/tools/returns.js";
import { moonPhaseTool, eventSearchTool, moonPhaseOutputSchema, eventSearchOutputSchema } from "../src/tools/events.js";

const birth = { utc: "2000-02-03T04:05:06+02:00", latitude: 12, longitude: 34 };
const at = "2026-01-03T00:00:00Z";
const clock = () => new Date(at);
const cases = [
  { name: "natal_chart", input: { birth }, handler: natalChartTool, schema: natalOutputSchema },
  { name: "transits_at", input: { birth, at }, handler: transitsAtTool, schema: transitOutputSchema },
  { name: "transits_now", input: { birth }, handler: (input: unknown) => transitsNowTool(input, clock), schema: transitOutputSchema },
  { name: "synastry", input: { first: birth, second: { utc: "2002-03-04T05:06:07Z" } }, handler: synastryTool, schema: synastryOutputSchema },
  { name: "solar_return", input: { birth, near: at }, handler: solarReturnTool, schema: solarReturnOutputSchema },
  { name: "lunar_return", input: { birth, after: at }, handler: lunarReturnTool, schema: lunarReturnOutputSchema },
  { name: "moon_phase", input: { at }, handler: moonPhaseTool, schema: moonPhaseOutputSchema },
  { name: "event_search", input: { body: "Sun", longitude: 0, from: at, to: "2026-01-04T00:00:00Z" }, handler: eventSearchTool, schema: eventSearchOutputSchema }
] satisfies { name: ToolName; input: Record<string, unknown>; handler: (input: unknown) => unknown; schema: z.ZodType }[];

describe("MCP tool registration", () => {
  let server: ReturnType<typeof createServer>;
  let client: Client;
  beforeEach(async () => {
    server = createServer({ clock });
    client = new Client({ name: "synthetic-protocol-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterEach(async () => { await client.close(); await server.close(); });

  it("discovers exactly the implemented tools with concrete schemas and read-only annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(Object.keys(inputSchemas).sort());
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    for (const entry of cases) {
      const tool = tools.find((tool) => tool.name === entry.name)!;
      expect(tool.description).toBeTruthy();
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(tool.inputSchema).toMatchObject(z.toJSONSchema(inputSchemas[entry.name]));
      expect(tool.outputSchema).toMatchObject(z.toJSONSchema(entry.schema));
    }
  });

  it.each(cases)("$name preserves the handler output and valid native receipts through the protocol", async ({ name, input, handler, schema }) => {
    const result = await client.callTool({ name, arguments: input });
    expect(result.isError).not.toBe(true);
    expect(result).toMatchObject(handler(input));
    const output = schema.parse(result.structuredContent) as { receipts: { envelope: unknown }[] };
    const text = result.content?.find((item) => item.type === "text");
    expect(text?.type).toBe("text");
    if (text?.type === "text") expect(JSON.parse(text.text)).toEqual(result.structuredContent);
    for (const receipt of output.receipts) expect(parseNatalEnvelope(JSON.stringify(receipt.envelope)).ok).toBe(true);
  });

  it.each(cases)("$name reports invalid arguments as a tool error without fabricated receipts", async ({ name }) => {
    const result = await client.callTool({ name, arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(result.content).toEqual([expect.objectContaining({ type: "text", text: expect.stringContaining("Input validation error") })]);
  });

  it("rejects strict-object extras and birth coordinate and event window refinements", async () => {
    for (const request of [
      { name: "natal_chart", arguments: { birth, extra: true } },
      { name: "natal_chart", arguments: { birth: { utc: birth.utc, latitude: 12 } } },
      { name: "event_search", arguments: { body: "Sun", longitude: 0, from: at, to: birth.utc } }
    ]) expect((await client.callTool(request)).isError).toBe(true);
  });

  it("returns engine refusals as tool errors and remains usable", async () => {
    for (const request of [
      { name: "natal_chart", arguments: { birth: { utc: "9999-01-01T00:00:00Z" } } },
      { name: "lunar_return", arguments: { birth: { ...birth, timeKnown: false }, after: at } }
    ]) {
      const result = await client.callTool(request);
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toBeUndefined();
    }
    expect((await client.callTool({ name: "moon_phase", arguments: { at } })).isError).not.toBe(true);
  });

  it("keeps budget refusals as structured search results with endpoint receipts", async () => {
    const result = await client.callTool({ name: "event_search", arguments: {
      body: "Sun", longitude: 0, from: at, to: "2026-02-03T00:00:00Z", maxSamples: 1
    } });
    expect(result.isError).not.toBe(true);
    const output = eventSearchOutputSchema.parse(result.structuredContent);
    expect(output.data.search).toMatchObject({ status: "refused", reason: "sample-budget", crossings: [] });
    expect(output.receipts.map((receipt) => receipt.role)).toEqual(["search-start", "search-end"]);
  });

  it("rejects unknown tools with a JSON-RPC invalid-params error", async () => {
    await expect(client.callTool({ name: "unknown_tool", arguments: {} })).rejects.toMatchObject({ code: -32602 });
  });
});
