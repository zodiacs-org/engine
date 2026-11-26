/**
 * A minor body's table (ZODMB01, src/minor-bodies/pack-data.ts) read: its
 * heliocentric position in the ICRF, km, at a TDB Julian date, from the
 * Chebyshev series scripts/minor-bodies/fit.py fitted to NASA JPL Horizons's
 * vectors. Environment-neutral: no file or network access; the table is
 * decoded from its base64 text at the first position asked of it.
 */

/**
 * A minor body's table: how it is laid out (`intervals` uniform intervals of
 * `intervalDays`, series of `degree`, coefficients in multiples of `unitKm`,
 * int32 below `k32`, int16 below `k8Start`, int8 beyond), the span it covers,
 * its fit's largest error at the vectors it was fitted to, km, and its
 * bytes' SHA-256, as pack-data.ts gives it.
 */
export interface MinorBodyTable {
  readonly intervals: number;
  readonly intervalDays: number;
  readonly degree: number;
  readonly unitKm: number;
  readonly k32: number;
  readonly k8Start: number;
  /** TDB Julian dates, the first interval's start and the last one's end. */
  readonly spanStartJd: number;
  readonly spanEndJd: number;
  readonly maxFitResidualKm: number;
  /** The SHA-256 of the table's bytes, lower-case hexadecimal. */
  readonly sha256: string;
}

/** A table and its reader. */
export interface Table {
  readonly layout: MinorBodyTable;
  /** The heliocentric ICRF position, km, at a TDB Julian date inside the span. */
  position(jdTdb: number): [number, number, number];
}

/**
 * Every coefficient of a table in km, interval by interval, then axis by
 * axis, then by order: the column-by-column layout pack-data.ts describes,
 * rearranged so that one interval's series lie together.
 */
function decode(layout: MinorBodyTable, base64: string): Float64Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const n = layout.intervals;
  const m = layout.degree + 1;
  const out = new Float64Array(n * 3 * m);
  let offset = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    for (let k = 0; k < m; k += 1) {
      const width = k < layout.k32 ? 4 : k < layout.k8Start ? 2 : 1;
      for (let i = 0; i < n; i += 1) {
        const at = offset + i * width;
        const q = width === 4 ? view.getInt32(at, true) : width === 2 ? view.getInt16(at, true) : view.getInt8(at);
        out[(i * 3 + axis) * m + k] = q * layout.unitKm;
      }
      offset += n * width;
    }
  }
  if (offset !== bytes.length) throw new RangeError(`a minor body's table is ${bytes.length} bytes where its layout needs ${offset}`);
  return out;
}

/**
 * The reader of one table: the interval that holds the date (the last one
 * for its end), and each axis's series there by Clenshaw's recurrence, on
 * the interval's own time from -1 to 1.
 */
export function table(layout: MinorBodyTable, base64: string): Table {
  let coefficients: Float64Array | undefined;
  return {
    layout,
    position(jdTdb: number): [number, number, number] {
      coefficients ??= decode(layout, base64);
      const m = layout.degree + 1;
      let index = Math.floor((jdTdb - layout.spanStartJd) / layout.intervalDays);
      if (index < 0) index = 0;
      if (index > layout.intervals - 1) index = layout.intervals - 1;
      const start = layout.spanStartJd + index * layout.intervalDays;
      const u = (2 * (jdTdb - start)) / layout.intervalDays - 1;
      const out: [number, number, number] = [0, 0, 0];
      for (let axis = 0; axis < 3; axis += 1) {
        const base = (index * 3 + axis) * m;
        let b1 = 0;
        let b2 = 0;
        for (let k = m - 1; k >= 1; k -= 1) {
          const b0 = 2 * u * b1 - b2 + coefficients[base + k]!;
          b2 = b1;
          b1 = b0;
        }
        out[axis] = u * b1 - b2 + coefficients[base]!;
      }
      return out;
    }
  };
}
