import type { KarmicDebtNumber, ReducedNumber } from "./types.js";

// Original interpretive prompts written for this project, not source excerpts.
export const NUMBER_MEANINGS: Readonly<Record<ReducedNumber, string>> = Object.freeze({
  0: "An open space: consider which direction you want to give your effort.",
  1: "Take initiative while leaving room for other people's contributions.",
  2: "Look for cooperation and listen carefully to differences.",
  3: "Express an idea clearly and make room for play.",
  4: "Build steady habits and give useful work a reliable structure.",
  5: "Explore change while keeping track of your commitments.",
  6: "Offer care while respecting your own and others' boundaries.",
  7: "Make time for study, reflection, and thoughtful questions.",
  8: "Use responsibility and resources with fairness and purpose.",
  9: "Consider the wider community and let completed work come to a close.",
  11: "Turn a sensitive insight into something others can understand.",
  22: "Give a large shared idea a practical foundation.",
  33: "Share care and knowledge without taking over another person's choices."
});

export const KARMIC_DEBT_MEANINGS: Readonly<Record<KarmicDebtNumber, string>> = Object.freeze({
  13: "A prompt to practice patience and finish work one step at a time.",
  14: "A prompt to balance freedom with dependable commitments.",
  16: "A prompt to question assumptions and learn with humility.",
  19: "A prompt to combine independence with accepting and offering help."
});
