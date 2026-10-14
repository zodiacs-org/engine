/** The CLI transport counts input bytes before decoding UTF-8. */
export const CLI_MAX_INPUT_BYTES = 1_048_576;

/** Each object or array counts as one level, including the root container. */
export const CLI_MAX_JSON_DEPTH = 64;

/** Deliberately excludes parser excerpts and other submitted text. */
export class CliJsonError extends Error {
  constructor() {
    super("Invalid CLI JSON input.");
    this.name = "CliJsonError";
  }
}

/**
 * Decode one JSON value with unique decoded object keys and finite numbers.
 * The caller must enforce the byte limit and reject malformed UTF-8 first.
 */
export function parseCliJson(text: string): unknown {
  if (typeof text !== "string") throw new CliJsonError();
  let cursor = 0;
  const numberToken = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

  function whitespace(): void {
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
      cursor++;
    }
  }

  function string(): string {
    if (text[cursor] !== '"') throw new CliJsonError();
    const start = cursor++;
    while (cursor < text.length) {
      const code = text.charCodeAt(cursor++);
      if (code === 0x22) {
        // Delegate escape and surrogate handling to the runtime's JSON grammar.
        try {
          return JSON.parse(text.slice(start, cursor)) as string;
        } catch {
          throw new CliJsonError();
        }
      }
      if (code < 0x20) throw new CliJsonError();
      if (code === 0x5c) cursor++;
    }
    throw new CliJsonError();
  }

  function object(depth: number): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const names = new Set<string>();
    cursor++;
    whitespace();
    if (text[cursor] === "}") {
      cursor++;
      return result;
    }
    while (cursor < text.length) {
      const key = string();
      if (names.has(key)) throw new CliJsonError();
      names.add(key);
      whitespace();
      if (text[cursor++] !== ":") throw new CliJsonError();
      const member = value(depth);
      // __proto__ is an ordinary own data property, as with JSON.parse.
      Object.defineProperty(result, key, {
        value: member, enumerable: true, configurable: true, writable: true
      });
      whitespace();
      const separator = text[cursor++];
      if (separator === "}") return result;
      if (separator !== ",") throw new CliJsonError();
      whitespace();
    }
    throw new CliJsonError();
  }

  function array(depth: number): unknown[] {
    const result: unknown[] = [];
    cursor++;
    whitespace();
    if (text[cursor] === "]") {
      cursor++;
      return result;
    }
    while (cursor < text.length) {
      result.push(value(depth));
      whitespace();
      const separator = text[cursor++];
      if (separator === "]") return result;
      if (separator !== ",") throw new CliJsonError();
    }
    throw new CliJsonError();
  }

  function value(parentDepth: number): unknown {
    whitespace();
    const first = text[cursor];
    if (first === "{" || first === "[") {
      if (parentDepth >= CLI_MAX_JSON_DEPTH) throw new CliJsonError();
      return first === "{" ? object(parentDepth + 1) : array(parentDepth + 1);
    }
    if (first === '"') return string();
    for (const [literal, decoded] of [["null", null], ["true", true], ["false", false]] as const) {
      if (text.startsWith(literal, cursor)) {
        cursor += literal.length;
        return decoded;
      }
    }
    numberToken.lastIndex = cursor;
    const match = numberToken.exec(text);
    if (!match) throw new CliJsonError();
    cursor = numberToken.lastIndex;
    const decoded = Number(match[0]);
    if (!Number.isFinite(decoded)) throw new CliJsonError();
    return decoded;
  }

  const result = value(0);
  whitespace();
  if (cursor !== text.length) throw new CliJsonError();
  return result;
}
