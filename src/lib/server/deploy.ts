// Server-side deploy logic: token validation and provider deploys. The user
// pastes a personal access token in the UI; we validate it, keep it in an
// httpOnly cookie, and proxy deploys through here. Never import from a client
// component.

import type { DeployBinaryFile, DeployErrorCode, DeployProvider, DeployResult } from "@/lib/deploy/types";

type FetchImpl = typeof fetch;

/** Carries a stable, localizable `code`. `message` is for server logs only. */
export class DeployError extends Error {
  constructor(
    public readonly code: DeployErrorCode,
    public readonly status = 400,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function parseProvider(value: string | undefined): DeployProvider {
  if (value === "vercel" || value === "netlify") return value;
  throw new DeployError("unknown_provider", 404);
}

export const TOKEN_COOKIE: Record<DeployProvider, string> = {
  vercel: "telar_vercel_token",
  netlify: "telar_netlify_token",
};

/** Confirms a personal access token works by calling the provider's user endpoint. */
export async function validateToken(
  provider: DeployProvider,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<void> {
  if (!token.trim()) throw new DeployError("invalid_token", 400);

  const endpoint =
    provider === "vercel"
      ? "https://api.vercel.com/v2/user"
      : "https://api.netlify.com/api/v1/user";

  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    throw new DeployError("network", 502);
  }

  if (!response.ok) {
    throw new DeployError("invalid_token", 401);
  }
}

// --- Deploys -------------------------------------------------------------

/** Deploys source files to Vercel; Vercel runs the Vite build server-side. */
export async function deployToVercel(
  token: string,
  name: string,
  files: Record<string, string>,
  binaryFiles: DeployBinaryFile[] = [],
  fetchImpl: FetchImpl = fetch,
): Promise<DeployResult> {
  const inlineFiles = [
    ...Object.entries(files).map(([file, data]) => ({ file, data })),
    ...binaryFiles.map((binary) => ({
      file: binary.path,
      data: binary.dataBase64,
      encoding: "base64" as const,
    })),
  ];

  if (inlineFiles.length === 0) {
    throw new DeployError("invalid_payload", 400);
  }

  const response = await fetchImpl("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      files: inlineFiles,
      // Override the template's `tsc --noEmit && vite build` with a plain
      // `vite build` so a stray type error doesn't block a deploy of an app
      // that already renders in the preview.
      projectSettings: { framework: "vite", buildCommand: "vite build" },
      target: "production",
    }),
  });

  const payload = (await response.json()) as {
    url?: string;
    readyState?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.url) {
    throw new DeployError("provider_failed", 502, payload.error?.message);
  }

  // Show the stable production URL (the project name) rather than the per-deploy
  // hashed URL, so every redeploy points at the same `<name>.vercel.app`.
  return { url: `https://${name}.vercel.app`, readyState: payload.readyState };
}

/**
 * Deploys a zip of the built static output to Netlify. When `siteId` is given it
 * updates that existing site; otherwise it creates one. If the given site is gone
 * (deleted, or belongs to a different account), it self-heals by creating a new one.
 */
export interface NetlifyDeployOptions {
  /** Existing site to update in place. */
  siteId?: string;
  /** Desired subdomain (the project slug) for a brand-new site. */
  name?: string;
}

export async function deployToNetlify(
  token: string,
  zip: ArrayBuffer,
  options: NetlifyDeployOptions = {},
  fetchImpl: FetchImpl = fetch,
): Promise<DeployResult> {
  let id = options.siteId || (await ensureNetlifySite(token, options.name, fetchImpl));

  let result = await pushNetlifyDeploy(id, token, zip, fetchImpl);
  if (!result && options.siteId) {
    // The persisted site no longer exists — create a fresh one and retry once.
    id = await ensureNetlifySite(token, options.name, fetchImpl);
    result = await pushNetlifyDeploy(id, token, zip, fetchImpl);
  }
  if (!result) {
    throw new DeployError("provider_failed", 502);
  }

  return { url: result.url, readyState: result.state, siteId: id };
}

/**
 * Returns a site id to deploy to, preferring the `name` (project slug) as the
 * subdomain. If that name is taken it reuses the caller's existing site with
 * that name, and only as a last resort creates an auto-named site.
 */
async function ensureNetlifySite(
  token: string,
  name: string | undefined,
  fetchImpl: FetchImpl,
): Promise<string> {
  if (name) {
    const created = await createNetlifySite(token, name, fetchImpl);
    if (created) return created;

    const existing = await findNetlifySiteByName(token, name, fetchImpl);
    if (existing) return existing;
  }

  const anon = await createNetlifySite(token, undefined, fetchImpl);
  if (!anon) throw new DeployError("provider_failed", 502);
  return anon;
}

/** Creates a site (optionally named). Returns the id, or null if the name is taken. */
async function createNetlifySite(
  token: string,
  name: string | undefined,
  fetchImpl: FetchImpl,
): Promise<string | null> {
  const response = await fetchImpl("https://api.netlify.com/api/v1/sites", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (response.status === 422 || response.status === 409) return null; // name already taken
  const site = (await response.json()) as { id?: string };
  if (!response.ok || !site.id) {
    if (name) return null; // let the caller fall back
    throw new DeployError("provider_failed", 502);
  }
  return site.id;
}

async function findNetlifySiteByName(
  token: string,
  name: string,
  fetchImpl: FetchImpl,
): Promise<string | null> {
  const response = await fetchImpl(
    `https://api.netlify.com/api/v1/sites?name=${encodeURIComponent(name)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) return null;
  const sites = (await response.json()) as Array<{ id?: string; name?: string }>;
  const match = Array.isArray(sites) ? sites.find((site) => site.name === name) : undefined;
  return match?.id ?? null;
}

async function pushNetlifyDeploy(
  siteId: string,
  token: string,
  zip: ArrayBuffer,
  fetchImpl: FetchImpl,
): Promise<{ url: string; state?: string } | null> {
  const response = await fetchImpl(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/zip" },
    body: zip,
  });

  if (response.status === 404) return null; // site is gone — caller may recreate
  const deploy = (await response.json()) as { ssl_url?: string; url?: string; state?: string };
  const url = deploy.ssl_url || deploy.url;
  if (!response.ok || !url) {
    throw new DeployError("provider_failed", 502);
  }
  return { url, state: deploy.state };
}
