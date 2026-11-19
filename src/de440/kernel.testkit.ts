/**
 * TEST-ONLY. A reader of a JPL DE kernel (`de440.bsp`, type-2 Chebyshev
 * segments) as a `StateSource`, so the tier-B tests can run this entry's
 * reduction on the raw kernel against the ERFA chain's places (rule (viii)
 * and check C4 of P4.1's preregistration). Not part of the package: no entry
 * point imports it, and it reads a file. Double precision; the chain it is
 * compared with evaluates the same series exactly.
 */
import { readFileSync } from "node:fs";
import type { StateSource } from "./pack.js";

interface Segment {
  target: number;
  center: number;
  start: number;
  end: number;
  init: number;
  intlen: number;
  rsize: number;
  n: number;
  records: number;
  base: number;
}

export class KernelSource implements StateSource {
  private readonly view: DataView;
  private readonly segments: Segment[] = [];
  private readonly span: { start: number; end: number };

  constructor(path: string) {
    const bytes = readFileSync(path);
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.toString("ascii", 0, 7) !== "DAF/SPK") throw new Error("not an SPK kernel");
    if (bytes.toString("ascii", 88, 96) !== "LTL-IEEE") throw new Error("only little-endian kernels are read");
    const nd = this.view.getInt32(8, true);
    const ni = this.view.getInt32(12, true);
    if (nd !== 2 || ni !== 6) throw new Error("not an SPK summary format");
    let record = this.view.getInt32(76, true);
    while (record) {
      const base = (record - 1) * 1024;
      const next = this.view.getFloat64(base, true);
      const count = this.view.getFloat64(base + 16, true);
      for (let i = 0; i < count; i += 1) {
        const off = base + 24 + i * 40;
        const start = this.view.getFloat64(off, true);
        const end = this.view.getFloat64(off + 8, true);
        const target = this.view.getInt32(off + 16, true);
        const center = this.view.getInt32(off + 20, true);
        const type = this.view.getInt32(off + 28, true);
        const first = this.view.getInt32(off + 32, true);
        const last = this.view.getInt32(off + 36, true);
        if (type !== 2) continue;
        const word = (address: number) => this.view.getFloat64((address - 1) * 8, true);
        const rsize = word(last - 1);
        this.segments.push({ target, center, start, end, init: word(last - 3), intlen: word(last - 2), rsize, n: (rsize - 2) / 3, records: word(last), base: first });
      }
      record = next;
    }
    const used = [[10, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [301, 3], [399, 3]] as const;
    const segs = used.map(([t, c]) => this.segment(t, c));
    this.span = { start: Math.max(...segs.map((s) => s.start)), end: Math.min(...segs.map((s) => s.end)) };
  }

  private segment(target: number, center: number): Segment {
    const found = this.segments.find((s) => s.target === target && s.center === center);
    if (!found) throw new Error(`the kernel has no segment ${center} -> ${target}`);
    return found;
  }

  /** Position (km) and velocity (km/s) of one segment, added into `out`. */
  private add(target: number, center: number, et: number, out: Float64Array): void {
    const s = this.segment(target, center);
    let index = Math.floor((et - s.init) / s.intlen);
    if (index >= s.records) index = s.records - 1;
    if (index < 0) index = 0;
    const at = (s.base - 1 + index * s.rsize) * 8;
    const mid = this.view.getFloat64(at, true);
    const radius = this.view.getFloat64(at + 8, true);
    const tau = (et - mid) / radius;
    for (let axis = 0; axis < 3; axis += 1) {
      const off = at + 16 + axis * s.n * 8;
      let b1 = 0;
      let b2 = 0;
      let d1 = 0;
      let d2 = 0;
      for (let k = s.n - 1; k >= 1; k -= 1) {
        const c = this.view.getFloat64(off + k * 8, true);
        const t = b1;
        b1 = 2 * tau * b1 - b2 + c;
        b2 = t;
        const td = d1;
        d1 = 2 * tau * d1 - d2 + 2 * t;
        d2 = td;
      }
      out[axis] = out[axis]! + (tau * b1 - b2 + this.view.getFloat64(off, true));
      out[axis + 3] = out[axis + 3]! + (tau * d1 - d2 + b1) / radius;
    }
  }

  covers(et: number): boolean {
    return Number.isFinite(et) && et >= this.span.start && et <= this.span.end;
  }

  state(body: string, et: number, out: Float64Array): Float64Array {
    out.fill(0);
    const route: Record<string, [number, number][]> = {
      Sun: [[10, 0]],
      Mercury: [[1, 0]],
      Venus: [[2, 0]],
      Mars: [[4, 0]],
      Jupiter: [[5, 0]],
      Saturn: [[6, 0]],
      Uranus: [[7, 0]],
      Neptune: [[8, 0]],
      Pluto: [[9, 0]],
      Earth: [[3, 0], [399, 3]],
      Moon: [[3, 0], [301, 3]]
    };
    const legs = route[body];
    if (!legs) throw new Error(`unknown body ${body}`);
    for (const [t, c] of legs) this.add(t, c, et, out);
    return out;
  }

  /** The kernel's own records are not this test kit's concern: none reported. */
  boundaries(): number[] {
    return [];
  }

  lunar(et: number, emb: Float64Array, moon: Float64Array, earth: Float64Array): void {
    for (const [t, c, out] of [[3, 0, emb], [301, 3, moon], [399, 3, earth]] as const) {
      out.fill(0);
      this.add(t, c, et, out);
    }
  }
}
