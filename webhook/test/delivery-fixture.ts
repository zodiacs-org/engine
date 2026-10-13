import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SigningKeyVault } from "../src/secrets.js";
import { WebhookStore } from "../src/storage.js";
import type { DeliveryWorkerPolicy } from "../src/delivery-worker.js";
import type { DeliveryClaim, NewEvent } from "../src/storage-types.js";

export const NOW = Date.parse("2000-01-01T00:00:00Z");
export const POLICY: DeliveryWorkerPolicy = {
  maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 2500, leaseMs: 5000, deadlineMs: 1000,
};
export const EVENT: NewEvent = {
  id: "synthetic-event", occurrenceKey: "synthetic-occurrence", idempotencyKey: "synthetic-idempotency",
  occurredAt: NOW + 100, payload: '{ "synthetic": true, "receipt": { "integration": "only" } }',
};
export function claimed(result: DeliveryClaim) {
  if (result.status !== "claimed") throw new Error("Expected delivery claim.");
  return result;
}

export function deliveryFixture() {
  const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, "delivery-"));
  const path = join(directory, "service.sqlite");
  const stores: WebhookStore[] = [];
  const vaults: SigningKeyVault[] = [];
  const secret = randomBytes(32);
  const wrappingKey = randomBytes(32);
  const open = () => { const store = new WebhookStore(path); stores.push(store); return store; };
  const openVault = () => {
    const vault = new SigningKeyVault(join(directory, "vault.sqlite"), wrappingKey);
    vaults.push(vault); return vault;
  };
  const store = open();
  const vault = openVault();
  vault.provision("runtime_key", secret);
  const spec = {
    callbackUrl: "https://receiver.example/events", secretRef: "runtime_key",
    filter: { kind: "ingress", body: "Moon", sign: "aries" },
    window: { start: new Date(NOW).toISOString(), end: new Date(NOW + 60_000).toISOString() },
  };
  store.createSubscription("synthetic-subscription", spec, NOW - 1);
  const enqueue = (events: readonly NewEvent[] = [EVENT], now = NOW) => store.commitScan({
    subscriptionId: "synthetic-subscription", expectedRevision: 1,
    from: NOW, to: NOW + 60_000, now, events,
  });
  return { store, vault, secret, spec, path, open, openVault, enqueue,
    cleanup: () => {
      for (const connection of stores) connection.close();
      for (const connection of vaults) connection.close();
      secret.fill(0); wrappingKey.fill(0);
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
