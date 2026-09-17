/**
 * Distance, in the unit the person reading it actually thinks in.
 *
 * Runs stay stored in kilometres — `distanceKm` on an activity, `distanceKm`
 * on the race — because that is what they have always been stored in and
 * because the numbers that anchor them are metric by definition: a half
 * marathon is 21.1 km and no rounding of miles will ever be it. Everything on
 * screen, and everything typed into a form, is miles.
 *
 * So the conversion lives at the two edges and nowhere else: `toMiles` on the
 * way out, `toKm` on the way back in. Storage does not change, which means no
 * migration to get wrong and no run already logged quietly shrinking to 62% of
 * itself the day this shipped.
 */
export const MI_PER_KM = 0.621371;

/** Kilometres as miles. */
export const toMiles = (km: number): number => km * MI_PER_KM;

/** Miles as kilometres, for storing what was typed. */
export const toKm = (miles: number): number => miles / MI_PER_KM;

/** Kilometres as a mileage worth reading. One decimal is the resolution a
 *  run is remembered at — nobody ran 8.0467 of anything. */
export const miles = (km: number, dp = 1): string => toMiles(km).toFixed(dp);
