import { afterEach, describe, expect, it, vi } from "vitest";

import { createSeedSnapshotLoader } from "@/lib/preview/seed-snapshot-loader";

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function binaryResponse(bytes: Uint8Array): Response {
  return {
    ok: true,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as Response;
}

const manifest = { version: "1" as const, default: "abc123.bin", generatedAt: "2026-01-01T00:00:00Z" };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createSeedSnapshotLoader", () => {
  it("busca o manifest e depois o binário do seed", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("manifest.json") ? jsonResponse(manifest) : binaryResponse(bytes),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createSeedSnapshotLoader().load();

    expect(result).toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledWith("/snapshots/manifest.json", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/snapshots/abc123.bin", expect.anything());
  });

  it("retorna undefined quando o manifest não existe (404)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false }) as Response));

    expect(await createSeedSnapshotLoader().load()).toBeUndefined();
  });

  it("retorna undefined em erro de rede", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    expect(await createSeedSnapshotLoader().load()).toBeUndefined();
  });

  it("memoiza o manifest entre chamadas de load", async () => {
    const bytes = new Uint8Array([1]);
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("manifest.json") ? jsonResponse(manifest) : binaryResponse(bytes),
    );
    vi.stubGlobal("fetch", fetchMock);

    const loader = createSeedSnapshotLoader();
    await loader.load();
    await loader.load();

    const manifestCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("manifest.json"),
    );
    expect(manifestCalls).toHaveLength(1);
  });
});
