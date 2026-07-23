import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // Vitest does NOT read tsconfig.json `paths` by default — without this
    // every `@/*` import fails to resolve. lib/utils.test.ts guards it.
    // (Vite 8 resolves this natively; `vite-tsconfig-paths` is not needed.)
    tsconfigPaths: true,
  },
  test: {
    // `node` is the default because the bulk of the suite is pdfkit and pure
    // logic. A file that needs a DOM opts in with a `// @vitest-environment
    // jsdom` docblock, which keeps the two out of one another's way without
    // splitting the config into projects.
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
  },
})
