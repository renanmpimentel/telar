"use client";

export interface ModuleCache {
  load(key: string): Promise<Uint8Array | undefined>;
  save(key: string, bytes: Uint8Array): Promise<void>;
}

const DB_NAME = "like-figma-preview";
const DB_VERSION = 1;
const STORE = "modules";

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Persists WebContainer `node_modules` snapshots in IndexedDB keyed by a
 * dependency signature, so a page reload can remount them instead of running a
 * fresh `npm install`. All operations degrade gracefully: a missing IndexedDB
 * or a failed read/write resolves to a cache miss rather than throwing.
 */
export function createModuleCache(): ModuleCache {
  return {
    async load(key) {
      const db = await openDatabase();
      if (!db) return undefined;

      try {
        const value = await requestToPromise(
          db.transaction(STORE, "readonly").objectStore(STORE).get(key),
        );
        if (value == null) return undefined;
        if (value instanceof Uint8Array) return value;
        if (value instanceof ArrayBuffer) return new Uint8Array(value);
        if (ArrayBuffer.isView(value)) {
          const view = value as ArrayBufferView;
          return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        }
        return undefined;
      } catch {
        return undefined;
      } finally {
        db.close();
      }
    },

    async save(key, bytes) {
      const db = await openDatabase();
      if (!db) return;

      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(STORE, "readwrite");
          transaction.objectStore(STORE).put(bytes, key);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } catch {
        // Best-effort cache; ignore write failures (e.g. quota exceeded).
      } finally {
        db.close();
      }
    },
  };
}
