/** Group window-local candidate passages, breaking at every rejected revolution. */
export function groupCandidatePassages(passages: readonly number[]): readonly (readonly number[])[] {
  const groups: number[][] = [];
  for (let index = 0; index < passages.length; index += 1) {
    const current = passages[index]!;
    const previous = passages[index - 1];
    if (!Number.isSafeInteger(current) || (previous !== undefined && current < previous)) {
      throw new RangeError("Candidate passage indices must be ordered integers.");
    }
    if (previous === undefined || current > previous + 1) groups.push([]);
    groups[groups.length - 1]!.push(index);
  }
  return groups.map((group) => Object.freeze(group));
}
