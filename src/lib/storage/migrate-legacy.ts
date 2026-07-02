"use client";

/**
 * One-time migration from the legacy "like-figma" storage identifiers to "telar".
 * Runs at workspace boot and is idempotent: it copies the saved projects DB and
 * localStorage keys to their new names, drops the legacy caches, and records a
 * flag so subsequent boots are a cheap no-op. Everything is best-effort — a
 * failure must never block the app from starting.
 */

const LEGACY_DB = "like-figma";
const LEGACY_PREVIEW_DB = "like-figma-preview";
const NEW_DB = "telar";
const PROJECT_STORE = "projects";
const PROJECT_DB_VERSION = 1;
const MIGRATION_FLAG = "telar.migrated.v1";

const LOCALSTORAGE_RENAMES: Array<[legacy: string, next: string]> = [
  ["like-figma.provider", "telar.provider"],
  ["like-figma.activeProjectId", "telar.activeProjectId"],
  ["like-figma.previewMode", "telar.previewMode"],
];
const LEGACY_WINDOW_PREFIX = "like-figma.previewWindow:";
const NEW_WINDOW_PREFIX = "telar.previewWindow:";

export async function migrateLegacyStorage(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if (window.localStorage.getItem(MIGRATION_FLAG)) return;
  } catch {
    return;
  }

  migrateLocalStorage();
  await migrateProjectsDatabase().catch(() => undefined);
  await deleteDatabase(LEGACY_PREVIEW_DB).catch(() => undefined);

  try {
    window.localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    // If we cannot record the flag the migration simply runs again next boot;
    // it stays idempotent because the legacy artifacts are already gone.
  }
}

function migrateLocalStorage(): void {
  try {
    for (const [legacyKey, nextKey] of LOCALSTORAGE_RENAMES) {
      renameLocalStorageKey(legacyKey, nextKey);
    }

    const windowKeys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(LEGACY_WINDOW_PREFIX)) windowKeys.push(key);
    }
    for (const legacyKey of windowKeys) {
      renameLocalStorageKey(legacyKey, NEW_WINDOW_PREFIX + legacyKey.slice(LEGACY_WINDOW_PREFIX.length));
    }
  } catch {
    // Ignore: a blocked/again-thrown localStorage keeps the legacy keys, which
    // are simply not read anymore under the new names.
  }
}

function renameLocalStorageKey(legacyKey: string, nextKey: string): void {
  const value = window.localStorage.getItem(legacyKey);
  if (value === null) return;
  if (window.localStorage.getItem(nextKey) === null) {
    window.localStorage.setItem(nextKey, value);
  }
  window.localStorage.removeItem(legacyKey);
}

async function migrateProjectsDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (!(await databaseExists(LEGACY_DB))) return;

  const projects = await readAllProjects(LEGACY_DB);
  if (projects.length > 0) {
    await writeAllProjects(NEW_DB, projects);
  }
  await deleteDatabase(LEGACY_DB);
}

async function databaseExists(name: string): Promise<boolean> {
  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      return databases.some((entry) => entry.name === name);
    } catch {
      return true;
    }
  }
  // Without databases() we cannot probe without creating; assume it may exist and
  // let readAllProjects return [] for an empty/absent store.
  return true;
}

function readAllProjects(dbName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.close();
        resolve([]);
        return;
      }
      const getAll = db.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).getAll();
      getAll.onsuccess = () => {
        const result = getAll.result;
        db.close();
        resolve(result);
      };
      getAll.onerror = () => {
        db.close();
        resolve([]);
      };
    };
  });
}

function writeAllProjects(dbName: string, projects: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, PROJECT_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(PROJECT_STORE, "readwrite");
      const store = transaction.objectStore(PROJECT_STORE);
      for (const project of projects) store.put(project);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    };
  });
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
