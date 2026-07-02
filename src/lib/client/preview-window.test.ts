import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PREVIEW_WINDOW_STORAGE_PREFIX,
  cleanupPreviewWindowPayloads,
  openPreviewWindow,
  readPreviewWindowPayload,
} from "@/lib/client/preview-window";

describe("preview window storage", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T12:00:00.000Z"));
    vi.spyOn(window, "open").mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("opens WebContainer previews through a same-origin fullscreen route", () => {
    const rawUrl = "https://demo.local-corp.webcontainer-api.io";

    const previewId = openPreviewWindow({ mode: "webcontainer", url: rawUrl });

    expect(previewId).toEqual(expect.any(String));
    expect(window.open).toHaveBeenCalledWith(
      `/preview/fullscreen?previewId=${encodeURIComponent(previewId ?? "")}`,
      "_blank",
      "noopener,noreferrer",
    );
    expect(window.open).not.toHaveBeenCalledWith(rawUrl, expect.anything(), expect.anything());

    const storedPayload = JSON.parse(
      localStorage.getItem(`${PREVIEW_WINDOW_STORAGE_PREFIX}${previewId}`) ?? "null",
    ) as unknown;
    expect(storedPayload).toMatchObject({
      mode: "webcontainer",
      url: rawUrl,
      createdAt: Date.parse("2026-06-09T12:00:00.000Z"),
    });
  });

  it("expires old preview payloads", () => {
    localStorage.setItem(
      `${PREVIEW_WINDOW_STORAGE_PREFIX}fresh`,
      JSON.stringify({
        mode: "mock",
        srcDoc: "<p>Fresh preview</p>",
        createdAt: Date.parse("2026-06-09T11:59:00.000Z"),
      }),
    );
    localStorage.setItem(
      `${PREVIEW_WINDOW_STORAGE_PREFIX}old`,
      JSON.stringify({
        mode: "mock",
        srcDoc: "<p>Old preview</p>",
        createdAt: Date.parse("2026-06-09T11:45:00.000Z"),
      }),
    );

    cleanupPreviewWindowPayloads();

    expect(readPreviewWindowPayload("fresh")).toMatchObject({ mode: "mock", srcDoc: "<p>Fresh preview</p>" });
    expect(readPreviewWindowPayload("old")).toBeNull();
    expect(localStorage.getItem(`${PREVIEW_WINDOW_STORAGE_PREFIX}old`)).toBeNull();
  });
});
