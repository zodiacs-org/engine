import { createServer as createHttpServer } from "node:http";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from "@modelcontextprotocol/node";
import { createServer } from "./server.js";
import type { Clock } from "./tools/transits.js";

export const MAX_REQUEST_BYTES = 65_536;

export function startStdio(options: { clock?: Clock; onerror?: (error: Error) => void } = {}) {
  return serveStdio(() => createServer(options), {
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
}

/** Local HTTP endpoint. Public routing and authentication belong to the deployment. */
export async function startHttp(options: { port?: number; clock?: Clock; onerror?: (error: Error) => void } = {}) {
  const port = options.port ?? 3000;
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError("Invalid HTTP port.");
  const handler = createMcpHandler(() => createServer(options), {
    legacy: "stateless", maxRequestBodySize: MAX_REQUEST_BYTES,
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
  const route = toNodeHandler(handler, {
    maxRequestBodySize: MAX_REQUEST_BYTES,
    ...(options.onerror ? { onerror: options.onerror } : {})
  });
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  let closing = false;
  const server = createHttpServer((req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (closing) { res.writeHead(503).end(); return; }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    // Explicit fields bridge the SDK's optional-property types under exactOptionalPropertyTypes.
    void route({
      method: req.method ?? "GET", url: req.url ?? "/", headers: req.headers,
      [Symbol.asyncIterator]: () => req[Symbol.asyncIterator]()
    }, res).catch(() => {
      options.onerror?.(new Error("HTTP transport failed."));
      if (!res.headersSent) res.writeHead(500).end();
      else res.destroy();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
    });
  } catch (error) { await handler.close(); throw error; }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP listener has no address.");
  let closed: Promise<void> | undefined;
  return {
    url: new URL(`http://127.0.0.1:${address.port}/mcp`),
    close(): Promise<void> {
      return closed ??= (async () => {
        closing = true;
        const stopped = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        try { await handler.close(); }
        finally { server.closeAllConnections(); await stopped; }
      })();
    }
  };
}
