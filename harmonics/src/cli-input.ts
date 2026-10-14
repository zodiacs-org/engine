import { snapshotFlags, validateBirthSettings } from "../../src/birth-input.js";
import { dateFrom } from "../../src/date-input.js";
import type { BirthInput } from "../../src/types.js";
import { harmonicChart } from "./harmonic-chart.js";
import type { EngineLongitudePoint } from "./engine.js";

export const MAX_INPUT_BYTES = 64 * 1024;
export const MAX_JSON_DEPTH = 16;

export type CliErrorCode = "invalid-arguments" | "invalid-input" | "input-read" | "execution-failed";

export class CliError extends Error {
  constructor(readonly code: CliErrorCode, message: string) {
    super(message);
    this.name = "CliError";
  }
}

export type ChartRequest =
  | { readonly mode: "points"; readonly points: readonly EngineLongitudePoint[] }
  | { readonly mode: "birth"; readonly birth: BirthInput };

function object(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))) {
    throw new CliError("invalid-input", `${label} must be an object with supported fields only.`);
  }
  return value as Record<string, unknown>;
}

/** JSON.parse supplies grammar validation; this token walk rejects duplicate decoded keys. */
function strictJson(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Never echo parser excerpts containing the submitted document.
    throw new CliError("invalid-input", "Input must be a single valid JSON document.");
  }
  const tokens = text.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/gu) ?? [];
  const stack: (Set<string> | null)[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "{" || token === "[") {
      stack.push(token === "{" ? new Set<string>() : null);
      if (stack.length > MAX_JSON_DEPTH) {
        throw new CliError("invalid-input", "Input exceeds the JSON nesting limit.");
      }
    } else if (token === "}" || token === "]") {
      stack.pop();
    } else if (token.startsWith('"') && tokens[index + 1] === ":") {
      const keys = stack[stack.length - 1]!;
      const key = JSON.parse(token) as string;
      if (keys?.has(key)) {
        throw new CliError("invalid-input", "JSON objects must not contain duplicate field names.");
      }
      keys?.add(key);
    }
  }
  return value;
}

/** Validate only JSON data. Engine helpers retain their date, setting and flag contracts. */
export function parseChartRequest(bytes: Uint8Array): ChartRequest {
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new CliError("invalid-input", "Input exceeds the byte limit.");
  }
  let text: string;
  try {
    // A BOM is not JSON whitespace. Preserve it so JSON.parse rejects it.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new CliError("invalid-input", "Input must be valid UTF-8.");
  }
  const input = object(strictJson(text), ["points", "birth"], "Input");
  const hasPoints = Object.hasOwn(input, "points");
  const hasBirth = Object.hasOwn(input, "birth");
  if (hasPoints === hasBirth) {
    throw new CliError("invalid-input", "Input requires exactly one of points or birth.");
  }
  try {
    if (hasPoints) {
      if (!Array.isArray(input.points)) throw new RangeError("points must be a nonempty array.");
      const points = input.points.map((value): EngineLongitudePoint => {
        const point = object(value, ["body", "lon", "speed"], "Each point");
        if (Object.hasOwn(point, "speed") &&
          (typeof point.speed !== "number" || !Number.isFinite(point.speed))) {
          throw new RangeError("Point speed, when supplied, must be finite degrees/day.");
        }
        return {
          body: point.body as string, lon: point.lon as number,
          ...(Object.hasOwn(point, "speed") ? { speed: point.speed as number } : {})
        };
      });
      // Reuse the longitude and identifier validator without guessing motion.
      harmonicChart(points, 1);
      return { mode: "points", points };
    }
    const birth = object(input.birth,
      ["utc", "timeScale", "latitude", "longitude", "houseSystem", "timeKnown", "flags", "deltaT"], "birth");
    if (typeof birth.utc !== "string" && typeof birth.utc !== "number") {
      throw new RangeError("birth.utc must be an ISO instant or epoch-millisecond number.");
    }
    dateFrom(birth.utc, "birth.utc");
    const typed = birth as unknown as BirthInput;
    validateBirthSettings(typed);
    if (Object.hasOwn(birth, "flags")) snapshotFlags(birth.flags);
    if (Object.hasOwn(birth, "timeScale") && !["utc", "ut1", "tt"].includes(birth.timeScale as string)) {
      throw new RangeError("timeScale must be utc, ut1 or tt.");
    }
    if (Object.hasOwn(birth, "deltaT") &&
      (typeof birth.deltaT !== "number" || !Number.isFinite(birth.deltaT) || Math.abs(birth.deltaT) > 1e10)) {
      throw new RangeError("deltaT must be finite seconds, at most 1e10 in size.");
    }
    return { mode: "birth", birth: typed };
  } catch (error) {
    if (error instanceof RangeError) throw new CliError("invalid-input", error.message);
    throw error;
  }
}
