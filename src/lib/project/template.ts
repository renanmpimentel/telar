import type { ProjectFileMap } from "@/lib/project/types";

export function createDefaultProjectFiles(): ProjectFileMap {
  return {
    "package.json": JSON.stringify(
      {
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "tsc --noEmit && vite build",
          preview: "vite preview --host 0.0.0.0",
        },
        dependencies: {
          "lucide-react": "^1.17.0",
          react: "^19.2.7",
          "react-dom": "^19.2.7",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^6.0.2",
          typescript: "^5.9.3",
          vite: "^8.0.16",
        },
      },
      null,
      2,
    ),
    "index.html": `<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
`,
    "tsconfig.json": JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          useDefineForClassFields: true,
          lib: ["DOM", "DOM.Iterable", "ES2022"],
          allowJs: false,
          skipLibCheck: true,
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          module: "ESNext",
          moduleResolution: "Bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`,
    "src/main.tsx": `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
    "src/App.tsx": `export default function App() {
  return (
    <main className="shell">
      <section className="panel">
        <p className="eyebrow">figma-fake</p>
        <h1>Start by asking the assistant for a UI.</h1>
        <p>
          Generated React files will replace this starter screen while the Vite
          preview keeps the last valid project state.
        </p>
      </section>
    </main>
  );
}
`,
    "src/styles.css": `:root {
  color: #171717;
  background: #f7f5ef;
  font-family: Avenir Next, Seravek, Segoe UI, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
}

.shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    linear-gradient(135deg, rgba(39, 184, 139, 0.12), transparent 38%),
    linear-gradient(315deg, rgba(240, 107, 77, 0.16), transparent 42%),
    #f7f5ef;
}

.panel {
  width: min(720px, 100%);
  border: 1px solid #d7d2c4;
  background: rgba(255, 255, 255, 0.72);
  padding: clamp(28px, 6vw, 64px);
  box-shadow: 0 24px 80px rgba(23, 23, 23, 0.08);
}

.eyebrow {
  color: #157f64;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-family: Charter, Georgia, serif;
  font-size: clamp(2.25rem, 7vw, 5rem);
  line-height: 0.95;
  letter-spacing: 0;
}

p {
  color: #555047;
  font-size: 1.05rem;
  line-height: 1.65;
}
`,
  };
}
