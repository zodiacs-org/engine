// Formulae and constants adapted from ERFA v2.0.1, derived from SOFA.
// See ../ERFA-NOTICE.txt. No engine or Swiss imports.
export const FRAME_MODEL = 'IAU2006-bias-precession/IAU2000B-unadjusted-nutation';
export const MAX_FRAME_TT_DAYS = 73050;
const AS2R = Math.PI / (180 * 3600);
const polynomial = (coefficients, t) => coefficients.reduceRight((v, c) => v * t + c, 0);
function centuries(ttDays) {
  if (!Number.isFinite(ttDays) || Math.abs(ttDays) > MAX_FRAME_TT_DAYS) throw Error('Frame model requires TT days since J2000 within two Julian centuries');
  return ttDays / 36525;
}

// Extract data only, from the pinned runtime ERFA source. No C is executed.
export function parseNutationTerms(source) {
  const table = /\}\s*x\[\]\s*=\s*\{([\s\S]*?)\n\s*\};/.exec(source)?.[1];
  if (!table) throw Error('Missing IAU2000B coefficient table');
  const text = table.replace(/\/\*[\s\S]*?\*\//g, '');
  const rows = [...text.matchAll(/\{([^{}]+)\}/g)].map(m => m[1].split(',').map(value => {
    if (!/^\s*[+-]?\d+(?:\.\d+)?\s*$/.test(value)) throw Error('Invalid coefficient');
    return Number(value);
  }));
  if (rows.length !== 77 || rows.some(r => r.length !== 11 || !r.every(Number.isFinite) || !r.slice(0,5).every(Number.isInteger)) || text.replace(/\{[^{}]+\}/g, '').replace(/[\s,]/g, '')) throw Error('Invalid IAU2000B table');
  return rows;
}

export function nutation2000B(ttDays, terms) {
  const t = centuries(ttDays);
  if (!Array.isArray(terms) || terms.length !== 77 || terms.some(r => !Array.isArray(r) || r.length !== 11 || !r.every(Number.isFinite) || !r.slice(0,5).every(Number.isInteger))) throw Error('Validated nutation terms required');
  const argumentsRadians = [[485868.249036,1717915923.2178], [1287104.79305,129596581.0481],
    [335779.526232,1739527262.8478], [1072260.70369,1602961601.2090], [450160.398036,-6962890.5431]]
    .map(([base, rate]) => ((base + rate*t) % 1296000) * AS2R);
  let longitude = 0, obliquity = 0;
  for (let i = terms.length - 1; i >= 0; i--) {
    const row = terms[i];
    const angle = row.slice(0,5).reduce((v,n,j) => v + n*argumentsRadians[j], 0) % (2*Math.PI);
    longitude += (row[5]+row[6]*t)*Math.sin(angle) + row[7]*Math.cos(angle);
    obliquity += (row[8]+row[9]*t)*Math.cos(angle) + row[10]*Math.sin(angle);
  }
  return { dpsi: (longitude/1e7 - 0.000135)*AS2R, deps: (obliquity/1e7 + 0.000388)*AS2R };
}

export function precession2006(ttDays) {
  const t = centuries(ttDays);
  const evaluate = coefficients => polynomial(coefficients,t)*AS2R;
  return {
    gamma: evaluate([-0.052928,10.556378,0.4932044,-0.00031238,-0.000002788,0.0000000260]),
    phi: evaluate([84381.412819,-46.811016,0.0511268,0.00053289,-0.000000440,-0.0000000176]),
    psi: evaluate([-0.041775,5038.481484,1.5584175,-0.00018522,-0.000026452,-0.0000000148]),
    epsilon: evaluate([84381.406,-46.836769,-0.0001831,0.00200340,-0.000000576,-0.0000000434])
  };
}

const multiply = (a,b) => a.map(row => b[0].map((_,j) => row.reduce((s,v,k) => s+v*b[k][j],0)));
const rx = a => [[1,0,0],[0,Math.cos(a),Math.sin(a)],[0,-Math.sin(a),Math.cos(a)]];
const rz = a => [[Math.cos(a),Math.sin(a),0],[-Math.sin(a),Math.cos(a),0],[0,0,1]];
export function fukushimaWilliamsMatrix({ gamma,phi,psi,epsilon }) {
  if (![gamma,phi,psi,epsilon].every(Number.isFinite)) throw Error('Finite frame angles required');
  return multiply(rx(-epsilon), multiply(rz(-psi), multiply(rx(phi),rz(gamma))));
}
export function rotate(matrix, vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite) || !Array.isArray(matrix) || matrix.length !== 3 || matrix.some(r => !Array.isArray(r) || r.length !== 3 || !r.every(Number.isFinite))) throw Error('Finite matrix and three-vector required');
  return matrix.map(row => row.reduce((s,v,i) => s+v*vector[i],0));
}

export function trueOfDate(ttDays, terms, frame) {
  if (!['true-equator-equinox-date','true-ecliptic-equinox-date'].includes(frame)) throw Error('Explicit true-of-date frame required');
  const p = precession2006(ttDays), n = nutation2000B(ttDays,terms);
  const trueObliquity = p.epsilon+n.deps;
  const equator = fukushimaWilliamsMatrix({...p,psi:p.psi+n.dpsi,epsilon:trueObliquity});
  return { frame, model:FRAME_MODEL, ttDaysSinceJ2000:ttDays, trueObliquity,
    matrix: frame === 'true-equator-equinox-date' ? equator : multiply(rx(trueObliquity),equator) };
}
