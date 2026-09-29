// The S1/S2 grid of PREREGISTRATION.md: 88 sites, 54 dates, 10 bodies, two conventions.
export const LATITUDES = [-65, -55, -45, -30, -15, 0, 15, 30, 45, 55, 65];
export const LONGITUDES = [-180, -135, -90, -45, 0, 45, 90, 135];
export const YEARS = [1900, 1925, 1950, 1975, 2000, 2025, 2050, 2075, 2100];
export const DAYS = ["01-15", "03-20", "05-15", "06-21", "09-22", "12-21"];
export const BODIES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"];
export const CONVENTIONS = [
  { name: "default", bodies: BODIES, options: {} },
  { name: "centre-no-refraction", bodies: ["Sun", "Moon"], options: { limb: "centre", refraction: "none" } }
];
export const DATES = YEARS.flatMap((year) => DAYS.map((day) => `${year}-${day}`));
export const SITES = LATITUDES.flatMap((latitude) => LONGITUDES.map((longitude) => ({ latitude, longitude })));
