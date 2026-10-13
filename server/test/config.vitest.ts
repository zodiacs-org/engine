import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

const rateLimit = { capacity: 60, refillPerSecond: 1 };

describe('environment configuration', () => {
  it('uses local defaults', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3000, logLevel: 'info', rateLimit });
  });

  it('accepts explicit listener and logging settings', () => {
    expect(readConfig({ HOST: '0.0.0.0', PORT: '8080', LOG_LEVEL: 'warn' })).toEqual({ host: '0.0.0.0', port: 8080, logLevel: 'warn', rateLimit });
    expect(readConfig({ HOST: '::1', PORT: '0', LOG_LEVEL: 'silent' })).toEqual({ host: '::1', port: 0, logLevel: 'silent', rateLimit });
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
    expect(readConfig(env)).toEqual({ host: '127.0.0.1', port: 1234, logLevel: 'info', rateLimit });
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
