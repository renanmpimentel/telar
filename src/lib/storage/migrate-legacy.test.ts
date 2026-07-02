import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { migrateLegacyStorage } from "@/lib/storage/migrate-legacy";

const ALL_DATABASES = ["like-figma", "like-figma-preview", "telar", "telar-preview"];

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function seedLegacyProjects(projects: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("like-figma", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("projects", "readwrite");
      const store = transaction.objectStore("projects");
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

function readProjects(dbName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const request = indexedDB.open(dbName);
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.close();
        resolve([]);
        return;
      }
      const getAll = db.transaction("projects", "readonly").objectStore("projects").getAll();
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

beforeEach(async () => {
  localStorage.clear();
  for (const name of ALL_DATABASES) await deleteDatabase(name);
});

describe("migrateLegacyStorage", () => {
  it("copia projetos e chaves do like-figma para telar e limpa o legado", async () => {
    const project = { id: "p1", name: "Meu app", files: {}, messages: [] };
    await seedLegacyProjects([project]);
    localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "openai", model: "gpt-5-mini" }));
    localStorage.setItem("like-figma.activeProjectId", "p1");
    localStorage.setItem("like-figma.previewWindow:p1", "payload");

    await migrateLegacyStorage();

    expect(await readProjects("telar")).toEqual([project]);
    expect(localStorage.getItem("telar.provider")).toContain("gpt-5-mini");
    expect(localStorage.getItem("telar.activeProjectId")).toBe("p1");
    expect(localStorage.getItem("telar.previewWindow:p1")).toBe("payload");

    expect(localStorage.getItem("like-figma.provider")).toBeNull();
    expect(localStorage.getItem("like-figma.activeProjectId")).toBeNull();
    expect(localStorage.getItem("like-figma.previewWindow:p1")).toBeNull();
    expect(localStorage.getItem("telar.migrated.v1")).toBe("1");
    expect(await readProjects("like-figma")).toEqual([]);
  });

  it("não sobrescreve uma chave nova já existente", async () => {
    localStorage.setItem("like-figma.activeProjectId", "old");
    localStorage.setItem("telar.activeProjectId", "new");

    await migrateLegacyStorage();

    expect(localStorage.getItem("telar.activeProjectId")).toBe("new");
    expect(localStorage.getItem("like-figma.activeProjectId")).toBeNull();
  });

  it("é idempotente e um no-op sem dados legados", async () => {
    await migrateLegacyStorage();
    expect(localStorage.getItem("telar.migrated.v1")).toBe("1");

    // Segunda execução retorna cedo pela flag e não recria nada.
    await migrateLegacyStorage();
    expect(await readProjects("telar")).toEqual([]);
  });
});
