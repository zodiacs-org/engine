import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';

describe('environment configuration', () => {
  it('uses local defaults', () => {
    expect(readConfig({})).toEqual({ host: '127.0.0.1', port: 3000, logLevel: 'info' });
  });

  it('accepts explicit listener and logging settings', () => {
    expect(readConfig({ HOST: '0.0.0.0', PORT: '8080', LOG_LEVEL: 'warn' })).toEqual({ host: '0.0.0.0', port: 8080, logLevel: 'warn' });
    expect(readConfig({ HOST: '::1', PORT: '0', LOG_LEVEL: 'silent' })).toEqual({ host: '::1', port: 0, logLevel: 'silent' });
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
    expect(readConfig(env)).toEqual({ host: '127.0.0.1', port: 1234, logLevel: 'info' });
  });
});
