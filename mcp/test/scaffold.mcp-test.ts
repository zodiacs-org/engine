import { describe, expect, it } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { ENGINE_VERSION, natalChart } from "@zodiacs/engine";
import {
  createNatalEnvelope,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "@zodiacs/engine/receipt";
import { createServer } from "../src/server.js";

describe("package scaffold", () => {
  it("initializes the official SDK with the server identity", async () => {
    const server = createServer();
    const client = new Client({ name: "scaffold-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()).toEqual({
        name: "zodiacs-astro", version: "0.0.0"
      });
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("loads the carried engine and round-trips a synthetic natal receipt", () => {
    const chart = natalChart({ utc: "2000-02-03T04:05:06Z", timeKnown: false });
    const envelope = createNatalEnvelope(chart);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(chart.engineVersion).toBe(ENGINE_VERSION);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.envelope).toEqual(envelope);
  });
});
