import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import { createModuleCache } from "@/lib/preview/module-cache";

describe("createModuleCache", () => {
  it("salva e recupera bytes por chave", async () => {
    const cache = createModuleCache();
    await cache.save("sig-1", new Uint8Array([1, 2, 3]));
    expect(await cache.load("sig-1")).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("retorna undefined para chave ausente", async () => {
    const cache = createModuleCache();
    expect(await cache.load("inexistente")).toBeUndefined();
  });

  it("sobrescreve o snapshot quando a mesma chave é salva de novo", async () => {
    const cache = createModuleCache();
    await cache.save("sig-2", new Uint8Array([1]));
    await cache.save("sig-2", new Uint8Array([9, 9]));
    expect(await cache.load("sig-2")).toEqual(new Uint8Array([9, 9]));
  });
});
