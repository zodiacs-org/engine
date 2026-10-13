import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const MAX_KEYS = 128;
const MAX_CONFIG_BYTES = 65_536;

function invalidConfig(): Error {
  return new Error('API key configuration is invalid.');
}

function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 32 && value.length <= 256
    && !/[^A-Za-z0-9_-]/u.test(value);
}

interface KeyEntry {
  digest: Buffer;
  principal: string;
}

/** A startup snapshot retaining digests and opaque, process-local identities. */
export class ApiKeyStore {
  readonly #entries: readonly KeyEntry[];

  constructor(keys: readonly string[] = []) {
    if (!Array.isArray(keys) || keys.length > MAX_KEYS
      || (arguments.length > 0 && keys.length === 0)) throw invalidConfig();

    const entries: KeyEntry[] = [];
    for (const key of keys) {
      if (!validToken(key)) throw invalidConfig();
      const digest = createHash('sha256').update(key).digest();
      if (entries.some((entry) => timingSafeEqual(entry.digest, digest))) throw invalidConfig();
      entries.push({ digest, principal: randomUUID() });
    }
    this.#entries = entries;
  }

  authenticate(credential: string): string | undefined {
    if (!validToken(credential)) return undefined;
    const digest = createHash('sha256').update(credential).digest();
    let principal: string | undefined;
    // Compare every configured digest so a matching key's position does not
    // decide how many comparisons run. All digests have the same byte length.
    for (const entry of this.#entries) {
      if (timingSafeEqual(entry.digest, digest)) principal = entry.principal;
    }
    return principal;
  }
}

function parseKeys(json: string): ApiKeyStore {
  if (Buffer.byteLength(json, 'utf8') > MAX_CONFIG_BYTES) throw invalidConfig();
  const keys: unknown = JSON.parse(json);
  if (!Array.isArray(keys)) throw invalidConfig();
  return new ApiKeyStore(keys);
}

async function readKeyFile(path: string): Promise<string> {
  // Opening a FIFO without O_NONBLOCK can wait forever before fstat can
  // reject it. fstat checks the opened object even if the path is replaced.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) throw invalidConfig();
    // Read at most one byte past the limit, including if a file grows after
    // fstat or a regular-file-like source reports a smaller size than it has.
    const buffer = Buffer.alloc(MAX_CONFIG_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (bytesRead === 0) return buffer.subarray(0, length).toString('utf8');
      length += bytesRead;
    }
    throw invalidConfig();
  } finally {
    await file.close();
  }
}

export async function loadApiKeys(env: NodeJS.ProcessEnv): Promise<ApiKeyStore> {
  try {
    const inline = env.API_KEYS;
    const path = env.API_KEYS_FILE;
    if (inline !== undefined && path !== undefined) throw invalidConfig();
    if (inline !== undefined) return parseKeys(inline);
    if (path !== undefined) {
      if (path.length === 0) throw invalidConfig();
      return parseKeys(await readKeyFile(path));
    }
    return new ApiKeyStore();
  } catch {
    // Parser and filesystem errors can contain key material or local paths.
    throw invalidConfig();
  }
}
