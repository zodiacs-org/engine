import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretError, SigningKeyVault, VAULT_KEY_BYTES } from "../src/secrets.js";
import { verifyWebhook } from "../src/signatures.js";
import { WebhookStore } from "../src/storage.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
const CACHE = fileURLToPath(new URL("../.cache/", import.meta.url));
const START = Date.parse("2000-01-01T00:00:00Z");
const timestamp = START / 1000;
const body = Buffer.from('{ "synthetic": true, "label": "Moon ☾" }\n');
const signInput = { body, idempotencyKey: "delivery:synthetic", timestamp };

function subscription(secretRef = "ReceiverOld") {
  return { callbackUrl: "https://receiver.example/events", secretRef,
    filter: { kind: "ingress", body: "Moon", sign: "aries" },
    window: { start: new Date(START).toISOString(), end: new Date(START + 10_000).toISOString() } };
}

let directory: string;
let vaultPath: string;
let wrappingKey: Buffer;
let secret: Buffer;
let handles: { close(): void }[];

function open(path = vaultPath, key = wrappingKey): SigningKeyVault {
  const vault = new SigningKeyVault(path, key);
  handles.push(vault);
  return vault;
}
function raw() {
  const db = new DatabaseSync(vaultPath);
  handles.push(db);
  return db;
}
function failure(operation: () => unknown, code: SecretError["code"]): void {
  let error: unknown;
  try { operation(); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(SecretError);
  expect((error as SecretError).code).toBe(code);
  expect((error as Error).message).toBe(`Webhook signing key: ${code}.`);
  expect((error as Error).cause).toBeUndefined();
}

beforeEach(() => {
  mkdirSync(CACHE, { recursive: true });
  directory = mkdtempSync(join(CACHE, "secrets-"));
  vaultPath = join(directory, "keys.sqlite");
  wrappingKey = randomBytes(32);
  secret = randomBytes(32);
  handles = [];
});
afterEach(() => {
  for (const handle of handles.reverse()) {
    try { handle.close(); } catch { /* Some tests close before reopening. */ }
  }
  wrappingKey.fill(0);
  secret.fill(0);
  rmSync(directory, { recursive: true, force: true });
});

describe("runtime signing-key custody", () => {
  it("signs persisted exact bytes after reopening without returning key material", () => {
    let vault = open();
    const provisioned = vault.provision("ReceiverOld", secret);
    expect(provisioned).toEqual({ secretRef: "ReceiverOld", status: "available" });
    expect(Object.isFrozen(provisioned)).toBe(true);
    expect(vault.inspect("ReceiverOld")).toEqual(provisioned);
    expect(vault.inspect("Missing")).toBeUndefined();
    const before = vault.sign("ReceiverOld", signInput);
    vault.close();
    vault = open();
    expect(vault.sign("ReceiverOld", signInput)).toEqual(before);
    expect(verifyWebhook({ body, headers: before, secret, expectedKeyId: "ReceiverOld", now: timestamp })).toBe(true);
    expect(JSON.stringify(vault)).toBe("{}");
    const printable = inspect(vault, { showHidden: true });
    expect(printable).not.toContain(secret.toString("hex"));
    expect(printable).not.toContain(wrappingKey.toString("hex"));
  });

  it("writes only authenticated ciphertext to the database and WAL files", () => {
    const vault = open();
    vault.provision("ReceiverOld", secret);
    vault.provision("ReceiverOther", secret);
    const rows = raw().prepare("SELECT nonce, ciphertext, tag FROM signing_keys ORDER BY secret_ref").all();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect((row.nonce as Uint8Array).byteLength).toBe(12);
      expect((row.tag as Uint8Array).byteLength).toBe(16);
      expect((row.ciphertext as Uint8Array).byteLength).toBe(VAULT_KEY_BYTES);
    }
    expect(rows[0]?.nonce).not.toEqual(rows[1]?.nonce);
    expect(rows[0]?.ciphertext).not.toEqual(rows[1]?.ciphertext);
    for (const filename of readdirSync(directory)) {
      const data = readFileSync(join(directory, filename));
      for (const material of [secret, wrappingKey]) {
        expect(data.includes(material)).toBe(false);
        expect(data.includes(material.toString("hex"))).toBe(false);
        expect(data.includes(material.toString("base64"))).toBe(false);
      }
    }
  });

  it("copies the wrapping key and does not mutate caller-owned material", () => {
    const inputWrappingKey = Buffer.from(wrappingKey);
    const inputSecret = Buffer.from(secret);
    const vault = open(vaultPath, inputWrappingKey);
    inputWrappingKey.fill(0);
    vault.provision("ReceiverOld", inputSecret);
    expect(inputSecret).toEqual(secret);
    inputSecret.fill(0);
    const headers = vault.sign("ReceiverOld", signInput);
    expect(verifyWebhook({ body, headers, secret, expectedKeyId: "ReceiverOld", now: timestamp })).toBe(true);
    vault.close();
    expect(() => open().assertAvailable("ReceiverOld")).not.toThrow();
  });

  it.each([false, true])("refuses a wrong wrapping key without changing an existing vault (populated=%s)", populated => {
    const vault = open();
    if (populated) vault.provision("ReceiverOld", secret);
    vault.close();
    const before = readFileSync(vaultPath);
    failure(() => open(vaultPath, randomBytes(32)), "vault-failure");
    expect(readFileSync(vaultPath)).toEqual(before);
    const reopened = open();
    if (populated) reopened.assertAvailable("ReceiverOld");
  });

  it("never overwrites a reference, including on a second connection or after revocation", () => {
    const first = open();
    const second = open();
    first.provision("ReceiverOld", secret);
    failure(() => second.provision("ReceiverOld", randomBytes(32)), "conflict");
    expect(second.sign("ReceiverOld", signInput)).toEqual(first.sign("ReceiverOld", signInput));
    expect(first.revoke("ReceiverOld").status).toBe("revoked");
    expect(first.revoke("ReceiverOld").status).toBe("revoked");
    failure(() => second.sign("ReceiverOld", signInput), "unavailable");
    failure(() => second.provision("ReceiverOld", secret), "conflict");
    failure(() => first.revoke("Missing"), "unavailable");
    expect(open().inspect("ReceiverOld")?.status).toBe("revoked");
  });

  it("refuses unknown, revoked and corrupt keys before subscription activation", () => {
    const vault = open();
    failure(() => vault.validateSubscription(subscription()), "unavailable");
    expect(vault.validateSubscription({ ...subscription(), enabled: false }).enabled).toBe(false);
    vault.provision("ReceiverOld", secret);
    expect(vault.validateSubscription(subscription()).secretRef).toBe("ReceiverOld");
    vault.revoke("ReceiverOld");
    failure(() => vault.validateSubscription(subscription()), "unavailable");
  });

  it.each(["nonce", "ciphertext", "tag"])("rejects tampering with encrypted %s without exposing crypto errors", field => {
    const vault = open();
    vault.provision("ReceiverOld", secret);
    const db = raw();
    db.exec("DROP TRIGGER signing_keys_no_replace");
    const row = db.prepare(`SELECT ${field} AS value FROM signing_keys`).get()!;
    const changed = Buffer.from(row.value as Uint8Array);
    changed[0] = changed[0]! ^ 1;
    db.prepare(`UPDATE signing_keys SET ${field} = ?`).run(changed);
    failure(() => vault.sign("ReceiverOld", signInput), "vault-failure");
    failure(() => vault.validateSubscription(subscription()), "vault-failure");
  });

  it("binds ciphertext to its reference so replacing another row cannot sign", () => {
    const vault = open();
    vault.provision("ReceiverOld", secret);
    vault.provision("ReceiverOther", randomBytes(32));
    const db = raw();
    db.exec("DROP TRIGGER signing_keys_no_replace");
    db.exec(`UPDATE signing_keys SET (nonce, ciphertext, tag) =
      (SELECT nonce, ciphertext, tag FROM signing_keys WHERE secret_ref = 'ReceiverOld')
      WHERE secret_ref = 'ReceiverOther'`);
    failure(() => vault.assertAvailable("ReceiverOther"), "vault-failure");
    expect(() => vault.assertAvailable("ReceiverOld")).not.toThrow();
  });

  it("refuses unrelated and modified schemas, and cannot open the subscription database as a vault", () => {
    const store = new WebhookStore(vaultPath);
    handles.push(store);
    failure(() => open(), "vault-failure");
    expect(store.listSubscriptions()).toEqual([]);
    const otherPath = join(directory, "other.sqlite");
    const vault = open(otherPath);
    vault.close();
    const db = new DatabaseSync(otherPath);
    handles.push(db);
    db.exec("DROP TRIGGER signing_keys_no_delete");
    failure(() => open(otherPath), "vault-failure");
  });

  it("enforces immutable material and permanent revocation at the SQL boundary", () => {
    const vault = open();
    vault.provision("ReceiverOld", secret);
    vault.revoke("ReceiverOld");
    const db = raw();
    db.exec("PRAGMA recursive_triggers = ON");
    for (const sql of [
      "DELETE FROM signing_keys",
      "UPDATE signing_keys SET ciphertext = randomblob(32)",
      "UPDATE signing_keys SET revoked = 0",
      "INSERT OR REPLACE INTO signing_keys SELECT * FROM signing_keys",
    ]) expect(() => db.exec(sql)).toThrow();
    expect(vault.inspect("ReceiverOld")?.status).toBe("revoked");
  });

  it("rejects malformed material and references with fixed diagnostics", () => {
    const vault = open();
    for (const length of [0, 31, 33, 64]) {
      failure(() => vault.provision("ReceiverOld", randomBytes(length)), "invalid-input");
      failure(() => new SigningKeyVault(":memory:", randomBytes(length)), "invalid-input");
    }
    failure(() => vault.provision("ReceiverOld", secret.toString("base64") as unknown as Uint8Array), "invalid-input");
    for (const ref of ["", "bad\nref", "a".repeat(129), "0key", "key.dot"]) {
      failure(() => vault.provision(ref, secret), "invalid-input");
    }
    for (const ref of ["A", "A".repeat(128), "A_-09"]) expect(vault.provision(ref, secret).secretRef).toBe(ref);
    failure(() => vault.sign("A", { ...signInput, timestamp: NaN }), "invalid-input");
    vault.close();
    expect(() => vault.close()).not.toThrow();
    failure(() => vault.provision("ReceiverOld", secret), "closed");
    failure(() => vault.sign("ReceiverOld", signInput), "closed");
    failure(() => vault.assertAvailable("ReceiverOld"), "closed");
    failure(() => vault.revoke("ReceiverOld"), "closed");
    failure(() => vault.validateSubscription({ ...subscription(), enabled: false }), "closed");
  });
});

describe("signing-key rotation with the durable outbox", () => {
  it("uses the new reference for new discoveries and keeps queued payloads and old keys unchanged", () => {
    const vault = open();
    const newSecret = randomBytes(32);
    vault.provision("ReceiverOld", secret);
    vault.provision("ReceiverNew", newSecret);
    const store = new WebhookStore(join(directory, "service.sqlite"));
    handles.push(store);
    store.createSubscription("sub", vault.validateSubscription(subscription()), START - 1);
    const enqueue = (revision: number, id: string) => store.commitScan({
      subscriptionId: "sub", expectedRevision: revision, from: START, to: START + 10_000, now: START,
      events: [{ id, occurrenceKey: `occurrence:${id}`, idempotencyKey: `delivery:${id}`,
        occurredAt: START, payload: body.toString("utf8") }],
    });
    enqueue(1, "old");
    store.updateSubscription("sub", 1, vault.validateSubscription(subscription("ReceiverNew")), START);
    enqueue(2, "new");
    expect(store.getDelivery("old")?.secretRef).toBe("ReceiverOld");
    expect(store.getDelivery("new")?.secretRef).toBe("ReceiverNew");
    for (const [id, key] of [["old", secret], ["new", newSecret]] as const) {
      const event = store.getEvent(id)!;
      const delivery = store.getDelivery(id)!;
      const bytes = Buffer.from(event.payload, "utf8");
      const headers = vault.sign(delivery.secretRef, { body: bytes, idempotencyKey: delivery.idempotencyKey, timestamp });
      expect(verifyWebhook({ body: bytes, headers, secret: key, expectedKeyId: delivery.secretRef, now: timestamp })).toBe(true);
      expect(event.payload).toBe(body.toString("utf8"));
    }
    store.recordAttempt({ eventId: "old", number: 1, startedAt: START, finishedAt: START + 1,
      result: { kind: "http", status: 503 } }, { status: "pending", availableAt: START + 1000 });
    const publicData = JSON.stringify({ subscriptions: store.listSubscriptions(), deliveries: store.listDeliveries(),
      attempts: store.listAttempts("old"), old: vault.inspect("ReceiverOld"), new: vault.inspect("ReceiverNew") });
    for (const key of [secret, newSecret, wrappingKey]) {
      expect(publicData).not.toContain(key.toString("hex"));
      expect(publicData).not.toContain(key.toString("base64"));
    }
    vault.revoke("ReceiverOld");
    failure(() => vault.sign("ReceiverOld", signInput), "unavailable");
    expect(() => vault.sign("ReceiverNew", signInput)).not.toThrow();
  });
});
