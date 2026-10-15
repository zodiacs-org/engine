import { access } from "node:fs/promises";
import { createEventsEclipseAdapter } from "./events-bridge.js";
import type { EventsEclipseSettings } from "./events-bridge.js";
import type { EclipseAdapter } from "./eclipse-adapter.js";
import { snapshotMetadata } from "./eclipse-adapter.js";

/** Load only the sibling project's already-built entry point, without building it. */
async function importCheckoutEvents(): Promise<unknown> {
  const entry = new URL("../../events/build/src/index.js", import.meta.url);
  try {
    await access(entry);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  // Only a missing entry is unavailable. Broken dependencies or module
  // initialization failures propagate instead of becoming empty searches.
  return import(/* @vite-ignore */ entry.href);
}

/** Node-only loader; custom import hooks are trusted local embedding code. */
export async function loadEventsEclipseAdapter(
  settings: EventsEclipseSettings,
  importEvents: () => Promise<unknown> = importCheckoutEvents
): Promise<EclipseAdapter> {
  // Validate settings before importing or executing the optional module.
  const captured = snapshotMetadata(settings) as unknown as EventsEclipseSettings;
  createEventsEclipseAdapter(null, captured);
  return createEventsEclipseAdapter(await importEvents(), captured);
}
