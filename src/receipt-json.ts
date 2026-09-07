export interface ReceiptJsonLimits {
  depth: number;
  nodes: number;
}

export type ReceiptJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; code: "invalid_json" | "complexity_limit" };

type Frame = {
  kind: "object" | "array";
  state: "first" | "next" | "separator";
  keys?: Set<string>;
};

/**
 * Internal JSON preflight. The caller must bound UTF-8 bytes before invoking it.
 * Rejects duplicate decoded member names and excessive structure before the
 * native full parse. Strings/values are never evaluated or assigned to objects.
 */
export function parseReceiptJson(json: string, limits: ReceiptJsonLimits): ReceiptJsonResult {
  if (typeof json !== "string") return { ok: false, code: "invalid_json" };
  if (
    !Number.isSafeInteger(limits.depth) ||
    limits.depth < 0 ||
    !Number.isSafeInteger(limits.nodes) ||
    limits.nodes < 1
  )
    return { ok: false, code: "complexity_limit" };

  let cursor = 0;
  let nodes = 0;
  let code: "invalid_json" | "complexity_limit" = "invalid_json";
  const stack: Frame[] = [];
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const reject = (reason: typeof code = "invalid_json"): never => {
    code = reason;
    throw new Error();
  };
  const whitespace = () => {
    while (cursor < json.length && " \t\r\n".includes(json[cursor]!)) cursor += 1;
  };
  const string = (decode: boolean): string | undefined => {
    const start = cursor;
    if (json[cursor++] !== '"') reject();
    while (cursor < json.length) {
      const character = json[cursor++]!;
      if (character === '"') {
        // Native decoding makes "a" and "\u0061" the same member name.
        return decode ? (JSON.parse(json.slice(start, cursor)) as string) : undefined;
      }
      if (character.charCodeAt(0) < 0x20) reject();
      if (character !== "\\") continue;
      const escape = json[cursor++];
      if (escape === "u") {
        const digits = json.slice(cursor, cursor + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) reject();
        cursor += 4;
      } else if (escape === undefined || !'"\\/bfnrt'.includes(escape)) reject();
    }
    return reject();
  };
  const value = (depth: number) => {
    if (++nodes > limits.nodes || depth > limits.depth) reject("complexity_limit");
    whitespace();
    const token = json[cursor];
    if (token === "{" || token === "[") {
      cursor += 1;
      stack.push({
        kind: token === "{" ? "object" : "array",
        state: "first",
        ...(token === "{" ? { keys: new Set<string>() } : {})
      });
    } else if (token === '"') string(false);
    else if (token === "-" || (token !== undefined && token >= "0" && token <= "9")) {
      number.lastIndex = cursor;
      if (!number.exec(json)) reject();
      cursor = number.lastIndex;
    } else {
      const literal = ["true", "false", "null"].find((candidate) =>
        json.startsWith(candidate, cursor)
      );
      if (!literal) return reject();
      cursor += literal.length;
    }
  };

  try {
    value(0);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      whitespace();
      const end = frame.kind === "object" ? "}" : "]";
      if (frame.state === "separator") {
        if (json[cursor] === end) {
          cursor += 1;
          stack.pop();
        } else if (json[cursor] === ",") {
          cursor += 1;
          frame.state = "next";
        } else reject();
        continue;
      }
      if (frame.state === "first" && json[cursor] === end) {
        cursor += 1;
        stack.pop();
        continue;
      }
      if (frame.kind === "object") {
        const key = string(true)!;
        if (frame.keys!.has(key)) reject();
        frame.keys!.add(key);
        whitespace();
        if (json[cursor++] !== ":") reject();
      }
      frame.state = "separator";
      value(stack.length);
    }
    whitespace();
    if (cursor !== json.length) reject();
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return { ok: false, code };
  }
}
