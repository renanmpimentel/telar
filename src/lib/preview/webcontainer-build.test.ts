import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";
import { createDefaultProjectFiles } from "@/lib/project/template";

function closedStream(): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      controller.close();
    },
  });
}

function dirEnt(name: string, isDir: boolean) {
  return { name, isDirectory: () => isDir, isFile: () => !isDir };
}

const fakeContainer = {
  mount: vi.fn(async () => undefined),
  export: vi.fn(async () => new Uint8Array()),
  on: vi.fn(),
  spawn: vi.fn(async () => ({
    exit: Promise.resolve(0),
    kill: vi.fn(),
    output: closedStream(),
  })),
  fs: {
    readdir: vi.fn(async (path: string) => {
      if (path === "dist") return [dirEnt("index.html", false), dirEnt("assets", true)];
      if (path === "dist/assets") return [dirEnt("app.js", false)];
      return [];
    }),
    readFile: vi.fn(async (path: string) => new TextEncoder().encode(`bytes:${path}`)),
  },
};

vi.mock("@webcontainer/api", () => ({
  WebContainer: { boot: vi.fn(async () => fakeContainer) },
}));

describe("WebContainerRuntime.buildStaticSite", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "crossOriginIsolated", { configurable: true, value: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs the build and returns dist/ as a flattened path -> bytes map", async () => {
    const runtime = new WebContainerRuntime({
      onStatus: vi.fn(),
      onUrl: vi.fn(),
      onLog: vi.fn(),
      onError: vi.fn(),
    });

    const dist = await runtime.buildStaticSite(createDefaultProjectFiles());

    expect(Object.keys(dist).sort()).toEqual(["assets/app.js", "index.html"]);
    expect(new TextDecoder().decode(dist["index.html"])).toBe("bytes:dist/index.html");
    expect(fakeContainer.spawn).toHaveBeenCalledWith("npx", ["vite", "build"]);
  });
});
