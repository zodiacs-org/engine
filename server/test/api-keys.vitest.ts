import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiKeyStore, loadApiKeys } from '../src/api-keys.js';

const CONFIG_ERROR = 'API key configuration is invalid.';
const temporaryDirectories: string[] = [];

function key(length = 43): string {
  return randomBytes(Math.ceil(length * 3 / 4)).toString('base64url').slice(0, length);
}

async function tempDirectory(): Promise<string> {
  const cache = fileURLToPath(new URL('../.cache/', import.meta.url));
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, 'api-keys-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function keyFile(contents: string): Promise<string> {
  const path = join(await tempDirectory(), 'keys.json');
  await writeFile(path, contents, { mode: 0o600 });
  return path;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('API key store', () => {
  it('defaults to an empty store that authenticates nobody', () => {
    expect(new ApiKeyStore().authenticate(key())).toBeUndefined();
    expect(() => new ApiKeyStore([])).toThrowError(new Error(CONFIG_ERROR));
  });

  it('returns stable, distinct opaque identities for matching keys only', () => {
    const first = key();
    const second = key();
    const store = new ApiKeyStore([first, second]);
    const principal = store.authenticate(first);
    expect(principal).toMatch(/^[a-f0-9-]{36}$/u);
    expect(store.authenticate(first)).toBe(principal);
    expect(store.authenticate(second)).not.toBe(principal);
    expect(new ApiKeyStore([first]).authenticate(first)).not.toBe(principal);
    expect(store.authenticate(key())).toBeUndefined();
    expect(principal).not.toBe(first);
    expect(principal).not.toBe(createHash('sha256').update(first).digest('hex'));
    expect(JSON.stringify(store)).toBe('{}');
  });

  it('snapshots its inputs and accepts the token length boundaries', () => {
    const minimum = randomBytes(32).toString('base64url');
    expect(minimum).toHaveLength(43);
    const maximum = key(256);
    const keys = [minimum, maximum];
    const store = new ApiKeyStore(keys);
    keys.splice(0);
    expect(store.authenticate(minimum)).toBeDefined();
    expect(store.authenticate(maximum)).toBeDefined();
  });

  it('accepts hex encoding of a cryptographically generated key', () => {
    const token = randomBytes(32).toString('hex');
    expect(new ApiKeyStore([token]).authenticate(token)).toBeDefined();
  });

  it.each([1, 31, 32, 42])('rejects a %i-character key at configuration and authentication', (length) => {
    const short = key(length);
    expect(() => new ApiKeyStore([short])).toThrowError(new Error(CONFIG_ERROR));
    expect(new ApiKeyStore([key()]).authenticate(short)).toBeUndefined();
  });

  it('rejects duplicates and invalid configured tokens without echoing values', () => {
    const token = key();
    const invalid = [key(31), key(257), '', `${token}\n`, `${token}\r`, ` ${token}`, `${token}=`, `${token},`, `${token}\0`, `${token}é`];
    expect(() => new ApiKeyStore([token, token])).toThrowError(new Error(CONFIG_ERROR));
    for (const value of invalid) {
      expect(() => new ApiKeyStore([value])).toThrowError(new Error(CONFIG_ERROR));
      expect(new ApiKeyStore([token]).authenticate(value)).toBeUndefined();
    }
  });

  it('enforces the configured key-count limit', () => {
    const keys = Array.from({ length: 128 }, () => key());
    const store = new ApiKeyStore(keys);
    expect(store.authenticate(keys[0]!)).toBeDefined();
    expect(store.authenticate(keys[127]!)).toBeDefined();
    expect(() => new ApiKeyStore([...keys, key()])).toThrowError(new Error(CONFIG_ERROR));
  });
});

describe('API key configuration', () => {
  it('keeps an absent configuration fail-closed and ignores unrelated environment values', async () => {
    const env = Object.freeze({ UNRELATED: key() });
    expect((await loadApiKeys(env)).authenticate(env.UNRELATED)).toBeUndefined();
  });

  it('loads a JSON key array from the environment', async () => {
    const token = key();
    const env = Object.freeze({ API_KEYS: JSON.stringify([token]) });
    const store = await loadApiKeys(env);
    expect(store.authenticate(token)).toBeDefined();
    expect(store.authenticate(key())).toBeUndefined();
  });

  it('loads a JSON key array from a local file', async () => {
    const token = key();
    const path = await keyFile(JSON.stringify([token]));
    const store = await loadApiKeys({ API_KEYS_FILE: path });
    expect(store.authenticate(token)).toBeDefined();
  });

  it.each(['', 'null', '{}', '[]', '[null]', '[1]', '[true]', '[[]]', '[{}]', '{', '\ufeff[]'])('rejects malformed explicit JSON configuration %j', async (value) => {
    await expect(loadApiKeys({ API_KEYS: value })).rejects.toThrowError(new Error(CONFIG_ERROR));
    await expect(loadApiKeys({ API_KEYS_FILE: await keyFile(value) })).rejects.toThrowError(new Error(CONFIG_ERROR));
  });

  it('rejects a JSON scalar even when it holds an otherwise valid token', async () => {
    await expect(loadApiKeys({ API_KEYS: JSON.stringify(key()) })).rejects.toThrowError(new Error(CONFIG_ERROR));
  });

  it('rejects duplicates, oversized key lists and malformed tokens from either source', async () => {
    const token = key();
    for (const keys of [[token, token], [key(31)], [key(32)], [key(42)], [key(257)], [`${token}\n`], Array.from({ length: 129 }, () => key())]) {
      const json = JSON.stringify(keys);
      await expect(loadApiKeys({ API_KEYS: json })).rejects.toThrowError(new Error(CONFIG_ERROR));
      await expect(loadApiKeys({ API_KEYS_FILE: await keyFile(json) })).rejects.toThrowError(new Error(CONFIG_ERROR));
    }
  });

  it('rejects both sources being supplied, including empty values', async () => {
    const token = key();
    const path = await keyFile(JSON.stringify([token]));
    for (const env of [
      { API_KEYS: JSON.stringify([token]), API_KEYS_FILE: path },
      { API_KEYS: '', API_KEYS_FILE: path },
      { API_KEYS: JSON.stringify([token]), API_KEYS_FILE: '' },
      { API_KEYS: '', API_KEYS_FILE: '' }
    ]) await expect(loadApiKeys(env)).rejects.toThrowError(new Error(CONFIG_ERROR));
  });

  it('enforces the byte limit for environment and file input at its boundary', async () => {
    const token = key();
    const json = JSON.stringify([token]).padEnd(65_536, ' ');
    expect((await loadApiKeys({ API_KEYS: json })).authenticate(token)).toBeDefined();
    expect((await loadApiKeys({ API_KEYS_FILE: await keyFile(json) })).authenticate(token)).toBeDefined();
    await expect(loadApiKeys({ API_KEYS: `${json} ` })).rejects.toThrowError(new Error(CONFIG_ERROR));
    await expect(loadApiKeys({ API_KEYS_FILE: await keyFile(`${json} `) })).rejects.toThrowError(new Error(CONFIG_ERROR));
    // A short UTF-16 string can still exceed the UTF-8 byte budget.
    await expect(loadApiKeys({ API_KEYS: 'é'.repeat(32_769) })).rejects.toThrowError(new Error(CONFIG_ERROR));
  });

  it('rejects missing files, empty paths and directories', async () => {
    const directory = await tempDirectory();
    for (const path of ['', join(directory, key()), directory]) {
      await expect(loadApiKeys({ API_KEYS_FILE: path })).rejects.toThrowError(new Error(CONFIG_ERROR));
    }
  });

  it.skipIf(process.platform === 'win32')('rejects a FIFO without waiting for a writer', async () => {
    const path = join(await tempDirectory(), 'keys.fifo');
    await promisify(execFile)('mkfifo', [path]);
    await expect(loadApiKeys({ API_KEYS_FILE: path })).rejects.toThrowError(new Error(CONFIG_ERROR));
  }, 2_000);

  it('never attaches raw parser or filesystem details to configuration errors', async () => {
    const canary = key();
    const path = join(await tempDirectory(), canary);
    for (const env of [{ API_KEYS: `[{${canary}` }, { API_KEYS_FILE: path }]) {
      const error = await loadApiKeys(env).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(CONFIG_ERROR);
      expect((error as Error).cause).toBeUndefined();
      expect(String(error)).not.toContain(canary);
      expect((error as Error).stack).not.toContain(canary);
      expect(JSON.stringify(error)).not.toContain(canary);
    }
  });
});
