import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { buildProjectZip } from "@/lib/export/zip";
import { createDefaultProjectFiles } from "@/lib/project/template";
import type { ProjectReference } from "@/lib/project/types";

describe("buildProjectZip", () => {
  it("exports all project files", async () => {
    const files = createDefaultProjectFiles();
    files["src/App.tsx"] = "export default function App() { return <main>Exported</main>; }";
    files["src/references/brief.md"] = "# Brief\nUse the reference.";
    const references: ProjectReference[] = [
      {
        id: "ref-1",
        name: "hero.png",
        mimeType: "image/png",
        size: 4,
        kind: "binary",
        projectPath: "src/references/hero.png",
        createdAt: "2026-06-09T12:00:00.000Z",
        dataBase64: "AQIDBA==",
      },
    ];

    const archive = await buildProjectZip(files, references);
    const zip = await JSZip.loadAsync(archive);

    await expect(zip.file("src/App.tsx")?.async("string")).resolves.toContain("Exported");
    await expect(zip.file("src/references/brief.md")?.async("string")).resolves.toContain("Brief");
    await expect(zip.file("src/references/hero.png")?.async("uint8array")).resolves.toEqual(
      Uint8Array.from([1, 2, 3, 4]),
    );
    expect(zip.file("package.json")).toBeTruthy();
    expect(zip.file("index.html")).toBeTruthy();
  });

  it("rejects unsafe paths before creating the archive", async () => {
    await expect(
      buildProjectZip({ "../secret.txt": "nope" }),
    ).rejects.toThrow(/Invalid project path/);
  });
});
