import JSZip from "jszip";

import { assertValidProjectPath } from "@/lib/project/paths";
import type { ProjectFileMap } from "@/lib/project/types";

export async function buildProjectZip(files: ProjectFileMap): Promise<Uint8Array> {
  const zip = new JSZip();

  for (const [filePath, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    zip.file(assertValidProjectPath(filePath), content);
  }

  return zip.generateAsync({ type: "uint8array" });
}

export async function downloadProjectZip(files: ProjectFileMap, projectName: string): Promise<void> {
  const archive = await buildProjectZip(files);
  const blob = new Blob([new Uint8Array(archive)], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(projectName || "figma-fake-project")}.zip`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "figma-fake-project";
}
