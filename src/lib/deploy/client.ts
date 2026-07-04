// Browser-side helpers for the publish feature. These call our own /api/deploy
// routes (which proxy to the providers), so the personal access token is sent
// once to /connect and then lives only in an httpOnly cookie — never in JS.
// Errors carry a stable code that the caller localizes.

import { zipStaticFiles } from "@/lib/export/zip";
import type { Translate } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type {
  DeployBinaryFile,
  DeployErrorCode,
  DeployProvider,
  DeployResult,
  DeploySession,
} from "@/lib/deploy/types";
import type { Project } from "@/lib/project/types";

const OFFLINE_SESSION: DeploySession = { vercel: false, netlify: false };

/** Thrown by the helpers below; `code` is mapped to a message with `deployErrorMessage`. */
export class DeployClientError extends Error {
  constructor(public readonly code: DeployErrorCode) {
    super(code);
  }
}

const ERROR_KEY: Record<DeployErrorCode, TranslationKey> = {
  not_connected: "publish.err.notConnected",
  invalid_token: "publish.err.invalidToken",
  invalid_payload: "publish.err.generic",
  empty_build: "publish.err.emptyBuild",
  provider_failed: "publish.err.providerFailed",
  unknown_provider: "publish.err.generic",
  build_failed: "publish.err.buildFailed",
  network: "publish.err.network",
  generic: "publish.err.generic",
};

export function deployErrorMessage(t: Translate, code: DeployErrorCode | string): string {
  const key = ERROR_KEY[code as DeployErrorCode] ?? "publish.err.generic";
  return t(key);
}

/** Narrows any thrown value to a stable error code for localization. */
export function toDeployErrorCode(error: unknown): DeployErrorCode {
  if (error instanceof DeployClientError) return error.code;
  return "network";
}

export async function fetchDeploySession(): Promise<DeploySession> {
  try {
    const response = await fetch("/api/deploy/session", { cache: "no-store" });
    if (!response.ok) return OFFLINE_SESSION;
    return (await response.json()) as DeploySession;
  } catch {
    return OFFLINE_SESSION;
  }
}

/** Validates + stores a personal access token (server sets an httpOnly cookie). */
export async function connectWithToken(provider: DeployProvider, token: string): Promise<void> {
  await postJson(`/api/deploy/${provider}/connect`, { token });
}

export async function disconnectProvider(provider: DeployProvider): Promise<void> {
  await fetch(`/api/deploy/${provider}/disconnect`, { method: "POST" });
}

export async function deployProjectToVercel(project: Project, name: string): Promise<DeployResult> {
  const binaryFiles: DeployBinaryFile[] = [];
  for (const reference of project.references) {
    if (reference.kind === "binary" && reference.dataBase64) {
      binaryFiles.push({ path: reference.projectPath, dataBase64: reference.dataBase64 });
    }
  }

  return postDeploy("vercel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, files: project.files, binaryFiles }),
  });
}

/** Zips the pre-built output and hands it to Netlify: updates `siteId`, or names a new site. */
export async function deployStaticToNetlify(
  dist: Record<string, Uint8Array>,
  options: { siteId?: string; name?: string } = {},
): Promise<DeployResult> {
  const zip = await zipStaticFiles(dist);
  const params = new URLSearchParams();
  if (options.siteId) params.set("siteId", options.siteId);
  if (options.name) params.set("name", options.name);
  const query = params.toString() ? `?${params.toString()}` : "";
  return postDeploy(
    "netlify",
    {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: new Uint8Array(zip),
    },
    query,
  );
}

async function postDeploy(
  provider: DeployProvider,
  init: RequestInit,
  query = "",
): Promise<DeployResult> {
  const response = await fetch(`/api/deploy/${provider}${query}`, init);
  const payload = (await response.json()) as DeployResult | { error?: { code?: DeployErrorCode } };
  if (!response.ok || !("url" in payload)) {
    throw new DeployClientError(("error" in payload && payload.error?.code) || "generic");
  }
  return payload;
}

async function postJson(url: string, body: unknown): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: { code?: DeployErrorCode } };
    throw new DeployClientError(payload.error?.code || "generic");
  }
}
