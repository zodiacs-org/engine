// Independently authored from NAIF's time and aberration Required Reading.
// No engine imports. NAIF frame 1 in modern DE kernels is aligned with ICRF.
export const C_KM_S = 299792.458;
export const AU_KM = 149597870.7;
export const TIME_MODEL = 'NAIF-DELTET-periodic/naif0012';
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const subtract = (a, b) => a.map((v, i) => v - b[i]);
function vector(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) throw Error('Finite three-vector required');
  return v;
}
export function unit(v) {
  vector(v);
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || !length) throw Error('Nonzero finite norm required');
  return v.map(x => x / length);
}

// TT seconds since JD 2451545.0, not UTC. Solve the implicit NAIF equation
// t_TDB = t_TT + K*sin(M(t_TDB) + EB*sin(M(t_TDB))). This is a truncated
// geocentric periodic model, not the full Fairhead-Bretagnon series.
export function ttToTdb(ttSeconds) {
  if (!Number.isFinite(ttSeconds) || Math.abs(ttSeconds) > 6.4e9) throw Error('TT outside supported model span');
  let offset = 0;
  for (let i = 0; i < 4; i++) {
    const m = 6.239996 + 1.99096871e-7 * (ttSeconds + offset);
    offset = 0.001657 * Math.sin(m + 0.01671 * Math.sin(m));
  }
  return { tdbSeconds: ttSeconds + offset, tdbMinusTtSeconds: offset, timeModel: TIME_MODEL };
}

// SPICE's Newtonian stellar aberration: rotate toward transverse observer
// velocity by asin(|v_perp|/c). This deliberately has SPICE CN+S semantics,
// not relativistic aberration or gravitational deflection.
export function stellarAberration(position, velocity) {
  const p = unit(position); vector(velocity);
  const beta = velocity.map(v => v / C_KM_S);
  if (Math.hypot(...beta) >= 1) throw Error('Observer velocity must be subluminal');
  const radial = dot(p, beta), transverse = beta.map((v, i) => v - radial * p[i]);
  const sineSquared = dot(transverse, transverse);
  const cosine = Math.sqrt(1 - sineSquared);
  const range = Math.hypot(...position);
  return p.map((v, i) => range * (cosine * v + transverse[i]));
}

// Position only: corrected velocity is not a simple difference of SPK
// velocities. No topocentric, precession, nutation or deflection is implied.
export async function reduceJpl(readState, { target, center, tdbSeconds, correction, frame = 'ICRF' }) {
  if (typeof readState !== 'function' || ![target, center].every(Number.isSafeInteger) || target === center || !Number.isFinite(tdbSeconds) || !['NONE', 'CN', 'CN+S'].includes(correction) || frame !== 'ICRF') throw Error('Explicit supported reduction conventions required');
  async function state(id, epoch) {
    const result = await readState({ target: id, center: 0, tdbSeconds: epoch });
    if (result.frame !== 'J2000' || result.timeScale !== 'TDB' || result.positionUnit !== 'km' || result.velocityUnit !== 'km/s' || result.corrections !== 'geometric') throw Error('Geometric J2000 SPK state required');
    vector(result.position); vector(result.velocity);
    return result;
  }
  const observer = await state(center, tdbSeconds);
  let lightTimeSeconds = 0, position, iterations = 0;
  for (; iterations < 32; iterations++) {
    const targetState = await state(target, tdbSeconds - lightTimeSeconds);
    position = subtract(targetState.position, observer.position);
    const next = Math.hypot(...position) / C_KM_S;
    if (!Number.isFinite(next) || next === 0) throw Error('Invalid target range');
    if (correction === 'NONE') break;
    // Account for binary64 epoch subtraction at historical epochs.
    if (Math.abs(next - lightTimeSeconds) <= Math.max(1e-9, Math.abs(tdbSeconds) * Number.EPSILON * 2)) {
      lightTimeSeconds = next;
      break;
    }
    lightTimeSeconds = next;
  }
  if (iterations === 32) throw Error('Light-time iteration did not converge');
  if (correction === 'CN+S') position = stellarAberration(position, observer.velocity);
  return { target, center, tdbSeconds, frame, positionUnit: 'km', correction,
    deflection: 'none', aberration: correction === 'CN+S' ? 'SPICE-Newtonian' : 'none',
    lightTimeSeconds: correction === 'NONE' ? 0 : lightTimeSeconds, iterations: iterations + 1,
    position, direction: unit(position) };
}

export function separationArcseconds(a, b) {
  a = unit(a); b = unit(b);
  const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  return Math.atan2(Math.hypot(...cross), dot(a, b)) * (180 / Math.PI) * 3600;
}
