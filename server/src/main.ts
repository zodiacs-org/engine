import { buildApp } from "./app.js";
import { readConfig } from "./config.js";
import { loadApiKeys } from "./api-keys.js";
import { CalculationPool } from "./calculation-pool.js";

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const apiKeys = await loadApiKeys(process.env);
  const calculations = new CalculationPool({
    timeoutMs: config.limits.calculationTimeoutMs,
    maxQueue: config.limits.calculationQueueSize
  });
  const app = buildApp({
    logger: { level: config.logLevel }, apiKeys, rateLimit: config.rateLimit,
    calculations, readiness: () => calculations.ready, limits: config.limits
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    app.log.info({ event: "server_stopping" });
    // A stalled connection must not keep a terminating process alive forever.
    const timer = setTimeout(() => {
      app.log.error({ event: "shutdown_timeout" });
      process.exit(1);
    }, config.limits.shutdownTimeoutMs);
    timer.unref();
    try {
      // Stop admission in both layers; accepted active work may finish while
      // queued calculations are refused. The process deadline covers slow HTTP.
      await Promise.all([app.close(), calculations.close()]);
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
    await calculations.start();
    if (stopping) return;
    const address = await app.listen({ host: config.host, port: config.port });
    app.log.info({ event: "server_started", address });
  } catch (error) {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    await Promise.all([app.close(), calculations.close()]);
    if (!stopping) throw error;
  }
}

void main().catch(() => {
  // Startup errors can include environment values or local credential paths.
  process.stderr.write(JSON.stringify({ level: "error", event: "startup_failed" }) + "\n");
  process.exitCode = 1;
});
