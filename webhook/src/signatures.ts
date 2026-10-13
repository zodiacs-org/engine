import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEBHOOK_SECRET_BYTES = 32;
export const MAX_WEBHOOK_BODY_BYTES = 262_144;
export const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;

const MAX_UNIX_SECONDS = 8_640_000_000_000;
const KEY_ID = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/;
const TIMESTAMP = /^(?:0|[1-9][0-9]{0,12})$/;
const SIGNATURE = /^v1=[a-f0-9]{64}$/;

export type WebhookSignatureHeaders = {
  readonly 'x-webhook-key-id': string;
  readonly 'x-webhook-timestamp': string;
  readonly 'x-webhook-signature': string;
  readonly 'idempotency-key': string;
};

export interface SignWebhookOptions {
  /** The exact bytes that will be sent in the request body. */
  readonly body: Uint8Array;
  /** Runtime-provisioned random key bytes, never a password or encoded text. */
  readonly secret: Uint8Array;
  readonly keyId: string;
  readonly idempotencyKey: string;
  /** Integer Unix seconds at the time of this delivery attempt. */
  readonly timestamp: number;
}

export type ReceivedWebhookHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;

export interface VerifyWebhookOptions {
  readonly body: Uint8Array;
  /** Header records must preserve duplicate values as arrays or comma joins. */
  readonly headers: ReceivedWebhookHeaders;
  readonly secret: Uint8Array;
  /** Select this expected key from trusted receiver configuration. */
  readonly expectedKeyId: string;
  /** Integer Unix seconds on the receiver's clock. */
  readonly now: number;
  /** Inclusive allowed clock difference in either direction. */
  readonly toleranceSeconds?: number;
}

function isUnixSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_UNIX_SECONDS;
}

function validBytes(body: unknown, secret: unknown): boolean {
  return body instanceof Uint8Array && body.byteLength <= MAX_WEBHOOK_BODY_BYTES
    && secret instanceof Uint8Array && secret.byteLength === WEBHOOK_SECRET_BYTES;
}

function validIdentifier(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

function digest(options: SignWebhookOptions): Buffer {
  const { body, secret, timestamp, keyId, idempotencyKey } = options;
  return createHmac('sha256', secret)
    .update(`zodiacs-webhook/v1\n${timestamp}\n${keyId}\n${idempotencyKey}\n`, 'utf8')
    .update(body)
    .digest();
}

/** Sign one delivery attempt, binding its key, timestamp, identity and exact body bytes. */
export function signWebhook(options: SignWebhookOptions): WebhookSignatureHeaders {
  try {
    const { body, secret, keyId, idempotencyKey, timestamp } = options;
    if (!validBytes(body, secret) || !validIdentifier(keyId, KEY_ID)
      || !validIdentifier(idempotencyKey, IDEMPOTENCY_KEY) || !isUnixSeconds(timestamp)) {
      throw new TypeError();
    }
    const signature = digest({ body, secret, keyId, idempotencyKey, timestamp }).toString('hex');
    return Object.freeze({
      'x-webhook-key-id': keyId,
      'x-webhook-timestamp': String(timestamp),
      'x-webhook-signature': `v1=${signature}`,
      'idempotency-key': idempotencyKey,
    });
  } catch {
    // Neither raw input nor crypto exceptions belong in public diagnostics.
    throw new TypeError('Invalid webhook signing input.');
  }
}

function readHeaders(input: unknown): WebhookSignatureHeaders | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return null;
  const names = new Set([
    'x-webhook-key-id', 'x-webhook-timestamp', 'x-webhook-signature', 'idempotency-key',
  ]);
  const selected: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const name of Object.getOwnPropertyNames(input)) {
    const normalized = name.toLowerCase();
    if (!names.has(normalized)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(input, name);
    if (Object.hasOwn(selected, normalized) || !descriptor || !('value' in descriptor)
      || typeof descriptor.value !== 'string') return null;
    selected[normalized] = descriptor.value;
  }
  const keyId = selected['x-webhook-key-id'];
  const timestamp = selected['x-webhook-timestamp'];
  const signature = selected['x-webhook-signature'];
  const idempotencyKey = selected['idempotency-key'];
  if (!validIdentifier(keyId, KEY_ID) || !validIdentifier(idempotencyKey, IDEMPOTENCY_KEY)
    || typeof timestamp !== 'string' || !TIMESTAMP.test(timestamp)
    || typeof signature !== 'string' || !SIGNATURE.test(signature)) return null;
  return {
    'x-webhook-key-id': keyId,
    'x-webhook-timestamp': timestamp,
    'x-webhook-signature': signature,
    'idempotency-key': idempotencyKey,
  };
}

/** Authenticate a request; the receiver must separately deduplicate its idempotency key. */
export function verifyWebhook(options: VerifyWebhookOptions): boolean {
  try {
    const { body, headers, secret, expectedKeyId, now } = options;
    const tolerance = options.toleranceSeconds === undefined
      ? DEFAULT_SIGNATURE_TOLERANCE_SECONDS : options.toleranceSeconds;
    if (!validBytes(body, secret) || !validIdentifier(expectedKeyId, KEY_ID)
      || !isUnixSeconds(now) || !isUnixSeconds(tolerance)) return false;
    const parsed = readHeaders(headers);
    if (!parsed || parsed['x-webhook-key-id'] !== expectedKeyId) return false;
    const timestamp = Number(parsed['x-webhook-timestamp']);
    if (!isUnixSeconds(timestamp) || Math.abs(now - timestamp) > tolerance) return false;
    const expected = digest({
      body, secret, keyId: expectedKeyId, timestamp,
      idempotencyKey: parsed['idempotency-key'],
    });
    const received = Buffer.from(parsed['x-webhook-signature'].slice(3), 'hex');
    return timingSafeEqual(expected, received);
  } catch {
    return false;
  }
}
