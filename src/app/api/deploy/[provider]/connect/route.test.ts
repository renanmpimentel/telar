import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/deploy/[provider]/connect/route";

function paramsFor(provider: string) {
  return { params: Promise.resolve({ provider }) };
}

function connectRequest(provider: string, body: unknown) {
  return new NextRequest(`http://localhost/api/deploy/${provider}/connect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/deploy/[provider]/connect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates a token and stores it as a cookie", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const response = await POST(connectRequest("vercel", { token: "tok" }), paramsFor("vercel"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie") ?? "").toContain("telar_vercel_token=tok");
  });

  it("rejects an empty token with invalid_token", async () => {
    const response = await POST(connectRequest("vercel", { token: "" }), paramsFor("vercel"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_token" } });
  });

  it("maps a provider-rejected token to invalid_token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    const response = await POST(connectRequest("netlify", { token: "bad" }), paramsFor("netlify"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { code: "invalid_token" } });
  });
});
