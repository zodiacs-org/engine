import { mkdir, open, readdir, rename, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createConfig } from './config.mjs';
import { planPositionTiles } from './generate.mjs';
import { databaseManifest, manifestLayout, tileDirectory } from './layout.mjs';
import { readStoreFile, writeStoreJson, storePathExists, verifyStoredTile } from './store.mjs';

const json = value => Buffer.from(JSON.stringify(value) + '\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async path => JSON.parse(await readStoreFile(path));

function validateCheckpoint(checkpoint, manifestSha256, plannedTiles) {
  if (checkpoint === null) return;
  if (checkpoint.version !== 1 || checkpoint.manifestSha256 !== manifestSha256 ||
      !Number.isSafeInteger(checkpoint.nextIndex) || checkpoint.nextIndex < 0 ||
      checkpoint.nextIndex > plannedTiles || typeof checkpoint.complete !== 'boolean' ||
      (checkpoint.complete && checkpoint.nextIndex !== plannedTiles)) throw new Error('Invalid migration checkpoint');
}

/** Move verified tile directories without changing any tile bytes. */
export async function migrateDatabaseLayout(directory, { onProgress = async () => {}, signal } = {}) {
  directory = resolve(directory);
  const markerPath = join(directory, '.layout-migration.json');
  const stagingRoot = join(dirname(directory), `.${basename(directory)}.layout.tmp`);
  const lockPath = join(directory, '.lock');
  signal?.throwIfAborted();
  const lock = await open(lockPath, 'wx');
  try {
    await lock.writeFile(json({ pid: process.pid, started: new Date().toISOString(), operation: 'layout-migration' }));
    const manifestPath = join(directory, 'manifest.json'), checkpointPath = join(directory, 'checkpoint.json');
    const currentManifestBytes = await readStoreFile(manifestPath);
    const currentManifest = JSON.parse(currentManifestBytes);
    if (!currentManifestBytes.equals(json(currentManifest))) throw new Error('Invalid migration manifest encoding');
    const currentCheckpoint = await storePathExists(checkpointPath) ? await readJson(checkpointPath) : null;
    let journal;
    const resuming = await storePathExists(markerPath);
    if (resuming) {
      journal = await readJson(markerPath);
      if (journal.version !== 1 || journal.directory !== directory ||
          !Object.hasOwn(journal, 'originalCheckpoint')) throw new Error('Invalid layout migration journal');
    } else {
      if (await storePathExists(stagingRoot)) throw new Error('Layout staging exists without a migration journal');
      journal = { version: 1, directory, originalManifest: currentManifest, originalCheckpoint: currentCheckpoint };
    }
    const original = journal.originalManifest;
    const config = createConfig(original?.config);
    const sourceLayout = manifestLayout(original);
    if (!json(original).equals(json(databaseManifest(config, sourceLayout)))) throw new Error('Invalid migration manifest');
    let plannedTiles = 0;
    for (const descriptor of planPositionTiles(config)) plannedTiles = descriptor.index + 1;
    const originalManifestSha256 = digest(json(original));
    validateCheckpoint(journal.originalCheckpoint, originalManifestSha256, plannedTiles);
    if (!resuming && sourceLayout === 'sharded') {
      return { migrated: false, directory, config, plannedTiles, originalManifestSha256,
        manifestSha256: originalManifestSha256, initialCheckpoint: currentCheckpoint,
        finalCheckpoint: currentCheckpoint, verifiedTiles: 0, movedTiles: 0 };
    }
    if (sourceLayout !== 'flat') throw new Error('Migration journal must describe the flat layout');
    const targetManifest = databaseManifest(config, 'sharded');
    const manifestSha256 = digest(json(targetManifest));
    const targetCheckpoint = { ...(journal.originalCheckpoint ?? { version: 1, nextIndex: 0, complete: false }), manifestSha256 };
    if (!isDeepStrictEqual(currentManifest, original) && !isDeepStrictEqual(currentManifest, targetManifest)) {
      throw new Error('Manifest disagrees with migration journal');
    }
    if (!isDeepStrictEqual(currentCheckpoint, journal.originalCheckpoint) && !isDeepStrictEqual(currentCheckpoint, targetCheckpoint)) {
      throw new Error('Checkpoint disagrees with migration journal');
    }
    if (isDeepStrictEqual(currentManifest, original) && !isDeepStrictEqual(currentCheckpoint, journal.originalCheckpoint)) {
      throw new Error('Migration checkpoint precedes its manifest update');
    }
    if (!resuming) {
      await writeStoreJson(markerPath, journal);
      await onProgress({ phase: 'journal-created', directory });
    }
    signal?.throwIfAborted();
    if (!await storePathExists(stagingRoot)) await mkdir(stagingRoot);
    await onProgress({ phase: 'staging-created', directory });
    let verifiedTiles = 0, movedTiles = 0, missing = false;
    for (const descriptor of planPositionTiles(config)) {
      signal?.throwIfAborted();
      const source = tileDirectory(directory, descriptor.index, 'flat');
      const target = tileDirectory(directory, descriptor.index, 'sharded');
      const staged = tileDirectory(stagingRoot, descriptor.index, 'sharded');
      const locations = [];
      for (const [path, root, layout] of [[source, directory, 'flat'], [target, directory, 'sharded'], [staged, stagingRoot, 'sharded']]) {
        if (await storePathExists(path)) locations.push({ path, root, layout });
      }
      if (locations.length > 1) throw new Error('Conflicting migration tile locations');
      if (!locations.length) {
        if (descriptor.index < (journal.originalCheckpoint?.nextIndex ?? 0)) throw new Error('Checkpoint tile missing during migration');
        missing = true;
        continue;
      }
      if (missing) throw new Error('Noncontiguous published tiles during migration');
      const location = locations[0];
      await verifyStoredTile(location.root, descriptor, config, location.layout);
      verifiedTiles++;
      if (location.path !== target) {
        const targetShard = dirname(target), stagedShard = dirname(staged);
        if (await storePathExists(targetShard)) {
          if (location.path === staged) throw new Error('Conflicting migration shard locations');
          await rename(source, target);
          movedTiles++;
          await onProgress({ phase: 'tile-moved', descriptor, directory });
        } else {
          if (!await storePathExists(stagedShard)) await mkdir(stagedShard);
          if (location.path === source) {
            await rename(source, staged);
            movedTiles++;
            await onProgress({ phase: 'tile-staged', descriptor, directory });
          }
          signal?.throwIfAborted();
          // Moving a source tile out first frees a child link in a saturated root.
          await rename(stagedShard, targetShard);
          await onProgress({ phase: 'shard-published', descriptor, directory });
        }
      }
      await onProgress({ phase: 'tile-verified', descriptor, directory });
    }
    // Refuse to discard unexpected staging contents, even after interrupted work.
    if ((await readdir(stagingRoot)).length) throw new Error('Unexpected migration staging contents');
    signal?.throwIfAborted();
    await writeStoreJson(manifestPath, targetManifest);
    await onProgress({ phase: 'manifest-updated', directory });
    signal?.throwIfAborted();
    await writeStoreJson(checkpointPath, targetCheckpoint);
    await onProgress({ phase: 'checkpoint-updated', directory });
    signal?.throwIfAborted();
    await rmdir(stagingRoot);
    await onProgress({ phase: 'staging-removed', directory });
    await rm(markerPath);
    return { migrated: true, directory, config, plannedTiles, originalManifestSha256, manifestSha256,
      initialCheckpoint: journal.originalCheckpoint, finalCheckpoint: targetCheckpoint, verifiedTiles, movedTiles };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}
