export type ProviderId = "openai" | "anthropic";

export type ProjectFileMap = Record<string, string>;

export type MessageRole = "user" | "assistant";

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

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  files: ProjectFileMap;
  messages: ChatMessage[];
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
