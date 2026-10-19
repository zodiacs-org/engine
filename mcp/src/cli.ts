import { pathToFileURL } from "node:url";
import { startHttp, startStdio } from "./transports.js";
import type { BearerAuthSource } from "./auth.js";

const usage = "Usage: node build/cli.js [stdio | http [--port PORT] [--auth-token-env NAME | --auth-token-file PATH]]";

export function parseArguments(args: string[]): { transport: "stdio" | "http"; port?: number; auth?: BearerAuthSource } {
  if (args.length === 0 || (args.length === 1 && args[0] === "stdio")) return { transport: "stdio" };
  if (args[0] !== "http") throw new Error(usage);
  const config: ReturnType<typeof parseArguments> = { transport: "http" };
  for (let index = 1; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if (!value) throw new Error(usage);
    if (option === "--port" && config.port === undefined && value.trim() === value && /^\d+$/.test(value)) {
      const port = Number(value);
      if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error(usage);
      config.port = port;
    } else if (option === "--auth-token-env" && !config.auth && value.trim() === value && /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      config.auth = { tokenEnv: value };
    } else if (option === "--auth-token-file" && !config.auth && !value.startsWith("--")) {
      config.auth = { tokenFile: value };
    } else throw new Error(usage);
  }
  return config;
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
    process.stderr.write(`zodiacs-astro: startup failed; ${usage}\n`);
    process.exitCode = 1;
  });
}
