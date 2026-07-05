"use client";

import type { ModuleCache } from "@/lib/preview/module-cache";
import type { SeedSnapshotLoader } from "@/lib/preview/seed-snapshot-loader";
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

interface WebContainerDirEnt {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
}

interface WebContainerFs {
  readdir: (path: string, options: { withFileTypes: true }) => Promise<WebContainerDirEnt[]>;
  readFile: (path: string) => Promise<Uint8Array>;
}

interface WebContainerInstance {
  mount: (tree: WebContainerTree | Uint8Array, options?: { mountPoint?: string }) => Promise<void>;
  spawn: (command: string, args: string[]) => Promise<RunningProcess>;
  export: (path: string, options: { format: "binary" }) => Promise<Uint8Array>;
  on: (event: "server-ready", callback: (port: number, url: string) => void) => void;
  fs: WebContainerFs;
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
  seedSnapshotLoader?: SeedSnapshotLoader | null;
}

const DEFAULT_BOOT_TIMEOUT_MS = 120_000;

export class WebContainerRuntime {
  private container?: WebContainerInstance;
  private devProcess?: RunningProcess;
  private installSignature?: string;
  private bootPromise?: Promise<WebContainerInstance>;
  private serverReadyResolvers: Array<() => void> = [];
  private readonly moduleCache: ModuleCache | null;
  private readonly seedSnapshotLoader: SeedSnapshotLoader | null;

  constructor(
    private readonly events: RuntimeEvents,
    private readonly options: RuntimeOptions = {},
  ) {
    // The node_modules snapshot cache remounts dependencies from IndexedDB on a
    // page reload instead of reinstalling them. It is self-healing: a bare
    // export()/mount() round-trip may drop node_modules/.bin executables (e.g.
    // vite), so if the restored snapshot cannot launch the dev server we fall back
    // to a clean install and retry. Worst case therefore matches a no-cache run.
    // Pass an explicit `moduleCache` (e.g. createModuleCache()) to enable it;
    // defaults to off so unit tests stay free of IndexedDB.
    this.moduleCache = options.moduleCache ?? null;
    // A prebuilt seed snapshot ships the base template dependencies as a static
    // asset. On a cache miss we mount it as a warm starting point so the ensuing
    // `npm install` only adds the delta instead of installing from scratch. It is
    // best-effort: a missing/unreachable seed simply falls through to a clean
    // install. Defaults to off so unit tests stay free of network access.
    this.seedSnapshotLoader = options.seedSnapshotLoader ?? null;
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

      const usedCache = await this.ensureDependencies(container, signature);
      this.installSignature = signature;

      const started = await this.startDevServer(container);
      if (!started && usedCache) {
        // The restored node_modules snapshot could not launch the dev server (e.g.
        // its .bin executables were lost in the export/mount round-trip). Reinstall
        // from scratch and retry once so a stale cache never breaks the preview.
        // startDevServer already cleared devProcess when the failed attempt exited.
        this.events.onStatus("Cached dependencies were incomplete, reinstalling");
        await this.install(container);
        await this.saveSnapshot(container, signature);
        const restarted = await this.startDevServer(container);
        if (!restarted) {
          this.events.onError("Preview server failed to start");
        }
      } else if (!started) {
        this.events.onError("Preview server failed to start");
      }
      return;
    }

    if (!this.devProcess) {
      await this.startDevServer(container);
    } else {
      this.events.onStatus("Preview updated");
    }
  }

  /**
   * Builds the project to static files and returns the produced `dist/` as a
   * path -> bytes map, ready to be zipped and deployed to a static host.
   *
   * Runs `vite build` directly instead of the template's `npm run build`
   * (`tsc --noEmit && vite build`): the goal of publishing is to produce the
   * bundle, and a stray TypeScript error in AI-generated code shouldn't block a
   * deploy when the app already renders in the (type-check-free) Vite preview.
   */
  async buildStaticSite(
    files: ProjectFileMap,
    references: ProjectReference[] = [],
  ): Promise<Record<string, Uint8Array>> {
    if (!globalThis.crossOriginIsolated) {
      throw new Error("Building requires cross-origin isolation. Use Chrome/Chromium.");
    }

    const container = await this.boot();
    this.events.onStatus("Preparing build");
    await container.mount(toWebContainerTree(files, references));
    await this.install(container);

    this.events.onStatus("Building static site");
    const build = await container.spawn("npx", ["vite", "build"]);
    this.pipeProcessOutput(build);
    const exitCode = await build.exit;
    if (exitCode !== 0) {
      throw new Error(`Build failed with exit code ${exitCode}`);
    }

    this.events.onStatus("Collecting build output");
    const dist = await collectDirectory(container, "dist");
    if (Object.keys(dist).length === 0) {
      throw new Error("The build produced no files in dist/.");
    }
    return dist;
  }

  /**
   * Installs the given files' dependencies and exports the resulting
   * `node_modules` as a binary snapshot. Used offline (via the dev-only
   * `/dev/seed` page) to prebuild the base template seed shipped under
   * `/snapshots/`; it is not part of the normal preview flow.
   */
  async exportSeedSnapshot(files: ProjectFileMap): Promise<Uint8Array> {
    if (!globalThis.crossOriginIsolated) {
      throw new Error("Seed generation requires cross-origin isolation. Use Chrome/Chromium.");
    }

    const container = await this.boot();
    this.events.onStatus("Mounting template");
    await container.mount(toWebContainerTree(files));
    await this.install(container);

    this.events.onStatus("Exporting node_modules snapshot");
    return container.export("node_modules", { format: "binary" });
  }

  /** Returns true when dependencies were remounted from the cache, false after a fresh install. */
  private async ensureDependencies(container: WebContainerInstance, signature: string): Promise<boolean> {
    if (this.moduleCache) {
      const cached = await this.moduleCache.load(signature).catch(() => undefined);
      if (cached) {
        this.events.onStatus("Restoring cached dependencies");
        await container.mount(cached, { mountPoint: "node_modules" });
        return true;
      }
    }

    // No exact per-user cache: mount the prebuilt base seed (if shipped) so the
    // install below only reconciles the delta. `npm install` still runs on top —
    // it rebuilds any node_modules/.bin dropped in the export/mount round-trip and
    // adds dependencies the seed does not cover — so this stays a pure speed-up
    // and returns false (a fresh install, not a trusted cache hit).
    if (this.seedSnapshotLoader) {
      const seed = await this.seedSnapshotLoader.load().catch(() => undefined);
      if (seed) {
        this.events.onStatus("Preparing dependencies");
        await container.mount(seed, { mountPoint: "node_modules" });
      }
    }

    await this.install(container);
    await this.saveSnapshot(container, signature);
    return false;
  }

  private async saveSnapshot(container: WebContainerInstance, signature: string): Promise<void> {
    if (!this.moduleCache) return;
    try {
      this.events.onStatus("Caching dependencies");
      const snapshot = await container.export("node_modules", { format: "binary" });
      await this.moduleCache.save(signature, snapshot);
    } catch {
      // Caching is best-effort; a failure here must not break the preview.
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
            const resolvers = this.serverReadyResolvers;
            this.serverReadyResolvers = [];
            for (const resolve of resolvers) resolve();
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

  /** Starts the dev server and resolves true once it is serving, false if it exits first. */
  private async startDevServer(container: WebContainerInstance): Promise<boolean> {
    this.events.onStatus("Starting Vite preview");
    const ready = new Promise<void>((resolve) => this.serverReadyResolvers.push(resolve));
    const process = await container.spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"]);
    this.pipeProcessOutput(process);
    this.devProcess = process;

    // The dev server is healthy once it emits `server-ready`; if the process exits
    // before that, the (possibly cache-restored) install could not launch it.
    const outcome = await Promise.race([
      ready.then(() => "ready" as const),
      process.exit.then((exitCode) => ({ exitCode })),
    ]);

    if (outcome === "ready") {
      // Surface only crashes that happen after the server was already serving.
      process.exit.then((exitCode) => {
        if (exitCode !== 0 && this.devProcess === process) {
          this.events.onError(`Preview server exited with code ${exitCode}`);
        }
      });
      return true;
    }

    this.devProcess = undefined;
    return false;
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

async function collectDirectory(
  container: WebContainerInstance,
  root: string,
): Promise<Record<string, Uint8Array>> {
  const out: Record<string, Uint8Array> = {};

  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await container.fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      } else {
        out[relativePath] = await container.fs.readFile(fullPath);
      }
    }
  }

  await walk(root, "");
  return out;
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
