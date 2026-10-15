/** Preregistered acceptance policy. None of these limits is a measured result. */
export const ACCEPTANCE_POLICY = Object.freeze({
  id: "minorbodies-acceptance-v1",
  targetSpan: Object.freeze({
    start: "1800-01-01T00:00:00",
    endExclusive: "2201-01-01T00:00:00",
    scale: "tt"
  }),
  limits: Object.freeze({
    fitDirectionArcsec: 0.05,
    longitudeArcsec: 1,
    latitudeArcsec: 1,
    distanceAu: 1e-7,
    longitudeSpeedArcsecPerDay: 0.1,
    latitudeSpeedArcsecPerDay: 0.1,
    distanceSpeedAuPerDay: 1e-8
  }),
  maxCommittedFileBytesExclusive: 2_000_000
} as const);
