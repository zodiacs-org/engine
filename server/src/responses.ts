import { engineIdentity } from "./engine.js";
import type { NatalEnvelope } from "../../src/receipt.js";

export interface ScopedNatalReceipt {
  /** JSON pointer to the chart covered by this envelope, within the response. */
  scope: string;
  envelope: NatalEnvelope;
}

// Infrastructure responses have no calculation receipt. Scope is server
// metadata; the envelope itself comes unchanged from the engine's creator.
export function success<T>(requestId: string, data: T, receipts: readonly ScopedNatalReceipt[] = []) {
  return { requestId, engine: engineIdentity, receipts, data };
}

export function failure(requestId: string, code: string, message: string) {
  return { requestId, engine: engineIdentity, receipts: [], error: { code, message } };
}
