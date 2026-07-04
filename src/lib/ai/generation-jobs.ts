// Background generation jobs. A generation is started with createGenerationJob,
// which returns immediately with an id; the client polls getGenerationJob and can
// stop it with cancelGenerationJob. The job owns the time budget (a generous
// safety cap) so a slow prompt is no longer bound to a single HTTP request.

import { randomUUID } from "node:crypto";

import { handleGenerateRequest } from "@/lib/ai/generate";
import type { GeneratedChange } from "@/lib/project/types";

export type JobStatus = "running" | "done" | "error" | "cancelled";

interface JobRecord {
  status: JobStatus;
  change?: GeneratedChange;
  error?: string;
  createdAt: number;
  controller: AbortController;
  capTimer?: ReturnType<typeof setTimeout>;
}

export interface JobSnapshot {
  status: JobStatus;
  change?: GeneratedChange;
  error?: string;
}

/** How long a stuck job may run before it is force-aborted (override via env). */
function safetyCapMs(): number {
  const raw = Number(process.env.TELAR_GENERATION_MAX_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20 * 60_000;
}

/** How long a finished job is kept so a reloading client can still read it. */
const RETENTION_MS = 10 * 60_000;

// Survive Next dev hot-reload by hanging the store off globalThis.
const globalStore = globalThis as typeof globalThis & {
  __telarGenJobs?: Map<string, JobRecord>;
};
const store: Map<string, JobRecord> =
  globalStore.__telarGenJobs ?? (globalStore.__telarGenJobs = new Map());

export function createGenerationJob(body: unknown): string {
  const id = randomUUID();
  const controller = new AbortController();
  const record: JobRecord = { status: "running", createdAt: Date.now(), controller };
  store.set(id, record);

  record.capTimer = setTimeout(() => {
    if (record.status === "running") {
      controller.abort();
      settle(id, { status: "error", error: "A geração excedeu o tempo máximo." });
    }
  }, safetyCapMs());

  void handleGenerateRequest(body, fetch, undefined, controller.signal)
    .then((result) => settle(id, { status: "done", change: result.change }))
    .catch((error) => settle(id, { status: "error", error: errorMessage(error) }));

  return id;
}

export function getGenerationJob(id: string): JobSnapshot | undefined {
  const record = store.get(id);
  if (!record) return undefined;
  return { status: record.status, change: record.change, error: record.error };
}

/** Aborts a running job. Returns false if the job is unknown. */
export function cancelGenerationJob(id: string): boolean {
  const record = store.get(id);
  if (!record) return false;
  if (record.status === "running") {
    record.status = "cancelled";
    record.controller.abort();
    if (record.capTimer) clearTimeout(record.capTimer);
    scheduleCleanup(id);
  }
  return true;
}

/** Applies a terminal result — unless the job was already cancelled. */
function settle(id: string, patch: Omit<JobSnapshot, "change"> & { change?: GeneratedChange }): void {
  const record = store.get(id);
  if (!record || record.status !== "running") return;
  record.status = patch.status;
  record.change = patch.change;
  record.error = patch.error;
  if (record.capTimer) clearTimeout(record.capTimer);
  scheduleCleanup(id);
}

function scheduleCleanup(id: string): void {
  setTimeout(() => store.delete(id), RETENTION_MS);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Falha na geração.";
}
