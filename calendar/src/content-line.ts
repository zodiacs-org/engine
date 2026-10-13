/** Refuse characters that cannot survive an RFC 5545 UTF-8 TEXT round trip. */
function validateText(value: string): void {
  if (typeof value !== "string" || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new RangeError("Calendar text contains an unsupported control character.");
  }
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new RangeError("Calendar text must contain valid Unicode scalar values.");
    }
  }
}

/** RFC 5545 section 3.3.11, for TEXT values only (not parameters). */
export function escapeText(value: string): string {
  validateText(value);
  return value.replace(/\\/gu, "\\\\")
    .replace(/\r\n|\r|\n/gu, "\\n")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,");
}

/** Fold a logical content line at 75 UTF-8 octets including continuation space. */
export function foldContentLine(line: string): string {
  validateText(line);
  if (/[\r\n]/u.test(line)) throw new RangeError("A logical content line cannot contain a line break.");
  let output = "";
  let octets = 0;
  for (const character of line) {
    const width = Buffer.byteLength(character, "utf8");
    if (octets + width > 75) {
      output += "\r\n ";
      octets = 1;
    }
    output += character;
    octets += width;
  }
  return output;
}

/** Validate canonical UTC input instead of accepting Date's calendar rollovers. */
export function utcDateTime(instant: string): string {
  if (typeof instant !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(instant)) {
    throw new RangeError("Expected a canonical UTC instant with milliseconds.");
  }
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== instant || date.getUTCFullYear() < 1) {
    throw new RangeError("Invalid UTC calendar date.");
  }
  return instant.slice(0, 19).replace(/[-:]/gu, "") + "Z";
}
