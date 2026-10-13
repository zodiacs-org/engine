import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { request, type Server } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WebhookService } from "../src/service.js";

export const DAY = 86_400_000;
export const START = Date.parse("2000-01-01T00:00:00Z");
export const END = Date.parse("2000-02-01T00:00:00Z");
export function serviceFixture() {
  const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, "service-"));
  const credentials = { adminToken: randomBytes(32), wrappingKey: randomBytes(32) };
  const secret = randomBytes(32);
  const services: WebhookService[] = [];
  const servers: Server[] = [];
  const config = {
    stateDirectory: "state", port: 0, pollIntervalMs: 5, scanPageSize: 1, deliveryBatchSize: 1,
    lookAheadMs: 31 * DAY, shutdownGraceMs: 25,
    scan: { maxWindowMs: 31 * DAY, stepMs: DAY / 4, maxEvaluations: 20_000 },
    delivery: { maxAttempts: 2, baseDelayMs: 1000, maxDelayMs: 2000, leaseMs: 5000, deadlineMs: 1000 },
  };
  const spec = { callbackUrl: "https://receiver.example/events", secretRef: "runtime_key",
    filter: { kind: "ingress", body: "Sun", sign: "aquarius" },
    window: { start: new Date(START).toISOString(), end: new Date(END).toISOString() },
  };
  const call = (service: WebhookService, method: string, path: string, input?: unknown) => new Promise<{ status: number; json: any }>((resolve, reject) => {
    const body = input === undefined ? undefined : Buffer.from(JSON.stringify(input));
    const req = request({ hostname: service.address.host, port: service.address.port, method, path, agent: false,
      headers: { authorization: `Bearer ${credentials.adminToken.toString("base64url")}`,
        ...(body ? { "content-type": "application/json", "content-length": body.length } : {}) },
    }, response => {
      const chunks: Buffer[] = [];
      response.on("data", chunk => chunks.push(chunk)); response.on("error", reject);
      response.on("end", () => {
        try { resolve({ status: response.statusCode!, json: JSON.parse(Buffer.concat(chunks).toString()) }); }
        catch (error) { reject(error); }
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error("Local control call stalled.")));
    req.on("error", reject); req.end(body);
  });
  return { directory, credentials, secret, services, servers, config, spec, call,
    path: join(directory, "state/service.sqlite"),
    cleanup: async () => {
      await Promise.all(services.map(service => service.stop()));
      for (const server of servers) {
        if (!server.listening) continue;
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
      credentials.adminToken.fill(0); credentials.wrappingKey.fill(0); secret.fill(0);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
export async function eventually(check: () => boolean): Promise<void> {
  const deadline = performance.now() + 4000;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("Local service condition did not settle.");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
