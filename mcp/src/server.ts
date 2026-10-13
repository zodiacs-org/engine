import { McpServer } from "@modelcontextprotocol/server";

/** Creates an unconnected server. Tools and transports are added by later milestones. */
export function createServer(): McpServer {
  return new McpServer({ name: "zodiacs-astro", version: "0.0.0" });
}
