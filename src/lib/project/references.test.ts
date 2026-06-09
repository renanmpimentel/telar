import { describe, expect, it } from "vitest";

import {
  addReferenceUploads,
  MAX_PROJECT_REFERENCES,
  MAX_REFERENCE_TOTAL_BYTES,
  ReferenceValidationError,
  validateReferencePath,
} from "@/lib/project/references";
import { createProject } from "@/lib/storage/projects";

const fixedNow = "2026-06-09T12:00:00.000Z";

function fixedOptions() {
  return {
    now: fixedNow,
    createId: (() => {
      let nextId = 0;
      return () => `ref-${++nextId}`;
    })(),
  };
}

describe("project references", () => {
  it("sanitizes upload names and stores text references as editable project files", () => {
    const project = createProject("References");

    const nextProject = addReferenceUploads(
      project,
      [
        {
          name: "Design Brief.md",
          mimeType: "text/markdown",
          size: 18,
          content: "# Brief\nUse blue.",
        },
        {
          name: "Hero Shot.PNG",
          mimeType: "image/png",
          size: 4,
          dataBase64: "AQIDBA==",
        },
      ],
      fixedOptions(),
    );

    expect(nextProject.references).toEqual([
      expect.objectContaining({
        id: "ref-1",
        name: "Design Brief.md",
        kind: "text",
        projectPath: "src/references/design-brief.md",
        createdAt: fixedNow,
      }),
      expect.objectContaining({
        id: "ref-2",
        name: "Hero Shot.PNG",
        kind: "binary",
        mimeType: "image/png",
        projectPath: "src/references/hero-shot.png",
        dataBase64: "AQIDBA==",
      }),
    ]);
    expect(nextProject.files["src/references/design-brief.md"]).toBe("# Brief\nUse blue.");
    expect(nextProject.files["src/references/hero-shot.png"]).toBeUndefined();
  });

  it("uses an incremental suffix when sanitized paths collide", () => {
    const project = addReferenceUploads(
      createProject("References"),
      [{ name: "Design Brief.md", mimeType: "text/markdown", size: 7, content: "First" }],
      fixedOptions(),
    );

    const nextProject = addReferenceUploads(
      project,
      [{ name: "design-brief.md", mimeType: "text/markdown", size: 8, content: "Second" }],
      fixedOptions(),
    );

    expect(nextProject.references.map((reference) => reference.projectPath)).toEqual([
      "src/references/design-brief.md",
      "src/references/design-brief-2.md",
    ]);
    expect(nextProject.files["src/references/design-brief-2.md"]).toBe("Second");
  });

  it("rejects unsupported extensions, hidden names, traversal, and project limit overages", () => {
    const project = createProject("References");

    expect(() =>
      addReferenceUploads(
        project,
        [{ name: "secret.exe", mimeType: "application/octet-stream", size: 4, dataBase64: "AAAA" }],
        fixedOptions(),
      ),
    ).toThrow(ReferenceValidationError);

    expect(() =>
      addReferenceUploads(
        project,
        [{ name: "../.env", mimeType: "text/plain", size: 4, content: "SECRET=1" }],
        fixedOptions(),
      ),
    ).toThrow(/Invalid reference name/);

    const fullProject = {
      ...project,
      references: Array.from({ length: MAX_PROJECT_REFERENCES }, (_, index) => ({
        id: `ref-${index}`,
        name: `ref-${index}.txt`,
        mimeType: "text/plain",
        size: 1,
        kind: "text" as const,
        projectPath: `src/references/ref-${index}.txt`,
        createdAt: fixedNow,
      })),
    };
    expect(() =>
      addReferenceUploads(
        fullProject,
        [{ name: "extra.txt", mimeType: "text/plain", size: 1, content: "extra" }],
        fixedOptions(),
      ),
    ).toThrow(/10 references/);

    expect(() =>
      addReferenceUploads(
        project,
        [
          {
            name: "oversized.pdf",
            mimeType: "application/pdf",
            size: MAX_REFERENCE_TOTAL_BYTES + 1,
            dataBase64: "JVBERi0=",
          },
        ],
        fixedOptions(),
      ),
    ).toThrow(/25 MB/);
  });

  it("validates reference paths under src/references only", () => {
    expect(validateReferencePath("src/references/mockup.png")).toEqual({
      ok: true,
      path: "src/references/mockup.png",
    });
    expect(validateReferencePath("src/references/spec.pdf")).toEqual({
      ok: true,
      path: "src/references/spec.pdf",
    });
    expect(validateReferencePath("src/assets/mockup.png").ok).toBe(false);
    expect(validateReferencePath("src/references/.secret.txt").ok).toBe(false);
  });
});
