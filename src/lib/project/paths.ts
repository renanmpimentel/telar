export type PathValidationResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

const EXACT_ALLOWED_PATHS = new Set([
  "package.json",
  "index.html",
  "vite.config.ts",
  "tsconfig.json",
  "src/main.tsx",
  "src/App.tsx",
  "src/styles.css",
]);

const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".json",
  ".md",
  ".svg",
  ".ts",
  ".tsx",
]);

export const APPROVED_PACKAGE_DEPENDENCIES = new Set([
  "@vitejs/plugin-react",
  "lucide-react",
  "react",
  "react-dom",
  "typescript",
  "vite",
]);

export function validateProjectPath(filePath: string): PathValidationResult {
  if (!filePath || filePath.length > 240) {
    return invalidPath(filePath);
  }

  if (
    filePath.startsWith("/") ||
    filePath.startsWith("./") ||
    filePath.includes("\\") ||
    filePath.includes("\0") ||
    filePath.includes("//")
  ) {
    return invalidPath(filePath);
  }

  const parts = filePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    return invalidPath(filePath);
  }

  if (EXACT_ALLOWED_PATHS.has(filePath)) {
    return { ok: true, path: filePath };
  }

  if (!filePath.startsWith("src/")) {
    return invalidPath(filePath);
  }

  const extension = getExtension(filePath);
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return invalidPath(filePath);
  }

  return { ok: true, path: filePath };
}

export function assertValidProjectPath(filePath: string): string {
  const result = validateProjectPath(filePath);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.path;
}

export function validatePackageJson(content: string): PathValidationResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, error: "package.json must be valid JSON" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "package.json must be a JSON object" };
  }

  const packageJson = parsed as Record<string, unknown>;
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = packageJson[field];
    if (!dependencies) continue;
    if (typeof dependencies !== "object" || Array.isArray(dependencies)) {
      return { ok: false, error: `${field} must be an object` };
    }

    for (const dependencyName of Object.keys(dependencies)) {
      if (!APPROVED_PACKAGE_DEPENDENCIES.has(dependencyName)) {
        return {
          ok: false,
          error: `Dependency "${dependencyName}" is not approved for this MVP`,
        };
      }
    }
  }

  return { ok: true, path: "package.json" };
}

function invalidPath(filePath: string): PathValidationResult {
  return { ok: false, error: `Invalid project path: ${filePath || "<empty>"}` };
}

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot);
}
