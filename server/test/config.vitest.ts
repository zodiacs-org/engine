import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { DEFAULT_RESOURCE_LIMITS, HTTP_LIMITS, resourceLimits } from '../src/resource-limits.js';

const rateLimit = { capacity: 60, refillPerSecond: 1 };
const limits = { maxConnections: 128, requestTimeoutMs: 30000, shutdownTimeoutMs: 10000, calculationTimeoutMs: 5000, calculationQueueSize: 8 };

describe('environment configuration', () => {
  it('uses local defaults', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3000, logLevel: 'info', rateLimit, limits });
  });

  it('accepts explicit listener and logging settings', () => {
    expect(readConfig({ HOST: '0.0.0.0', PORT: '8080', LOG_LEVEL: 'warn' })).toEqual({ host: '0.0.0.0', port: 8080, logLevel: 'warn', rateLimit, limits });
    expect(readConfig({ HOST: '::1', PORT: '0', LOG_LEVEL: 'silent' })).toEqual({ host: '::1', port: 0, logLevel: 'silent', rateLimit, limits });
    expect(readConfig({ PORT: '65535' }).port).toBe(65535);
  });

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])('accepts log level %s', (logLevel) => {
    expect(readConfig({ LOG_LEVEL: logLevel }).logLevel).toBe(logLevel);
  });

  it.each(['', '-1', '65536', '1.5', '1e3', '+80', ' 80', '80 ', 'NaN', 'Infinity', '80\n'])('rejects invalid PORT %j', (port) => {
    expect(() => readConfig({ PORT: port })).toThrowError('PORT is invalid.');
  });

  it.each(['', ' ', ' localhost', 'localhost ', 'local host', 'local\nhost', '\tlocalhost'])('rejects invalid HOST %j', (host) => {
    expect(() => readConfig({ HOST: host })).toThrowError('HOST is invalid.');
  });

  it.each(['', 'INFO', 'verbose', ' info', 'info\n'])('rejects invalid LOG_LEVEL %j', (logLevel) => {
    expect(() => readConfig({ LOG_LEVEL: logLevel })).toThrowError('LOG_LEVEL is invalid.');
  });

  it.each(['HOST', 'PORT', 'LOG_LEVEL'] as const)('does not echo invalid %s values', (key) => {
    const canary = `${randomUUID()} ${randomUUID()}`;
    expect(() => readConfig({ [key]: canary })).toThrowError(new Error(`${key} is invalid.`));
  });

  it('does not mutate the supplied environment or return unrelated variables', () => {
    const env = Object.freeze({ PORT: '1234', UNRELATED: randomUUID() });
    expect(readConfig(env)).toEqual({ host: '127.0.0.1', port: 1234, logLevel: 'info', rateLimit, limits });
  });

  it('accepts bounded token bucket settings and defaults each independently', () => {
    expect(readConfig({ RATE_LIMIT_CAPACITY: '1', RATE_LIMIT_REFILL_PER_SECOND: '10000' }).rateLimit)
      .toEqual({ capacity: 1, refillPerSecond: 10000 });
    expect(readConfig({ RATE_LIMIT_CAPACITY: '10000', RATE_LIMIT_REFILL_PER_SECOND: '1' }).rateLimit)
      .toEqual({ capacity: 10000, refillPerSecond: 1 });
    expect(readConfig({ RATE_LIMIT_CAPACITY: '5' }).rateLimit).toEqual({ capacity: 5, refillPerSecond: 1 });
    expect(readConfig({ RATE_LIMIT_REFILL_PER_SECOND: '5' }).rateLimit).toEqual({ capacity: 60, refillPerSecond: 5 });
  });

  it.each(['RATE_LIMIT_CAPACITY', 'RATE_LIMIT_REFILL_PER_SECOND'])('rejects malformed or out-of-range %s without supplied values', (name) => {
    for (const value of ['', '0', '-1', '10001', '1.5', '1e3', ' 1', '1 ', '+1', 'NaN', 'Infinity', '1\n', randomUUID()]) {
      expect(() => readConfig({ [name]: value })).toThrowError('Rate limit configuration is invalid.');
    }
  });
});

describe('resource configuration', () => {
  it('uses tested defaults and snapshots the caller configuration', () => {
    expect(DEFAULT_RESOURCE_LIMITS).toEqual(limits);
    expect(HTTP_LIMITS).toEqual({ headerBytes: 16384, headersTimeoutMs: 10000, timeoutCheckIntervalMs: 1000, keepAliveTimeoutMs: 5000 });
    const supplied = { ...limits };
    const result = resourceLimits(supplied);
    supplied.calculationQueueSize = 0;
    expect(result).toEqual(limits);
    expect(Object.isFrozen(result)).toBe(true);
    expect(resourceLimits({ ...limits, privateValue: randomUUID() } as typeof limits)).toEqual(limits);
  });

  it.each([
    ['MAX_CONNECTIONS', 'maxConnections', 1, 10000],
    ['REQUEST_TIMEOUT_MS', 'requestTimeoutMs', 100, 120000],
    ['SHUTDOWN_TIMEOUT_MS', 'shutdownTimeoutMs', 100, 30000],
    ['CALCULATION_TIMEOUT_MS', 'calculationTimeoutMs', 100, 30000],
    ['CALCULATION_QUEUE_SIZE', 'calculationQueueSize', 0, 64],
  ] as const)('validates both boundaries and refuses unsafe %s values', (envName, key, minimum, maximum) => {
    for (const value of [minimum, maximum]) {
      expect(readConfig({ [envName]: String(value) }).limits).toEqual({ ...limits, [key]: value });
    }
    for (const value of [String(minimum - 1), String(maximum + 1), '', '1.5', '1e3', '+1', ' 1', '1 ', '1\n', 'NaN', 'Infinity', randomUUID()]) {
      expect(() => readConfig({ [envName]: value })).toThrowError('Resource limits are invalid.');
    }
    for (const value of [minimum - 1, maximum + 1, 1.5, NaN, Infinity, undefined]) {
      expect(() => resourceLimits({ ...limits, [key]: value })).toThrowError('Resource limits are invalid.');
    }
  });
});
