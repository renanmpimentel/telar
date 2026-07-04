import type { GenerationSkill } from "@/lib/project/generation-skill";

export type ProviderId = "openai" | "anthropic" | "claude-cli" | "codex-cli";

export type ProjectFileMap = Record<string, string>;

export type MessageRole = "user" | "assistant";

export type ProjectReferenceKind = "text" | "binary";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  error?: boolean;
  versionId?: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface GeneratedChange {
  summary: string;
  files: GeneratedFile[];
  notes: string[];
  errors: string[];
}

export interface ProjectReference {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ProjectReferenceKind;
  projectPath: string;
  createdAt: string;
  dataBase64?: string;
}

export interface ProjectVersion {
  id: string;
  prompt: string;
  summary: string;
  createdAt: string;
  files: ProjectFileMap;
}

/** Persisted identity of a project's live deployments, so redeploys update in place. */
export interface DeployTargets {
  vercel?: { name: string };
  netlify?: { siteId: string; url?: string };
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: ProjectFileMap;
  messages: ChatMessage[];
  references: ProjectReference[];
  generationSkill: GenerationSkill;
  versions: ProjectVersion[];
  deployTargets?: DeployTargets;
}

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ProviderPreferences {
  provider: ProviderId;
  model: string;
  apiKey?: string;
}
