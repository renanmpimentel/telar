import type { GenerationSkill } from "@/lib/project/generation-skill";

export type ProviderId = "openai" | "anthropic";

export type ProjectFileMap = Record<string, string>;

export type MessageRole = "user" | "assistant";

export type ProjectReferenceKind = "text" | "binary";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  error?: boolean;
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

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: ProjectFileMap;
  messages: ChatMessage[];
  references: ProjectReference[];
  generationSkill: GenerationSkill;
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
