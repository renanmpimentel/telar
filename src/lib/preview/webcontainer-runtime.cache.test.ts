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

function emptyStream(): ReadableStream<string> {
  return new ReadableStream<string>({
    start(controller) {
      controller.close();
    },
  });
}

/**
 * `devServer` scripts each `npm run dev` attempt in order: "ready" emits
 * server-ready and keeps the process running; a number exits with that code
 * without becoming ready (simulating a cache-restored install that cannot boot).
 * Defaults to always becoming ready.
 */
function createFakeContainer(options: { devServer?: Array<"ready" | number> } = {}): FakeContainer {
  const calls = { mount: [] as Array<{ mountPoint?: string } | undefined>, spawn: [] as string[][], export: 0 };
  const devServer = options.devServer ?? [];
  let devAttempt = 0;
  let serverReadyCb: ((port: number, url: string) => void) | undefined;

  return {
    calls,
    async mount(_tree, options) {
      calls.mount.push(options);
    },
    async spawn(command, args) {
      calls.spawn.push([command, ...args]);
      const isDevServer = command === "npm" && args[0] === "run";
      if (!isDevServer) {
        return { exit: Promise.resolve(0), kill() {}, output: emptyStream() };
      }

      const behavior = devServer[devAttempt++] ?? "ready";
      if (behavior === "ready") {
        if (serverReadyCb) queueMicrotask(() => serverReadyCb?.(3000, "http://preview.local"));
        return { exit: new Promise<number>(() => {}), kill() {}, output: emptyStream() };
      }
      return { exit: Promise.resolve(behavior), kill() {}, output: emptyStream() };
    },
    async export() {
      calls.export += 1;
      return new Uint8Array([7, 7, 7]);
    },
    on(event, callback) {
      if (event === "server-ready") serverReadyCb = callback;
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

  it("reinstala e reinicia quando o dev server não sobe a partir do cache", async () => {
    // Cache hit, but the restored node_modules can't launch the dev server on the
    // first attempt (exit 127); the runtime must fall back to a clean install.
    const container = createFakeContainer({ devServer: [127, "ready"] });
    boot.mockResolvedValue(container);
    const events = createEvents();
    const cache: ModuleCache = {
      load: async () => new Uint8Array([7, 7, 7]),
      save: async () => {},
    };

    const runtime = new WebContainerRuntime(events, { moduleCache: cache });
    await runtime.sync(createDefaultProjectFiles());

    expect(ranNpmInstall(container)).toBe(true);
    const devLaunches = container.calls.spawn.filter((call) => call[0] === "npm" && call[1] === "run");
    expect(devLaunches).toHaveLength(2);
    expect(events.onError).not.toHaveBeenCalled();
  });
});

describe("dev server launch", () => {
  it("inicia o dev server via npm run dev", async () => {
    const container = createFakeContainer();
    boot.mockResolvedValue(container);

    const runtime = new WebContainerRuntime(createEvents());
    await runtime.sync(createDefaultProjectFiles());

    const devCall = container.calls.spawn.find((call) => call[0] === "npm" && call[1] === "run");
    expect(devCall).toEqual(["npm", "run", "dev", "--", "--host", "0.0.0.0"]);
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
