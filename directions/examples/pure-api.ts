import { hit, scan } from "../src/index.js";

/** Invented coordinates with hand derivations in evidence/M8 and M9. */
export function runExample() {
  const contact = hit({
    convention: {
      system: "placidus-semiarc", mode: "zodiacal", latitude: "zero-both",
      motion: "direct", key: "ptolemy"
    },
    geometry: { ramcDegrees: 0, latitudeDegrees: 0, trueObliquityDegrees: 0 },
    significator: {
      kind: "body", id: "Synthetic S",
      coordinates: { longitudeDegrees: 350, latitudeDegrees: 4 }
    },
    promissor: {
      kind: "body", id: "Synthetic P",
      coordinates: { longitudeDegrees: 10, latitudeDegrees: -7 }
    },
    contact: { kind: "conjunction" },
    yearUnit: "tropical-365.2422-days"
  });
  if (contact.status !== "ok") throw new Error(`${contact.stage}: ${contact.code}`);

  const contacts = scan({
    convention: {
      system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy"
    },
    geometry: { ramcDegrees: 0, latitudeDegrees: 0 },
    selections: [{
      significator: {
        kind: "body", id: "S",
        coordinates: { rightAscensionDegrees: 330, declinationDegrees: 0 }
      },
      promissor: {
        kind: "body", id: "P",
        coordinates: { rightAscensionDegrees: 60, declinationDegrees: 0 }
      },
      contact: { kind: "conjunction" }
    }],
    motions: [
      { motion: "direct" },
      { motion: "converse", converseConstruction: "placidus-role-swap" }
    ],
    yearUnit: "tropical-365.2422-days",
    ageRange: { fromYears: 0, toYears: 300, includeFrom: true, includeTo: true },
    maxEvaluations: 2
  });
  if (contacts.status !== "complete") throw new Error(`${contacts.stage}: ${contacts.code}`);
  return { basis: "hand-derived-synthetic-coordinates", contact, contacts };
}
