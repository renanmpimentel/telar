import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearProjectStorageForTests,
  createProject,
  loadProject,
  listProjectSummaries,
  saveProject,
  saveProviderPreferences,
} from "@/lib/storage/projects";

describe("project persistence", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearProjectStorageForTests();
  });

  it("stores and loads projects with messages and files", async () => {
    const project = createProject("Landing page");
    project.messages.push({ id: "m1", role: "user", content: "Make a pricing UI" });
    project.files["src/App.tsx"] = "export default function App() { return <main>Pricing</main>; }";

    await saveProject(project);

    const loaded = await loadProject(project.id);
    expect(loaded?.name).toBe("Landing page");
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.files["src/App.tsx"]).toContain("Pricing");
  });

  it("lists summaries without duplicating file payloads", async () => {
    const project = createProject("Workspace");
    await saveProject(project);

    const summaries = await listProjectSummaries();

    expect(summaries).toEqual([
      expect.objectContaining({ id: project.id, name: "Workspace" }),
    ]);
    expect(summaries[0]).not.toHaveProperty("files");
  });

  it("does not persist BYOK API keys in provider preferences", () => {
    saveProviderPreferences({
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "test-secret",
    });

    expect(localStorage.getItem("like-figma.provider")).not.toContain("test-secret");
  });
});
