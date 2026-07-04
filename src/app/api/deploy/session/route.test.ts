import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/deploy/session/route";

describe("GET /api/deploy/session", () => {
  it("reports which providers have a token cookie", async () => {
    const request = new NextRequest("http://localhost/api/deploy/session", {
      headers: { cookie: "telar_vercel_token=abc" },
    });
    const response = GET(request);
    await expect(response.json()).resolves.toEqual({ vercel: true, netlify: false });
  });

  it("reports no connections without cookies", async () => {
    const request = new NextRequest("http://localhost/api/deploy/session");
    const response = GET(request);
    await expect(response.json()).resolves.toEqual({ vercel: false, netlify: false });
  });
});
