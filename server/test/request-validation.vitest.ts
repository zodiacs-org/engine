import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, LightMyRequestResponse } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';
import { JSON_LIMITS } from '../src/request-validation.js';
import { success } from '../src/responses.js';

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  const handler = vi.fn(async (request: FastifyRequest) => success(request.id, request.body));
  // Only the tests expose this route. Production calculation schemas follow in M4.
  app.post('/v1/json', handler);
  app.post('/v1/validated', {
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['samples'],
        properties: {
          samples: { type: 'integer', minimum: 1, maximum: 4 },
          timeKnown: { type: 'boolean', default: true },
          tags: { type: 'array', maxItems: 2, uniqueItems: true, items: { type: 'string', maxLength: 4 } },
          place: { type: 'object', additionalProperties: false, properties: { latitude: { type: 'number', minimum: -90, maximum: 90 } } },
        },
      },
    },
  }, handler);
  return { app, handler };
}

function expectFailure(response: LightMyRequestResponse, status = 400, code = 'invalid_request') {
  expect(response.statusCode).toBe(status);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.json()).toEqual({
    requestId: response.headers['x-request-id'],
    engine: expect.objectContaining({ name: '@zodiacs/engine', version: expect.any(String) }),
    receipts: [],
    error: { code, message: status === 413 ? 'Request body is too large.'
      : status === 415 ? 'Content type or encoding is not supported.' : 'Request is invalid.' },
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('bounded JSON bodies', () => {
  it('enforces the documented byte, container-depth and value-count limits', () => {
    expect(JSON_LIMITS).toEqual({ bytes: 65_536, depth: 16, nodes: 4096 });
  });

  it.each(['application/json', 'APPLICATION/JSON', 'application/json; charset=utf-8', 'application/json; charset="UTF-8"'])
    ('accepts UTF-8 objects with %s', async (contentType) => {
      const { app } = createApp();
      const input = { text: 'ก🌑', nested: [{ enabled: false, value: null }], number: -1.5 };
      const response = await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, 'content-type': contentType }, payload: JSON.stringify(input) });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(input);
    });

  it('measures bytes rather than string length at the body boundary', async () => {
    const { app, handler } = createApp();
    const padding = JSON_LIMITS.bytes - Buffer.byteLength(JSON.stringify({ text: '' }));
    const payload = JSON.stringify({ text: 'ก'.repeat(Math.floor(padding / 3)) + 'x'.repeat(padding % 3) });
    expect(Buffer.byteLength(payload)).toBe(65_536);
    expect(payload.length).toBeLessThan(65_536);
    const accepted = await app.inject({ method: 'POST', url: '/v1/json', headers, payload });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().data).toEqual(JSON.parse(payload));
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload: payload + ' ' }), 413, 'body_too_large');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('bounds container depth for both objects and arrays before reaching a handler', async () => {
    const { app, handler } = createApp();
    for (const kind of ['object', 'array']) {
      const nested = (depth: number) => {
        let value: unknown = 0;
        for (let layer = 1; layer < depth; layer++) value = kind === 'object' ? { nested: value } : [value];
        return { nested: value };
      };
      const accepted = await app.inject({ method: 'POST', url: '/v1/json', headers, payload: nested(16) });
      expect(accepted.statusCode).toBe(200);
      expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload: nested(17) }));
    }
    // Deep input within the byte cap must produce a client error, not a stack error.
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload: '{"nested":' + '['.repeat(10_000) + '0' + ']'.repeat(10_000) + '}' }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('bounds the total values across wide arrays and object properties', async () => {
    const { app, handler } = createApp();
    expect((await app.inject({ method: 'POST', url: '/v1/json', headers, payload: { values: Array(4094).fill(null) } })).statusCode).toBe(200);
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload: { values: Array(4095).fill(null) } }));
    const properties = Object.fromEntries(Array.from({ length: 4095 }, (_, index) => [`v${index}`, 0]));
    expect((await app.inject({ method: 'POST', url: '/v1/json', headers, payload: properties })).statusCode).toBe(200);
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload: { ...properties, extra: 0 } }));
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it.each(['', ' ', '{', '{"x":}', '{"x":1,}', '{}{}', '\ufeff{}', 'null', 'true', '0', '"text"', '[]', '[{}]', '{"x":1e999}', '{"x":[-1e999]}'])
    ('rejects malformed JSON, nonobjects and nonfinite numbers (%j)', async (payload) => {
      const { app, handler } = createApp();
      expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload }));
      expect(handler).not.toHaveBeenCalled();
    });

  it.each(['__proto__', 'constructor', 'prototype', '\\u005f_proto__'])('rejects forbidden property %s at every nesting level', async (property) => {
    const { app, handler } = createApp();
    const propertyJson = `"${property}":{"polluted":true}`;
    for (const payload of [`{${propertyJson}}`, `{"nested":[{${propertyJson}}]}`]) {
      expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload }));
    }
    expect(handler).not.toHaveBeenCalled();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it.each([[0xff], [0xc3], [0xed, 0xa0, 0x80], [0xc0, 0xaf]])('rejects invalid UTF-8 bytes %j instead of replacing them', async (...bytes: number[]) => {
    const { app, handler } = createApp();
    const payload = Buffer.concat([Buffer.from('{"text":"'), Buffer.from(bytes), Buffer.from('"}')]);
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers, payload }));
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('media types and content encodings', () => {
  it.each(['text/plain', 'application/x-www-form-urlencoded', 'application/octet-stream', 'application/ld+json', 'application/json; charset=latin1',
    'application/json; charset=utf-16', 'application/json; charset=utf8', 'application/json; junk', 'application/json; charset=utf-8; charset=latin1', 'application/jsonp'])
    ('rejects unsupported or ambiguous media type %s', async (contentType) => {
      const { app, handler } = createApp();
      expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, 'content-type': contentType }, payload: '{}' }), 415, 'unsupported_media_type');
      expect(handler).not.toHaveBeenCalled();
    });

  it.each(['gzip', 'br', 'deflate', 'identity, gzip', ''])('rejects content encoding %j before parsing', async (encoding) => {
    const { app, handler } = createApp();
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, 'content-encoding': encoding }, payload: '{malformed' }), 415, 'unsupported_media_type');
    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts identity encoding', async () => {
    const { app } = createApp();
    expect((await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, 'content-encoding': 'identity' }, payload: '{}' })).statusCode).toBe(200);
  });

  it('requires a content type for payloads even on unknown paths', async () => {
    const { app, handler } = createApp();
    for (const url of ['/v1/json', '/v1/missing']) {
      expectFailure(await app.inject({ method: 'POST', url, headers: { authorization: headers.authorization }, payload: '{}' }), 415, 'unsupported_media_type');
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['content-type', 'content-encoding'])('rejects duplicate %s fields', async (field) => {
    const { app, handler } = createApp();
    const value = field === 'content-type' ? 'application/json' : 'identity';
    expectFailure(await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, [field]: [value, value] }, payload: '{}' }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects GET bodies which the framework would otherwise ignore', async () => {
    const { app } = createApp();
    expectFailure(await app.inject({ method: 'GET', url: '/healthz', headers: { 'content-type': 'application/json' }, payload: '{}' }));
    expect((await app.inject('/healthz')).statusCode).toBe(200);
  });
});

describe('strict route schemas and private validation errors', () => {
  it('preserves accepted values without injecting defaults', async () => {
    const { app } = createApp();
    for (const input of [{ samples: 1 }, { samples: 4, timeKnown: false, tags: ['a', 'b'], place: { latitude: -90 } }]) {
      const response = await app.inject({ method: 'POST', url: '/v1/validated', headers, payload: input });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual(input);
    }
  });

  it.each([{}, { samples: '1' }, { samples: [1] }, { samples: 0 }, { samples: 5 }, { samples: 1.5 }, { samples: null },
    { samples: 1, timeKnown: 'true' }, { samples: 1, timeKnown: null }, { samples: 1, unknown: true },
    { samples: 1, tags: 'a' }, { samples: 1, tags: ['a', 'b', 'c'] }, { samples: 1, tags: ['a', 'a'] },
    { samples: 1, tags: ['abcde'] }, { samples: 1, place: { latitude: 90.1 } }, { samples: 1, place: { unknown: 0 } }])
    ('rejects schema-invalid objects without coercion or stripping (%j)', async (payload) => {
      const { app, handler } = createApp();
      expectFailure(await app.inject({ method: 'POST', url: '/v1/validated', headers, payload }));
      expect(handler).not.toHaveBeenCalled();
    });

  it('requires the body when a route declares its schema', async () => {
    const { app, handler } = createApp();
    expectFailure(await app.inject({ method: 'POST', url: '/v1/validated', headers: { authorization: headers.authorization } }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps rejected inputs, validation details and credentials out of responses and trace logs', async () => {
    const chunks: string[] = [];
    const stream = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); } });
    const { app, handler } = createApp({ logger: { level: 'trace', stream } });
    const canary = randomUUID();
    const responses = [
      await app.inject({ method: 'POST', url: '/v1/validated', headers, payload: { samples: canary } }),
      await app.inject({ method: 'POST', url: '/v1/validated', headers, payload: { samples: 1, [canary]: canary } }),
      await app.inject({ method: 'POST', url: '/v1/json', headers, payload: `{"text":"${canary}` }),
      await app.inject({ method: 'POST', url: '/v1/json', headers: { ...headers, 'content-type': `application/${canary}` }, payload: '{}' }),
    ];
    for (const response of responses.slice(0, 3)) expectFailure(response);
    expectFailure(responses[3]!, 415, 'unsupported_media_type');
    expect(handler).not.toHaveBeenCalled();
    await app.close();
    const logs = chunks.join('');
    expect(logs.trim().split('\n').map((line) => JSON.parse(line)).filter((entry) => entry.event === 'request_completed').map((entry) => entry.statusCode))
      .toEqual([400, 400, 400, 415]);
    const output = logs + responses.map((response) => response.body).join('');
    for (const privateText of [canary, key, 'instancePath', 'schemaPath', 'stack']) expect(output).not.toContain(privateText);
  });
});
