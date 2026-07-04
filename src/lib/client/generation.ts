// Client helpers for background generation jobs: start, poll, cancel, and keep
// the active job id per project in localStorage so a reload can re-attach.

import type { GeneratedChange } from "@/lib/project/types";

export interface GenerationStatus {
  status: "running" | "done" | "error" | "cancelled" | "unknown";
  change?: GeneratedChange;
  error?: { message?: string };
}

export async function startGeneration(body: unknown): Promise<string> {
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as { jobId?: string; error?: { message?: string } };
  if (!response.ok || typeof payload.jobId !== "string") {
    throw new Error(payload.error?.message || "Falha ao iniciar a geração.");
  }
  return payload.jobId;
}

export async function fetchGenerationStatus(jobId: string): Promise<GenerationStatus> {
  const response = await fetch(`/api/generate/status?jobId=${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  if (response.status === 404) return { status: "unknown" };
  return (await response.json()) as GenerationStatus;
}

export async function cancelGeneration(jobId: string): Promise<void> {
  await fetch("/api/generate/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });
}

const jobKey = (projectId: string) => `telar.genJob.${projectId}`;

export function saveActiveJob(projectId: string, jobId: string, prompt: string): void {
  localStorage.setItem(jobKey(projectId), JSON.stringify({ jobId, prompt }));
}

export function loadActiveJob(projectId: string): { jobId: string; prompt: string } | null {
  const raw = localStorage.getItem(jobKey(projectId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { jobId?: unknown; prompt?: unknown };
    if (typeof parsed.jobId !== "string") return null;
    return { jobId: parsed.jobId, prompt: typeof parsed.prompt === "string" ? parsed.prompt : "" };
  } catch {
    return null;
  }
}

export function clearActiveJob(projectId: string): void {
  localStorage.removeItem(jobKey(projectId));
}
