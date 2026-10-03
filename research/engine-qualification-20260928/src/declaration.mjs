import { assert, equal, exactKeys } from './common.mjs';

export const COMPARISON_PROFILE = 'geocentric-tropical-true-of-date-pinned-clock-v1';
export const FROZEN_BASELINE_DIGEST = '4691195c5e4b192c45638378270514bc99ce3f2a168d82d5cd3c472b9aeef599';
const IMPLEMENTATION_FIELDS = ['origin','zodiac','frame','clock','moonCorrection','planetCorrection','axes','centers','rotationModel'];
function text(value, label) { assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 4096, label + ' requires a nonempty declaration'); }
export function validateDeclaration(declaration, artifact, references) {
  exactKeys(declaration, ['schemaVersion','artifactDigest','comparisonProfile','referenceSelection','implementation','knownDifferences','review'], 'Candidate declaration');
  assert(declaration.schemaVersion === 1 && declaration.artifactDigest === artifact.digest, 'Declaration does not identify these installed bytes');
  assert(declaration.comparisonProfile === COMPARISON_PROFILE, 'Unsupported comparison profile');
  assert(equal(declaration.referenceSelection, references.conventions), 'Reference selection differs from the frozen comparison contract');
  exactKeys(declaration.implementation, IMPLEMENTATION_FIELDS, 'Implementation declaration');
  for (const key of IMPLEMENTATION_FIELDS) text(declaration.implementation[key], 'Implementation ' + key);
  const supported = { origin:'geocentric', zodiac:'tropical', frame:'true-ecliptic-equinox-of-date', clock:'encoded-UT1-plus-pinned-deltaT', moonCorrection:'geometric' };
  for (const [key, value] of Object.entries(supported)) assert(declaration.implementation[key] === value, 'Unsupported declared implementation ' + key + '; adapt and review the comparison contract first');
  assert(Array.isArray(declaration.knownDifferences) && declaration.knownDifferences.length <= 32, 'Invalid known-difference ledger');
  declaration.knownDifferences.forEach(value => text(value, 'Known difference'));
  exactKeys(declaration.review, ['reviewer','source','notes'], 'Declaration review');
  for (const [key, value] of Object.entries(declaration.review)) text(value, 'Review ' + key);
  return declaration;
}
export function declarationTemplate(artifact, references) {
  return { schemaVersion:1, artifactDigest:artifact.digest, comparisonProfile:COMPARISON_PROFILE,
    referenceSelection:references.conventions,
    implementation:Object.fromEntries(IMPLEMENTATION_FIELDS.map(key => [key, null])),
    knownDifferences:[], review:{reviewer:null,source:null,notes:null} };
}
