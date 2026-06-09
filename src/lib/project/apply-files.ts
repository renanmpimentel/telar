import { GeneratedChangeSchema } from "@/lib/project/schema";
import { validateGeneratedProjectPath, validatePackageJson } from "@/lib/project/paths";
import type { GeneratedChange, ProjectFileMap } from "@/lib/project/types";

export type ApplyGeneratedChangeResult =
  | {
      ok: true;
      files: ProjectFileMap;
      changedPaths: string[];
      change: GeneratedChange;
    }
  | {
      ok: false;
      files: ProjectFileMap;
      error: string;
    };

export function applyGeneratedChange(
  currentFiles: ProjectFileMap,
  change: unknown,
): ApplyGeneratedChangeResult {
  const parsed = GeneratedChangeSchema.safeParse(change);
  if (!parsed.success) {
    return {
      ok: false,
      files: currentFiles,
      error: parsed.error.issues.map((issue) => issue.message).join("; "),
    };
  }

  const nextFiles = { ...currentFiles };
  const changedPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const file of parsed.data.files) {
    const pathResult = validateGeneratedProjectPath(file.path);
    if (!pathResult.ok) {
      return { ok: false, files: currentFiles, error: pathResult.error };
    }

    if (seenPaths.has(pathResult.path)) {
      return {
        ok: false,
        files: currentFiles,
        error: `Duplicate generated file path: ${pathResult.path}`,
      };
    }

    if (pathResult.path === "package.json") {
      const packageResult = validatePackageJson(file.content);
      if (!packageResult.ok) {
        return { ok: false, files: currentFiles, error: packageResult.error };
      }
    }

    seenPaths.add(pathResult.path);
    nextFiles[pathResult.path] = file.content;
    changedPaths.push(pathResult.path);
  }

  return {
    ok: true,
    files: nextFiles,
    changedPaths,
    change: parsed.data,
  };
}
