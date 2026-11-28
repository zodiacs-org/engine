// Relativistic and single-Sun corrections adapted from ERFA v2.0.1.
// Derived from SOFA; ../ERFA-NOTICE.txt retains the licence.
import { C_KM_S, AU_KM, unit, reduceJpl } from './reduction.mjs';
import { trueOfDate, rotate, MAX_FRAME_TT_DAYS } from './frames.mjs';
export const SOLAR_SCHWARZSCHILD_AU = 1.97412574336e-8;
const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i],0);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function direction(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || Math.abs(Math.hypot(...v)-1)>1e-8) throw Error('Unit direction required');
}
function distance(s) {
  if (!Number.isFinite(s) || s<=0) throw Error('Positive heliocentric distance in AU required');
}

// Full Lorentz aberration plus the ERFA solar-potential term. Returned unit
// direction only; no corrected range or velocity is inferred.
export function relativisticAberration(p, velocityKmS, sunDistanceAu) {
  direction(p); distance(sunDistanceAu);
  if (!Array.isArray(velocityKmS) || velocityKmS.length!==3 || !velocityKmS.every(Number.isFinite)) throw Error('Finite observer velocity required');
  const beta = velocityKmS.map(v => v/C_KM_S), betaSquared=dot(beta,beta);
  if (betaSquared>=1) throw Error('Observer velocity must be subluminal');
  const inverseGamma=Math.sqrt(1-betaSquared), radial=dot(p,beta), weight=1+radial/(1+inverseGamma);
  return unit(p.map((v,i) => inverseGamma*v + weight*beta[i] + SOLAR_SCHWARZSCHILD_AU/sunDistanceAu*(beta[i]-radial*v)));
}

// Finite-target single-body deflection. p: observer->target, q: Sun->target,
// e: Sun->observer. The denominator limiter is the ERFA ldsun prescription.
// This is a specified static Sun geometry, not a multi-body ray integration.
// Output is intentionally unnormalised, matching ERFA ld/ldsun.
export function solarDeflection(p,q,e,sunDistanceAu) {
  [p,q,e].forEach(direction); distance(sunDistanceAu);
  const limiter=1e-6/Math.max(1,sunDistanceAu*sunDistanceAu);
  const denominator=Math.max(dot(q,q.map((v,i) => v+e[i])),limiter);
  const tangent=cross(p,cross(e,q));
  return p.map((v,i) => v+SOLAR_SCHWARZSCHILD_AU/sunDistanceAu/denominator*tangent[i]);
}

// Keep the existing SPICE modes separate. Geocentric only, explicit TT and
// TDB supplied by the caller. A frame timestamp is never inferred from TDB.
export async function apparentJpl(readState, {target,center,tdbSeconds,ttDays,correction,frame,terms}) {
  if (center!==399 || !['CN+REL','CN+REL+SUN'].includes(correction) || !['ICRF','true-equator-equinox-date','true-ecliptic-equinox-date'].includes(frame) || !Number.isFinite(ttDays) || Math.abs(ttDays)>MAX_FRAME_TT_DAYS) throw Error('Explicit geocentric apparent conventions required');
  if (correction==='CN+REL+SUN' && target===10) throw Error('Solar self-deflection is undefined; choose CN+REL');
  const geometric = await reduceJpl(readState,{target,center,tdbSeconds,correction:'CN'});
  async function state(id,time) {
    const s=await readState({target:id,center:0,tdbSeconds:time});
    if (s.frame!=='J2000' || s.timeScale!=='TDB' || s.positionUnit!=='km' || s.velocityUnit!=='km/s' || s.corrections!=='geometric' || !Array.isArray(s.position) || s.position.length!==3 || !s.position.every(Number.isFinite) || !Array.isArray(s.velocity) || s.velocity.length!==3 || !s.velocity.every(Number.isFinite)) throw Error('Geometric J2000 SPK state required');
    return s;
  }
  const observer=await state(center,tdbSeconds), sun=await state(10,tdbSeconds);
  const solarObserver=observer.position.map((v,i) => v-sun.position[i]);
  const sunDistanceAu=Math.hypot(...solarObserver)/AU_KM;
  let direction=geometric.direction;
  if (correction==='CN+REL+SUN') {
    const emitted=await state(target,tdbSeconds-geometric.lightTimeSeconds);
    const q=unit(emitted.position.map((v,i) => v-sun.position[i]));
    direction=unit(solarDeflection(direction,q,unit(solarObserver),sunDistanceAu));
  }
  direction=relativisticAberration(direction,observer.velocity,sunDistanceAu);
  let frameModel='ICRF';
  if (frame!=='ICRF') {
    const rotation=trueOfDate(ttDays,terms,frame);
    direction=rotate(rotation.matrix,direction); frameModel=rotation.model;
  }
  return {target,center,tdbSeconds,ttDaysSinceJ2000:ttDays,frame,frameModel,correction,
    lightTimeSeconds:geometric.lightTimeSeconds,aberration:'Lorentz+ERFA-solar-potential',
    deflection:correction==='CN+REL+SUN'?'single-Sun-finite-target-static-reception-Sun/ERFA-limiter':'none',
    direction:unit(direction)};
}
