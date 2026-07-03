"use client";

import { AlertTriangle, ExternalLink, Info, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { openPreviewWindow } from "@/lib/client/preview-window";
import { createModuleCache } from "@/lib/preview/module-cache";
import type { ProjectFileMap, ProjectReference } from "@/lib/project/types";
import { WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";

interface PreviewPaneProps {
  files: ProjectFileMap;
  references?: ProjectReference[];
  isGenerating?: boolean;
}

type PreviewState =
  | { mode: "idle"; status: string; url?: undefined; srcDoc?: undefined; error?: undefined }
  | { mode: "mock"; status: string; srcDoc: string; url?: undefined; error?: undefined }
  | { mode: "webcontainer"; status: string; url?: string; srcDoc?: undefined; error?: undefined }
  | { mode: "error"; status: string; error: string; url?: undefined; srcDoc?: undefined };

export function PreviewPane({ files, references = [], isGenerating = false }: PreviewPaneProps) {
  const runtimeRef = useRef<WebContainerRuntime | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<PreviewState>({ mode: "idle", status: "Waiting" });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [mockMode] = useState(() => readMockMode());
  const fileSignature = useMemo(() => stableProjectSignature(files, references), [files, references]);
  const displayState: PreviewState = mockMode
    ? { mode: "mock", status: "Preview ready", srcDoc: buildMockPreviewDoc(files) }
    : state;
  const canOpenPreview =
    displayState.mode === "mock" || (displayState.mode === "webcontainer" && Boolean(displayState.url));
  const statusTone: "ready" | "busy" | "error" | "idle" =
    displayState.mode === "error"
      ? "error"
      : displayState.mode === "mock" || (displayState.mode === "webcontainer" && Boolean(displayState.url))
        ? "ready"
        : displayState.mode === "idle"
          ? "idle"
          : "busy";

  function handleOpenPreview() {
    if (displayState.mode === "webcontainer" && displayState.url) {
      openPreviewWindow({ mode: "webcontainer", url: displayState.url });
      return;
    }

    if (displayState.mode === "mock") {
      openPreviewWindow({ mode: "mock", srcDoc: displayState.srcDoc });
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
      runtimeRef.current = new WebContainerRuntime(
        {
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
        },
        { moduleCache: createModuleCache() },
      );
    }

    let cancelled = false;
    runtimeRef.current
      .sync(files, references)
      .then(() => {
        // The dev server is running and files are mounted, but a bare mount()
        // does not reliably trigger Vite HMR — force the iframe to reload so the
        // preview always reflects the generated code.
        if (!cancelled) setReloadNonce((nonce) => nonce + 1);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Preview failed to boot";
        setState({ mode: "error", status: "Preview error", error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [fileSignature, files, references, mockMode]);

  return (
    <section className="preview-region" aria-label="Preview">
      <div className="canvas-bar">
        <div className="preview-actions">
          <span
            className="status-pill"
            data-tone={statusTone}
            data-testid="preview-status"
            role="status"
            aria-live="polite"
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="status-label">{displayState.status}</span>
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
          <div className="preview-doc">
            <iframe
              title="Project preview"
              src={appendReloadParam(displayState.url, reloadNonce)}
              className="preview-frame"
            />
          </div>
        ) : displayState.mode === "mock" ? (
          <div className="preview-doc">
            <iframe title="Project preview" srcDoc={displayState.srcDoc} className="preview-frame" />
          </div>
        ) : (
          <div className="preview-message">
            <Loader2 className="spin" size={24} aria-hidden="true" />
            <p>{displayState.status}</p>
          </div>
        )}

        {isGenerating ? (
          <div className="preview-skeleton" aria-hidden="true">
            <div className="preview-skeleton-topbar">
              <span className="preview-skeleton-dot" />
              <span className="preview-skeleton-dot" />
              <span className="preview-skeleton-dot" />
              <span className="preview-skeleton-pill" />
            </div>
            <div className="preview-skeleton-hero" />
            <div className="preview-skeleton-grid">
              <span className="preview-skeleton-card" />
              <span className="preview-skeleton-card" />
              <span className="preview-skeleton-card" />
            </div>
            <span className="preview-skeleton-line long" />
            <span className="preview-skeleton-line" />
            <span className="preview-skeleton-line short" />
          </div>
        ) : null}
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

export function appendReloadParam(url: string, nonce: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}__preview=${nonce}`;
}

function readMockMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_MODE === "mock" ||
    (typeof window !== "undefined" && window.localStorage.getItem("telar.previewMode") === "mock")
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
      html, body { height: 100%; margin: 0; }
      .mock-root { min-height: 100%; display: flow-root; }
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
