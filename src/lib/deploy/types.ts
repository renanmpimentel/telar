// Shared types for the one-click publish feature (Vercel + Netlify deploys).

export type DeployProvider = "vercel" | "netlify";

export const DEPLOY_PROVIDERS: DeployProvider[] = ["vercel", "netlify"];

/**
 * Stable, locale-independent error identifiers. The server returns these; the
 * client maps each to a translated string via `deployErrorMessage`. Never send
 * user-facing prose from the server — it can't be localized.
 */
export type DeployErrorCode =
  | "not_connected"
  | "invalid_token"
  | "invalid_payload"
  | "empty_build"
  | "provider_failed"
  | "unknown_provider"
  | "build_failed"
  | "network"
  | "generic";

/** Which providers the user is currently connected to (token cookie present). */
export interface DeploySession {
  vercel: boolean;
  netlify: boolean;
}

/** Successful deploy response returned to the client. */
export interface DeployResult {
  /** Public https URL of the deployed site. */
  url: string;
  /** Provider readiness, when known (Vercel builds asynchronously). */
  readyState?: string;
  /** Netlify site id — persisted so later deploys update the same site. */
  siteId?: string;
}

export interface DeployErrorResponse {
  error: { code: DeployErrorCode };
}

/** Body of POST /api/deploy/[provider]/connect — the user's personal access token. */
export interface DeployConnectRequest {
  token: string;
}

/** A binary asset shipped alongside the text file map (e.g. uploaded images). */
export interface DeployBinaryFile {
  path: string;
  dataBase64: string;
}

/** Body of POST /api/deploy/vercel — source files; Vercel runs the build. */
export interface VercelDeployRequest {
  name: string;
  files: Record<string, string>;
  binaryFiles?: DeployBinaryFile[];
}
