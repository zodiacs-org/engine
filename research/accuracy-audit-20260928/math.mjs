// Geometry only. No ephemeris or target-specific expectations.
export function unit(vector) {
  if (!Array.isArray(vector) || vector.length !== 3 || !vector.every(Number.isFinite)) throw new Error('Expected three finite Cartesian components');
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length === 0) throw new Error('Expected a finite nonzero vector');
  return vector.map(x => x / length);
}

export function spherical(vector) {
  const [x, y, z] = unit(vector);
  const longitude = ((Math.atan2(y, x) * 180 / Math.PI) % 360 + 360) % 360;
  return {longitude, latitude: Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI};
}

export function fromSpherical(longitude, latitude) {
  if (![longitude, latitude].every(Number.isFinite) || Math.abs(latitude) > 90) throw new Error('Invalid spherical coordinates');
  const lon = longitude * Math.PI / 180, lat = latitude * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
}

export function angleArcsec(left, right) {
  const a = unit(left), b = unit(right);
  const cross = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  return Math.atan2(Math.hypot(...cross), a.reduce((sum, x, i) => sum + x*b[i], 0)) * 180 / Math.PI * 3600;
}

export const longitudeDeltaArcsec = (left, right) => (((left - right + 540) % 360 + 360) % 360 - 180) * 3600;

export function rotate(matrix, vector) {
  unit(vector);
  if (!Array.isArray(matrix) || matrix.length !== 3 || matrix.some(row => !Array.isArray(row) || row.length !== 3 || !row.every(Number.isFinite))) throw new Error('Invalid rotation matrix');
  return matrix.map(row => row.reduce((sum, x, i) => sum + x*vector[i], 0));
}

export function components(target, sameFrame, independentFrame, originalReference) {
  for (const point of [target, sameFrame, independentFrame, originalReference]) {
    if (!point || ![point.longitude, point.latitude].every(Number.isFinite) || point.longitude < 0 || point.longitude >= 360 || Math.abs(point.latitude) > 90) throw new Error('Invalid coordinates in decomposition');
  }
  const differences = (left, right) => ({longitude: longitudeDeltaArcsec(left.longitude, right.longitude), latitude: (left.latitude - right.latitude)*3600});
  const total = differences(target, originalReference);
  const residual = differences(target, sameFrame);
  const rotationChoice = differences(sameFrame, independentFrame);
  const referenceConvention = differences(independentFrame, originalReference);
  const closure = {
    longitude: longitudeDeltaArcsec(total.longitude/3600, (residual.longitude + rotationChoice.longitude + referenceConvention.longitude)/3600),
    latitude: total.latitude - residual.latitude - rotationChoice.latitude - referenceConvention.latitude
  };
  if (Math.max(Math.abs(closure.longitude), Math.abs(closure.latitude)) > 0.000001) throw new Error('Signed-coordinate decomposition failed numerical closure');
  return {unit: 'arcsec', total, sameTargetFrameResidual: residual, rotationChoiceDelta: rotationChoice, referenceConventionDelta: referenceConvention, closure};
}
