import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    setupFiles: ["./vitest.setup.ts"],
    restoreMocks: true,
  },
});
