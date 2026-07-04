"use client";

import { AlertTriangle, ExternalLink, Info, Loader2, Monitor, Smartphone } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { openPreviewWindow } from "@/lib/client/preview-window";
import { useI18n } from "@/lib/i18n";
import { createModuleCache } from "@/lib/preview/module-cache";
import type { ProjectFileMap, ProjectReference } from "@/lib/project/types";
import { WebContainerRuntime } from "@/lib/preview/webcontainer-runtime";

interface PreviewPaneProps {
  files: ProjectFileMap;
  references?: ProjectReference[];
  isGenerating?: boolean;
}

export interface PreviewHandle {
  /**
   * Builds the current project to static files (Vite `dist/`) inside the shared
   * WebContainer and returns them as a path -> bytes map. Rejects in mock mode.
   */
  buildStaticSite: (
    files: ProjectFileMap,
    references: ProjectReference[],
  ) => Promise<Record<string, Uint8Array>>;
}

type PreviewState =
  | { mode: "idle"; status: string; url?: undefined; srcDoc?: undefined; error?: undefined }
  | { mode: "mock"; status: string; srcDoc: string; url?: undefined; error?: undefined }
  | { mode: "webcontainer"; status: string; url?: string; srcDoc?: undefined; error?: undefined }
  | { mode: "error"; status: string; error: string; url?: undefined; srcDoc?: undefined };

export const PreviewPane = forwardRef<PreviewHandle, PreviewPaneProps>(function PreviewPane(
  { files, references = [], isGenerating = false },
  ref,
) {
  const { t } = useI18n();
  // Keep the latest translator in a ref so the runtime effect need not depend on it
  // (re-running would tear down and rebuild the WebContainer on a language switch).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const runtimeRef = useRef<WebContainerRuntime | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [state, setState] = useState<PreviewState>({ mode: "idle", status: t("preview.waiting") });
  const [reloadNonce, setReloadNonce] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [viewport, setViewport] = useState<"desktop" | "mobile">("desktop");
  const [mockMode] = useState(() => readMockMode());
  const fileSignature = useMemo(() => stableProjectSignature(files, references), [files, references]);
  const displayState: PreviewState = mockMode
    ? { mode: "mock", status: t("preview.ready"), srcDoc: buildMockPreviewDoc(files) }
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
  const isBusy = statusTone === "busy";

  // Elapsed-time counter while the WebContainer is booting/installing/starting,
  // so a slow first `npm install` doesn't look frozen.
  useEffect(() => {
    if (!isBusy) return;
    setElapsed(0);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isBusy]);

  function handleOpenPreview() {
    if (displayState.mode === "webcontainer" && displayState.url) {
      openPreviewWindow({ mode: "webcontainer", url: displayState.url });
      return;
    }

    if (displayState.mode === "mock") {
      openPreviewWindow({ mode: "mock", srcDoc: displayState.srcDoc });
    }
  }

  function ensureRuntime(): WebContainerRuntime {
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
              status: tRef.current("preview.ready"),
              url,
            }),
          onLog: (line) => {
            setLogs((current) => [...current.slice(-18), line]);
          },
          onError: (message) => {
            setState({ mode: "error", status: tRef.current("preview.error"), error: message });
          },
        },
        { moduleCache: createModuleCache() },
      );
    }
    return runtimeRef.current;
  }

  useImperativeHandle(
    ref,
    () => ({
      buildStaticSite: (buildFiles, buildReferences) => {
        if (mockMode) {
          return Promise.reject(new Error("Building is unavailable in mock preview mode."));
        }
        return ensureRuntime().buildStaticSite(buildFiles, buildReferences);
      },
    }),
    [mockMode],
  );

  useEffect(() => {
    return () => runtimeRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (mockMode) {
      return;
    }

    const runtime = ensureRuntime();

    let cancelled = false;
    runtime
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
        setState({ mode: "error", status: tRef.current("preview.error"), error: message });
      });

    return () => {
      cancelled = true;
    };
  }, [fileSignature, files, references, mockMode]);

  return (
    <section className="preview-region" aria-label={t("preview.region")}>
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
          <div className="segmented viewport-toggle" role="group" aria-label={t("preview.viewport")}>
            <button
              type="button"
              className={viewport === "desktop" ? "is-selected" : ""}
              aria-pressed={viewport === "desktop"}
              title={t("preview.desktop")}
              onClick={() => setViewport("desktop")}
            >
              <Monitor size={15} aria-hidden="true" />
              <span className="sr-only">{t("preview.desktop")}</span>
            </button>
            <button
              type="button"
              className={viewport === "mobile" ? "is-selected" : ""}
              aria-pressed={viewport === "mobile"}
              title={t("preview.mobile")}
              onClick={() => setViewport("mobile")}
            >
              <Smartphone size={15} aria-hidden="true" />
              <span className="sr-only">{t("preview.mobile")}</span>
            </button>
          </div>
          <button
            className="preview-open-button"
            type="button"
            onClick={handleOpenPreview}
            disabled={!canOpenPreview}
            aria-label={t("preview.openNewTab")}
            title={canOpenPreview ? t("preview.openNewTab") : t("preview.openNewTabDisabled")}
          >
            <ExternalLink size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="preview-stage" data-viewport={viewport}>
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
            <div className="preview-message-body">
              <p>
                {displayState.status}
                {isBusy ? <span className="preview-elapsed"> · {formatElapsed(elapsed)}</span> : null}
              </p>
              {isBusy && elapsed >= 5 ? (
                <small className="preview-hint">{t("preview.installHint")}</small>
              ) : null}
            </div>
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
          {t("preview.details")}
        </summary>
        <pre>{logs.join("\n") || t("preview.noMessages")}</pre>
      </details>
    </section>
  );
});

export function appendReloadParam(url: string, nonce: number): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}__preview=${nonce}`;
}

export function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
      html { scrollbar-width: thin; scrollbar-color: transparent transparent; }
      html:hover, html:focus-within { scrollbar-color: rgba(0,0,0,0.22) transparent; }
      html::-webkit-scrollbar { width: 8px; height: 8px; }
      html::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; }
      html:hover::-webkit-scrollbar-thumb, html:active::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.22); }
      html::-webkit-scrollbar-track { background: transparent; }
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
