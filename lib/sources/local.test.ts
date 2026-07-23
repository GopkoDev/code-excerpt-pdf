import { describe, expect, it } from "vitest"

import { createLocalSource, toLocalFiles } from "@/lib/sources/local"

const local = (path: string, text: string) => ({
  path,
  blob: new Blob([text]),
})

describe("createLocalSource", () => {
  it("lists every file with its path, name and size", async () => {
    const source = createLocalSource([local("src/a.ts", "const a = 1\n")])
    const [entry] = await source.listFiles()

    expect(entry.path).toBe("src/a.ts")
    expect(entry.name).toBe("a.ts")
    expect(entry.sizeBytes).toBe(12)
    expect(entry.status).toBe("available")
  })

  it("reads a file's raw bytes back", async () => {
    const source = createLocalSource([local("a.ts", "hello")])
    const bytes = await source.readFile("a.ts")
    expect(new TextDecoder().decode(bytes)).toBe("hello")
  })

  it("reports the byte length of non-ASCII content, not its length in characters", async () => {
    const source = createLocalSource([local("укр.ts", "// Привіт")])
    const [entry] = await source.listFiles()
    // Cyrillic is two bytes per character in UTF-8.
    expect(entry.sizeBytes).toBeGreaterThan("// Привіт".length)
  })

  it("throws a named error for an unknown path", async () => {
    const source = createLocalSource([local("a.ts", "x")])
    await expect(source.readFile("nope.ts")).rejects.toThrow(/nope\.ts/)
  })

  /**
   * Listing may read metadata (size is needed to label the tree) but must
   * never pull content. In the GitHub source the equivalent mistake is a blob
   * fetch per tree row, which would blow the API budget.
   */
  it("does not load content until a file is actually read", async () => {
    let contentReads = 0
    const blob = new Blob(["x"])
    const readBytes = blob.arrayBuffer.bind(blob)
    Object.defineProperty(blob, "arrayBuffer", {
      value: () => {
        contentReads += 1
        return readBytes()
      },
    })
    const source = createLocalSource([{ path: "a.ts", blob }])

    await source.listFiles()
    expect(contentReads).toBe(0)

    await source.readFile("a.ts")
    expect(contentReads).toBe(1)
  })

  it("handles an empty source", async () => {
    expect(await createLocalSource([]).listFiles()).toEqual([])
  })
})

describe("toLocalFiles", () => {
  it("prefers webkitRelativePath so folder structure survives", () => {
    const file = new File(["x"], "a.ts")
    Object.defineProperty(file, "webkitRelativePath", {
      value: "project/src/a.ts",
    })
    expect(toLocalFiles([file])[0].path).toBe("project/src/a.ts")
  })

  it("falls back to the bare name for individually picked files", () => {
    expect(toLocalFiles([new File(["x"], "a.ts")])[0].path).toBe("a.ts")
  })
})
