import { describe, expect, it } from "vitest";

import { validateProjectPath } from "@/lib/project/paths";

describe("validateProjectPath", () => {
  it("accepts template and source file paths", () => {
    const validPaths = [
      "package.json",
      "index.html",
      "vite.config.ts",
      "tsconfig.json",
      "src/main.tsx",
      "src/App.tsx",
      "src/styles.css",
      "src/components/Button.tsx",
      "src/assets/logo.svg",
    ];

    for (const filePath of validPaths) {
      expect(validateProjectPath(filePath)).toEqual({ ok: true, path: filePath });
    }
  });

  it("rejects path traversal and paths outside the project surface", () => {
    const invalidPaths = [
      "../package.json",
      "src/../package.json",
      "/etc/passwd",
      "src\\App.tsx",
      "node_modules/react/index.js",
      "src/.env",
      "public/secret.txt",
      "src//App.tsx",
      "./src/App.tsx",
      "",
    ];

    for (const filePath of invalidPaths) {
      expect(validateProjectPath(filePath).ok, filePath).toBe(false);
    }
  });
});
