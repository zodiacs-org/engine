/** Longest body label, in UTF-16 code units, the configured-aspect and declination analyses accept. */
export const MAX_BODY_LABEL_LENGTH = 80;

/**
 * One rule for caller-chosen body labels in the configured-aspect and
 * declination analyses: a nonempty string of at most 80 UTF-16 code units
 * (an astral character such as an emoji counts two), that String.prototype.trim
 * leaves unchanged (so no leading or trailing ECMAScript white space or line
 * terminator, U+FEFF included), and that contains no C0 control character
 * (U+0000–U+001F) and no DEL (U+007F). C1 controls (U+0080–U+009F), format
 * characters such as U+200B and lone surrogates are not rejected. Matching is
 * exact and case-sensitive. The message never repeats the label.
 */
export function checkedBodyLabel(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_BODY_LABEL_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new RangeError(
      "Body labels must be nonempty, trimmed strings of at most 80 characters, without control characters."
    );
  }
  return value;
}
