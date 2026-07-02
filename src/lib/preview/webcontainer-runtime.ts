"use client";

import type { ModuleCache } from "@/lib/preview/module-cache";
import { assertValidReferencePath, decodeBase64ToUint8Array } from "@/lib/project/references";
import type { ProjectFileMap, ProjectReference } from "@/lib/project/types";

type WebContainerTree = Record<string, WebContainerDirectory | WebContainerFile>;

interface WebContainerDirectory {
  directory: WebContainerTree;
}

interface WebContainerFile {
  file: {
    contents: string | Uint8Array;
  };
}

interface RunningProcess {
  exit: Promise<number>;
  kill: () => void;
  output: ReadableStream<string>;
}

interface WebContainerInstance {
  mount: (tree: WebContainerTree | Uint8Array, options?: { mountPoint?: string }) => Promise<void>;
  spawn: (command: string, args: string[]) => Promise<RunningProcess>;
  export: (path: string, options: { format: "binary" }) => Promise<Uint8Array>;
  on: (event: "server-ready", callback: (port: number, url: string) => void) => void;
}

interface RuntimeEvents {
  onStatus: (status: string) => void;
  onUrl: (url: string) => void;
  onLog: (line: string) => void;
  onError: (message: string) => void;
}

interface RuntimeOptions {
  bootTimeoutMs?: number;
  moduleCache?: ModuleCache | null;
}

const DEFAULT_BOOT_TIMEOUT_MS = 120_000;

export class WebContainerRuntime {
  private container?: WebContainerInstance;
  private devProcess?: RunningProcess;
  private installSignature?: string;
  private bootPromise?: Promise<WebContainerInstance>;
  private readonly moduleCache: ModuleCache | null;

  constructor(
    private readonly events: RuntimeEvents,
    private readonly options: RuntimeOptions = {},
  ) {
    // The node_modules snapshot cache lets a page reload remount dependencies from
    // IndexedDB instead of reinstalling them. Pass an explicit `moduleCache`
    // (e.g. createModuleCache()) to enable it; the dev server launches Vite by its
    // JS entry point, so the missing .bin symlinks in a restored snapshot no longer
    // break startup (previously an exit-code-127 failure). Defaults to off so unit
    // tests and non-persistent callers stay free of IndexedDB.
    this.moduleCache = options.moduleCache ?? null;
  }

  async sync(files: ProjectFileMap, references: ProjectReference[] = []): Promise<void> {
    if (!globalThis.crossOriginIsolated) {
      throw new Error("Preview requires cross-origin isolation. Use Chrome/Chromium with the local dev server.");
    }

    const container = await this.boot();
    this.events.onStatus("Syncing files");
    await container.mount(toWebContainerTree(files, references));

    const signature = dependencySignature(files["package.json"] ?? "");
    if (this.installSignature !== signature) {
      this.devProcess?.kill();
      this.devProcess = undefined;
      await this.ensureDependencies(container, signature);
      this.installSignature = signature;
    }

    if (!this.devProcess) {
      await this.startDevServer(container);
    } else {
      this.events.onStatus("Preview updated");
    }
  }

  private async ensureDependencies(container: WebContainerInstance, signature: string): Promise<void> {
    if (this.moduleCache) {
      const cached = await this.moduleCache.load(signature).catch(() => undefined);
      if (cached) {
        this.events.onStatus("Restoring cached dependencies");
        await container.mount(cached, { mountPoint: "node_modules" });
        return;
      }
    }

    await this.install(container);

    if (this.moduleCache) {
      try {
        this.events.onStatus("Caching dependencies");
        const snapshot = await container.export("node_modules", { format: "binary" });
        await this.moduleCache.save(signature, snapshot);
      } catch {
        // Caching is best-effort; a failure here must not break the preview.
      }
    }
  }

  dispose(): void {
    this.devProcess?.kill();
    this.devProcess = undefined;
  }

  private async boot(): Promise<WebContainerInstance> {
    if (!this.bootPromise) {
      this.events.onStatus("Booting WebContainer");
      this.bootPromise = withTimeout(
        import("@webcontainer/api").then(async ({ WebContainer }) => {
          const container = (await WebContainer.boot()) as unknown as WebContainerInstance;
          container.on("server-ready", (_port, url) => {
            this.events.onUrl(url);
            this.events.onStatus("Preview ready");
          });
          return container;
        }),
        this.options.bootTimeoutMs ?? DEFAULT_BOOT_TIMEOUT_MS,
        "WebContainer did not finish booting. Use Chrome/Chromium, keep third-party worker/CDN requests unblocked, and reload the page.",
      ).catch((error: unknown) => {
        this.bootPromise = undefined;
        throw error;
      });
    }

    try {
      this.container = await this.bootPromise;
      return this.container;
    } catch (error) {
      const message = error instanceof Error ? error.message : "WebContainer failed to boot";
      this.events.onError(message);
      throw error;
    }
  }

  private async install(container: WebContainerInstance): Promise<void> {
    this.events.onStatus("Installing preview dependencies");
    // --prefer-offline reuses WebContainer's npm cache; --no-audit/--no-fund skip
    // network round-trips that add seconds without changing the installed tree.
    const process = await container.spawn("npm", [
      "install",
      "--prefer-offline",
      "--no-audit",
      "--no-fund",
    ]);
    this.pipeProcessOutput(process);
    const exitCode = await process.exit;

    if (exitCode !== 0) {
      throw new Error(`Preview dependency install failed with exit code ${exitCode}`);
    }
  }

  private async startDevServer(container: WebContainerInstance): Promise<void> {
    this.events.onStatus("Starting Vite preview");
    // Launch Vite through its real JS entry point instead of `npm run dev` /
    // node_modules/.bin/vite: a node_modules snapshot restored from the cache may
    // not recreate the .bin symlinks, which would make the shim fail with exit 127.
    // The package file itself is always present, so invoking it directly is safe in
    // both the fresh-install and cache-hit paths.
    const process = await container.spawn("node", [
      "node_modules/vite/bin/vite.js",
      "--host",
      "0.0.0.0",
    ]);
    this.pipeProcessOutput(process);
    process.exit.then((exitCode) => {
      if (exitCode !== 0) {
        this.events.onError(`Preview server exited with code ${exitCode}`);
      }
    });
    this.devProcess = process;
  }

  private pipeProcessOutput(process: RunningProcess): void {
    const reader = process.output.getReader();
    void (async () => {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        this.events.onLog(chunk.value);
      }
    })();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function dependencySignature(packageJson: string): string {
  try {
    const parsed = JSON.parse(packageJson) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const normalize = (deps: Record<string, string> = {}): string[] =>
      Object.keys(deps)
        .sort()
        .map((name) => `${name}@${deps[name]}`);
    return JSON.stringify({
      dependencies: normalize(parsed.dependencies),
      devDependencies: normalize(parsed.devDependencies),
    });
  } catch {
    return packageJson;
  }
}

export function toWebContainerTree(
  files: ProjectFileMap,
  references: ProjectReference[] = [],
): WebContainerTree {
  const tree: WebContainerTree = {};

  for (const [filePath, contents] of Object.entries(files)) {
    addFileToTree(tree, filePath, contents);
  }

  for (const reference of references.filter((candidate) => candidate.kind === "binary")) {
    if (!reference.dataBase64) continue;
    addFileToTree(
      tree,
      assertValidReferencePath(reference.projectPath),
      decodeBase64ToUint8Array(reference.dataBase64),
    );
  }

  return tree;
}

function addFileToTree(tree: WebContainerTree, filePath: string, contents: string | Uint8Array): void {
  const parts = filePath.split("/");
  let current = tree;

  for (const [index, part] of parts.entries()) {
    const isFile = index === parts.length - 1;
    if (isFile) {
      current[part] = { file: { contents } };
      continue;
    }

    const existing = current[part];
    if (!existing || !("directory" in existing)) {
      current[part] = { directory: {} };
    }
    current = (current[part] as WebContainerDirectory).directory;
  }
}
