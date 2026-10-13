import { engineIdentity } from "./engine.js";
import type { NatalEnvelope } from "../../src/receipt.js";
import type { CalcReceipt, HousesRequest } from "../../src/calc.js";

export interface ScopedNatalReceipt {
  /** JSON pointer to the chart covered by this envelope, within the response. */
  scope: string;
  envelope: NatalEnvelope;
}

export interface ScopedHousesReceipt {
  /** JSON pointer to the houses calculation covered by this engine receipt. */
  scope: string;
  receipt: CalcReceipt<HousesRequest>;
}

// Infrastructure responses have no calculation receipt. Scope is server
// metadata; each envelope or calculation receipt comes unchanged from the engine.
export function success<T>(requestId: string, data: T, receipts: readonly (ScopedNatalReceipt | ScopedHousesReceipt)[] = []) {
  return { requestId, engine: engineIdentity, receipts, data };
}

export function failure(requestId: string, code: string, message: string) {
  return { requestId, engine: engineIdentity, receipts: [], error: { code, message } };
}
