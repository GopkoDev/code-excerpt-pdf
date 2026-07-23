import { describe, expect, it } from "vitest"

import { createVendoredResolver } from "@/lib/vendored"
import { parseGitattributes } from "@/lib/vendored/gitattributes"
import { shadcnUiFolder } from "@/lib/vendored/plugins/shadcn"
import { structuralLayer } from "@/lib/vendored/structural"

describe("structuralLayer", () => {
  const structural = structuralLayer()

  it.each([
    "node_modules/react/index.js",
    "dist/bundle.js",
    ".next/static/chunk.js",
    "coverage/lcov-report/index.html",
    "package-lock.json",
    "src/vendor/thing.js",
    "public/vendor/pdfkit.standalone.js",
  ])("flags %s", (path) => {
    expect(structural(path)?.vendored).toBe(true)
  })

  it.each([
    "src/app.ts",
    "lib/pdf/render.ts",
    "components/theme-provider.tsx",
    "node_modules_notes.md",
  ])("abstains on %s", (path) => {
    expect(structural(path)).toBeNull()
  })

  it("says which rule fired, so the UI can explain itself", () => {
    expect(structural("dist/a.js")?.reason).toMatch(/dist/)
  })
})

describe("parseGitattributes", () => {
  it("reads linguist-vendored", () => {
    expect(parseGitattributes("docs/* linguist-vendored")).toEqual([
      { pattern: "docs/*", vendored: true },
    ])
  })

  it("treats linguist-generated as vendored too", () => {
    expect(parseGitattributes("api.ts linguist-generated")[0].vendored).toBe(
      true
    )
  })

  it("honours an explicit negation", () => {
    expect(parseGitattributes("src/* -linguist-vendored")[0].vendored).toBe(
      false
    )
  })

  it("ignores comments, blank lines and unrelated attributes", () => {
    const parsed = parseGitattributes(
      ["# a comment", "", "*.png binary", "docs/* linguist-vendored"].join("\n")
    )
    expect(parsed).toHaveLength(1)
  })

  it("returns nothing for an empty file", () => {
    expect(parseGitattributes("")).toEqual([])
  })
})

describe("shadcnUiFolder", () => {
  it("resolves the ui alias to a repo path", () => {
    const json = JSON.stringify({ aliases: { ui: "@/components/ui" } })
    expect(shadcnUiFolder(json)).toBe("components/ui")
  })

  it("returns null when there is no components.json", () => {
    expect(shadcnUiFolder(undefined)).toBeNull()
  })

  it("returns null for malformed JSON rather than throwing", () => {
    expect(shadcnUiFolder("{ not json")).toBeNull()
  })

  it("returns null when the alias is missing", () => {
    expect(shadcnUiFolder(JSON.stringify({ style: "base-nova" }))).toBeNull()
  })
})

describe("createVendoredResolver — precedence", () => {
  const componentsJson = JSON.stringify({ aliases: { ui: "@/components/ui" } })

  it("flags shadcn's ui folder via components.json", () => {
    const resolve = createVendoredResolver({ componentsJson })
    const verdict = resolve("components/ui/button.tsx")
    expect(verdict?.vendored).toBe(true)
    expect(verdict?.source).toBe("plugin")
  })

  it("lets .gitattributes beat the shadcn plugin", () => {
    const resolve = createVendoredResolver({
      componentsJson,
      gitattributes: "components/ui/* -linguist-vendored",
    })
    const verdict = resolve("components/ui/button.tsx")
    expect(verdict?.vendored).toBe(false)
    expect(verdict?.source).toBe("gitattributes")
  })

  it("lets a manual override beat .gitattributes", () => {
    const resolve = createVendoredResolver({
      gitattributes: "src/* linguist-vendored",
      overrides: [{ path: "src/a.ts", scope: "file", vendored: false }],
    })
    expect(resolve("src/a.ts")?.source).toBe("manual")
    expect(resolve("src/a.ts")?.vendored).toBe(false)
    expect(resolve("src/b.ts")?.source).toBe("gitattributes")
  })

  it("lets .gitattributes beat the structural list", () => {
    const resolve = createVendoredResolver({
      gitattributes: "dist/* -linguist-vendored",
    })
    expect(resolve("dist/a.js")?.vendored).toBe(false)
    expect(resolve("dist/a.js")?.source).toBe("gitattributes")
  })

  it("abstains on an ordinary authored file", () => {
    expect(createVendoredResolver({})("src/app.ts")).toBeNull()
  })
})

describe("createVendoredResolver — manual overrides", () => {
  it("cascades a folder override to descendants", () => {
    const resolve = createVendoredResolver({
      overrides: [{ path: "src/legacy", scope: "folder", vendored: true }],
    })
    expect(resolve("src/legacy/a.ts")?.vendored).toBe(true)
    expect(resolve("src/legacy/deep/b.ts")?.vendored).toBe(true)
    expect(resolve("src/current/a.ts")).toBeNull()
  })

  /**
   * The cascade must be evaluated per query, not baked in when the rule is
   * created — otherwise a file that appears later escapes its folder's rule.
   */
  it("cascades to files that did not exist when the rule was made", () => {
    const resolve = createVendoredResolver({
      overrides: [{ path: "src/legacy", scope: "folder", vendored: true }],
    })
    expect(resolve("src/legacy/added-later.ts")?.vendored).toBe(true)
  })

  it("lets a file override beat the folder it sits in", () => {
    const resolve = createVendoredResolver({
      overrides: [
        { path: "src/legacy", scope: "folder", vendored: true },
        { path: "src/legacy/keep.ts", scope: "file", vendored: false },
      ],
    })
    expect(resolve("src/legacy/keep.ts")?.vendored).toBe(false)
    expect(resolve("src/legacy/other.ts")?.vendored).toBe(true)
  })

  it("prefers the deepest folder override when two nest", () => {
    const resolve = createVendoredResolver({
      overrides: [
        { path: "src", scope: "folder", vendored: true },
        { path: "src/keep", scope: "folder", vendored: false },
      ],
    })
    expect(resolve("src/keep/a.ts")?.vendored).toBe(false)
    expect(resolve("src/other/a.ts")?.vendored).toBe(true)
  })

  /** SPEC: unmarking a file the parser flagged must stick. */
  it("unmarks a structurally flagged file when the user says so", () => {
    const resolve = createVendoredResolver({
      overrides: [{ path: "dist/keep.js", scope: "file", vendored: false }],
    })
    expect(resolve("dist/keep.js")?.vendored).toBe(false)
    expect(resolve("dist/other.js")?.vendored).toBe(true)
  })
})
