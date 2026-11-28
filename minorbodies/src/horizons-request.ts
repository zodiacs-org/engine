import { minorBodyDefinition } from "./catalog.ts";
import type { MinorBody } from "./catalog.ts";

export const HORIZONS_ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api";
export const MAX_HORIZONS_EPOCHS = 128;

export interface HorizonsRequest {
  readonly schema: "minorbodies-horizons-request-v1";
  readonly body: MinorBody;
  readonly epochs: readonly number[];
  readonly endpoint: typeof HORIZONS_ENDPOINT;
  readonly url: string;
  /** Exact query values, including Horizons' quote delimiters. */
  readonly parameters: Readonly<Record<string, string>>;
}

/** Construct an explicit TT, receive-light-time/aberration corrected ICRF request. */
export function makeHorizonsRequest(body: MinorBody, epochs: readonly number[]): HorizonsRequest {
  const definition = minorBodyDefinition(body);
  if (!Array.isArray(epochs) || epochs.length < 1 || epochs.length > MAX_HORIZONS_EPOCHS) {
    throw new RangeError(`Horizons requests require 1 to ${MAX_HORIZONS_EPOCHS} epochs.`);
  }
  let previous = -Infinity;
  let previousPrinted = -Infinity;
  for (const epoch of epochs) {
    if (typeof epoch !== "number" || !Number.isFinite(epoch) || epoch <= 0 || epoch <= previous) {
      throw new RangeError("Horizons epochs must be finite, positive and strictly increasing TT Julian dates.");
    }
    const printed = Number(epoch.toFixed(9));
    if (printed <= previousPrinted) {
      throw new RangeError("Horizons epochs must be distinct at the returned nine-decimal Julian date precision.");
    }
    previous = epoch;
    previousPrinted = printed;
  }
  const parameters = Object.freeze({
    format: "json",
    COMMAND: `'${definition.command}'`,
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'500@399'",
    REF_SYSTEM: "'ICRF'",
    REF_PLANE: "'FRAME'",
    VEC_CORR: "'LT+S'",
    VEC_TABLE: "'2'",
    OUT_UNITS: "'AU-D'",
    TIME_TYPE: "'TT'",
    TLIST_TYPE: "'JD'",
    CSV_FORMAT: "'YES'",
    OBJ_DATA: "'YES'",
    MAKE_EPHEM: "'YES'",
    TLIST: epochs.map((epoch) => `'${epoch}'`).join(" ")
  });
  return Object.freeze({
    schema: "minorbodies-horizons-request-v1",
    body,
    epochs: Object.freeze([...epochs]),
    endpoint: HORIZONS_ENDPOINT,
    url: `${HORIZONS_ENDPOINT}?${new URLSearchParams(parameters)}`,
    parameters
  });
}

/** Reject imported manifests whose request URL, query or epochs were changed independently. */
export function assertHorizonsRequest(request: HorizonsRequest): void {
  if (request === null || typeof request !== "object") throw new RangeError("Invalid Horizons request.");
  const canonical = makeHorizonsRequest(request.body, request.epochs);
  if (request.schema !== canonical.schema || request.endpoint !== canonical.endpoint ||
      request.url !== canonical.url || request.parameters === null || typeof request.parameters !== "object" ||
      Object.keys(request.parameters).length !== Object.keys(canonical.parameters).length ||
      Object.entries(canonical.parameters).some(([key, value]) => request.parameters[key] !== value)) {
    throw new RangeError("Horizons request does not match its canonical parameters.");
  }
}
