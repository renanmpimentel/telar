import JSZip from "jszip";

import { assertValidReferencePath, decodeBase64ToUint8Array } from "@/lib/project/references";
import { assertValidProjectPath } from "@/lib/project/paths";
import type { ProjectFileMap, ProjectReference } from "@/lib/project/types";

export async function buildProjectZip(
  files: ProjectFileMap,
  references: ProjectReference[] = [],
): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const [filePath, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    zip.file(assertValidProjectPath(filePath), content);
  }

  for (const reference of references
    .filter((candidate) => candidate.kind === "binary")
    .sort((a, b) => a.projectPath.localeCompare(b.projectPath))) {
    if (!reference.dataBase64) continue;
    zip.file(assertValidReferencePath(reference.projectPath), decodeBase64ToUint8Array(reference.dataBase64));
  }

  return zip.generateAsync({ type: "uint8array" });
}

export async function downloadProjectZip(
  files: ProjectFileMap,
  projectName: string,
  references: ProjectReference[] = [],
): Promise<void> {
  const archive = await buildProjectZip(files, references);
  const blob = new Blob([new Uint8Array(archive)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${telarProjectSlug(projectName)}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Zips an already-built file map (e.g. a Vite `dist/`) into a deployable archive. */
export async function zipStaticFiles(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [filePath, data] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    zip.file(filePath, data);
  }
  return zip.generateAsync({ type: "uint8array" });
}

/**
 * Deploy/download identifier for a project. Always `telar-` prefixed and derived
 * from the project name; falls back to `telar-app-XXXX` when the project has no
 * real name yet (empty or still the default "Untitled Project").
 */
export function telarProjectSlug(name: string): string {
  const base = slugifyBase(name);
  const core = base && base !== "untitled-project" ? base : `app-${randomSuffix()}`;
  // Avoid telar-telar-... when the name already leads with "telar".
  return core.startsWith("telar") ? core : `telar-${core}`;
}

function slugifyBase(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 72);
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
