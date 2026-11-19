/*
 * Five synthetic births whose draft natal receipts every runtime computes, so
 * that their digests can be compared with Node's. The instants are given in
 * UTC, so no host time zone data is read. Invented inputs, not anyone's
 * birth data.
 *
 * This module imports nothing: the caller passes the selected engine entry
 * and the receipt entry, so that it runs the same in Node, Bun,
 * Deno and a browser page.
 */
export const RECEIPT_BIRTHS = Object.freeze([
  Object.freeze({ id: 'R1', utc: '1931-04-12T03:17:00Z', latitude: -33.75, longitude: 151.25, houseSystem: 'placidus' }),
  Object.freeze({ id: 'R2', utc: '1966-09-03T22:41:00Z', latitude: 40.5, longitude: -3.75, houseSystem: 'koch' }),
  Object.freeze({ id: 'R3', utc: '1989-01-27T14:05:30Z', latitude: 69.75, longitude: 18.5, houseSystem: 'placidus' }),
  Object.freeze({ id: 'R4', utc: '2004-06-30T08:00:00Z', latitude: 13.75, longitude: 100.5, houseSystem: 'whole' }),
  Object.freeze({ id: 'R5', utc: '2023-11-05T19:59:59Z', latitude: -54.75, longitude: -68.25, houseSystem: 'regiomontanus' }),
]);

/** Each birth's serialized envelope, as text, from createNatalEnvelope and serializeNatalEnvelope. */
export function receiptTexts(engine, receipt) {
  return RECEIPT_BIRTHS.map(({ id, ...input }) => {
    try {
      const chart = engine.natalChart({ ...input, timeKnown: true });
      return { id, text: receipt.serializeNatalEnvelope(receipt.createNatalEnvelope(chart)) };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
