import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/deploy/[provider]/route";

function paramsFor(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

describe("POST /api/deploy/[provider]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 when the provider token cookie is missing", async () => {
    const request = new NextRequest("http://localhost/api/deploy/vercel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "demo", files: { "index.html": "x" } }),
    });

    const response = await POST(request, paramsFor("vercel"));
    expect(response.status).toBe(401);
  });

  it("returns 404 for an unknown provider", async () => {
    const request = new NextRequest("http://localhost/api/deploy/heroku", { method: "POST" });
    const response = await POST(request, paramsFor("heroku"));
    expect(response.status).toBe(404);
  });

  it("deploys source files to Vercel when authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ url: "demo.vercel.app", readyState: "QUEUED" }), {
          status: 200,
        }),
      ),
    );

    const request = new NextRequest("http://localhost/api/deploy/vercel", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "telar_vercel_token=tok" },
      body: JSON.stringify({ name: "demo", files: { "index.html": "<div></div>" } }),
    });

    const response = await POST(request, paramsFor("vercel"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://demo.vercel.app",
      readyState: "QUEUED",
    });
  });
});
