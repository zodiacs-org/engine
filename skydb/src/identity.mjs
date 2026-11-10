import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const ENGINE_IDENTITY = Object.freeze({
  name: '@zodiacs/engine',
  version: '1.0.0',
  archive: 'zodiacs-engine-1.0.0.tgz',
  sha256: 'c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6',
  bytes: 288063,
  ephemeris: '2.1.19'
});

export function verifyArchiveBytes(bytes) {
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== ENGINE_IDENTITY.bytes || digest !== ENGINE_IDENTITY.sha256) {
    throw new Error('Engine archive identity mismatch');
  }
  return ENGINE_IDENTITY;
}

export async function verifyEngineArchive() {
  const manifest = JSON.parse(await readFile(new URL('../../artifacts/archives.json', import.meta.url), 'utf8'));
  const entries = manifest.archives.filter(entry => entry.version === ENGINE_IDENTITY.version);
  if (entries.length !== 1 || entries[0].file !== ENGINE_IDENTITY.archive ||
      entries[0].sha256 !== ENGINE_IDENTITY.sha256 || entries[0].bytes !== ENGINE_IDENTITY.bytes) {
    throw new Error('Carried manifest identity mismatch');
  }
  return verifyArchiveBytes(await readFile(new URL(`../../artifacts/${ENGINE_IDENTITY.archive}`, import.meta.url)));
}

export function requireNode22(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (major !== 22 || minor < 7) throw new Error('Skydb requires Node 22.7 or later in the Node 22 series');
}
