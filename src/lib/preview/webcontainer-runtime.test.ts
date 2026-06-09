import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toWebContainerTree, WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";
import { createDefaultProjectFiles } from "@/lib/project/template";
import type { ProjectReference } from "@/lib/project/types";

vi.mock("@webcontainer/api", () => ({
  WebContainer: {
    boot: vi.fn(() => new Promise(() => undefined)),
  },
}));

type TestTree = Record<string, TestDirectory | TestFile>;

interface TestDirectory {
  directory: TestTree;
}

interface TestFile {
  file: {
    contents: string | Uint8Array;
  };
}

describe("toWebContainerTree", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(globalThis, "crossOriginIsolated", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mounts binary references as files under src/references", () => {
    const files = createDefaultProjectFiles();
    files["src/references/brief.md"] = "# Brief";
    const references: ProjectReference[] = [
      {
        id: "ref-1",
        name: "hero.png",
        mimeType: "image/png",
        size: 4,
        kind: "binary",
        projectPath: "src/references/hero.png",
        createdAt: "2026-06-09T12:00:00.000Z",
        dataBase64: "AQIDBA==",
      },
    ];

    const tree = toWebContainerTree(files, references) as TestTree;
    const src = tree.src as TestDirectory;
    const referenceDirectory = src.directory.references as TestDirectory;
    const brief = referenceDirectory.directory["brief.md"] as TestFile;
    const hero = referenceDirectory.directory["hero.png"] as TestFile;

    expect(brief.file.contents).toBe("# Brief");
    expect(hero.file.contents).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("fails with an actionable error when WebContainer boot never resolves", async () => {
    const runtime = new WebContainerRuntime(
      {
        onStatus: vi.fn(),
        onUrl: vi.fn(),
        onLog: vi.fn(),
        onError: vi.fn(),
      },
      { bootTimeoutMs: 1000 },
    );

    const syncPromise = runtime.sync(createDefaultProjectFiles());
    const expectation = expect(syncPromise).rejects.toThrow(/WebContainer did not finish booting/);
    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
  });
});
