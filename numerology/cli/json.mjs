// Local transport bounds, independent of the library's name/table bounds.
export const MAX_JSON_BYTES = 65_536;
export const MAX_JSON_DEPTH = 16;
export const MAX_JSON_TOKENS = 10_000;

export class CliError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function parseJson(text) {
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new CliError("input-limit", "JSON input exceeds the byte limit.");
  }
  let value;
  try { value = JSON.parse(text); }
  catch { throw new CliError("invalid-json", "Input must be one valid JSON value."); }

  // Native parsing establishes syntax first. Scan structural tokens to reject
  // duplicate decoded keys (including escaped spellings) and bound nesting.
  // No caller keys are assigned to ordinary object properties by this scanner.
  const tokens = /"(?:[^"\\]|\\[\s\S])*"|[{}\[\]:,]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu;
  const stack = [];
  let count = 0;
  for (const match of text.matchAll(tokens)) {
    if (++count > MAX_JSON_TOKENS) {
      throw new CliError("input-limit", "JSON input exceeds the token limit.");
    }
    const token = match[0];
    if (token === "{" || token === "[") {
      stack.push(token === "{" ? new Set() : null);
      if (stack.length > MAX_JSON_DEPTH) {
        throw new CliError("input-limit", "JSON input exceeds the nesting limit.");
      }
    } else if (token === "}" || token === "]") {
      stack.pop();
    } else if (token.startsWith('"')) {
      let next = match.index + token.length;
      while (next < text.length && /[\t\r\n ]/u.test(text[next])) next++;
      if (text[next] !== ":") continue;
      const key = JSON.parse(token);
      const keys = stack.at(-1);
      if (keys.has(key)) {
        throw new CliError("duplicate-key", "JSON objects must not contain duplicate keys.");
      }
      keys.add(key);
    }
  }
  return value;
}
