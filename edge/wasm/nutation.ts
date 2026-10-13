// Experimental translation of src/nutation.ts (MIT; see ../../LICENSE).
// Tables are copied from the current JS module at initialization, not vendored.
// Preserve binary64 operation order. Do not enable fast math or fused multiply-add.
@external("host", "sin") declare function sinHost(x: f64): f64;
@external("host", "cos") declare function cosHost(x: f64): f64;
@external("host", "remainder") declare function remainder(x: f64, y: f64): f64;

// Fixed storage: arguments, coefficients, multipliers, re, im, result, offsets.
// No allocation, memory growth or garbage collection during a kernel call.
const BASE: usize = memory.data(4800);
export function dataPointer(): usize { return BASE; }
export function identity(x: f64): f64 { return x; }

function get(offset: usize, i: i32): f64 { return load<f64>(BASE + offset + <usize>i * 8); }
function put(offset: usize, i: i32, value: f64): void { store<f64>(BASE + offset + <usize>i * 8, value); }

export function nutation(t: f64, terms: i32): void {
  const arcsec: f64 = (3.141592653589793 / 180) / 3600;
  let om: f64 = 0;
  for (let j = 0; j < 5; j++) {
    const f = remainder(get(0, 2 * j) + t * get(0, 2 * j + 1), 1296000) * arcsec;
    const cos = cosHost(f);
    const sin = sinHost(f);
    const o = 7 * j;
    put(4168, o + 1, cos);
    put(4448, o + 1, -sin);
    put(4168, o + 2, 1);
    put(4448, o + 2, 0);
    for (let k = o + 3; k < o + 7; k++) {
      put(4168, k, get(4168, k - 1) * cos - get(4448, k - 1) * sin);
      put(4448, k, get(4168, k - 1) * sin + get(4448, k - 1) * cos);
    }
    put(4168, o, get(4168, o + 4));
    put(4448, o, -get(4448, o + 4));
    om = f;
  }
  let dp: f64 = 0;
  let de: f64 = 0;
  for (let i = terms - 1; i >= 0; i--) {
    let cos: f64 = 1;
    let sin: f64 = 0;
    for (let j = 0; j < 5; j++) {
      const k = 7 * j + <i32>load<u8>(BASE + 3776 + <usize>(5 * i + j));
      const next = cos * get(4168, k) - sin * get(4448, k);
      sin = cos * get(4448, k) + sin * get(4168, k);
      cos = next;
    }
    const k = 6 * i;
    dp += (get(80, k) + get(80, k + 1) * t) * sin + get(80, k + 2) * cos;
    de += (get(80, k + 3) + get(80, k + 4) * t) * cos + get(80, k + 5) * sin;
  }
  put(4728, 0, dp * 1e-7 + get(4752, 0));
  put(4728, 1, de * 1e-7 + get(4752, 1));
  put(4728, 2, om);
}
