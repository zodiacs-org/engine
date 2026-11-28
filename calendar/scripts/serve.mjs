#!/usr/bin/env node
import { register } from "node:module";
import { open } from "node:fs/promises";
import { prepareEvents } from "./prepare-events.mjs";

const help = "Usage: node scripts/serve.mjs --config FEED-MAP.json [--port PORT]\n" +
  "Serve operator-configured synthetic feeds on http://127.0.0.1:PORT/feeds/ID.ics\n";
try {
  const argv = process.argv.slice(2);
  if (argv.length === 1 && argv[0] === "--help") process.stdout.write(help);
  else {
    const args = new Map();
    for (let index = 0; index < argv.length; index += 2) {
      const key = argv[index], value = argv[index + 1];
      if (!["--config", "--port"].includes(key) || args.has(key) || !value || value.startsWith("--")) {
        throw new Error("Invalid server arguments. Use --help.");
      }
      args.set(key, value);
    }
    if (!args.has("--config")) throw new Error("--config is required.");
    const portText = args.get("--port") ?? "8080";
    if (!/^(0|[1-9]\d{0,4})$/.test(portText) || Number(portText) > 65535) throw new Error("Invalid port.");
    register(new URL("./typescript-loader.mjs", import.meta.url));
    await prepareEvents();
    const { createFeedServer, MAX_HTTP_CONFIG_BYTES } = await import("../src/http.ts");
    let config;
    // Read a bounded regular file, keeping parser diagnostics out of stdout.
    const file = await open(args.get("--config"), "r");
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > MAX_HTTP_CONFIG_BYTES) throw new Error("Invalid configuration file.");
      let bytes = 0;
      const chunks = [];
      for await (const chunk of file.createReadStream({ autoClose: false })) {
        bytes += chunk.length;
        if (bytes > MAX_HTTP_CONFIG_BYTES) throw new Error("Configuration exceeds the byte limit.");
        chunks.push(chunk);
      }
      config = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    } finally { await file.close(); }
    const server = createFeedServer(config);
    const stop = () => {
      server.closeAllConnections();
      server.close();
      process.removeListener("SIGINT", stop);
      process.removeListener("SIGTERM", stop);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    server.once("error", () => {
      process.stderr.write("calendar: Feed server could not listen.\n");
      process.exitCode = 1;
      stop();
    });
    server.listen(Number(portText), "127.0.0.1", () => {
      const address = server.address();
      process.stdout.write(`Calendar feeds: http://127.0.0.1:${address.port}/feeds/ID.ics\n`);
    });
  }
} catch {
  process.stderr.write("calendar: Invalid server configuration or startup failure. Use --help.\n");
  process.exitCode = 1;
}
