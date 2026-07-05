"use client";

import { useCallback, useRef, useState } from "react";

import { createDefaultProjectFiles } from "@/lib/project/template";
import { dependencySignature, WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";

declare global {
  interface Window {
    /** Dependency signature of the generated seed, read by the generate-seed Playwright spec. */
    __SEED_SIGNATURE__?: string;
  }
}

/**
 * Dev-only page that prebuilds the base template `node_modules` seed. It boots a
 * WebContainer, installs the default template dependencies, exports the resulting
 * `node_modules` as a binary snapshot, and downloads it as `seed.bin`. The
 * `tests/e2e/generate-seed.spec.ts` Playwright script drives this page and writes
 * the download plus a manifest into `public/snapshots/`.
 *
 * Never shipped to production: the route renders nothing there.
 */
export default function SeedGeneratorPage() {
  const [status, setStatus] = useState("Idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [running, setRunning] = useState(false);
  const startedRef = useRef(false);

  const generate = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setRunning(true);

    const runtime = new WebContainerRuntime({
      onStatus: setStatus,
      onUrl: () => {},
      onLog: (line) => setLogs((current) => [...current.slice(-40), line]),
      onError: (message) => setError(message),
    });

    try {
      const files = createDefaultProjectFiles();
      window.__SEED_SIGNATURE__ = dependencySignature(files["package.json"] ?? "");

      const snapshot = await runtime.exportSeedSnapshot(files);

      const blob = new Blob([snapshot.slice()], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "seed.bin";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setStatus(`Done — ${snapshot.byteLength} bytes`);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }, []);

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  return (
    <main style={{ fontFamily: "monospace", padding: 24, lineHeight: 1.6 }}>
      <h1>Seed snapshot generator</h1>
      <button type="button" data-testid="seed-start" onClick={() => void generate()} disabled={running}>
        {running ? "Generating…" : "Generate seed"}
      </button>
      <p data-testid="seed-status">Status: {status}</p>
      {done && <p data-testid="seed-done">Snapshot downloaded as seed.bin</p>}
      {error && <p style={{ color: "crimson" }} data-testid="seed-error">Error: {error}</p>}
      <pre style={{ background: "#111", color: "#ddd", padding: 12, maxHeight: 320, overflow: "auto" }}>
        {logs.join("\n")}
      </pre>
    </main>
  );
}
