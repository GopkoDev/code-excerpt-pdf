import { describe, expect, it } from "vitest"

import {
  buildTree,
  commonRoot,
  flattenFiles,
  folderAt,
} from "@/lib/tree/build"
import type { FileEntry } from "@/lib/tree/types"

const entry = (path: string, sizeBytes = 100): FileEntry => ({
  path,
  name: path.split("/").pop()!,
  sizeBytes,
  status: "available",
})

describe("buildTree", () => {
  it("nests files under their folders", () => {
    const tree = buildTree([entry("src/a.ts"), entry("src/lib/b.ts")])

    expect(tree).toHaveLength(1)
    const src = tree[0]
    expect(src.kind).toBe("folder")
    expect(src.name).toBe("src")
    expect(src.kind === "folder" && src.children.map((c) => c.name)).toEqual([
      "lib",
      "a.ts",
    ])
  })

  it("puts folders before files, each alphabetically", () => {
    const tree = buildTree([
      entry("z.ts"),
      entry("a.ts"),
      entry("beta/x.ts"),
      entry("alpha/y.ts"),
    ])
    expect(tree.map((n) => n.name)).toEqual(["alpha", "beta", "a.ts", "z.ts"])
  })

  it("keeps root-level files at the root", () => {
    const tree = buildTree([entry("README.md")])
    expect(tree).toHaveLength(1)
    expect(tree[0].kind).toBe("file")
  })

  it("handles an empty input", () => {
    expect(buildTree([])).toEqual([])
  })

  it("sums descendant sizes onto folders, including nested ones", () => {
    const tree = buildTree([
      entry("src/a.ts", 100),
      entry("src/lib/b.ts", 250),
      entry("src/lib/deep/c.ts", 400),
    ])
    const src = tree[0]
    expect(src.kind === "folder" && src.sizeBytes).toBe(750)
    expect(src.kind === "folder" && src.fileCount).toBe(3)
  })

  it("counts only available files as selectable", () => {
    const tree = buildTree([
      entry("src/a.ts"),
      { ...entry("src/b.ts"), status: "used" },
      { ...entry("src/c.ts"), status: "vendored" },
    ])
    const src = tree[0]
    expect(src.kind === "folder" && src.fileCount).toBe(3)
    expect(src.kind === "folder" && src.availableCount).toBe(1)
  })

  it("gives every node a unique path", () => {
    const tree = buildTree([entry("src/a.ts"), entry("src/lib/b.ts")])
    const paths = flattenFiles(tree).map((f) => f.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it("does not collapse two folders that share a name prefix", () => {
    const tree = buildTree([entry("lib/a.ts"), entry("libs/b.ts")])
    expect(tree.map((n) => n.name)).toEqual(["lib", "libs"])
  })

  it("tolerates a leading ./ and duplicate slashes", () => {
    const tree = buildTree([entry("./src//a.ts")])
    expect(flattenFiles(tree).map((f) => f.path)).toEqual(["src/a.ts"])
  })
})

describe("flattenFiles", () => {
  it("returns every file in the tree, depth first", () => {
    const tree = buildTree([
      entry("src/lib/b.ts"),
      entry("src/a.ts"),
      entry("z.ts"),
    ])
    expect(flattenFiles(tree).map((f) => f.path)).toEqual([
      "src/lib/b.ts",
      "src/a.ts",
      "z.ts",
    ])
  })

  it("returns nothing for an empty tree", () => {
    expect(flattenFiles([])).toEqual([])
  })
})

describe("folderAt", () => {
  it("finds a nested folder by path", () => {
    const tree = buildTree([entry("src/lib/b.ts")])
    expect(folderAt(tree, "src/lib")?.name).toBe("lib")
  })

  it("returns undefined for an unknown path", () => {
    expect(folderAt(buildTree([entry("a.ts")]), "nope")).toBeUndefined()
  })
})

describe("commonRoot", () => {
  it("finds the shared top folder of a dropped directory", () => {
    expect(commonRoot(["proj/src/a.ts", "proj/docs/b.md"])).toBe("proj")
  })

  it("goes as deep as the paths agree", () => {
    expect(commonRoot(["proj/src/a.ts", "proj/src/b.ts"])).toBe("proj/src")
  })

  it("is empty when files were picked from different roots", () => {
    expect(commonRoot(["a/x.ts", "b/y.ts"])).toBe("")
  })

  it("is empty for loose files with no folder at all", () => {
    expect(commonRoot(["a.ts", "b.ts"])).toBe("")
  })

  it("never swallows the whole path of a single file", () => {
    expect(commonRoot(["proj/src/a.ts"])).toBe("proj/src")
  })

  it("is empty for no files", () => {
    expect(commonRoot([])).toBe("")
  })
})
