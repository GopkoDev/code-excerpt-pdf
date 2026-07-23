import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Vitest does NOT read tsconfig.json `paths` by default — without this
    // every `@/*` import fails to resolve. lib/utils.test.ts guards it.
    // (Vite 8 resolves this natively; `vite-tsconfig-paths` is not needed.)
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
