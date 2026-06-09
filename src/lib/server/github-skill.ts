import {
  MAX_GENERATION_SKILL_CONTENT_BYTES,
  type GithubGenerationSkill,
} from "@/lib/project/generation-skill";

type FetchImpl = typeof fetch;

const GITHUB_HOST = "github.com";
const RAW_GITHUB_HOST = "raw.githubusercontent.com";
const DEFAULT_TIMEOUT_MS = 5000;

export { MAX_GENERATION_SKILL_CONTENT_BYTES };

export class GithubSkillResolverError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export async function resolveGithubGenerationSkill(
  inputUrl: string,
  fetchImpl: FetchImpl = fetch,
  options: { timeoutMs?: number; now?: () => Date } = {},
): Promise<GithubGenerationSkill> {
  const sourceUrl = normalizeGithubSkillUrl(inputUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchImpl(sourceUrl, {
      method: "GET",
      headers: { Accept: "text/plain,text/markdown,*/*" },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GithubSkillResolverError("Timed out fetching the GitHub SKILL.md file.", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new GithubSkillResolverError(
      `GitHub SKILL.md is inaccessible (HTTP ${response.status}).`,
      502,
    );
  }

  const contentLength = response.headers.get("Content-Length");
  if (contentLength && Number(contentLength) > MAX_GENERATION_SKILL_CONTENT_BYTES) {
    throw new GithubSkillResolverError("GitHub SKILL.md exceeds the 100KB size limit.");
  }

  const contentType = response.headers.get("Content-Type");
  if (contentType && !isTextualContentType(contentType)) {
    throw new GithubSkillResolverError("GitHub SKILL.md must be a text or Markdown response.");
  }

  const content = await response.text();
  const byteLength = new TextEncoder().encode(content).byteLength;
  if (byteLength > MAX_GENERATION_SKILL_CONTENT_BYTES) {
    throw new GithubSkillResolverError("GitHub SKILL.md exceeds the 100KB size limit.");
  }
  if (!content.trim()) {
    throw new GithubSkillResolverError("GitHub SKILL.md is empty.");
  }

  return {
    source: "github",
    name: extractSkillName(content),
    sourceUrl,
    content,
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
  };
}

function normalizeGithubSkillUrl(inputUrl: string): string {
  let url: URL;
  try {
    url = new URL(inputUrl.trim());
  } catch {
    throw new GithubSkillResolverError("Enter a valid public GitHub SKILL.md URL.");
  }

  if (url.protocol !== "https:") {
    throw new GithubSkillResolverError("GitHub SKILL.md URL must use https.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new GithubSkillResolverError("GitHub SKILL.md URL must point directly to the file.");
  }

  if (url.hostname === GITHUB_HOST) {
    return normalizeGithubBlobUrl(url);
  }

  if (url.hostname === RAW_GITHUB_HOST) {
    return normalizeRawGithubUrl(url);
  }

  throw new GithubSkillResolverError("Only public GitHub SKILL.md URLs are supported.");
}

function normalizeGithubBlobUrl(url: URL): string {
  const parts = pathParts(url);
  const blobIndex = parts.indexOf("blob");
  if (blobIndex !== 2 || parts.length < 5) {
    throw new GithubSkillResolverError("GitHub URL must point to a SKILL.md file in blob view.");
  }

  const [owner, repo] = parts;
  const ref = parts[3];
  const skillPathParts = parts.slice(4);
  assertSkillPath(skillPathParts);

  return `https://${RAW_GITHUB_HOST}/${owner}/${repo}/${ref}/${skillPathParts.join("/")}`;
}

function normalizeRawGithubUrl(url: URL): string {
  const parts = pathParts(url);
  if (parts.length < 4) {
    throw new GithubSkillResolverError("GitHub raw URL must point to a SKILL.md file.");
  }

  assertSkillPath(parts.slice(3));
  return `https://${RAW_GITHUB_HOST}${url.pathname}`;
}

function pathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

function assertSkillPath(parts: string[]): void {
  const fileName = parts.at(-1);
  if (fileName !== "SKILL.md") {
    throw new GithubSkillResolverError("GitHub URL must point directly to SKILL.md.");
  }
}

function isTextualContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  return (
    normalized.startsWith("text/") ||
    normalized === "application/octet-stream" ||
    normalized === "application/x-markdown"
  );
}

function extractSkillName(content: string): string {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const name = frontmatter?.[1].match(/^name:\s*["']?([^"'\r\n]+)["']?\s*$/m)?.[1]?.trim();
  return name || "SKILL.md";
}
