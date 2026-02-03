import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globalSetup: "test/vi.test.setup.global.ts",
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    fileParallelism: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "test/",
        "build/",
        "cdk/",
        "cdk.out/",
        "**/*.config.*",
      ],
    },
  },
});
