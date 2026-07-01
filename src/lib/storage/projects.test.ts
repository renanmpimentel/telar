import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  clearProjectStorageForTests,
  createProject,
  loadProject,
  listProjectSummaries,
  loadProviderPreferences,
  migrateProject,
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
    project.references.push({
      id: "ref-1",
      name: "brief.md",
      mimeType: "text/markdown",
      size: 7,
      kind: "text",
      projectPath: "src/references/brief.md",
      createdAt: "2026-06-09T12:00:00.000Z",
    });

    await saveProject(project);

    const loaded = await loadProject(project.id);
    expect(loaded?.name).toBe("Landing page");
    expect(loaded?.messages).toHaveLength(1);
    expect(loaded?.files["src/App.tsx"]).toContain("Pricing");
    expect(loaded?.references).toHaveLength(1);
  });

  it("migrates older project records without references", () => {
    const oldProject = createProject("Old project");
    const projectWithoutReferences = { ...oldProject } as Partial<typeof oldProject>;
    delete projectWithoutReferences.references;

    const migrated = migrateProject(projectWithoutReferences);

    expect(migrated.references).toEqual([]);
    expect(migrated.files["src/App.tsx"]).toContain("Start by asking");
  });

  it("creates projects with the built-in frontend-design generation skill", () => {
    const project = createProject("Skilled project");

    expect(project.generationSkill).toEqual({
      source: "builtin",
      name: "frontend-design",
    });
  });

  it("migrates older project records without a generation skill", () => {
    const oldProject = createProject("Old project");
    const projectWithoutSkill = { ...oldProject } as Partial<typeof oldProject>;
    delete projectWithoutSkill.generationSkill;

    const migrated = migrateProject(projectWithoutSkill);

    expect(migrated.generationSkill).toEqual({
      source: "builtin",
      name: "frontend-design",
    });
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

  it("carrega preferências de provider CLI com modelo vazio", () => {
    localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "claude-cli", model: "" }));
    const prefs = loadProviderPreferences();
    expect(prefs).toEqual({ provider: "claude-cli", model: "" });
  });

  it("rejeita openai com model vazio", () => {
    localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "openai", model: "" }));
    expect(loadProviderPreferences()).toBeUndefined();
  });

  it("rejeita anthropic com model vazio", () => {
    localStorage.setItem("like-figma.provider", JSON.stringify({ provider: "anthropic", model: "" }));
    expect(loadProviderPreferences()).toBeUndefined();
  });
});
