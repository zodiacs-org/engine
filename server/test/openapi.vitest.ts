import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance, type FastifySchema } from 'fastify';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { OpenAPIV3_1 } from 'openapi-types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as engine from '../../src/index.js';
import { CALC_SPAN } from '../../src/calc.js';
import * as receipt from '../../src/receipt.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { buildApp } from '../src/app.js';
import { JSON_LIMITS } from '../src/request-validation.js';
import { DEFAULT_RATE_LIMIT } from '../src/rate-limit.js';
import { registerOpenApi } from '../src/openapi.js';
import { routeDocs } from '../src/route-docs.js';
import { CalculationError, type CalculationErrorCode } from '../src/calculation-pool.js';
import { DEFAULT_RESOURCE_LIMITS, HTTP_LIMITS } from '../src/resource-limits.js';

type Schema = Record<string, unknown>;
interface Operation {
  operationId: string;
  security: unknown[];
  requestBody?: { required: boolean; content: { 'application/json': { schema: Schema; examples: Record<string, { value: object }> } } };
  responses: Record<string, { headers: Record<string, { schema: Schema }>; content: { 'application/json': { schema: Schema } } }>;
  'x-query-schema'?: Schema;
  'x-receipt-scopes': { scope: string; kind: string }[];
  'x-rate-limit-cost': number;
}
interface Document {
  openapi: string;
  jsonSchemaDialect: string;
  info: { version: string };
  servers: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema>; securitySchemes: Record<string, unknown>; responses: Record<string, unknown> };
  'x-json-limits': typeof JSON_LIMITS;
  'x-rate-limit': typeof DEFAULT_RATE_LIMIT;
  'x-engine': unknown;
  'x-time-coverage': unknown;
  'x-resource-limits': unknown;
}

const apps: FastifyInstance[] = [];
const key = randomBytes(32).toString('base64url');
const authorization = { authorization: `Bearer ${key}` };
const headers = { ...authorization, 'content-type': 'application/json' };
const birth = { utc: '2001-02-03T04:05:06.789Z', latitude: 23.45, longitude: -67.89 };
const paths = ['/v1/natal', '/v1/transits', '/v1/synastry', '/v1/returns/solar', '/v1/returns/lunar', '/v1/moon-phase', '/v1/houses'];

function createApp(options: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({ logger: false, apiKeys: new ApiKeyStore([key]), ...options });
  apps.push(app);
  return app;
}
async function document(app: FastifyInstance): Promise<Document> {
  const response = await app.inject('/openapi.json');
  expect(response.statusCode).toBe(200);
  return response.json<Document>();
}
function validator(doc: Document) {
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(doc, 'api');
  return {
    schema: (schema: Schema, value: unknown) => {
      const validate = ajv.compile({ ...schema, components: doc.components });
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    },
    response: (path: string, status: number, value: unknown, method = 'post') => {
      const pointer = path.replaceAll('~', '~0').replaceAll('/', '~1');
      const validate = ajv.compile({ $ref: `api#/paths/${pointer}/${method}/responses/${status}/content/application~1json/schema` });
      expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
    }
  };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('generated OpenAPI contract', () => {
  it('validates as OpenAPI 3.1 with resolvable references and JSON Schema 2020-12 schemas', async () => {
    const app = createApp();
    const doc = await document(app);
    expect(doc.openapi).toBe('3.1.1');
    expect(doc.jsonSchemaDialect).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(doc.info.version).toBe(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    await SwaggerParser.validate(structuredClone(doc) as unknown as OpenAPIV3_1.Document, { resolve: { external: false }, dereference: { circular: false } });
    const ajv = new Ajv2020({ strict: false, validateFormats: false });
    for (const schema of Object.values(doc.components.schemas)) {
      expect(ajv.validateSchema(schema), JSON.stringify(ajv.errors)).toBe(true);
      // Compile every component even when an example has no instance of it.
      ajv.compile({ ...schema, components: doc.components });
    }
    expect(Object.keys(doc.paths).sort()).toEqual([...paths, '/healthz', '/readyz', '/openapi.json'].sort());
    expect(new Set(Object.values(doc.paths).flatMap((item) => Object.values(item).map((op) => op.operationId))).size).toBe(Object.keys(doc.paths).length);
    for (const [path, item] of Object.entries(doc.paths)) {
      const method = path.startsWith('/v1/') ? 'POST' : 'GET';
      expect(app.hasRoute({ url: path, method })).toBe(true);
      expect(Object.keys(item)).toEqual([method.toLowerCase()]);
      expect(item[method.toLowerCase()]!.security).toEqual(method === 'GET' ? [] : [{ apiKey: [] }]);
    }
    expect(doc.components.securitySchemes.apiKey).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(doc['x-engine']).toEqual({ name: '@zodiacs/engine', version: engine.ENGINE_VERSION, ephemeris: engine.EPHEMERIS });
    expect(doc['x-json-limits']).toMatchObject(JSON_LIMITS);
    expect(doc['x-time-coverage']).toMatchObject({ referenceSpan: engine.REFERENCE_SPAN, ephemerisSpan: engine.EPHEMERIS_SPAN, housesSpan: CALC_SPAN });
    expect(doc['x-rate-limit']).toMatchObject(DEFAULT_RATE_LIMIT);
    expect(doc).toHaveProperty('x-admission-limit', expect.objectContaining({ capacity: 120, windowMs: 60_000, maxClients: 4_096 }));
    expect(doc['x-resource-limits']).toMatchObject({ ...DEFAULT_RESOURCE_LIMITS, ...HTTP_LIMITS });
  });

  it('documents admission refusals on public and protected routes', async () => {
    const app = createApp({ monotonicNow: () => 0 });
    const doc = await document(app);
    for (let index = 1; index < 120; index++) expect((await app.inject('/healthz')).statusCode).toBe(200);
    for (const path of ['/healthz', '/readyz', '/openapi.json', '/v1/natal']) {
      const response = await app.inject({ url: path, method: path === '/v1/natal' ? 'POST' : 'GET' });
      expect(response.statusCode).toBe(429);
      expect(response.headers).not.toHaveProperty('x-ratelimit-limit');
      validator(doc).response(path, 429, response.json(), path === '/v1/natal' ? 'post' : 'get');
    }
  });

  it('discovers configured resource bounds without incorporating request state', async () => {
    const limits = { ...DEFAULT_RESOURCE_LIMITS, maxConnections: 3, calculationTimeoutMs: 800, calculationQueueSize: 0 };
    const app = createApp({ limits });
    const doc = await document(app);
    expect(doc['x-resource-limits']).toMatchObject({ ...limits, ...HTTP_LIMITS });
    expect(app.server.maxConnections).toBe(3);
    expect(app.server.headersTimeout).toBe(10000);
    expect(app.server.requestTimeout).toBe(30000);
    expect(app.server.timeout).toBe(30000);
    expect(app.server.keepAliveTimeout).toBe(5000);
  });

  it.each([
    ['server_busy', 503], ['not_ready', 503], ['calculation_timeout', 504],
    ['calculation_failed', 500], ['internal_error', 500], ['invalid_request', 400], ['receipt_unavailable', 422],
  ] satisfies [CalculationErrorCode, number][])('documents sanitized %s worker failures', async (code, status) => {
    const run = vi.fn(async () => { throw new CalculationError(code); });
    const app = createApp({ calculations: { run } });
    const doc = await document(app);
    const response = await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth });
    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      requestId: response.headers['x-request-id'], engine: doc['x-engine'], receipts: [],
      error: { code, message: new CalculationError(code).message },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-ratelimit-remaining']).toBe('59');
    expect(run).toHaveBeenCalledExactlyOnceWith('natal', birth, response.headers['x-request-id']);
    validator(doc).response('/v1/natal', status, response.json());
  });

  it('authenticates, meters and validates before admitting calculation work', async () => {
    const run = vi.fn(async () => { throw new CalculationError('server_busy'); });
    const app = createApp({ calculations: { run }, rateLimit: { capacity: 2, refillPerSecond: 1 }, monotonicNow: () => 0 });
    expect((await app.inject({ method: 'POST', url: '/v1/natal', payload: birth })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: { ...birth, unexpected: true } })).statusCode).toBe(400);
    expect(run).not.toHaveBeenCalled();
    expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth })).statusCode).toBe(503);
    expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth })).statusCode).toBe(429);
    expect(run).toHaveBeenCalledTimes(1);
    for (const url of ['/healthz', '/readyz', '/openapi.json']) expect((await app.inject(url)).statusCode).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('requires documentation for every sealed application route and unique operation identities', async () => {
    const app = Fastify({ exposeHeadRoutes: false });
    apps.push(app);
    const seal = registerOpenApi(app);
    app.get('/undocumented', async () => ({}));
    expect(seal).toThrow('missing OpenAPI documentation');
    const duplicate = Fastify({ exposeHeadRoutes: false });
    apps.push(duplicate);
    const sealDuplicate = registerOpenApi(duplicate);
    duplicate.get('/duplicate', { config: { openapi: routeDocs.openapi } }, async () => ({}));
    expect(sealDuplicate).toThrow('Duplicate OpenAPI operation');
  });

  it('checks every synthetic example against the actual request schema, HTTP response schema and receipt scope', async () => {
    const app = createApp();
    const captured = new Map<string, FastifySchema | undefined>();
    app.addHook('onRequest', async (request) => { captured.set(request.routeOptions.url!, request.routeOptions.schema); });
    const doc = await document(app);
    const validate = validator(doc);
    for (const path of paths) {
      const op = doc.paths[path]!.post!;
      const body = op.requestBody!;
      expect(body.required).toBe(true);
      for (const { value } of Object.values(body.content['application/json'].examples)) {
        validate.schema(body.content['application/json'].schema, value);
        const response = await app.inject({ method: 'POST', url: path, headers, payload: value });
        expect(response.statusCode, path).toBe(200);
        validate.response(path, 200, response.json());
        expect(body.content['application/json'].schema).toEqual(captured.get(path)!.body);
        expect(op['x-query-schema']).toEqual(captured.get(path)!.querystring);
        expect(response.json().receipts.map((item: { scope: string }) => item.scope)).toEqual(op['x-receipt-scopes'].map(({ scope }) => scope));
        for (const item of response.json().receipts) {
          const scoped = item.scope.slice(1).split('/').reduce((value: Record<string, unknown>, key: string) => value[key], response.json());
          expect(scoped).toBeDefined();
          if (item.envelope) expect(receipt.parseNatalEnvelope(JSON.stringify(item.envelope)).ok).toBe(true);
          else expect(item.receipt).toEqual(scoped.receipt);
        }
      }
      const wrongQuery = await app.inject({ method: 'POST', url: `${path}?unused=1`, headers, payload: body.content['application/json'].examples.synthetic!.value });
      expect(wrongQuery.statusCode).toBe(400);
      validate.response(path, 400, wrongQuery.json());
    }
    for (const path of ['/healthz', '/readyz', '/openapi.json']) {
      const response = await app.inject(path);
      validate.response(path, 200, response.json(), 'get');
    }
  });

  it.each([
    { utc: '1701-02-03T04:05:06Z' },
    { utc: birth.utc, timeKnown: false, latitude: 90, longitude: 180 },
    { ...birth, timeScale: 'ut1', deltaT: 0 },
    { ...birth, timeScale: 'tt', flags: ['lmt', 'lmt'] },
    { ...birth, latitude: 78.25, houseSystem: 'koch' },
    { ...birth, deltaT: 1e10 }
  ])('describes optional, nullable, canonical and pinned chart output: %j', async (input) => {
    const app = createApp();
    const doc = await document(app);
    const response = await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: input });
    expect(response.statusCode).toBe(200);
    validator(doc).response('/v1/natal', 200, response.json());
  });

  it('describes houses output and native receipts across every system and polar geometry', async () => {
    const app = createApp();
    const validate = validator(await document(app));
    for (const houseSystem of engine.HOUSE_SYSTEMS) {
      for (const latitude of [birth.latitude, 78.25]) {
        const payload = {
          time: { jd: 2451545, scale: 'tt', deltaT: 64 },
          place: { latitude, longitude: birth.longitude },
          houseSystem,
        };
        const response = await app.inject({ method: 'POST', url: '/v1/houses', headers, payload });
        expect(response.statusCode, `${houseSystem} at ${latitude}`).toBe(200);
        validate.response('/v1/houses', 200, response.json());
      }
    }
  });

  it('describes optional return settings, nullable locations and independent natal clocks', async () => {
    const app = createApp();
    const validate = validator(await document(app));
    const at = '2024-06-07T08:09:10+02:00';
    const cases = [
      ['/v1/returns/solar', {
        natal: { ...birth, latitude: 78.25, houseSystem: 'placidus' }, at,
      }],
      ['/v1/returns/solar', {
        natal: { ...birth, timeKnown: false }, at, selection: 'nearest',
        location: { latitude: -23.45, longitude: 67.89 }, houseSystem: 'equal-mc',
      }],
      ['/v1/returns/solar', {
        natal: { utc: birth.utc, timeScale: 'tt', deltaT: 0 }, at, location: null,
      }],
      ['/v1/returns/lunar', {
        natal: { ...birth, timeScale: 'ut1', deltaT: 123.456 }, after: at,
        location: { latitude: -78.25, longitude: 67.89 }, houseSystem: 'koch',
      }],
      ['/v1/returns/lunar', { natal: { utc: birth.utc }, after: at }],
    ] as const;
    for (const [url, payload] of cases) {
      const response = await app.inject({ method: 'POST', url, headers, payload });
      expect(response.statusCode, JSON.stringify({ url, payload })).toBe(200);
      validate.response(url, 200, response.json());
    }
  });

  it('keeps conditional request validation intact without coercing defaults or null', async () => {
    const app = createApp();
    const doc = await document(app);
    const ajv = new Ajv2020({ strict: false, coerceTypes: false, useDefaults: false, removeAdditional: false });
    const validate = ajv.compile(doc.paths['/v1/natal']!.post!.requestBody!.content['application/json'].schema);
    for (const input of [{ ...birth, latitude: '23.45' }, { utc: birth.utc, latitude: 23.45 }, { ...birth, latitude: 90 }, { ...birth, timeScale: null }, { ...birth, extra: true }]) {
      expect(validate(input)).toBe(false);
      expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: input })).statusCode).toBe(400);
    }
    const invalidCalendar = { utc: '2001-02-30' };
    expect(validate(invalidCalendar)).toBe(true); // Engine semantic validation follows JSON Schema.
    expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: invalidCalendar })).statusCode).toBe(400);
    const minimal = { utc: birth.utc };
    const copy = structuredClone(minimal);
    expect(validate(copy)).toBe(true);
    expect(copy).toEqual(minimal);
  });

  it('describes ordinary errors and their headers, including receipt refusal and unavailable readiness', async () => {
    const app = createApp({ rateLimit: { capacity: 10, refillPerSecond: 1 }, monotonicNow: () => 0, readiness: () => false });
    const doc = await document(app);
    const validate = validator(doc);
    const cases = [
      { headers: {}, payload: birth, status: 401 },
      { headers, payload: {}, status: 400 },
      { headers, payload: '{', status: 400 },
      { headers, payload: ' '.repeat(JSON_LIMITS.bytes + 1), status: 413 },
      { headers: { ...authorization, 'content-type': 'text/plain' }, payload: '{}', status: 415 }
    ];
    for (const item of cases) {
      const response = await app.inject({ method: 'POST', url: '/v1/natal', headers: item.headers, payload: item.payload });
      expect(response.statusCode).toBe(item.status);
      validate.response('/v1/natal', item.status, response.json());
      if (item.status === 401) expect(response.headers['www-authenticate']).toBe('Bearer realm="engine-api"');
    }
    vi.spyOn(receipt, 'createNatalEnvelope').mockImplementationOnce(() => { throw new receipt.NatalEnvelopeError('inconsistent_result'); });
    const refused = await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth });
    expect(refused.statusCode).toBe(422);
    validate.response('/v1/natal', 422, refused.json());
    vi.spyOn(engine, 'natalChart').mockImplementationOnce(() => { throw new Error(randomUUID()); });
    const failed = await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth });
    expect(failed.statusCode).toBe(500);
    validate.response('/v1/natal', 500, failed.json());
    const notReady = await app.inject('/readyz');
    expect(notReady.statusCode).toBe(503);
    validate.response('/readyz', 503, notReady.json(), 'get');
    const absent = await app.inject({ url: '/absent', headers: authorization });
    expect(absent.statusCode).toBe(404);
    validate.schema((doc.components.responses.NotFound as { content: { 'application/json': { schema: Schema } } }).content['application/json'].schema, absent.json());
  });

  it('uses configured limits, stays public without spending tokens, and reports rate-limit errors accurately', async () => {
    const app = createApp({ rateLimit: { capacity: 1, refillPerSecond: 3 }, monotonicNow: () => 0 });
    const doc = await document(app);
    expect(doc['x-rate-limit']).toMatchObject({ capacity: 1, refillPerSecond: 3 });
    for (const auth of [undefined, headers, { authorization: 'malformed' }]) {
      const response = await app.inject({ url: '/openapi.json', ...(auth ? { headers: auth } : {}) });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    }
    expect((await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth })).statusCode).toBe(200);
    const exhausted = await app.inject({ method: 'POST', url: '/v1/natal', headers, payload: birth });
    expect(exhausted.statusCode).toBe(429);
    expect(exhausted.headers).toMatchObject({ 'retry-after': '1', 'x-ratelimit-limit': '1', 'x-ratelimit-remaining': '0' });
    validator(doc).response('/v1/natal', 429, exhausted.json());
    expect((await app.inject('/openapi.json')).json()).toEqual(doc);
    expect(doc.paths['/openapi.json']!.get!['x-rate-limit-cost']).toBe(0);
    for (const path of paths) expect(doc.paths[path]!.post!['x-rate-limit-cost']).toBe(1);
  });

  it('returns a deterministic raw document and logs neither credentials nor hostile request metadata', async () => {
    let logs = '';
    const stream = new Writable({ write(chunk, _encoding, done) { logs += chunk.toString(); done(); } });
    const canary = randomUUID();
    const app = createApp({ logger: { level: 'trace', stream } });
    const clean = await app.inject('/openapi.json');
    const hostile = await app.inject({ url: '/openapi.json', headers: { authorization: `Bearer ${key}`, host: `${canary}.invalid`, 'x-forwarded-host': canary, 'x-request-id': canary } });
    expect(hostile.body).toBe(clean.body);
    expect(hostile.headers['x-request-id']).not.toBe(clean.headers['x-request-id']);
    expect(hostile.headers).toMatchObject({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    expect(hostile.json()).not.toHaveProperty('receipts');
    expect(hostile.json().servers).toEqual([{ url: '/', description: expect.any(String) }]);
    const other = await createApp().inject('/openapi.json');
    expect(other.body).toBe(clean.body);
    const query = await app.inject(`/openapi.json?key=${canary}`);
    expect(query.statusCode).toBe(400);
    validator(clean.json()).response('/openapi.json', 400, query.json(), 'get');
    await app.close();
    for (const secret of [key, canary]) {
      expect(logs).not.toContain(secret);
      expect(hostile.body).not.toContain(secret);
      expect(query.body).not.toContain(secret);
    }
    expect(logs).toContain('"route":"/openapi.json"');
  });
});
