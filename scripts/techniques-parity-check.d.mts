/** Types for techniques-parity-check.mjs, which the unit suite imports. */
export interface ParityResult {
  corpus: string;
  cases: number;
  agree: number;
  disagreements: { index: number; site: any; package: any }[];
}
export declare function largestMsDifference(result: ParityResult): number;
export declare function checkReturns(api: object, expected: any): ParityResult[];
export declare function checkComposite(api: object, expected: any): ParityResult[];
export declare function checkVoidOfCourse(api: object, expected: any): ParityResult[];
export declare function checkPatterns(api: object, expected: any): ParityResult[];
export declare function checkDignities(api: object, expected: any): ParityResult[];
export declare function checkMoonSigns(
  api: object,
  expected: any,
  options: { compareMidnights: boolean; prepare?: (date: string, timeZone: string) => Promise<void> }
): Promise<ParityResult[]>;
