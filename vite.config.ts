import { defineConfig } from "vitest/config";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) {
            return "three";
          }

          if (id.includes("@dimforge/rapier3d-compat")) {
            return "rapier";
          }

          if (id.includes("/src/")) {
            return "game-core";
          }

          return undefined;
        }
      }
    }
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"]
    }
  }
});
