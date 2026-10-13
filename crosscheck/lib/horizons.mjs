// Read public JPL responses already retained by the repository. No Swiss data.
export const HORIZONS_LIMITS = Object.freeze({ angleArcseconds: 0.1, rangeKm: 100 });
export function parseHorizons(text, target, correction) {
  const label = { NONE: 'GEOMETRIC', CN: 'LT CORRECTED', 'CN+S': 'LT+S CORRECTED' }[correction];
  if (!Number.isSafeInteger(target) || !label || !text.includes('API SOURCE: NASA/JPL Horizons API') ||
      !new RegExp(`Target body name: .*\\(${target}\\)`).test(text) || !/Center body name: Earth \(399\)/.test(text) ||
      !text.includes('{source: DE441}') || !/Output units\s*: AU-D/.test(text) || !/Reference frame\s*: ICRF/.test(text) ||
      !text.includes(`Output type     : ${label} cartesian states`) || !/Output format\s*: (?:1 \(position only\)|2 \(position and velocity\))/.test(text) || !/JDTT\s*,/.test(text)) throw Error('Unsupported Horizons conventions');
  const format = Number(/Output format\s*: ([12])/.exec(text)[1]);
  const sections = text.split('$$SOE');
  if (sections.length !== 2 || sections[1].split('$$EOE').length !== 2) throw Error('Invalid Horizons delimiters');
  const rows = sections[1].split('$$EOE')[0].trim().split('\n').map(line => {
    const fields = line.trim().split(',');
    if (fields.length !== (format === 1 ? 6 : 9) || fields.at(-1).trim() !== '' || !fields[1].includes('A.D.')) throw Error('Invalid Horizons row');
    const number = value => {
      if (!/^[+-]?\d+(?:\.\d*)?(?:E[+-]?\d+)?$/.test(value.trim())) throw Error('Invalid Horizons number');
      const n = Number(value); if (!Number.isFinite(n)) throw Error('Nonfinite Horizons number'); return n;
    };
    if (format === 2) fields.slice(5,8).forEach(number);
    const jdTt = number(fields[0]), positionAu = fields.slice(2,5).map(number);
    if (!Math.hypot(...positionAu)) throw Error('Zero Horizons range');
    return { jdTt, positionAu };
  });
  if (!rows.length || rows.some((r,i) => i && r.jdTt <= rows[i-1].jdTt)) throw Error('Horizons epochs must increase');
  return rows;
}

// A bounded deterministic subset: first, middle and last covered row per file.
// Eligibility includes a margin for target emission preceding reception.
export function selectRows(rows, startTdbSeconds, endTdbSeconds, convert) {
  const covered = rows.filter(r => {
    const t = convert((r.jdTt - 2451545) * 86400).tdbSeconds;
    return t >= startTdbSeconds + 86400 && t <= endTdbSeconds;
  });
  return { outsideCoverage: rows.length - covered.length,
    rows: [...new Set([0, Math.floor(covered.length / 2), covered.length - 1])].filter(i => i >= 0 && i < covered.length).map(i => covered[i]),
    eligible: covered.length };
}
