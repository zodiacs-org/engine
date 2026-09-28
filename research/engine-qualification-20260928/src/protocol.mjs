import { readFile } from 'node:fs/promises';
import { assert, digest, sha256 } from './common.mjs';

export const PROTOCOL_SHA256 = '1b9eb82e20ec9c901375da390b2f1fbdffa4e17bdf5d74a37aaf830c9eea99b4';
export const PROTOCOL_DIGEST = 'c817cd540a945ac0334176a0f8570881bd0d46bebd3156a2f9822286060b3584';
export function validateProtocol(protocol) {
  assert(digest(protocol) === PROTOCOL_DIGEST, 'Unreviewed qualification protocol or threshold change');
  return protocol;
}
export async function loadProtocol() {
  const bytes = await readFile(new URL('../data/protocol.json', import.meta.url));
  assert(sha256(bytes) === PROTOCOL_SHA256, 'Frozen protocol bytes changed');
  return validateProtocol(JSON.parse(bytes));
}
