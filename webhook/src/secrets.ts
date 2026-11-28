import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseHandle, SQLOutputValue } from "node:sqlite";
import { parseSubscription } from "./subscription.js";
import { signWebhook, type WebhookSignatureHeaders } from "./signatures.js";
import type { SubscriptionSpec } from "./types.js";

const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

export const VAULT_KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const APPLICATION_ID = 0x5a574b56;
const SCHEMA_VERSION = 1;
const CHECK_AAD = Buffer.from("zodiacs-webhook-vault/v1/check", "utf8");

export type SecretErrorCode = "invalid-input" | "conflict" | "unavailable" | "closed" | "vault-failure";
export class SecretError extends Error {
  constructor(readonly code: SecretErrorCode) {
    super(`Webhook signing key: ${code}.`);
    this.name = "SecretError";
  }
}

export interface SigningKeyMetadata {
  readonly secretRef: string;
  readonly status: "available" | "revoked";
}

export interface VaultSignInput {
  readonly body: Uint8Array;
  readonly idempotencyKey: string;
  /** Unix seconds, refreshed at each delivery attempt. */
  readonly timestamp: number;
}

// Immutable after deployment. A future schema change needs a migration.
const schemaSql = `
CREATE TABLE vault_metadata (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nonce BLOB NOT NULL CHECK (length(nonce) = 12),
  tag BLOB NOT NULL CHECK (length(tag) = 16)
) STRICT;
CREATE TABLE signing_keys (
  secret_ref TEXT PRIMARY KEY NOT NULL,
  nonce BLOB NOT NULL CHECK (length(nonce) = 12),
  ciphertext BLOB NOT NULL CHECK (length(ciphertext) = 32),
  tag BLOB NOT NULL CHECK (length(tag) = 16),
  revoked INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0, 1))
) STRICT;
CREATE TRIGGER signing_keys_no_replace BEFORE UPDATE OF secret_ref, nonce, ciphertext, tag ON signing_keys
BEGIN SELECT RAISE(ABORT, 'Signing key material is immutable.'); END;
CREATE TRIGGER signing_keys_no_delete BEFORE DELETE ON signing_keys
BEGIN SELECT RAISE(ABORT, 'Signing key references are retained.'); END;
CREATE TRIGGER signing_keys_no_restore BEFORE UPDATE OF revoked ON signing_keys
WHEN OLD.revoked = 1 AND NEW.revoked != 1
BEGIN SELECT RAISE(ABORT, 'Revocation is permanent.'); END;
`;

type Row = Record<string, SQLOutputValue>;
interface Sealed { nonce: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array }

function fail(code: SecretErrorCode): never { throw new SecretError(code); }
function reference(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(value)) fail("invalid-input");
}
function keyBytes(value: unknown): asserts value is Uint8Array {
  if (!(value instanceof Uint8Array) || value.byteLength !== VAULT_KEY_BYTES) fail("invalid-input");
}
function aad(secretRef: string): Buffer {
  return Buffer.from(`zodiacs-webhook-vault/v1/key\n${secretRef}`, "utf8");
}
function seal(key: Uint8Array, plaintext: Uint8Array, context: Uint8Array): Sealed {
  const nonce = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_BYTES });
  cipher.setAAD(context);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { nonce, ciphertext, tag: cipher.getAuthTag() };
}
function unseal(key: Uint8Array, sealed: Sealed, context: Uint8Array): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, sealed.nonce, { authTagLength: TAG_BYTES });
  decipher.setAAD(context);
  decipher.setAuthTag(sealed.tag);
  const partial = decipher.update(sealed.ciphertext);
  let tail: Buffer | undefined;
  try {
    tail = decipher.final();
    return Buffer.concat([partial, tail]);
  } finally {
    partial.fill(0);
    tail?.fill(0);
  }
}
function sealedRow(row: Row): Sealed {
  if (!(row.nonce instanceof Uint8Array) || row.nonce.byteLength !== IV_BYTES
    || !(row.ciphertext instanceof Uint8Array) || row.ciphertext.byteLength !== VAULT_KEY_BYTES
    || !(row.tag instanceof Uint8Array) || row.tag.byteLength !== TAG_BYTES) fail("vault-failure");
  return { nonce: row.nonce, ciphertext: row.ciphertext, tag: row.tag };
}
function schema(db: DatabaseHandle): string {
  return JSON.stringify(db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name`).all());
}
function expectedSchema(): string {
  const db = new DatabaseSync(":memory:");
  try { db.exec(schemaSql); return schema(db); } finally { db.close(); }
}

/** A separate encrypted key database. The wrapping key comes only from runtime custody. */
export class SigningKeyVault {
  #db: DatabaseHandle;
  #wrappingKey: Buffer;
  #closed = false;

  constructor(path: string, wrappingKey: Uint8Array) {
    if (typeof path !== "string" || path.length === 0 || path.includes("\0")) fail("invalid-input");
    keyBytes(wrappingKey);
    this.#wrappingKey = Buffer.alloc(VAULT_KEY_BYTES);
    this.#wrappingKey.set(wrappingKey);
    let db: DatabaseHandle | undefined;
    try {
      db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false });
      this.#db = db;
      db.exec("PRAGMA busy_timeout = 5000; PRAGMA recursive_triggers = ON; PRAGMA synchronous = FULL;");
      this.#initialize();
      db.exec("PRAGMA journal_mode = WAL;");
    } catch {
      this.#wrappingKey.fill(0);
      try { db?.close(); } catch { /* Keep the public diagnostic fixed. */ }
      fail("vault-failure");
    }
  }

  #initialize(): void {
    const expected = expectedSchema();
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const version = this.#db.prepare("PRAGMA user_version").get()?.user_version;
      const appId = this.#db.prepare("PRAGMA application_id").get()?.application_id;
      if (version === 0 && appId === 0 && schema(this.#db) === "[]") {
        this.#db.exec(schemaSql);
        const check = seal(this.#wrappingKey, Buffer.alloc(0), CHECK_AAD);
        this.#db.prepare("INSERT INTO vault_metadata(id, nonce, tag) VALUES (1, ?, ?)")
          .run(check.nonce, check.tag);
        this.#db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}; PRAGMA application_id = ${APPLICATION_ID};`);
      } else if (version !== SCHEMA_VERSION || appId !== APPLICATION_ID || schema(this.#db) !== expected) {
        fail("vault-failure");
      }
      const checks = this.#db.prepare("SELECT nonce, tag FROM vault_metadata WHERE id = 1").all();
      const check = checks[0];
      if (checks.length !== 1 || !(check?.nonce instanceof Uint8Array) || !(check.tag instanceof Uint8Array)) {
        fail("vault-failure");
      }
      // Authenticate even an empty vault so a wrong wrapping key cannot add unusable rows.
      unseal(this.#wrappingKey, { nonce: check.nonce, tag: check.tag, ciphertext: Buffer.alloc(0) }, CHECK_AAD).fill(0);
      this.#db.exec("COMMIT");
    } catch {
      try { this.#db.exec("ROLLBACK"); } catch { /* Preserve the fixed diagnostic. */ }
      fail("vault-failure");
    }
  }

  #run<T>(operation: () => T): T {
    if (this.#closed) fail("closed");
    try { return operation(); } catch (error) {
      if (error instanceof SecretError) throw error;
      fail("vault-failure");
    }
  }

  close(): void {
    if (this.#closed) return;
    // Always erase this owned copy, including on a failed close.
    try { this.#run(() => this.#db.close()); } finally {
      this.#closed = true;
      this.#wrappingKey.fill(0);
    }
  }

  /** Provision a caller-held random shared key. Returns metadata, never key bytes. */
  provision(secretRef: string, secret: Uint8Array): SigningKeyMetadata {
    return this.#run(() => {
      reference(secretRef); keyBytes(secret);
      const encrypted = seal(this.#wrappingKey, secret, aad(secretRef));
      const result = this.#db.prepare(`INSERT INTO signing_keys(secret_ref, nonce, ciphertext, tag)
        VALUES (?, ?, ?, ?) ON CONFLICT(secret_ref) DO NOTHING`)
        .run(secretRef, encrypted.nonce, encrypted.ciphertext, encrypted.tag);
      if (result.changes !== 1) fail("conflict");
      return Object.freeze({ secretRef, status: "available" });
    });
  }

  inspect(secretRef: string): SigningKeyMetadata | undefined {
    return this.#run(() => {
      reference(secretRef);
      const row = this.#db.prepare("SELECT revoked FROM signing_keys WHERE secret_ref = ?").get(secretRef);
      return row && Object.freeze({ secretRef, status: row.revoked === 1 ? "revoked" : "available" });
    });
  }

  #withKey<T>(secretRef: string, operation: (key: Uint8Array) => T): T {
    return this.#run(() => {
      reference(secretRef);
      const row = this.#db.prepare("SELECT * FROM signing_keys WHERE secret_ref = ?").get(secretRef);
      if (!row || row.revoked !== 0) fail("unavailable");
      const secret = unseal(this.#wrappingKey, sealedRow(row), aad(secretRef));
      try { keyBytes(secret); return operation(secret); } finally { secret.fill(0); }
    });
  }

  /** Checks recoverability, not just reference existence. */
  assertAvailable(secretRef: string): void {
    this.#withKey(secretRef, () => undefined);
  }

  /** The control boundary must use this before storing an enabled subscription. */
  validateSubscription(input: unknown): SubscriptionSpec {
    if (this.#closed) fail("closed");
    const spec = parseSubscription(input);
    if (spec.enabled) this.assertAvailable(spec.secretRef);
    return spec;
  }

  sign(secretRef: string, input: VaultSignInput): WebhookSignatureHeaders {
    return this.#withKey(secretRef, secret => {
      try { return signWebhook({ ...input, secret, keyId: secretRef }); } catch { fail("invalid-input"); }
    });
  }

  /** Permanent, including for retained deliveries. Rotation instead provisions a new reference. */
  revoke(secretRef: string): SigningKeyMetadata {
    return this.#run(() => {
      reference(secretRef);
      const result = this.#db.prepare("UPDATE signing_keys SET revoked = 1 WHERE secret_ref = ?").run(secretRef);
      if (result.changes !== 1) fail("unavailable");
      return Object.freeze({ secretRef, status: "revoked" });
    });
  }
}
