#!/usr/bin/env node
// Optional source-checkout service. Importing the library never runs this file.
import { parseArgs } from "node:util";

process.env.TSX_DISABLE_CACHE = "1";
const HELP = `Usage: node geocode/bin/server.mjs --index PATH [--host ADDRESS] [--port PORT]
       node geocode/bin/server.mjs --help

Load an explicit local index. The default host is 127.0.0.1 and port 0 selects
an ephemeral port. Startup writes the bound address as JSON to stdout.
GET /lookup?query=TEXT accepts optional country, region and limit parameters.
POST /tz accepts the library's GeocodeRequest as application/json.
Normal library outcomes return HTTP 200, including unresolved places and times.
SIGINT or SIGTERM stops accepting connections and drains active requests.
No request logging, downloads or automatic place selection. Per-client rate
limiting remains milestone M8; this milestone's service is for local use.
`;

function failure(code, message) {
  process.stderr.write(`${JSON.stringify({ error: { code, message } })}\n`);
  process.exitCode = 1;
}

let args;
try {
  args = parseArgs({
    strict: true, allowPositionals: false, tokens: true,
    options: { help: { type: "boolean", short: "h" }, index: { type: "string" }, host: { type: "string" }, port: { type: "string" } }
  });
  const seen = new Set();
  for (const token of args.tokens) {
    if (token.kind !== "option") continue;
    if (seen.has(token.name)) throw new Error();
    seen.add(token.name);
  }
  if (args.values.help) {
    if (process.argv.length !== 3) throw new Error();
  } else {
    const { index, port } = args.values;
    if (typeof index !== "string" || !index.trim() || /[\p{Cc}\p{Cs}]/u.test(index)
        || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(index)) throw new Error();
    if (port !== undefined && (!/^(?:0|[1-9][0-9]{0,4})$/u.test(port) || Number(port) > 65535)) throw new Error();
  }
} catch {
  failure("invalid-input", "Invalid service options. Run node geocode/bin/server.mjs --help.");
}

if (args && !process.exitCode) {
  if (args.values.help) process.stdout.write(HELP);
  else {
    let service;
    try {
      const { tsImport } = await import("tsx/esm/api");
      const modules = await Promise.all([
        tsImport("../src/load-index.ts", { parentURL: import.meta.url, tsconfig: false }),
        tsImport("../src/atlas-time.ts", { parentURL: import.meta.url, tsconfig: false }),
        tsImport("../src/geocoder.ts", { parentURL: import.meta.url, tsconfig: false }),
        tsImport("../src/http-server.ts", { parentURL: import.meta.url, tsconfig: false })
      ]);
      const [{ loadPlaceIndex }, { loadAtlasTimeProvider }, { createGeocoder }, { createGeocodeServer }] = modules;
      const dataset = await loadPlaceIndex(args.values.index);
      const geocoder = createGeocoder(dataset, loadAtlasTimeProvider());
      service = createGeocodeServer(geocoder, {
        ...(args.values.host === undefined ? {} : { host: args.values.host }),
        ...(args.values.port === undefined ? {} : { port: Number(args.values.port) })
      });
      // Register before listening so a signal during startup still closes it.
      let stopping = false;
      function stop() {
        stopping = true;
        void service.close().catch(() => failure("shutdown-error", "Cannot finish service shutdown."));
      }
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
      const address = await service.start();
      if (!stopping) process.stdout.write(`${JSON.stringify({ status: "listening", address })}\n`);
    } catch {
      if (service) {
        try { await service.close(); }
        catch { failure("shutdown-error", "Cannot finish service shutdown."); }
      }
      failure("startup-error", "Cannot start the service. Check the Node runtime, local index, atlas and bind options.");
    }
  }
}
