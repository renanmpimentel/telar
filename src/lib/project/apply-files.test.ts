import { describe, expect, it } from "vitest";

import { applyGeneratedChange } from "@/lib/project/apply-files";
import { createDefaultProjectFiles } from "@/lib/project/template";

describe("applyGeneratedChange", () => {
  it("applies full-file updates atomically", () => {
    const baseFiles = createDefaultProjectFiles();
    const result = applyGeneratedChange(baseFiles, {
      summary: "Create a dashboard",
      files: [
        {
          path: "src/App.tsx",
          content: "export default function App() { return <main>Dashboard</main>; }",
        },
        {
          path: "src/components/Metric.tsx",
          content: "export function Metric() { return <strong>42</strong>; }",
        },
      ],
      notes: [],
      errors: [],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changedPaths).toEqual(["src/App.tsx", "src/components/Metric.tsx"]);
    expect(result.files["src/App.tsx"]).toContain("Dashboard");
    expect(result.files["src/components/Metric.tsx"]).toContain("Metric");
    expect(baseFiles["src/App.tsx"]).not.toContain("Dashboard");
  });

  it("rejects unsafe paths without modifying files", () => {
    const baseFiles = createDefaultProjectFiles();
    const result = applyGeneratedChange(baseFiles, {
      summary: "Try to escape",
      files: [{ path: "../secrets.txt", content: "nope" }],
      notes: [],
      errors: [],
    });

    expect(result.ok).toBe(false);
    expect(baseFiles["src/App.tsx"]).toContain("Start by asking the assistant");
  });

  it("rejects package changes with unapproved dependencies", () => {
    const baseFiles = createDefaultProjectFiles();
    const nextPackage = JSON.parse(baseFiles["package.json"]) as Record<string, unknown>;
    nextPackage.dependencies = {
      ...(nextPackage.dependencies as Record<string, string>),
      lodash: "^4.17.21",
    };

    const result = applyGeneratedChange(baseFiles, {
      summary: "Add lodash",
      files: [{ path: "package.json", content: JSON.stringify(nextPackage, null, 2) }],
      notes: [],
      errors: [],
    });

    expect(result.ok).toBe(false);
  });
});
