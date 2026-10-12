import { openDatabase } from './query.mjs';
import { planPositionTiles } from './generate.mjs';
import { verifyStoredTile } from './store.mjs';

/** Traverse every planned tile, retaining only a single decoded tile at a time. */
export async function verifyDatabase(directory) {
  const database = await openDatabase(directory, { cacheTiles: 1 });
  let tiles = 0, samples = 0, events = 0;
  for (const descriptor of planPositionTiles(database.config)) {
    const tile = await verifyStoredTile(directory, descriptor);
    // Query loading also validates body membership and event ownership/order.
    for await (const event of database.events(descriptor.startMs, descriptor.endMs)) events++;
    tiles++;
    samples += tile.positions.samples.length;
  }
  return { tiles, samples, events, config: database.config };
}
