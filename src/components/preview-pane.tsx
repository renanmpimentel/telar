"use client";

import { AlertTriangle, ExternalLink, Info, Loader2, MonitorPlay } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ProjectFileMap, ProjectReference } from "@/lib/project/types";
import { WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";

interface PreviewPaneProps {
  files: ProjectFileMap;
  references?: ProjectReference[];
}

type PreviewState =
  | { mode: "idle"; status: string; url?: undefined; srcDoc?: undefined; error?: undefined }
  | { mode: "mock"; status: string; srcDoc: string; url?: undefined; error?: undefined }
  | { mode: "webcontainer"; status: string; url?: string; srcDoc?: undefined; error?: undefined }
  | { mode: "error"; status: string; error: string; url?: undefined; srcDoc?: undefined };

export function PreviewPane({ files, references = [] }: PreviewPaneProps) {
  const runtimeRef = useRef<WebContainerRuntime | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<PreviewState>({ mode: "idle", status: "Waiting" });
  const [mockMode] = useState(() => readMockMode());
  const fileSignature = useMemo(() => stableProjectSignature(files, references), [files, references]);
  const displayState: PreviewState = mockMode
    ? { mode: "mock", status: "Preview ready", srcDoc: buildMockPreviewDoc(files) }
    : state;
  const canOpenPreview =
    displayState.mode === "mock" || (displayState.mode === "webcontainer" && Boolean(displayState.url));

  function handleOpenPreview() {
    if (displayState.mode === "webcontainer" && displayState.url) {
      window.open(displayState.url, "_blank", "noopener,noreferrer");
      return;
    }

    if (displayState.mode === "mock") {
      const blob = new Blob([displayState.srcDoc], { type: "text/html" });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    }
  }

  useEffect(() => {
    return () => runtimeRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (mockMode) {
      return;
    }

    if (!runtimeRef.current) {
      runtimeRef.current = new WebContainerRuntime({
        onStatus: (status) =>
          setState((current) => ({
            mode: "webcontainer",
            status,
            url: current.mode === "webcontainer" ? current.url : undefined,
          })),
        onUrl: (url) =>
          setState({
            mode: "webcontainer",
            status: "Preview ready",
            url,
          }),
        onLog: (line) => {
          setLogs((current) => [...current.slice(-18), line]);
        },
        onError: (message) => {
          setState({ mode: "error", status: "Preview error", error: message });
        },
      });
    }

    runtimeRef.current.sync(files, references).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Preview failed to boot";
      setState({ mode: "error", status: "Preview error", error: message });
    });
  }, [fileSignature, files, references, mockMode]);

  return (
    <section className="workspace-region preview-region" aria-label="Preview">
      <div className="region-bar">
        <div className="region-title">
          <MonitorPlay size={17} aria-hidden="true" />
          <span>Preview</span>
        </div>
        <div className="preview-actions">
          <span className="status-pill" data-testid="preview-status">
            {displayState.status}
          </span>
          <button
            className="preview-open-button"
            type="button"
            onClick={handleOpenPreview}
            disabled={!canOpenPreview}
            aria-label="Abrir preview em nova aba"
            title={canOpenPreview ? "Abrir preview em nova aba" : "Preview indisponivel para abrir em nova aba"}
          >
            <ExternalLink size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="preview-stage">
        {displayState.mode === "error" ? (
          <div className="preview-message" role="alert">
            <AlertTriangle size={24} aria-hidden="true" />
            <p>{displayState.error}</p>
          </div>
        ) : displayState.mode === "webcontainer" && displayState.url ? (
          <iframe title="Project preview" src={displayState.url} className="preview-frame" />
        ) : displayState.mode === "mock" ? (
          <iframe title="Project preview" srcDoc={displayState.srcDoc} className="preview-frame" />
        ) : (
          <div className="preview-message">
            <Loader2 className="spin" size={24} aria-hidden="true" />
            <p>{displayState.status}</p>
          </div>
        )}
      </div>

      <details className="preview-log">
        <summary>
          <Info size={15} aria-hidden="true" />
          Detalhes
        </summary>
        <pre>{logs.join("\n") || "Nenhuma mensagem do preview ainda."}</pre>
      </details>
    </section>
  );
}

function readMockMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_MODE === "mock" ||
    (typeof window !== "undefined" && window.localStorage.getItem("like-figma.previewMode") === "mock")
  );
}

function stableProjectSignature(files: ProjectFileMap, references: ProjectReference[]): string {
  const fileSignature = Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([filePath, content]) => `${filePath}:${content.length}:${content}`)
    .join("|");
  const referenceSignature = [...references]
    .sort((a, b) => a.projectPath.localeCompare(b.projectPath))
    .map((reference) => `${reference.projectPath}:${reference.size}:${reference.dataBase64 ?? ""}`)
    .join("|");
  return `${fileSignature}::${referenceSignature}`;
}

function buildMockPreviewDoc(files: ProjectFileMap): string {
  const appSource = files["src/App.tsx"] ?? "";
  const css = files["src/styles.css"] ?? "";
  const visibleText = extractTsxText(appSource);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${css}
      body { min-height: 100vh; }
      .mock-root { min-height: 100vh; }
      .mock-source { position: fixed; inset: auto 16px 16px 16px; max-height: 38vh; overflow: auto; border: 1px solid #d8d1c2; background: rgba(255,255,255,.86); color: #171717; padding: 12px; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }
    </style>
  </head>
  <body>
    <main class="mock-root" aria-label="Mock preview">
      ${visibleText.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </main>
    <pre class="mock-source">${escapeHtml(appSource)}</pre>
  </body>
</html>`;
}

function extractTsxText(source: string): string[] {
  const text = Array.from(source.matchAll(/>([^<>{}][^<>]*)</g))
    .map((match) => match[1]?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));

  return text.length > 0 ? text : ["Preview updated"];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
