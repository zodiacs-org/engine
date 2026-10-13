import { McpServer } from "@modelcontextprotocol/server";
import { inputSchemas } from "./contracts.js";
import { natalChartTool, natalOutputSchema } from "./tools/natal.js";
import { transitsAtTool, transitsNowTool, transitOutputSchema, type Clock } from "./tools/transits.js";
import { synastryTool, synastryOutputSchema } from "./tools/synastry.js";
import { solarReturnTool, lunarReturnTool, solarReturnOutputSchema, lunarReturnOutputSchema } from "./tools/returns.js";
import { moonPhaseTool, eventSearchTool, moonPhaseOutputSchema, eventSearchOutputSchema } from "./tools/events.js";

/** Creates an unconnected server with validated tools and native calculation receipts. */
export function createServer(options: { clock?: Clock } = {}): McpServer {
  const server = new McpServer({ name: "zodiacs-astro", version: "0.0.0" });
  const annotations = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  server.registerTool("natal_chart", {
    description: "Calculate a tropical natal chart from a resolved instant. Returns a native natal receipt; unknown time suppresses houses and angles.",
    inputSchema: inputSchemas.natal_chart, outputSchema: natalOutputSchema, annotations
  }, natalChartTool);
  server.registerTool("transits_at", {
    description: "Calculate moving-to-natal aspects at a resolved instant, with separate natal and transit sky receipts.",
    inputSchema: inputSchemas.transits_at, outputSchema: transitOutputSchema, annotations
  }, transitsAtTool);
  server.registerTool("transits_now", {
    description: "Capture the current instant once and calculate moving-to-natal aspects, with natal and transit sky receipts.",
    inputSchema: inputSchemas.transits_now, outputSchema: transitOutputSchema, annotations
  }, (input) => transitsNowTool(input, options.clock));
  server.registerTool("synastry", {
    description: "Compare two natal charts with native aspects and element/modality counts. Returns separate natal receipts; no compatibility score or relationship prediction.",
    inputSchema: inputSchemas.synastry, outputSchema: synastryOutputSchema, annotations
  }, synastryTool);
  server.registerTool("solar_return", {
    description: "Find the nearest or most recent solar longitude return and cast its chart. Receipts cover natal and return charts, not search completeness.",
    inputSchema: inputSchemas.solar_return, outputSchema: solarReturnOutputSchema, annotations
  }, solarReturnTool);
  server.registerTool("lunar_return", {
    description: "Find the lunar longitude return strictly after the anchor and cast its chart. Requires known birth time. Receipts cover charts, not search completeness.",
    inputSchema: inputSchemas.lunar_return, outputSchema: lunarReturnOutputSchema, annotations
  }, lunarReturnTool);
  server.registerTool("moon_phase", {
    description: "Calculate Moon-Sun elongation, phase and elongation-based illumination, with a sky chart receipt. The receipt covers positions, not phase classification.",
    inputSchema: inputSchemas.moon_phase, outputSchema: moonPhaseOutputSchema, annotations
  }, moonPhaseTool);
  server.registerTool("event_search", {
    description: "Search bounded tropical longitude crossings in (from,to]. Budget refusal returns no partial events. Completeness is not proven; receipts cover endpoint and event charts only.",
    inputSchema: inputSchemas.event_search, outputSchema: eventSearchOutputSchema, annotations
  }, eventSearchTool);
  return server;
}
