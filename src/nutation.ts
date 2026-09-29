/**
 * Nutation and the obliquity of date: the IAU 2000B nutation in longitude
 * (Δψ) and in obliquity (Δε), the IAU 2006 mean obliquity, the true obliquity
 * and the equation of the equinoxes.
 *
 * IAU 2000B is the abridged model of D. D. McCarthy and B. J. Luzum, "An
 * abridged model of the precession-nutation of the celestial pole", Celestial
 * Mechanics and Dynamical Astronomy 85, 37–49 (2003), and IERS Conventions
 * (2003), chapter 5: 77 luni-solar terms, with fundamental arguments linear in
 * time (Simon et al. 1994), and two fixed offsets that stand for the planetary
 * terms it leaves out. The terms and the offsets below are transcribed from
 * `iau2000b` in NOVAS C 3.1 (`nutation.c` of the novas 3.1.1.5 package), by
 * the US Naval Observatory, a work of the US Government not subject to
 * copyright. LICENSING.md records the file and its SHA-256, and
 * `src/nutation.test.ts` compares every number with its text and the results
 * with ERFA's `nut00b`. astronomy-engine 2.1.19 keeps the first five terms.
 */
import { meanObliquity } from "./houses.js";

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;

/**
 * The fundamental arguments l, l′, F, D and Ω, arcseconds: at J2000.0 and per
 * Julian century of TT.
 */
export const ARGUMENTS = [
  485_868.249036, 1_717_915_923.2178,
  1_287_104.79305, 129_596_581.0481,
  335_779.526232, 1_739_527_262.8478,
  1_072_260.70369, 1_602_961_601.209,
  450_160.398036, -6_962_890.5431
];

/**
 * Each term's multipliers of l, l′, F, D and Ω, in NOVAS's order, written as
 * five digits: the multiplier plus 2.
 */
export const MULTIPLIERS =
  "2222322404224242222423222234043222222423324242140422403" +
  "1242412242322231222312444324230242322242224442040402242" +
  "4242432404124234222222422232231224324404220423220321223" +
  "1244324222324440242223424224432142422243324034240402243" +
  "4242321403222031124242203322422340331222024245242421242" +
  "3142422232114441242221444022233342442223132323322232422" +
  "1240332224122322243412464132332040332443024441222433404";

/**
 * Each term's coefficients, in 1e-7″, with its multipliers in the comment: the
 * term adds (A + A′t) sin θ + A″ cos θ to Δψ and (B + B′t) cos θ + B″ sin θ to
 * Δε, where θ is its argument and t is Julian centuries of TT from J2000.0.
 */
// prettier-ignore
export const COEFFICIENTS = [
  //       A        A′       A″         B       B′      B″  //  l l′  F  D  Ω
  -172064161,  -174666,   33386,  92052331,   9086,  15377, //  0  0  0  0  1
   -13170906,    -1675,  -13696,   5730336,  -3015,  -4587, //  0  0  2 -2  2
    -2276413,     -234,    2796,    978459,   -485,   1374, //  0  0  2  0  2
     2074554,      207,    -698,   -897492,    470,   -291, //  0  0  0  0  2
     1475877,    -3633,   11817,     73871,   -184,  -1924, //  0  1  0  0  0
     -516821,     1226,    -524,    224386,   -677,   -174, //  0  1  2 -2  2
      711159,       73,    -872,     -6750,      0,    358, //  1  0  0  0  0
     -387298,     -367,     380,    200728,     18,    318, //  0  0  2  0  1
     -301461,      -36,     816,    129025,    -63,    367, //  1  0  2  0  2
      215829,     -494,     111,    -95929,    299,    132, //  0 -1  2 -2  2
      128227,      137,     181,    -68982,     -9,     39, //  0  0  2 -2  1
      123457,       11,      19,    -53311,     32,     -4, // -1  0  2  0  2
      156994,       10,    -168,     -1235,      0,     82, // -1  0  0  2  0
       63110,       63,      27,    -33228,      0,     -9, //  1  0  0  0  1
      -57976,      -63,    -189,     31429,      0,    -75, // -1  0  0  0  1
      -59641,      -11,     149,     25543,    -11,     66, // -1  0  2  2  2
      -51613,      -42,     129,     26366,      0,     78, //  1  0  2  0  1
       45893,       50,      31,    -24236,    -10,     20, // -2  0  2  0  1
       63384,       11,    -150,     -1220,      0,     29, //  0  0  0  2  0
      -38571,       -1,     158,     16452,    -11,     68, //  0  0  2  2  2
       32481,        0,       0,    -13870,      0,      0, //  0 -2  2 -2  2
      -47722,        0,     -18,       477,      0,    -25, // -2  0  0  2  0
      -31046,       -1,     131,     13238,    -11,     59, //  2  0  2  0  2
       28593,        0,      -1,    -12338,     10,     -3, //  1  0  2 -2  2
       20441,       21,      10,    -10758,      0,     -3, // -1  0  2  0  1
       29243,        0,     -74,      -609,      0,     13, //  2  0  0  0  0
       25887,        0,     -66,      -550,      0,     11, //  0  0  2  0  0
      -14053,      -25,      79,      8551,     -2,    -45, //  0  1  0  0  1
       15164,       10,      11,     -8001,      0,     -1, // -1  0  0  2  1
      -15794,       72,     -16,      6850,    -42,     -5, //  0  2  2 -2  2
       21783,        0,      13,      -167,      0,     13, //  0  0 -2  2  0
      -12873,      -10,     -37,      6953,      0,    -14, //  1  0  0 -2  1
      -12654,       11,      63,      6415,      0,     26, //  0 -1  0  0  1
      -10204,        0,      25,      5222,      0,     15, // -1  0  2  2  1
       16707,      -85,     -10,       168,     -1,     10, //  0  2  0  0  0
       -7691,        0,      44,      3268,      0,     19, //  1  0  2  2  2
      -11024,        0,     -14,       104,      0,      2, // -2  0  2  0  0
        7566,      -21,     -11,     -3250,      0,     -5, //  0  1  2  0  2
       -6637,      -11,      25,      3353,      0,     14, //  0  0  2  2  1
       -7141,       21,       8,      3070,      0,      4, //  0 -1  2  0  2
       -6302,      -11,       2,      3272,      0,      4, //  0  0  0  2  1
        5800,       10,       2,     -3045,      0,     -1, //  1  0  2 -2  1
        6443,        0,      -7,     -2768,      0,     -4, //  2  0  2 -2  2
       -5774,      -11,     -15,      3041,      0,     -5, // -2  0  0  2  1
       -5350,        0,      21,      2695,      0,     12, //  2  0  2  0  1
       -4752,      -11,      -3,      2719,      0,     -3, //  0 -1  2 -2  1
       -4940,      -11,     -21,      2720,      0,     -9, //  0  0  0 -2  1
        7350,        0,      -8,       -51,      0,      4, // -1 -1  0  2  0
        4065,        0,       6,     -2206,      0,      1, //  2  0  0 -2  1
        6579,        0,     -24,      -199,      0,      2, //  1  0  0  2  0
        3579,        0,       5,     -1900,      0,      1, //  0  1  2 -2  1
        4725,        0,      -6,       -41,      0,      3, //  1 -1  0  0  0
       -3075,        0,      -2,      1313,      0,     -1, // -2  0  2  0  2
       -2904,        0,      15,      1233,      0,      7, //  3  0  2  0  2
        4348,        0,     -10,       -81,      0,      2, //  0 -1  0  2  0
       -2878,        0,       8,      1232,      0,      4, //  1 -1  2  0  2
       -4230,        0,       5,       -20,      0,     -2, //  0  0  0  1  0
       -2819,        0,       7,      1207,      0,      3, // -1 -1  2  2  2
       -4056,        0,       5,        40,      0,     -2, // -1  0  2  0  0
       -2647,        0,      11,      1129,      0,      5, //  0 -1  2  2  2
       -2294,        0,     -10,      1266,      0,     -4, // -2  0  0  0  1
        2481,        0,      -7,     -1062,      0,     -3, //  1  1  2  0  2
        2179,        0,      -2,     -1129,      0,     -2, //  2  0  0  0  1
        3276,        0,       1,        -9,      0,      0, // -1  1  0  1  0
       -3389,        0,       5,        35,      0,     -2, //  1  1  0  0  0
        3339,        0,     -13,      -107,      0,      1, //  1  0  2  0  0
       -1987,        0,      -6,      1073,      0,     -2, // -1  0  2 -2  1
       -1981,        0,       0,       854,      0,      0, //  1  0  0  0  2
        4026,        0,    -353,      -553,      0,   -139, // -1  0  0  1  0
        1660,        0,      -5,      -710,      0,     -2, //  0  0  2  1  2
       -1521,        0,       9,       647,      0,      4, // -1  0  2  4  2
        1314,        0,       0,      -700,      0,      0, // -1  1  0  1  1
       -1283,        0,       0,       672,      0,      0, //  0 -2  2 -2  1
       -1331,        0,       8,       663,      0,      4, //  1  0  2  2  1
        1383,        0,      -2,      -594,      0,     -2, // -2  0  2  2  2
        1405,        0,       4,      -610,      0,      2, // -1  0  0  0  2
        1290,        0,       0,      -556,      0,      0 //  1  1  2 -2  2
];

/**
 * The fixed offsets for the planetary terms the model leaves out, added to Δψ
 * and Δε, arcseconds.
 */
export const OFFSETS = [-0.000135, 0.000388] as const;

/** The number of terms. */
export const NUTATION_TERMS = 77;

/**
 * Δψ and Δε in arcseconds, from the first `terms` terms and the two offsets,
 * at `t` Julian centuries of TT from J2000.0; `om` is the argument Ω, radians.
 */
export function nutation(t: number, terms = NUTATION_TERMS): { dpsi: number; deps: number; om: number } {
  const f: number[] = [];
  for (let j = 0; j < 10; j += 2) f.push(((ARGUMENTS[j]! + t * ARGUMENTS[j + 1]!) % 1_296_000) * ARCSEC);
  let dp = 0;
  let de = 0;
  // From the smallest term to the largest, as NOVAS sums them.
  for (let i = terms - 1; i >= 0; i -= 1) {
    let theta = 0;
    for (let j = 0; j < 5; j += 1) theta += (MULTIPLIERS.charCodeAt(5 * i + j) - 50) * f[j]!;
    theta %= 2 * Math.PI;
    const s = Math.sin(theta);
    const c = Math.cos(theta);
    const k = 6 * i;
    dp += (COEFFICIENTS[k]! + COEFFICIENTS[k + 1]! * t) * s + COEFFICIENTS[k + 2]! * c;
    de += (COEFFICIENTS[k + 3]! + COEFFICIENTS[k + 4]! * t) * c + COEFFICIENTS[k + 5]! * s;
  }
  return { dpsi: dp * 1e-7 + OFFSETS[0], deps: de * 1e-7 + OFFSETS[1], om: f[4]! };
}

/** The nutation and obliquity of date. */
export interface Tilt {
  /** Nutation in longitude Δψ, arcseconds. */
  readonly dpsi: number;
  /** Nutation in obliquity Δε, arcseconds. */
  readonly deps: number;
  /** Mean obliquity of date εA (IAU 2006), degrees. */
  readonly mobl: number;
  /** True obliquity of date, εA + Δε, degrees. */
  readonly tobl: number;
  /**
   * Equation of the equinoxes, arcseconds: Δψ cos εA plus the two largest
   * complementary terms of IERS Conventions (2010), table 5.2e, 2640.96 µas
   * sin Ω and 63.52 µas sin 2Ω. The rest of that table adds up to at most
   * 44.0 µas from 1800 to 2200.
   */
  readonly ee: number;
}

/** The nutation and obliquity at `tt`, days of TT from J2000.0 (astronomy-engine's `time.tt`). */
export function tilt(tt: number): Tilt {
  const t = tt / 36_525;
  const { dpsi, deps, om } = nutation(t);
  const mobl = meanObliquity(t);
  return {
    dpsi,
    deps,
    mobl,
    tobl: mobl + deps / 3600,
    ee: dpsi * Math.cos(mobl * DEG) + 0.00264096 * Math.sin(om) + 0.00006352 * Math.sin(2 * om)
  };
}
