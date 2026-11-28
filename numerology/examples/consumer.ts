import {
  profile, compareNames, destiny, expression, personalDay
} from "@zodiacs/numerology";
import type {
  ProfileOptions, ProfileResult, NameChangeResult, NameNumberResult, PersonalCycleResult
} from "@zodiacs/numerology";

// Invented names and civil dates, shared with the handwritten profile fixtures.
const birthDate = "0001-01-01";
const options = {
  system: "chaldean",
  targetDate: "2000-10-22"
} satisfies ProfileOptions;
const reading: ProfileResult = profile(birthDate, "Ael Vorn", options);
const comparison: NameChangeResult = compareNames(birthDate, "Mi", "D");
const named: NameNumberResult = destiny("Ael Vorn", { system: "chaldean" });
const day: PersonalCycleResult = personalDay(birthDate, options.targetDate);

// Keep the complete receipts in the output. No ambient clock or engine import.
console.log(JSON.stringify({ reading, comparison, named, day, alias: destiny === expression }));
