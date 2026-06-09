import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { buildProjectZip } from "@/lib/export/zip";
import { createDefaultProjectFiles } from "@/lib/project/template";

describe("buildProjectZip", () => {
  it("exports all project files", async () => {
    const files = createDefaultProjectFiles();
    files["src/App.tsx"] = "export default function App() { return <main>Exported</main>; }";

    const archive = await buildProjectZip(files);
    const zip = await JSZip.loadAsync(archive);

    await expect(zip.file("src/App.tsx")?.async("string")).resolves.toContain("Exported");
    expect(zip.file("package.json")).toBeTruthy();
    expect(zip.file("index.html")).toBeTruthy();
  });

  it("rejects unsafe paths before creating the archive", async () => {
    await expect(
      buildProjectZip({ "../secret.txt": "nope" }),
    ).rejects.toThrow(/Invalid project path/);
  });
});
