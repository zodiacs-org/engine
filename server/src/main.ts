import { buildApp } from "./app.js";
import { readConfig } from "./config.js";

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const app = buildApp({ logger: { level: config.logLevel } });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ event: "server_stopping" });
    // A stalled connection must not keep a terminating process alive forever.
    const timer = setTimeout(() => {
      app.log.error({ event: "shutdown_timeout" });
      process.exit(1);
    }, 10_000);
    timer.unref();
    try {
      await app.close();
      app.log.info({ event: "server_stopped" });
    } finally {
      clearTimeout(timer);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  };
  const onSignal = () => {
    void stop().catch(() => {
      app.log.error({ event: "shutdown_failed" });
      process.exitCode = 1;
    });
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    const address = await app.listen({ host: config.host, port: config.port });
    app.log.info({ event: "server_started", address });
  } catch (error) {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await app.close();
    throw error;
  }
}

void main().catch(() => {
  // Startup errors can include environment values or local credential paths.
  process.stderr.write(JSON.stringify({ level: "error", event: "startup_failed" }) + "\n");
  process.exitCode = 1;
});
