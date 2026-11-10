import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGNATURE_TOLERANCE_SECONDS,
  MAX_WEBHOOK_BODY_BYTES,
  WEBHOOK_SECRET_BYTES,
  signWebhook,
  verifyWebhook,
} from '../src/signatures.js';
import type { ReceivedWebhookHeaders, SignWebhookOptions, VerifyWebhookOptions } from '../src/signatures.js';

function fixture(overrides: Partial<SignWebhookOptions> = {}) {
  const options = {
    body: Buffer.from('{"event":"synthetic-event","receipt":{"engine":"synthetic"}}'),
    secret: randomBytes(WEBHOOK_SECRET_BYTES),
    keyId: 'callback_key',
    idempotencyKey: 'event:synthetic.1',
    timestamp: 946_684_800,
    ...overrides,
  };
  const headers = signWebhook(options);
  const receiver: VerifyWebhookOptions = {
    body: options.body, headers, secret: options.secret,
    expectedKeyId: options.keyId, now: options.timestamp,
  };
  return { options, headers, receiver };
}

// Independent HMAC construction for a runtime key, using SHA-256's block size.
function referenceHmac(secret: Uint8Array, message: Uint8Array): string {
  const innerPad = Buffer.alloc(64, 0x36);
  const outerPad = Buffer.alloc(64, 0x5c);
  for (let index = 0; index < secret.length; index++) {
    innerPad[index] = innerPad[index]! ^ secret[index]!;
    outerPad[index] = outerPad[index]! ^ secret[index]!;
  }
  const inner = createHash('sha256').update(innerPad).update(message).digest();
  return createHash('sha256').update(outerPad).update(inner).digest('hex');
}

describe('webhook signing protocol', () => {
  it('binds protocol, timestamp, key id, identity and raw bytes to SHA-256 HMAC', () => {
    const body = new Uint8Array([0xff, 0x00, 0x0a, 0xc3, 0xa9]);
    const { options, headers, receiver } = fixture({ body });
    const preimage = Buffer.concat([
      Buffer.from('zodiacs-webhook/v1\n946684800\ncallback_key\nevent:synthetic.1\n'),
      body,
    ]);
    expect(headers).toEqual({
      'x-webhook-key-id': options.keyId,
      'x-webhook-timestamp': '946684800',
      'x-webhook-signature': `v1=${referenceHmac(options.secret, preimage)}`,
      'idempotency-key': options.idempotencyKey,
    });
    expect(Object.isFrozen(headers)).toBe(true);
    expect(verifyWebhook(receiver)).toBe(true);
  });

  it('uses only the selected body and key views without mutating caller buffers', () => {
    const keyBacking = randomBytes(40);
    const secret = new Uint8Array(keyBacking.buffer, keyBacking.byteOffset + 4, 32);
    const bodyBacking = new Uint8Array([0x00, 0x61, 0x0a, 0xff]);
    const body = bodyBacking.subarray(1, 3);
    const beforeKey = Buffer.from(keyBacking);
    const beforeBody = Buffer.from(bodyBacking);
    const { options, headers, receiver } = fixture({ body, secret });
    const copied = signWebhook({ ...options, body: Buffer.from(body), secret: Buffer.from(secret) });
    expect(headers).toEqual(copied);
    expect(verifyWebhook(receiver)).toBe(true);
    expect(keyBacking.equals(beforeKey)).toBe(true);
    expect(Buffer.from(bodyBacking).equals(beforeBody)).toBe(true);
  });

  it('accepts the empty body and enforces the byte limit, including its boundary', () => {
    expect(MAX_WEBHOOK_BODY_BYTES).toBe(262_144);
    for (const body of [new Uint8Array(0), new Uint8Array(MAX_WEBHOOK_BODY_BYTES)]) {
      expect(verifyWebhook(fixture({ body }).receiver)).toBe(true);
    }
    const { options, receiver } = fixture();
    const tooLarge = new Uint8Array(MAX_WEBHOOK_BODY_BYTES + 1);
    expect(() => signWebhook({ ...options, body: tooLarge })).toThrow('Invalid webhook signing input.');
    expect(verifyWebhook({ ...receiver, body: tooLarge })).toBe(false);
  });

  it('accepts valid identifier boundaries and Date-representable integer Unix seconds', () => {
    for (const timestamp of [0, 8_640_000_000_000]) {
      const { receiver } = fixture({ timestamp, keyId: 'a'.repeat(128), idempotencyKey: '1'.repeat(256) });
      expect(verifyWebhook(receiver)).toBe(true);
    }
    expect(verifyWebhook(fixture({ keyId: 'A', idempotencyKey: '1' }).receiver)).toBe(true);
  });

  it('is deterministic for the same attempt and re-signs later attempts with the same identity', () => {
    const { options, headers, receiver } = fixture();
    expect(signWebhook(options)).toEqual(headers);
    const retried = signWebhook({ ...options, timestamp: options.timestamp + 10 });
    expect(retried['x-webhook-signature']).not.toBe(headers['x-webhook-signature']);
    expect(retried['idempotency-key']).toBe(headers['idempotency-key']);
    expect(verifyWebhook({ ...receiver, headers: retried, now: options.timestamp + 10 })).toBe(true);
  });
});

describe('receiver authenticity checks', () => {
  it('rejects changed body bytes, including equivalent JSON, whitespace and newlines', () => {
    const { receiver } = fixture({ body: Buffer.from('{"a":1,"b":2}') });
    for (const body of ['{"b":2,"a":1}', '{"a":1, "b":2}', '{"a":1,"b":2}\n', '{"a":1,"b":3}']) {
      expect(verifyWebhook({ ...receiver, body: Buffer.from(body) })).toBe(false);
    }
  });

  it('rejects a different secret, key selection, timestamp, identity or signature', () => {
    const { receiver, headers, options } = fixture();
    expect(verifyWebhook({ ...receiver, secret: randomBytes(WEBHOOK_SECRET_BYTES) })).toBe(false);
    expect(verifyWebhook({ ...receiver, expectedKeyId: 'another_key' })).toBe(false);
    for (const changes of [
      { 'x-webhook-key-id': 'another_key' },
      { 'x-webhook-timestamp': String(options.timestamp + 1) },
      { 'idempotency-key': 'another:event' },
      { 'x-webhook-signature': `v1=${'0'.repeat(64)}` },
    ]) {
      expect(verifyWebhook({ ...receiver, headers: { ...headers, ...changes } })).toBe(false);
    }
    const differentKeyHeader = { ...headers, 'x-webhook-key-id': 'another_key' };
    expect(verifyWebhook({ ...receiver, headers: differentKeyHeader, expectedKeyId: 'another_key' })).toBe(false);
  });

  it('includes the boundary of the default clock tolerance and rejects older or future requests', () => {
    expect(DEFAULT_SIGNATURE_TOLERANCE_SECONDS).toBe(300);
    const { receiver } = fixture();
    for (const offset of [-301, -300, -1, 0, 1, 300, 301]) {
      expect(verifyWebhook({ ...receiver, now: receiver.now + offset })).toBe(Math.abs(offset) <= 300);
    }
    expect(verifyWebhook({ ...receiver, toleranceSeconds: 0 })).toBe(true);
    expect(verifyWebhook({ ...receiver, now: receiver.now + 1, toleranceSeconds: 0 })).toBe(false);
    expect(verifyWebhook({ ...receiver, now: receiver.now - 1, toleranceSeconds: 0 })).toBe(false);
    expect(verifyWebhook({ ...receiver, now: receiver.now + 301, toleranceSeconds: 301 })).toBe(true);
  });

  it('rejects noninteger or nonfinite receiver clocks and tolerances without a bypass', () => {
    const { receiver } = fixture();
    for (const value of [NaN, Infinity, -Infinity, -1, 1.5, 8_640_000_000_001, Number.MAX_SAFE_INTEGER,
      null, '300', false, {}, []]) {
      expect(verifyWebhook({ ...receiver, now: value } as VerifyWebhookOptions)).toBe(false);
      expect(verifyWebhook({ ...receiver, toleranceSeconds: value } as VerifyWebhookOptions)).toBe(false);
    }
  });

  it('accepts case-insensitive header names and unrelated ordinary HTTP headers', () => {
    const { receiver, headers } = fixture();
    const renamed = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toUpperCase(), value]));
    expect(verifyWebhook({ ...receiver, headers: { ...renamed, 'content-type': 'application/json' } })).toBe(true);
  });

  it('rejects missing headers, duplicate case aliases, arrays and comma-joined values', () => {
    const { receiver, headers } = fixture();
    for (const name of Object.keys(headers) as (keyof typeof headers)[]) {
      const missing: Record<string, string> = { ...headers };
      delete missing[name];
      expect(verifyWebhook({ ...receiver, headers: missing })).toBe(false);
      expect(verifyWebhook({ ...receiver, headers: { ...headers, [name.toUpperCase()]: headers[name] } })).toBe(false);
      for (const value of [undefined, [], [headers[name]], [headers[name], headers[name]], `${headers[name]}, ${headers[name]}`]) {
        expect(verifyWebhook({ ...receiver, headers: { ...headers, [name]: value } })).toBe(false);
      }
    }
  });

  it.each(['', '-1', '+1', '01', '1.0', '1e3', ' 946684800', '946684800 ', '946684800\n',
    'NaN', 'Infinity', '8640000000001', '9007199254740992', '1'.repeat(1000)])(
    'rejects noncanonical timestamp header %#', timestamp => {
      const { receiver, headers } = fixture();
      expect(verifyWebhook({ ...receiver, headers: { ...headers, 'x-webhook-timestamp': timestamp } })).toBe(false);
    },
  );

  it('rejects malformed or ambiguous signature syntax before digest comparison', () => {
    const { receiver, headers } = fixture();
    const signature = headers['x-webhook-signature'];
    for (const value of ['', signature.slice(3), signature.slice(0, -1), `${signature}0`,
      signature.toUpperCase(), signature.replace('v1=', 'v2='), ` ${signature}`, `${signature}\n`,
      `v1=${'g'.repeat(64)}`, `${signature},${signature}`, `v1=${'a'.repeat(1000)}`]) {
      expect(verifyWebhook({ ...receiver, headers: { ...headers, 'x-webhook-signature': value } })).toBe(false);
    }
  });

  it('does not read inherited headers or invoke header accessors', () => {
    const { receiver, headers } = fixture();
    expect(verifyWebhook({ ...receiver, headers: Object.create(headers) as ReceivedWebhookHeaders })).toBe(false);
    const accessor = { ...headers };
    let calls = 0;
    Object.defineProperty(accessor, 'x-webhook-signature', { get() { calls++; return headers['x-webhook-signature']; } });
    expect(verifyWebhook({ ...receiver, headers: accessor })).toBe(false);
    expect(calls).toBe(0);
    const noPrototype = Object.assign(Object.create(null) as Record<string, string>, headers);
    expect(verifyWebhook({ ...receiver, headers: noPrototype })).toBe(true);
  });
});

describe('signing input validation and diagnostics', () => {
  it('requires precisely the provisioned secret byte length and Uint8Array inputs', () => {
    expect(WEBHOOK_SECRET_BYTES).toBe(32);
    const { options, receiver } = fixture();
    for (const size of [0, 1, 31, 33, 64]) {
      const secret = randomBytes(size);
      expect(() => signWebhook({ ...options, secret })).toThrow('Invalid webhook signing input.');
      expect(verifyWebhook({ ...receiver, secret })).toBe(false);
    }
    for (const value of [null, undefined, 'runtime-input-marker', [], {}, new ArrayBuffer(32), new Uint16Array(16)]) {
      expect(() => signWebhook({ ...options, secret: value } as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
      expect(() => signWebhook({ ...options, body: value } as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
      expect(verifyWebhook({ ...receiver, secret: value } as VerifyWebhookOptions)).toBe(false);
      expect(verifyWebhook({ ...receiver, body: value } as VerifyWebhookOptions)).toBe(false);
    }
  });

  it('rejects malformed key identifiers and idempotency keys without echoing them', () => {
    const { options, receiver, headers } = fixture();
    for (const keyId of ['', '1key', '_key', 'runtime-input-marker\n', 'key/ref', 'clé', 'a'.repeat(129), null, 1, {}]) {
      expect(() => signWebhook({ ...options, keyId } as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
      expect(verifyWebhook({ ...receiver, expectedKeyId: keyId } as VerifyWebhookOptions)).toBe(false);
      expect(verifyWebhook({ ...receiver, headers: { ...headers, 'x-webhook-key-id': keyId } } as unknown as VerifyWebhookOptions)).toBe(false);
    }
    for (const idempotencyKey of ['', '_event', '.event', ':event', 'runtime-input-marker\n', 'event/ref',
      'event key', 'évent', 'a'.repeat(257), null, 1, {}]) {
      expect(() => signWebhook({ ...options, idempotencyKey } as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
      expect(verifyWebhook({ ...receiver, headers: { ...headers, 'idempotency-key': idempotencyKey } } as unknown as VerifyWebhookOptions)).toBe(false);
    }
  });

  it('rejects invalid signing clocks and runtime inputs with static errors', () => {
    const { options, receiver } = fixture();
    for (const timestamp of [NaN, Infinity, -Infinity, -1, 1.5, 8_640_000_000_001,
      Number.MAX_SAFE_INTEGER, '946684800', null, {}]) {
      expect(() => signWebhook({ ...options, timestamp } as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
    }
    for (const value of [null, undefined, [], {}, 'runtime-input-marker']) {
      expect(() => signWebhook(value as unknown as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
      expect(verifyWebhook(value as unknown as VerifyWebhookOptions)).toBe(false);
      expect(verifyWebhook({ ...receiver, headers: value } as VerifyWebhookOptions)).toBe(false);
    }
    const throwing = Object.defineProperty({}, 'body', { get() { throw new Error('runtime-input-marker'); } });
    expect(() => signWebhook(throwing as SignWebhookOptions)).toThrow('Invalid webhook signing input.');
    expect(verifyWebhook(throwing as VerifyWebhookOptions)).toBe(false);
  });
});
