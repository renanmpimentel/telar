"use client";

import type { ProjectFileMap } from "@/lib/project/types";

type WebContainerTree = Record<string, WebContainerDirectory | WebContainerFile>;

interface WebContainerDirectory {
  directory: WebContainerTree;
}

interface WebContainerFile {
  file: {
    contents: string;
  };
}

interface RunningProcess {
  exit: Promise<number>;
  kill: () => void;
  output: ReadableStream<string>;
}

interface WebContainerInstance {
  mount: (tree: WebContainerTree) => Promise<void>;
  spawn: (command: string, args: string[]) => Promise<RunningProcess>;
  on: (event: "server-ready", callback: (port: number, url: string) => void) => void;
}

interface RuntimeEvents {
  onStatus: (status: string) => void;
  onUrl: (url: string) => void;
  onLog: (line: string) => void;
  onError: (message: string) => void;
}

export class WebContainerRuntime {
  private container?: WebContainerInstance;
  private devProcess?: RunningProcess;
  private installSignature?: string;
  private bootPromise?: Promise<WebContainerInstance>;

  constructor(private readonly events: RuntimeEvents) {}

  async sync(files: ProjectFileMap): Promise<void> {
    if (!globalThis.crossOriginIsolated) {
      throw new Error("Preview requires cross-origin isolation. Use Chrome/Chromium with the local dev server.");
    }

    const container = await this.boot();
    this.events.onStatus("Syncing files");
    await container.mount(toWebContainerTree(files));

    const packageSignature = files["package.json"] ?? "";
    if (this.installSignature !== packageSignature) {
      this.devProcess?.kill();
      this.devProcess = undefined;
      await this.install(container);
      this.installSignature = packageSignature;
    }

    if (!this.devProcess) {
      await this.startDevServer(container);
    } else {
      this.events.onStatus("Preview updated");
    }
  }

  dispose(): void {
    this.devProcess?.kill();
    this.devProcess = undefined;
  }

  private async boot(): Promise<WebContainerInstance> {
    if (!this.bootPromise) {
      this.events.onStatus("Booting WebContainer");
      this.bootPromise = import("@webcontainer/api").then(async ({ WebContainer }) => {
        const container = (await WebContainer.boot()) as unknown as WebContainerInstance;
        container.on("server-ready", (_port, url) => {
          this.events.onUrl(url);
          this.events.onStatus("Preview ready");
        });
        return container;
      });
    }

    this.container = await this.bootPromise;
    return this.container;
  }

  private async install(container: WebContainerInstance): Promise<void> {
    this.events.onStatus("Installing preview dependencies");
    const process = await container.spawn("npm", ["install"]);
    this.pipeProcessOutput(process);
    const exitCode = await process.exit;

    if (exitCode !== 0) {
      throw new Error(`Preview dependency install failed with exit code ${exitCode}`);
    }
  }

  private async startDevServer(container: WebContainerInstance): Promise<void> {
    this.events.onStatus("Starting Vite preview");
    const process = await container.spawn("npm", ["run", "dev", "--", "--host", "0.0.0.0"]);
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

function toWebContainerTree(files: ProjectFileMap): WebContainerTree {
  const tree: WebContainerTree = {};

  for (const [filePath, contents] of Object.entries(files)) {
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

  return tree;
}
