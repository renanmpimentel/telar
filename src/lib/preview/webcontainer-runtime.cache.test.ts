import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boot = vi.fn();
vi.mock("@webcontainer/api", () => ({ WebContainer: { boot } }));

import { WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";
import type { ModuleCache } from "@/lib/preview/module-cache";
import { createDefaultProjectFiles } from "@/lib/project/template";

interface FakeContainer {
  calls: { mount: Array<{ mountPoint?: string } | undefined>; spawn: string[][]; export: number };
  mount: (tree: unknown, options?: { mountPoint?: string }) => Promise<void>;
  spawn: (command: string, args: string[]) => Promise<unknown>;
  export: (path: string, options: { format: "binary" }) => Promise<Uint8Array>;
  on: (event: string, callback: (port: number, url: string) => void) => void;
}

function createFakeContainer(): FakeContainer {
  const calls = { mount: [] as Array<{ mountPoint?: string } | undefined>, spawn: [] as string[][], export: 0 };
  return {
    calls,
    async mount(_tree, options) {
      calls.mount.push(options);
    },
    async spawn(command, args) {
      calls.spawn.push([command, ...args]);
      return {
        exit: Promise.resolve(0),
        kill() {},
        output: new ReadableStream<string>({
          start(controller) {
            controller.close();
          },
        }),
      };
    },
    async export() {
      calls.export += 1;
      return new Uint8Array([7, 7, 7]);
    },
    on(event, callback) {
      if (event === "server-ready") callback(3000, "http://preview.local");
    },
  };
}

function createEvents() {
  return { onStatus: vi.fn(), onUrl: vi.fn(), onLog: vi.fn(), onError: vi.fn() };
}

function ranNpmInstall(container: FakeContainer): boolean {
  return container.calls.spawn.some((call) => call[0] === "npm" && call[1] === "install");
}

beforeEach(() => {
  Object.defineProperty(globalThis, "crossOriginIsolated", { configurable: true, value: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("dependency snapshot cache", () => {
  it("instala e salva o snapshot no cache miss", async () => {
    const container = createFakeContainer();
    boot.mockResolvedValue(container);
    const store = new Map<string, Uint8Array>();
    const cache: ModuleCache = {
      load: async (key) => store.get(key),
      save: async (key, bytes) => {
        store.set(key, bytes);
      },
    };

    const runtime = new WebContainerRuntime(createEvents(), { moduleCache: cache });
    await runtime.sync(createDefaultProjectFiles());

    expect(ranNpmInstall(container)).toBe(true);
    expect(container.calls.export).toBe(1);
    expect(store.size).toBe(1);
  });

  it("monta o snapshot e pula o install no cache hit", async () => {
    const container = createFakeContainer();
    boot.mockResolvedValue(container);
    const cache: ModuleCache = {
      load: async () => new Uint8Array([7, 7, 7]),
      save: async () => {},
    };

    const runtime = new WebContainerRuntime(createEvents(), { moduleCache: cache });
    await runtime.sync(createDefaultProjectFiles());

    expect(ranNpmInstall(container)).toBe(false);
    expect(container.calls.mount.some((options) => options?.mountPoint === "node_modules")).toBe(true);
  });
});

describe("dev server launch", () => {
  it("inicia o Vite pelo entry point JS, sem depender de node_modules/.bin", async () => {
    const container = createFakeContainer();
    boot.mockResolvedValue(container);

    const runtime = new WebContainerRuntime(createEvents());
    await runtime.sync(createDefaultProjectFiles());

    const devCall = container.calls.spawn.find((call) =>
      call.includes("node_modules/vite/bin/vite.js"),
    );
    // Invocar o arquivo real evita o exit-127 quando o .bin não é restaurado do cache.
    expect(devCall?.[0]).toBe("node");
    expect(container.calls.spawn.some((call) => call[0] === "npm" && call[1] === "run")).toBe(false);
  });

  it("usa flags rápidas no npm install", async () => {
    const container = createFakeContainer();
    boot.mockResolvedValue(container);

    const runtime = new WebContainerRuntime(createEvents());
    await runtime.sync(createDefaultProjectFiles());

    const installCall = container.calls.spawn.find(
      (call) => call[0] === "npm" && call[1] === "install",
    );
    expect(installCall).toEqual(["npm", "install", "--prefer-offline", "--no-audit", "--no-fund"]);
  });
});
