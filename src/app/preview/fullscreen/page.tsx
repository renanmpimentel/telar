"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  cleanupPreviewWindowPayloads,
  readPreviewWindowPayload,
  type StoredPreviewWindowPayload,
} from "@/lib/client/preview-window";

type FullscreenPreviewState =
  | { status: "loading" }
  | { status: "ready"; payload: StoredPreviewWindowPayload }
  | { status: "unavailable" };

export default function FullscreenPreviewPage() {
  const [state, setState] = useState<FullscreenPreviewState>({ status: "loading" });

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      cleanupPreviewWindowPayloads();

      const previewId = new URLSearchParams(window.location.search).get("previewId");
      if (!previewId) {
        setState({ status: "unavailable" });
        return;
      }

      const payload = readPreviewWindowPayload(previewId);
      setState(payload ? { status: "ready", payload } : { status: "unavailable" });
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  if (state.status === "loading") {
    return (
      <main className="fullscreen-preview-page" aria-label="Preview fullscreen">
        <div className="fullscreen-preview-status">
          <Loader2 className="spin" size={24} aria-hidden="true" />
          <p>Carregando preview...</p>
        </div>
      </main>
    );
  }

  if (state.status === "unavailable") {
    return (
      <main className="fullscreen-preview-page" aria-label="Preview fullscreen">
        <div className="fullscreen-preview-error" role="alert">
          <AlertTriangle size={24} aria-hidden="true" />
          <div>
            <h1>Preview indisponivel</h1>
            <p>Abra o preview novamente pelo workspace.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="fullscreen-preview-page" aria-label="Preview fullscreen">
      {state.payload.mode === "webcontainer" ? (
        <iframe title="Fullscreen project preview" src={state.payload.url} className="fullscreen-preview-frame" />
      ) : (
        <iframe title="Fullscreen project preview" srcDoc={state.payload.srcDoc} className="fullscreen-preview-frame" />
      )}
    </main>
  );
}
