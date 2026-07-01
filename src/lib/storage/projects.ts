import { createDefaultProjectFiles } from "@/lib/project/template";
import {
  createDefaultGenerationSkill,
  normalizeGenerationSkill,
} from "@/lib/project/generation-skill";
import type { Project, ProjectReference, ProjectSummary, ProviderPreferences } from "@/lib/project/types";

const DB_NAME = "like-figma";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const PROVIDER_STORAGE_KEY = "like-figma.provider";
const ACTIVE_PROJECT_KEY = "like-figma.activeProjectId";

export function createProject(name = "Untitled Project"): Project {
  const now = new Date().toISOString();

  return {
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    files: createDefaultProjectFiles(),
    messages: [],
    references: [],
    generationSkill: createDefaultGenerationSkill(),
  };
}

export async function saveProject(project: Project): Promise<Project> {
  const nextProject = migrateProject({ ...project, updatedAt: new Date().toISOString() });
  const db = await openDatabase();

  try {
    await requestToPromise(
      db.transaction(PROJECT_STORE, "readwrite").objectStore(PROJECT_STORE).put(nextProject),
    );
  } finally {
    db.close();
  }

  return nextProject;
}

export async function loadProject(projectId: string): Promise<Project | undefined> {
  const db = await openDatabase();
  try {
    const result = await requestToPromise<Project | undefined>(
      db.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).get(projectId),
    );
    return result ? migrateProject(result) : undefined;
  } finally {
    db.close();
  }
}

export async function listProjectSummaries(): Promise<ProjectSummary[]> {
  const db = await openDatabase();
  let projects: Project[];

  try {
    projects = (
      await requestToPromise<unknown[]>(
        db.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).getAll(),
      )
    ).map(migrateProject);
  } finally {
    db.close();
  }

  return projects
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((project) => ({
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      messageCount: project.messages.length,
    }));
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDatabase();
  try {
    await requestToPromise(
      db.transaction(PROJECT_STORE, "readwrite").objectStore(PROJECT_STORE).delete(projectId),
    );
  } finally {
    db.close();
  }
}

export function saveProviderPreferences(preferences: ProviderPreferences): void {
  const persisted = {
    provider: preferences.provider,
    model: preferences.model,
  };
  localStorage.setItem(PROVIDER_STORAGE_KEY, JSON.stringify(persisted));
}

export function loadProviderPreferences(): Omit<ProviderPreferences, "apiKey"> | undefined {
  const raw = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Omit<ProviderPreferences, "apiKey">;
    const validProviders = ["openai", "anthropic", "claude-cli", "codex-cli"];
    if (!validProviders.includes(parsed.provider)) return undefined;
    const isCli = parsed.provider === "claude-cli" || parsed.provider === "codex-cli";
    if (!isCli && !parsed.model) return undefined;
    return { provider: parsed.provider, model: parsed.model ?? "" };
  } catch {
    return undefined;
  }
}

export function saveActiveProjectId(projectId: string): void {
  localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
}

export function loadActiveProjectId(): string | undefined {
  return localStorage.getItem(ACTIVE_PROJECT_KEY) ?? undefined;
}

export async function clearProjectStorageForTests(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked"));
  });
}

export function migrateProject(rawProject: unknown): Project {
  const project = rawProject as Project & { references?: unknown; generationSkill?: unknown };
  const references = Array.isArray(project.references)
    ? project.references.filter(isProjectReference)
    : [];

  return {
    ...project,
    files: project.files ?? createDefaultProjectFiles(),
    messages: Array.isArray(project.messages) ? project.messages : [],
    references,
    generationSkill: normalizeGenerationSkill(project.generationSkill),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function createId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `project-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isProjectReference(value: unknown): value is ProjectReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Partial<ProjectReference>;
  const hasBaseFields =
    typeof reference.id === "string" &&
    typeof reference.name === "string" &&
    typeof reference.mimeType === "string" &&
    typeof reference.size === "number" &&
    typeof reference.projectPath === "string" &&
    typeof reference.createdAt === "string" &&
    (reference.kind === "text" || reference.kind === "binary");

  if (!hasBaseFields) return false;
  if (reference.kind === "binary") {
    return typeof reference.dataBase64 === "string";
  }
  return true;
}
