import { engineIdentity } from "./engine.js";

// Infrastructure responses have no calculation to attest. Calculation routes
// will add their original engine receipts with explicit operation scope.
export function success<T>(requestId: string, data: T) {
  return { requestId, engine: engineIdentity, receipts: [], data };
}

export function failure(requestId: string, code: string, message: string) {
  return { requestId, engine: engineIdentity, receipts: [], error: { code, message } };
}
