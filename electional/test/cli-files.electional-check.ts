import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readBoundedText } from '../src/cli-main.js';
let directory: string;
beforeAll(async () => {
  const base = new URL('../generated/', import.meta.url); await mkdir(base, { recursive: true });
  directory = await mkdtemp(join(fileURLToPath(base), 'cli-files-'));
});
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
describe('CLI regular file byte and UTF-8 boundary', () => {
  it('accepts a file at the inclusive byte limit and rejects one byte over', async () => {
    const path = join(directory, 'exact'); await writeFile(path, 'éé');
    expect(await readBoundedText(path, 4)).toBe('éé'); await expect(readBoundedText(path, 3)).rejects.toThrow(RangeError);
  });
  it('rejects invalid UTF-8 instead of replacing bytes', async () => {
    const path = join(directory, 'invalid'); await writeFile(path, Buffer.from([0xff]));
    await expect(readBoundedText(path, 4)).rejects.toThrow(TypeError);
  });
  it('accepts an initial UTF-8 byte-order mark while counting its bytes', async () => {
    const path = join(directory, 'bom'); await writeFile(path, Buffer.from([0xef, 0xbb, 0xbf, 0x61]));
    expect(await readBoundedText(path, 4)).toBe('a'); await expect(readBoundedText(path, 3)).rejects.toThrow(RangeError);
  });
  it('rejects a directory and a missing file', async () => {
    await expect(readBoundedText(directory, 4)).rejects.toThrow(RangeError);
    await expect(readBoundedText(join(directory, 'missing'), 4)).rejects.toThrow();
  });
  it('allows empty bytes for the shared parser to reject and does not mutate files', async () => {
    const path = join(directory, 'empty'); await writeFile(path, ''); expect(await readBoundedText(path, 4)).toBe('');
    expect(await readBoundedText(path, 4)).toBe('');
  });
  it.each([0, -1, 0.1, Infinity])('rejects invalid byte limit %s', async limit => {
    await expect(readBoundedText(join(directory, 'never-opened'), limit)).rejects.toThrow(RangeError);
  });
});
