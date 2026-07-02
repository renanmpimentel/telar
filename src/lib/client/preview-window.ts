export const PREVIEW_WINDOW_STORAGE_PREFIX = "like-figma.previewWindow:";

const PREVIEW_WINDOW_TTL_MS = 10 * 60 * 1000;

export type PreviewWindowPayload =
  | { mode: "webcontainer"; url: string }
  | { mode: "mock"; srcDoc: string };

export type StoredPreviewWindowPayload = PreviewWindowPayload & {
  createdAt: number;
};

export function openPreviewWindow(payload: PreviewWindowPayload): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  cleanupPreviewWindowPayloads();

  const previewId = createPreviewId();
  const storedPayload: StoredPreviewWindowPayload = {
    ...payload,
    createdAt: Date.now(),
  };

  try {
    window.localStorage.setItem(getPreviewWindowStorageKey(previewId), JSON.stringify(storedPayload));
  } catch {
    return null;
  }

  window.open(getPreviewWindowUrl(previewId), "_blank", "noopener,noreferrer");
  return previewId;
}

export function readPreviewWindowPayload(previewId: string): StoredPreviewWindowPayload | null {
  if (typeof window === "undefined" || !previewId) {
    return null;
  }

  const storageKey = getPreviewWindowStorageKey(previewId);
  const rawPayload = window.localStorage.getItem(storageKey);
  if (!rawPayload) {
    return null;
  }

  const payload = parsePreviewWindowPayload(rawPayload);
  if (!payload || isPreviewWindowPayloadExpired(payload.createdAt)) {
    window.localStorage.removeItem(storageKey);
    return null;
  }

  return payload;
}

export function cleanupPreviewWindowPayloads(now = Date.now()): void {
  if (typeof window === "undefined") {
    return;
  }

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey?.startsWith(PREVIEW_WINDOW_STORAGE_PREFIX)) {
      continue;
    }

    const payload = parsePreviewWindowPayload(window.localStorage.getItem(storageKey));
    if (!payload || isPreviewWindowPayloadExpired(payload.createdAt, now)) {
      window.localStorage.removeItem(storageKey);
    }
  }
}

export function getPreviewWindowUrl(previewId: string): string {
  return `/preview/fullscreen?previewId=${encodeURIComponent(previewId)}`;
}

function getPreviewWindowStorageKey(previewId: string): string {
  return `${PREVIEW_WINDOW_STORAGE_PREFIX}${previewId}`;
}

function createPreviewId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function parsePreviewWindowPayload(rawPayload: string | null): StoredPreviewWindowPayload | null {
  if (!rawPayload) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  if (!isObject(parsed) || typeof parsed.createdAt !== "number" || !Number.isFinite(parsed.createdAt)) {
    return null;
  }

  if (parsed.mode === "webcontainer" && typeof parsed.url === "string" && parsed.url.length > 0) {
    return {
      mode: "webcontainer",
      url: parsed.url,
      createdAt: parsed.createdAt,
    };
  }

  if (parsed.mode === "mock" && typeof parsed.srcDoc === "string") {
    return {
      mode: "mock",
      srcDoc: parsed.srcDoc,
      createdAt: parsed.createdAt,
    };
  }

  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPreviewWindowPayloadExpired(createdAt: number, now = Date.now()): boolean {
  return now - createdAt > PREVIEW_WINDOW_TTL_MS;
}
