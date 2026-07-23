import { describe, expect, it } from "vitest"

import { matchesGlob } from "@/lib/vendored/glob"

describe("matchesGlob", () => {
  it("matches an exact path", () => {
    expect(matchesGlob("src/a.ts", "src/a.ts")).toBe(true)
    expect(matchesGlob("src/b.ts", "src/a.ts")).toBe(false)
  })

  it("treats a bare name as matching at any depth, like .gitignore", () => {
    expect(matchesGlob("node_modules/x/y.js", "node_modules")).toBe(true)
    expect(matchesGlob("a/b/node_modules/x.js", "node_modules")).toBe(true)
    expect(matchesGlob("src/a.ts", "node_modules")).toBe(false)
  })

  it("does not let a bare name match a partial segment", () => {
    expect(matchesGlob("node_modules_old/x.js", "node_modules")).toBe(false)
    expect(matchesGlob("src/libs/a.ts", "lib")).toBe(false)
  })

  it("matches * within a single segment only", () => {
    expect(matchesGlob("src/a.min.js", "*.min.js")).toBe(true)
    expect(matchesGlob("a.min.js", "*.min.js")).toBe(true)
    expect(matchesGlob("src/deep/a.min.js", "src/*.min.js")).toBe(false)
  })

  it("matches ** across segments", () => {
    expect(matchesGlob("src/deep/nested/a.ts", "src/**")).toBe(true)
    expect(matchesGlob("src/a.ts", "src/**")).toBe(true)
    expect(matchesGlob("other/a.ts", "src/**")).toBe(false)
  })

  it("matches a rooted pattern only at the root", () => {
    expect(matchesGlob("dist/a.js", "/dist")).toBe(true)
    expect(matchesGlob("packages/x/dist/a.js", "/dist")).toBe(false)
  })

  it("matches a trailing-slash pattern as a folder", () => {
    expect(matchesGlob("dist/a.js", "dist/")).toBe(true)
    expect(matchesGlob("dist", "dist/")).toBe(false)
  })

  it("matches a folder prefix path", () => {
    expect(matchesGlob("components/ui/button.tsx", "components/ui")).toBe(true)
    expect(matchesGlob("components/uix/button.tsx", "components/ui")).toBe(
      false
    )
  })

  it("is not confused by a leading ./", () => {
    expect(matchesGlob("./src/a.ts", "src/a.ts")).toBe(true)
  })

  it("handles an empty pattern by never matching", () => {
    expect(matchesGlob("src/a.ts", "")).toBe(false)
  })

  it("escapes regex metacharacters in literal segments", () => {
    expect(matchesGlob("src/a+b.ts", "src/a+b.ts")).toBe(true)
    expect(matchesGlob("src/axb.ts", "src/a+b.ts")).toBe(false)
  })
})
