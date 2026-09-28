/** Longest body label accepted by the configured-aspect and declination analyses. */
export const MAX_BODY_LABEL_LENGTH = 80;

/**
 * One rule for caller-chosen body labels in the configured-aspect and
 * declination analyses: a nonempty string of at most 80 UTF-16 code units,
 * without leading or trailing whitespace and without C0 control characters or
 * DEL. Matching is exact and case-sensitive. The message never repeats the label.
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
