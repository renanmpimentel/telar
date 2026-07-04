import { describe, expect, it, vi } from "vitest";

import {
  DeployError,
  deployToNetlify,
  deployToVercel,
  parseProvider,
  validateToken,
} from "@/lib/server/deploy";

describe("parseProvider", () => {
  it("accepts known providers", () => {
    expect(parseProvider("vercel")).toBe("vercel");
    expect(parseProvider("netlify")).toBe("netlify");
  });

  it("rejects unknown providers with a 404 code", () => {
    try {
      parseProvider("heroku");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(DeployError);
      expect((error as DeployError).status).toBe(404);
      expect((error as DeployError).code).toBe("unknown_provider");
    }
  });
});

describe("validateToken", () => {
  it("resolves when the provider accepts the token", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(validateToken("vercel", "tok", fetchImpl)).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.vercel.com/v2/user",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer tok" }) }),
    );
  });

  it("rejects an empty token before calling the provider", async () => {
    const fetchImpl = vi.fn();
    await expect(validateToken("netlify", "  ", fetchImpl)).rejects.toMatchObject({
      code: "invalid_token",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps a 401 to invalid_token", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401 }));
    await expect(validateToken("netlify", "bad", fetchImpl)).rejects.toMatchObject({
      code: "invalid_token",
    });
  });
});

describe("deployToVercel", () => {
  it("posts inline source files and returns an https url", async () => {
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { files: unknown[]; projectSettings: unknown };
      expect(body.projectSettings).toEqual({ framework: "vite", buildCommand: "vite build" });
      expect(body.files.length).toBe(1);
      return new Response(JSON.stringify({ url: "demo.vercel.app", readyState: "QUEUED" }), {
        status: 200,
      });
    });
    const result = await deployToVercel(
      "tok",
      "demo",
      { "index.html": "<div></div>" },
      [],
      fetchImpl,
    );
    expect(result).toEqual({ url: "https://demo.vercel.app", readyState: "QUEUED" });
  });

  it("maps a provider rejection to provider_failed", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad token" } }), { status: 403 }),
    );
    await expect(
      deployToVercel("tok", "demo", { "index.html": "x" }, [], fetchImpl),
    ).rejects.toMatchObject({ code: "provider_failed" });
  });
});

describe("deployToNetlify", () => {
  const zip = () => new TextEncoder().encode("zip-bytes").buffer;

  it("creates a named site then deploys the zip and returns the site id", async () => {
    const calls: string[] = [];
    let createBody = "";
    const fetchImpl = vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href.endsWith("/sites")) {
        createBody = String(init?.body);
        return new Response(JSON.stringify({ id: "site-1" }), { status: 201 });
      }
      return new Response(JSON.stringify({ ssl_url: "https://telar-x.netlify.app", state: "ready" }), {
        status: 200,
      });
    });
    const result = await deployToNetlify("tok", zip(), { name: "telar-x" }, fetchImpl);
    expect(result.url).toBe("https://telar-x.netlify.app");
    expect(result.siteId).toBe("site-1");
    expect(JSON.parse(createBody)).toEqual({ name: "telar-x" });
    expect(calls[0]).toBe("https://api.netlify.com/api/v1/sites");
    expect(calls[1]).toBe("https://api.netlify.com/api/v1/sites/site-1/deploys");
  });

  it("reuses an existing site id without creating a new one", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ ssl_url: "https://demo.netlify.app" }), { status: 200 });
    });
    const result = await deployToNetlify("tok", zip(), { siteId: "site-9" }, fetchImpl);
    expect(result.siteId).toBe("site-9");
    expect(calls).toEqual(["https://api.netlify.com/api/v1/sites/site-9/deploys"]);
  });

  it("reuses the caller's own site when the desired name is taken", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      calls.push(href);
      if (href === "https://api.netlify.com/api/v1/sites") {
        return new Response("name taken", { status: 422 });
      }
      if (href.startsWith("https://api.netlify.com/api/v1/sites?name=")) {
        return new Response(JSON.stringify([{ id: "mine", name: "telar-x" }]), { status: 200 });
      }
      return new Response(JSON.stringify({ ssl_url: "https://telar-x.netlify.app" }), { status: 200 });
    });
    const result = await deployToNetlify("tok", zip(), { name: "telar-x" }, fetchImpl);
    expect(result.siteId).toBe("mine");
    expect(calls[calls.length - 1]).toBe("https://api.netlify.com/api/v1/sites/mine/deploys");
  });

  it("recreates the site when the persisted one is gone (404)", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: unknown) => {
      const href = String(url);
      calls.push(href);
      if (href === "https://api.netlify.com/api/v1/sites/old/deploys") {
        return new Response("not found", { status: 404 });
      }
      if (href.endsWith("/sites")) {
        return new Response(JSON.stringify({ id: "new-site" }), { status: 201 });
      }
      return new Response(JSON.stringify({ ssl_url: "https://demo.netlify.app" }), { status: 200 });
    });
    const result = await deployToNetlify("tok", zip(), { siteId: "old", name: "telar-x" }, fetchImpl);
    expect(result.siteId).toBe("new-site");
    expect(calls).toEqual([
      "https://api.netlify.com/api/v1/sites/old/deploys",
      "https://api.netlify.com/api/v1/sites",
      "https://api.netlify.com/api/v1/sites/new-site/deploys",
    ]);
  });
});
