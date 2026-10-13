import { pathToFileURL } from "node:url";
import { startHttp, startStdio } from "./transports.js";

export function parseArguments(args: string[]): { transport: "stdio" | "http"; port?: number } {
  if (args.length === 0 || (args.length === 1 && args[0] === "stdio")) return { transport: "stdio" };
  if (args[0] === "http" && args.length === 1) return { transport: "http" };
  if (args[0] === "http" && args.length === 3 && args[1] === "--port" && /^\d+$/.test(args[2]!)) {
    const port = Number(args[2]);
    if (Number.isSafeInteger(port) && port >= 0 && port <= 65535) return { transport: "http", port };
  }
  throw new Error("Usage: node build/cli.js [stdio | http [--port PORT]]");
}

export async function main(args = process.argv.slice(2)) {
  const config = parseArguments(args);
  const onerror = () => { process.stderr.write("zodiacs-astro: transport error\n"); };
  const running = config.transport === "stdio" ? startStdio({ onerror }) : await startHttp({ ...config, onerror });
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void running.close().then(() => process.exit(0), () => process.exit(1));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  if ("url" in running && running.url instanceof URL) process.stderr.write(`zodiacs-astro: listening at ${running.url.href}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch(() => {
    process.stderr.write("zodiacs-astro: startup failed; usage: node build/cli.js [stdio | http [--port PORT]]\n");
    process.exitCode = 1;
  });
}
