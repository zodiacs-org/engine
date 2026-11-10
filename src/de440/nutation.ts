/**
 * IAU 2000B nutation with the P03 adjustment, and the IAU 2006 mean
 * obliquity, for the DE440 reduction: the research runtime's
 * (examples/precision-alpha/src/core/nutation.mjs in the site repository)
 * expressions, operation for operation, so that this reduction gives the
 * runtime's numbers bit for bit. The 77 terms are the ones the engine carries
 * (src/nutation.ts, transcribed from NOVAS C 3.1), which equal the runtime's
 * term for term and in the same order. Angles in arcseconds unless named
 * otherwise; t is Julian centuries of TT since J2000.
 */
import { MULTIPLIERS, NUTATION_TERMS, coefficients } from "../nutation.js";

const TURNAS = 1296000.0;
const DAS2R = Math.PI / (180 * 3600);
const D2PI = 2 * Math.PI;
/** The series' units: 0.1 microarcsecond. */
const U2A = 1e-7;
/** The fixed planetary-bias offsets the 2000B model carries, arcseconds. */
const DPPLAN_B = -0.000135;
const DEPLAN_B = +0.000388;

const fmod = (x: number, y: number): number => x % y;
const arcsecArg = (a: number): number => fmod(a, TURNAS) * DAS2R;

/** Nutation in longitude and in obliquity, arcseconds. */
export interface Nutation {
  readonly dpsi: number;
  readonly deps: number;
}

let rows: readonly (readonly number[])[] | undefined;

/** Each term as the runtime's table holds it: five multipliers, then A, A', A'', B, B', B'' (1e-7 arcsecond). */
function series(): readonly (readonly number[])[] {
  if (!rows) {
    const c = coefficients();
    const out: number[][] = [];
    for (let i = 0; i < NUTATION_TERMS; i += 1) {
      const row: number[] = [];
      for (let k = 0; k < 5; k += 1) row.push(Number(MULTIPLIERS[i * 5 + k]) - 2);
      for (let k = 0; k < 6; k += 1) row.push(c[i * 6 + k]!);
      out.push(row);
    }
    rows = out;
  }
  return rows;
}

/** IAU 2000B, summed from the smallest term up, as the published algorithm prescribes. */
export function nut00b(t: number): Nutation {
  const el = arcsecArg(485868.249036 + 1717915923.2178 * t);
  const elp = arcsecArg(1287104.79305 + 129596581.0481 * t);
  const f = arcsecArg(335779.526232 + 1739527262.8478 * t);
  const d = arcsecArg(1072260.70369 + 1602961601.209 * t);
  const om = arcsecArg(450160.398036 - 6962890.5431 * t);
  let dp = 0;
  let de = 0;
  const terms = series();
  for (let i = terms.length - 1; i >= 0; i -= 1) {
    const r = terms[i]!;
    const arg = fmod(r[0]! * el + r[1]! * elp + r[2]! * f + r[3]! * d + r[4]! * om, D2PI);
    const s = Math.sin(arg);
    const c = Math.cos(arg);
    dp += (r[5]! + r[6]! * t) * s + r[7]! * c;
    de += (r[8]! + r[9]! * t) * c + r[10]! * s;
  }
  return { dpsi: dp * U2A + DPPLAN_B, deps: de * U2A + DEPLAN_B };
}

/** IAU 2006 (P03) mean obliquity of the ecliptic, arcseconds. */
export function meanObliquityArcsec(t: number): number {
  return ((((-0.0000000434 * t - 0.000000576) * t + 0.0020034) * t - 0.0001831) * t - 46.836769) * t + 84381.406;
}

/** The P03 adjustment that makes an IAU 2000 nutation consistent with IAU 2006 precession (as eraNut06a applies it). */
export function adjustToP03(nut: Nutation, t: number): Nutation {
  const fj2 = -2.7774e-6 * t;
  return {
    dpsi: nut.dpsi + nut.dpsi * (0.4697e-6 + fj2),
    deps: nut.deps + nut.deps * fj2
  };
}
