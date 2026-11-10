import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadServiceEnvironment, ServiceError, type ServiceCredentials } from "./service-config.js";
import { startService, type WebhookService } from "./service.js";

const HELP = `Usage: webhook-service [--help]
Run the local control API and discovery/delivery workers.
Runtime environment:
  WEBHOOK_ADMIN_TOKEN   Random canonical base64url admin token
  WEBHOOK_WRAPPING_KEY  Persistent canonical base64url vault wrapping key
  WEBHOOK_SETTINGS      Optional JSON policy object (no credentials)
The control API binds only to loopback. State is stored inside webhook/.
`;
/** The executable is compiled into build/webhook/src; imports start no service. */
export async function runServiceCli(argv: readonly string[], projectDirectory: string): Promise<number> {
  if (argv.length === 1 && argv[0] === "--help") { process.stdout.write(HELP); return 0; }
  if (argv.length !== 0) { process.stderr.write('{"error":{"code":"invalid-command"}}\n'); return 2; }
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major !== 22 || minor! < 13) { process.stderr.write('{"error":{"code":"unsupported-runtime"}}\n'); return 1; }
  let service: WebhookService | undefined, credentials: ServiceCredentials | undefined;
  let requestedStop = false;
  const stop = () => { requestedStop = true; void service?.stop().catch(() => undefined); };
  process.on("SIGINT", stop); process.on("SIGTERM", stop);
  try {
    const loaded = loadServiceEnvironment(process.env);
    credentials = loaded.credentials;
    // Remove owned credential environment entries before starting workers.
    delete process.env.WEBHOOK_ADMIN_TOKEN; delete process.env.WEBHOOK_WRAPPING_KEY;
    service = await startService(loaded.config, credentials, projectDirectory,
      { report: notice => { process.stderr.write(JSON.stringify(notice) + "\n"); } });
    credentials.adminToken.fill(0); credentials.wrappingKey.fill(0); credentials = undefined;
    if (requestedStop) await service.stop();
    else process.stdout.write(JSON.stringify({ status: "ready", address: service.address }) + "\n");
    await service.done;
    process.stdout.write('{"status":"stopped"}\n');
    return 0;
  } catch (error) {
    const code = error instanceof ServiceError ? error.code : "startup-failed";
    process.stderr.write(JSON.stringify({ error: { code } }) + "\n");
    return code === "invalid-config" || code === "invalid-credentials" ? 2 : 1;
  } finally {
    process.off("SIGINT", stop); process.off("SIGTERM", stop);
    credentials?.adminToken.fill(0); credentials?.wrappingKey.fill(0);
    try { await service?.stop(); } catch { /* Keep the fixed diagnostic. */ }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await runServiceCli(process.argv.slice(2), fileURLToPath(new URL("../../../", import.meta.url)));
}
