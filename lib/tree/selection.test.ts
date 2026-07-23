import { describe, expect, it } from "vitest"

import { buildTree, folderAt } from "@/lib/tree/build"
import {
  deselectFolder,
  nodeState,
  selectFolder,
  toggleFile,
} from "@/lib/tree/selection"
import type { FileEntry, FileStatus } from "@/lib/tree/types"

const entry = (path: string, status: FileStatus = "available"): FileEntry => ({
  path,
  name: path.split("/").pop()!,
  sizeBytes: 100,
  status,
})

const TREE = buildTree([
  entry("src/a.ts"),
  entry("src/b.ts"),
  entry("src/used.ts", "used"),
  entry("src/vendor.ts", "vendored"),
  entry("docs/readme.md"),
])

const src = () => folderAt(TREE, "src")!

describe("nodeState", () => {
  it("is none when nothing is selected", () => {
    expect(nodeState(src(), new Set())).toBe("none")
  })

  it("is partial when some available files are selected", () => {
    expect(nodeState(src(), new Set(["src/a.ts"]))).toBe("partial")
  })

  it("is all when every AVAILABLE file is selected, ignoring the rest", () => {
    // used.ts and vendor.ts cannot be bulk-selected, so they must not keep
    // the folder from reading as fully selected.
    expect(nodeState(src(), new Set(["src/a.ts", "src/b.ts"]))).toBe("all")
  })

  it("is none for a folder with nothing available", () => {
    const tree = buildTree([entry("x/only.ts", "used")])
    expect(nodeState(folderAt(tree, "x")!, new Set())).toBe("none")
  })

  it("stays none for an unselectable folder even if that file is selected", () => {
    const tree = buildTree([entry("x/only.ts", "used")])
    expect(nodeState(folderAt(tree, "x")!, new Set(["x/only.ts"]))).toBe("none")
  })

  it("reports file nodes as all or none", () => {
    const file = src().children.find((c) => c.name === "a.ts")!
    expect(nodeState(file, new Set())).toBe("none")
    expect(nodeState(file, new Set(["src/a.ts"]))).toBe("all")
  })

  it("rolls nested folders up into the parent", () => {
    const tree = buildTree([entry("p/q/deep.ts"), entry("p/top.ts")])
    const p = folderAt(tree, "p")!
    expect(nodeState(p, new Set(["p/top.ts"]))).toBe("partial")
    expect(nodeState(p, new Set(["p/top.ts", "p/q/deep.ts"]))).toBe("all")
  })
})

describe("selectFolder", () => {
  it("adds only available files and reports what it skipped", () => {
    const result = selectFolder(src(), new Set())

    expect([...result.selected].sort()).toEqual(["src/a.ts", "src/b.ts"])
    expect(result.added).toBe(2)
    expect(result.skippedUsed).toBe(1)
    expect(result.skippedVendored).toBe(1)
  })

  it("counts used-but-changed as used", () => {
    const tree = buildTree([entry("x/a.ts", "used-but-changed")])
    const result = selectFolder(folderAt(tree, "x")!, new Set())
    expect(result.skippedUsed).toBe(1)
    expect(result.added).toBe(0)
  })

  it("does not double-count files already selected", () => {
    const result = selectFolder(src(), new Set(["src/a.ts"]))
    expect(result.added).toBe(1)
    expect(result.selected.size).toBe(2)
  })

  it("leaves selections outside the folder untouched", () => {
    const result = selectFolder(src(), new Set(["docs/readme.md"]))
    expect(result.selected.has("docs/readme.md")).toBe(true)
  })

  it("reaches nested descendants", () => {
    const tree = buildTree([entry("p/q/deep.ts"), entry("p/top.ts")])
    const result = selectFolder(folderAt(tree, "p")!, new Set())
    expect([...result.selected].sort()).toEqual(["p/q/deep.ts", "p/top.ts"])
  })

  it("does not mutate the set it was given", () => {
    const before = new Set<string>()
    selectFolder(src(), before)
    expect(before.size).toBe(0)
  })

  /**
   * The loop this prevents: a binary file listed as available gets bulk
   * selected, fails to decode, is deselected — and, still being available,
   * is picked up again by the very next bulk select. Its folder can never
   * reach "all", so it sits indeterminate and every click re-reports the
   * same error.
   */
  describe("files that turned out not to be text", () => {
    const withBinary = buildTree([
      entry("src/a.ts"),
      entry("src/.DS_Store", "unsupported"),
    ])
    const folder = () => folderAt(withBinary, "src")!

    it("skips them and counts them separately", () => {
      const result = selectFolder(folder(), new Set())
      expect([...result.selected]).toEqual(["src/a.ts"])
      expect(result.added).toBe(1)
      expect(result.skippedUnsupported).toBe(1)
      expect(result.skippedUsed).toBe(0)
      expect(result.skippedVendored).toBe(0)
    })

    it("lets the folder reach 'all' — otherwise the checkbox is stuck", () => {
      const result = selectFolder(folder(), new Set())
      expect(nodeState(folder(), result.selected)).toBe("all")
    })

    it("adds nothing on a second click, so the error cannot repeat", () => {
      const first = selectFolder(folder(), new Set())
      const second = selectFolder(folder(), first.selected)
      expect(second.added).toBe(0)
      expect(second.selected).toEqual(first.selected)
    })

    it("does not count toward a folder's available total", () => {
      expect(folder().availableCount).toBe(1)
      expect(folder().fileCount).toBe(2)
    })
  })
})

describe("deselectFolder", () => {
  it("removes every descendant, including unavailable ones", () => {
    const selected = new Set(["src/a.ts", "src/used.ts", "docs/readme.md"])
    const result = deselectFolder(src(), selected)
    expect([...result]).toEqual(["docs/readme.md"])
  })

  it("does not mutate the set it was given", () => {
    const before = new Set(["src/a.ts"])
    deselectFolder(src(), before)
    expect(before.size).toBe(1)
  })
})

describe("toggleFile", () => {
  it("adds and removes a file", () => {
    const once = toggleFile("src/a.ts", new Set())
    expect([...once]).toEqual(["src/a.ts"])
    expect([...toggleFile("src/a.ts", once)]).toEqual([])
  })

  /**
   * SPEC: a used file must never *silently* re-enter a listing — but it is
   * never hard-blocked either. Bulk folder select skips it; picking it
   * deliberately is allowed, and the UI warns.
   */
  it("allows selecting a used file individually", () => {
    expect([...toggleFile("src/used.ts", new Set())]).toEqual(["src/used.ts"])
  })

  it("does not mutate the set it was given", () => {
    const before = new Set<string>()
    toggleFile("src/a.ts", before)
    expect(before.size).toBe(0)
  })
})
