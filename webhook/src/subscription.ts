import {
  EVENT_BODIES, ZODIAC_SIGNS,
  type Direction, type EventBody, type EventFilter, type ScheduleWindow, type SubscriptionSpec
} from "./types.js";
import { parseCustomQuery } from "./custom-query.js";

export const SUBSCRIPTION_LIMITS = Object.freeze({
  callbackUrlBytes: 2048,
  secretRefBytes: 128,
  expressionBytes: 4096
});

export class SubscriptionValidationError extends Error {
  readonly code = "invalid-subscription";

  constructor(readonly field: string) {
    super(`Invalid subscription field: ${field}.`);
    this.name = "SubscriptionValidationError";
  }
}

function invalid(field: string): never {
  throw new SubscriptionValidationError(field);
}

/** Read plain data without invoking ordinary accessors. Same-realm proxies are not sandboxed. */
function object(input: unknown, allowed: readonly string[], field: string): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) invalid(field);
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) invalid(field);
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.includes(key)) invalid(field);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid(field);
    output[key] = descriptor.value;
  }
  return output;
}

function text(input: unknown, maxBytes: number, field: string): string {
  if (typeof input !== "string" || input.length > maxBytes || Buffer.byteLength(input, "utf8") > maxBytes) {
    invalid(field);
  }
  // Invalid UTF-16 would be replaced during UTF-8 serialization, changing signed content.
  for (let i = 0; i < input.length; i++) {
    const unit = input.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = input.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid(field);
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      invalid(field);
    }
  }
  return input;
}

/** Syntax only. The delivery boundary must also validate resolved addresses. */
export function parseCallbackUrl(input: unknown): string {
  const field = "callbackUrl";
  const value = text(input, SUBSCRIPTION_LIMITS.callbackUrlBytes, field);
  if (!/^https:\/\//i.test(value) || /[\s\u0000-\u001f\u007f\\#]/u.test(value)) invalid(field);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid(field);
  }
  // Reject even an empty userinfo spelling. WHATWG URL drops it when normalizing.
  const authority = value.slice(value.indexOf("://") + 3).split(/[/?]/u)[0];
  if (!authority || authority.includes("@") || url.protocol !== "https:" || !url.hostname || url.port === "0") {
    invalid(field);
  }
  const normalized = url.href;
  if (Buffer.byteLength(normalized, "utf8") > SUBSCRIPTION_LIMITS.callbackUrlBytes) invalid(field);
  return normalized;
}

function secretRef(input: unknown): string {
  const value = text(input, SUBSCRIPTION_LIMITS.secretRefBytes, "secretRef");
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(value)) invalid("secretRef");
  return value;
}

function instant(input: unknown, field: string): string {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(input)) {
    invalid(field);
  }
  const milliseconds = Date.parse(input);
  if (!Number.isFinite(milliseconds)) invalid(field);
  const canonical = new Date(milliseconds).toISOString();
  const expected = input.includes(".")
    ? input.slice(0, -1).padEnd(23, "0") + "Z"
    : input.slice(0, -1) + ".000Z";
  if (canonical !== expected) invalid(field);
  return canonical;
}

export function parseScheduleWindow(input: unknown): ScheduleWindow {
  const value = object(input, ["start", "end"], "window");
  const start = instant(value.start, "window.start");
  const end = instant(value.end, "window.end");
  if (start >= end) invalid("window");
  return Object.freeze({ start, end });
}

function body(input: unknown, field: string): EventBody {
  if (typeof input !== "string" || !(EVENT_BODIES as readonly string[]).includes(input)) invalid(field);
  return input as EventBody;
}

function direction(value: Record<string, unknown>): Direction {
  if (!Object.hasOwn(value, "direction")) return "any";
  if (value.direction !== "any" && value.direction !== "direct" && value.direction !== "retrograde") {
    invalid("filter.direction");
  }
  return value.direction;
}

function bodies(input: unknown): readonly [EventBody, EventBody] {
  if (!Array.isArray(input) || input.length !== 2 || Object.getPrototypeOf(input) !== Array.prototype) {
    invalid("filter.bodies");
  }
  if (Reflect.ownKeys(input).some((key) => key !== "0" && key !== "1" && key !== "length")) {
    invalid("filter.bodies");
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const first = descriptors["0"];
  const second = descriptors["1"];
  if (!first || !second || !("value" in first) || !("value" in second) || !first.enumerable || !second.enumerable) {
    invalid("filter.bodies");
  }
  const a = body(first.value, "filter.bodies");
  const b = body(second.value, "filter.bodies");
  if (a === b) invalid("filter.bodies");
  return Object.freeze([a, b]);
}

function eventFilter(input: unknown, validateCustom: boolean): EventFilter {
  const value = object(input, ["kind", "bodies", "angle", "body", "sign", "direction", "type", "expression"], "filter");
  switch (value.kind) {
    case "aspect-exact": {
      object(value, ["kind", "bodies", "angle"], "filter");
      const pair = bodies(value.bodies);
      if (typeof value.angle !== "number" || !Number.isFinite(value.angle) || value.angle < 0 || value.angle > 180) {
        invalid("filter.angle");
      }
      return Object.freeze({ kind: value.kind, bodies: pair, angle: value.angle === 0 ? 0 : value.angle });
    }
    case "ingress": {
      object(value, ["kind", "body", "sign", "direction"], "filter");
      const selected = body(value.body, "filter.body");
      if (typeof value.sign !== "string" || !(ZODIAC_SIGNS as readonly string[]).includes(value.sign)) {
        invalid("filter.sign");
      }
      return Object.freeze({
        kind: value.kind, body: selected,
        sign: value.sign as (typeof ZODIAC_SIGNS)[number], direction: direction(value)
      });
    }
    case "station": {
      object(value, ["kind", "body", "direction"], "filter");
      const selected = body(value.body, "filter.body");
      if (selected === "Sun" || selected === "Moon") invalid("filter.body");
      return Object.freeze({ kind: value.kind, body: selected, direction: direction(value) });
    }
    case "eclipse": {
      object(value, ["kind", "type"], "filter");
      if (value.type !== "any" && value.type !== "solar" && value.type !== "lunar") invalid("filter.type");
      return Object.freeze({ kind: value.kind, type: value.type });
    }
    case "custom": {
      object(value, ["kind", "expression"], "filter");
      const expression = text(value.expression, SUBSCRIPTION_LIMITS.expressionBytes, "filter.expression");
      if (expression.trim() === "" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(expression)) {
        invalid("filter.expression");
      }
      if (validateCustom) {
        try { parseCustomQuery(expression); } catch { invalid("filter.expression"); }
      }
      return Object.freeze({ kind: value.kind, expression });
    }
    default:
      return invalid("filter.kind");
  }
}

export function parseEventFilter(input: unknown): EventFilter {
  return eventFilter(input, true);
}

function subscription(input: unknown, validateCustom: boolean): SubscriptionSpec {
  const value = object(input, ["callbackUrl", "secretRef", "filter", "window", "enabled"], "subscription");
  const enabled = Object.hasOwn(value, "enabled") ? value.enabled : true;
  if (typeof enabled !== "boolean") invalid("enabled");
  return Object.freeze({
    callbackUrl: parseCallbackUrl(value.callbackUrl),
    secretRef: secretRef(value.secretRef),
    filter: eventFilter(value.filter, validateCustom),
    window: parseScheduleWindow(value.window),
    enabled
  });
}

/** Includes DSL semantics, without DNS, HTTP, key lookup, execution or ephemeris calls. */
export function parseSubscription(input: unknown): SubscriptionSpec {
  return subscription(input, true);
}

/** Storage-only compatibility: pre-DSL drafts remain inspectable and replaceable.
 * Never use this to authorize creation, updates or execution of custom filters.
 */
export function parseStoredSubscription(input: unknown): SubscriptionSpec {
  return subscription(input, false);
}
