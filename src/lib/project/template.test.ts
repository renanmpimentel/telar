import { describe, expect, it } from "vitest";

import { createDefaultProjectFiles } from "@/lib/project/template";

describe("createDefaultProjectFiles", () => {
  it("main.tsx envolve o App em um error boundary", () => {
    const main = createDefaultProjectFiles()["src/main.tsx"];
    expect(main).toContain("getDerivedStateFromError");
    expect(main).toContain("<PreviewErrorBoundary>");
    expect(main).toContain("<App />");
  });

  it("package.json inclui lucide-react", () => {
    const pkg = JSON.parse(createDefaultProjectFiles()["package.json"]);
    expect(pkg.dependencies["lucide-react"]).toBeDefined();
  });
});
