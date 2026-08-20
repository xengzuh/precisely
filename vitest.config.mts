import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Picks up the "@/..." aliases from tsconfig.json so tests import the same
    // paths the app does.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
})
