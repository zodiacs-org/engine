import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createServer } from "../src/server.js";

const page = readFileSync(new URL("../../docs/agents/MCP-TOOLS.md", import.meta.url), "utf8");
// Each "## `tool`" section runs to the next level-two heading.
const sections = [...page.matchAll(/^## `([a-z_]+)`\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map(([, name, body]) => ({
  name: name!, blocks: [...body!.matchAll(/```json\n([\s\S]*?)```/g)].map(([, json]) => JSON.parse(json!) as unknown)
}));

/** Every key shown has the value shown; a list matches in full unless it ends with "...". */
function expectContained(actual: unknown, excerpt: unknown, path: string): void {
  if (Array.isArray(excerpt)) {
    expect(Array.isArray(actual), path).toBe(true);
    const list = actual as unknown[];
    const prefix = excerpt.at(-1) === "...";
    const shown = prefix ? excerpt.slice(0, -1) : excerpt;
    if (prefix) expect(list.length, path).toBeGreaterThanOrEqual(shown.length);
    else expect(list.length, path).toBe(shown.length);
    shown.forEach((item, index) => expectContained(list[index], item, `${path}[${index}]`));
  } else if (excerpt !== null && typeof excerpt === "object") {
    expect(actual !== null && typeof actual === "object" && !Array.isArray(actual), path).toBe(true);
    for (const [key, value] of Object.entries(excerpt)) {
      expect(Object.hasOwn(actual as object, key), `${path}.${key}`).toBe(true);
      expectContained((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
  } else expect(actual, path).toEqual(excerpt);
}

describe("docs/agents/MCP-TOOLS.md", () => {
  const server = createServer({ clock: () => new Date("2026-01-03T00:00:00Z") });
  const client = new Client({ name: "synthetic-docs-test", version: "0.0.0" });
  beforeAll(async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterAll(async () => { await client.close(); await server.close(); });

  it("names exactly the tools that tools/list returns", async () => {
    const { tools } = await client.listTools();
    expect(sections.map(({ name }) => name).sort()).toEqual(tools.map(({ name }) => name).sort());
  });

  it("shows excerpts contained in the actual output of each example", async () => {
    await client.listTools();
    for (const { name, blocks } of sections) {
      expect(blocks, name).toHaveLength(2);
      const result = await client.callTool({ name, arguments: blocks[0] as Record<string, unknown> });
      expect(result.isError, name).not.toBe(true);
      expectContained(result.structuredContent, blocks[1], name);
    }
  });

  it("rejects an excerpt that differs from the output", () => {
    expect(() => expectContained({ a: [1, 2] }, { a: [1] }, "list")).toThrow();
    expect(() => expectContained({ a: [1, 2] }, { a: [1, "..."] }, "prefix")).not.toThrow();
    expect(() => expectContained({ a: { b: 1 } }, { a: { b: 2 } }, "value")).toThrow();
    expect(() => expectContained({ a: {} }, { a: { b: undefined } }, "key")).toThrow();
  });
});
