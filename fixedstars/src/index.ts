export { catalog, findStar } from "./catalog.js";
export { propagateStarDirection, starPositionAtTt, starPositions, STAR_POSITION_CONVENTIONS } from "./positions.js";
export type { StarPosition, StarPositions, StarPositionTime } from "./positions.js";
export { findStarContacts, STAR_CONTACT_CONVENTIONS } from "./contacts.js";
export type {
  ContactOrbs, ContactStarPosition, ContactTarget, StarContact, StarContactKind, StarContacts
} from "./contacts.js";
export { chartContactTargets, natalStarHits, NATAL_STAR_CONVENTIONS } from "./natal.js";
export type { NatalStarHits } from "./natal.js";
export type {
  CatalogProvenance,
  CatalogStar,
  HistoricalAttribution,
  ProperMotion,
  SourceCitation
} from "./types.js";

