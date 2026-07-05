"use client";

/**
 * Loads a prebuilt `node_modules` seed snapshot shipped as a static asset under
 * `/snapshots/`. The seed holds the base template dependencies, so the very first
 * preview in a fresh browser can mount it as a warm starting point and let
 * `npm install` add only the missing delta instead of installing everything from
 * scratch. See {@link WebContainerRuntime.ensureDependencies}.
 *
 * All operations degrade gracefully: a missing manifest, a 404, or any network
 * error resolves to `undefined` (a seed miss), so the app behaves exactly as it
 * did before when no seed has been generated.
 */
export interface SeedSnapshotLoader {
  load(): Promise<Uint8Array | undefined>;
}

export interface SeedSnapshotManifest {
  version: "1";
  /** Filename (relative to `/snapshots/`) of the default template seed. */
  default: string;
  generatedAt: string;
}

const MANIFEST_URL = "/snapshots/manifest.json";

async function fetchManifest(): Promise<SeedSnapshotManifest | undefined> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: "force-cache" });
    if (!response.ok) return undefined;
    const manifest = (await response.json()) as SeedSnapshotManifest;
    if (!manifest || typeof manifest.default !== "string" || !manifest.default) {
      return undefined;
    }
    return manifest;
  } catch {
    return undefined;
  }
}

export function createSeedSnapshotLoader(): SeedSnapshotLoader {
  // Memoize the manifest lookup so repeated syncs in one session hit the network
  // (or the HTTP cache) at most once.
  let manifestPromise: Promise<SeedSnapshotManifest | undefined> | undefined;

  return {
    async load() {
      if (!manifestPromise) manifestPromise = fetchManifest();
      const manifest = await manifestPromise;
      if (!manifest) return undefined;

      try {
        const response = await fetch(`/snapshots/${manifest.default}`, {
          cache: "force-cache",
        });
        if (!response.ok) return undefined;
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) return undefined;
        return new Uint8Array(buffer);
      } catch {
        return undefined;
      }
    },
  };
}
