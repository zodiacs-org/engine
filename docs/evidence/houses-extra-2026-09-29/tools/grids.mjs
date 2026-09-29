// The two preregistered grids (PREREGISTRATION.md): the latitude ladder L and
// the global grid G. Each case is a RAMC, a latitude and an obliquity, in
// degrees, with its bodies as [longitude, latitude] pairs.

export const LADDER_OBLIQUITY = 23.4392911;
const LADDER_BODY_LATITUDES = [0, 1.4, -1.4, 5.2, -5.2, 11.3, -17.1, 17.1];

export function ladder() {
  const latitudes = [
    ...Array.from({ length: 117 }, (_, k) => -(550 + 116 - k) / 10),
    ...Array.from({ length: 117 }, (_, k) => (550 + k) / 10)
  ];
  const cases = [];
  for (const lat of latitudes) {
    for (let j = 0; j < 24; j += 1) {
      const c = cases.length;
      const bodies = Array.from({ length: 8 }, (_, m) => [11.25 + 45 * m, LADDER_BODY_LATITUDES[(m + c) % 8]]);
      cases.push({ set: "L", index: c, ramc: 7.5 + 15 * j, lat, eps: LADDER_OBLIQUITY, bodies });
    }
  }
  return cases;
}

/** mulberry32, as the preregistration writes it. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function globalGrid() {
  const next = mulberry32(20260929);
  return Array.from({ length: 20_000 }, (_, index) => {
    const lat = -89.9 + 179.8 * next();
    const ramc = 360 * next();
    const eps = 23.41 + 0.06 * next();
    const lon = 360 * next();
    const bodyLat = -20 + 40 * next();
    return { set: "G", index, ramc, lat, eps, bodies: [[lon, bodyLat]] };
  });
}

export const inputOf = (c, ramc = c.ramc) => ({ gastHours: ramc / 15, longitude: 0, latitude: c.lat, obliquity: c.eps });
