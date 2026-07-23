// @vitest-environment jsdom

import { webcrypto } from "node:crypto"

import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { paginate, type MeasuredFile, type Metrics } from "@/lib/pdf/measure"
import { nodeState } from "@/lib/tree/selection"
import type { ContentSource, FileEntry, TreeNode } from "@/lib/tree/types"

/**
 * `useFileSelection` is the whole pipeline between a `ContentSource` and a PDF,
 * and it is shared verbatim by anonymous mode and GitHub mode. The pure pieces
 * it composes — `paginate`, `selectFolder`, `resolveStatuses` — each have their
 * own tests; what only exists here is the *orchestration*, and that is where
 * both bugs reported from the running app actually lived:
 *
 *  - a file that failed to decode stayed `available`, so the next bulk select
 *    re-added it, and its folder could never reach fully-selected
 *  - a folder's exact page count was summed from its files instead of being
 *    paginated as one flow, so the badge disagreed with the running total
 *
 * Both have a test below, and both were confirmed to fail against the code as
 * it was before the fix.
 */

const { workerSend } = vi.hoisted(() => ({ workerSend: vi.fn() }))

// The only mock in this file, and it is at a boundary a test cannot cross:
// `usePdfWorker` constructs a real `Worker` from a module URL. Everything the
// hook does with the response — measuring bookkeeping, pagination, the render
// cache — runs for real against it.
vi.mock("@/hooks/use-pdf-worker", () => ({
  usePdfWorker: () => ({ send: workerSend }),
}))

/**
 * Stand-in font metrics. The numbers are arbitrary but fixed; every expected
 * page count in this file is derived by calling the real `paginate` with these
 * same metrics, so the assertions test the hook, not the geometry.
 */
const METRICS: Metrics = {
  code: { lineHeight: 11.7, advance: 13.7 },
  title: { lineHeight: 16.9, advance: 20.9 },
}

const measured = (name: string, codeLines: number): MeasuredFile => ({
  name,
  titleLines: 1,
  codeLines,
})

function countLines(text: string) {
  const lines = text.split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.length
}

const encoder = new TextEncoder()
const bytesOf = (content: string | Uint8Array) =>
  typeof content === "string" ? encoder.encode(content) : content

type FakeSource = ContentSource & { reads: string[] }

function fakeSource(files: Record<string, string | Uint8Array>): FakeSource {
  const reads: string[] = []
  return {
    reads,
    listFiles: async (): Promise<FileEntry[]> =>
      Object.entries(files).map(([path, content]) => ({
        path,
        name: path.split("/").pop() ?? path,
        sizeBytes: bytesOf(content).length,
        status: "available",
      })),
    readFile: async (path: string) => {
      reads.push(path)
      const content = files[path]
      if (content === undefined) throw new Error(`No such file: ${path}`)
      return bytesOf(content)
    },
  }
}

/** `n` lines of source, distinct per file so signatures differ. */
const source = (n: number, tag = "x") => `const ${tag} = 1\n`.repeat(n)

function findNode(nodes: TreeNode[], path: string): TreeNode {
  const hit = find(nodes, path)
  if (!hit) throw new Error(`No node at ${path}`)
  return hit
}

function find(nodes: TreeNode[], path: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === path) return node
    if (node.kind === "folder") {
      const hit = find(node.children, path)
      if (hit) return hit
    }
  }
  return null
}

// jsdom's Crypto has getRandomValues but no SubtleCrypto, and the hook hashes
// every file it reads. Node's implementation is the same algorithm.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto })
}

let useFileSelection: typeof import("./use-file-selection").useFileSelection

beforeEach(async () => {
  workerSend.mockReset()
  workerSend.mockImplementation(async (request: Record<string, unknown>) => {
    if (request.type === "measure") {
      const files = request.files as { name: string; text: string }[]
      return {
        type: "measured",
        metrics: METRICS,
        files: files.map((file) => measured(file.name, countLines(file.text))),
      }
    }
    const files = request.files as { name: string }[]
    return {
      type: "rendered",
      blob: new Blob(["%PDF"], { type: "application/pdf" }),
      pageCount: files.length,
      files: files.map((file, index) => ({
        name: file.name,
        startPage: index + 1,
        endPage: index + 1,
      })),
    }
  })
  ;({ useFileSelection } = await import("./use-file-selection"))
})

/** Mount the hook and point it at a source, settled. */
async function load(files: Record<string, string | Uint8Array>) {
  const src = fakeSource(files)
  const hook = renderHook(() => useFileSelection())
  await act(async () => {
    hook.result.current.loadSource(src)
  })
  await waitFor(() => expect(hook.result.current.metrics).not.toBeNull())
  await waitFor(() =>
    expect(hook.result.current.entries.length).toBe(Object.keys(files).length)
  )
  return { ...hook, src }
}

/** Click a node the way the tree does — with the state it currently renders. */
async function click(
  hook: Awaited<ReturnType<typeof load>>,
  path: string,
  root: "tree" = "tree"
) {
  const node = findNode(hook.result.current[root], path)
  const state = nodeState(node, hook.result.current.selected)
  await act(async () => {
    hook.result.current.handleToggleSelect(node, state)
  })
}

describe("loadSource", () => {
  it("lists the source into a tree and opens the top level", async () => {
    const hook = await load({
      "src/a.ts": source(3),
      "src/b.ts": source(3),
      "README.md": source(2),
    })

    expect(hook.result.current.entries.map((e) => e.path).sort()).toEqual([
      "README.md",
      "src/a.ts",
      "src/b.ts",
    ])
    expect(hook.result.current.expanded.has("src")).toBe(true)
  })

  it("asks the worker for metrics before anything is selected", async () => {
    const hook = await load({ "a.ts": source(3) })

    // Without this the tree would label every row "0p" until the first
    // selection happened to load the font.
    expect(hook.result.current.metrics).toEqual(METRICS)
    expect(workerSend).toHaveBeenCalledWith({ type: "measure", files: [] })
  })

  it("surfaces a listing failure instead of showing an empty repository", async () => {
    const hook = renderHook(() => useFileSelection())
    await act(async () => {
      hook.result.current.loadSource({
        listFiles: async () => {
          throw new Error("Bad credentials.")
        },
        readFile: async () => new Uint8Array(),
      })
    })

    await waitFor(() =>
      expect(hook.result.current.error).toBe("Bad credentials.")
    )
    expect(hook.result.current.isLoading).toBe(false)
  })

  /**
   * A directory picker prefixes every path with the dropped folder's own name,
   * so repo config sits under that prefix and not at the root. Looking for it
   * at the root silently disables vendored detection for every dropped folder.
   */
  it("finds repo config under the folder every path shares", async () => {
    const hook = await load({
      "my-repo/.gitattributes": "vendor/** linguist-vendored\n",
      "my-repo/vendor/lib.ts": source(3),
      "my-repo/src/app.ts": source(3),
    })

    await waitFor(() => expect(hook.result.current.vendoredCount).toBe(1))
    const node = findNode(hook.result.current.tree, "my-repo/vendor/lib.ts")
    expect(hook.result.current.verdictFor(node)?.vendored).toBe(true)
  })
})

describe("measuring a selection", () => {
  it("reads and measures only the files that were selected", async () => {
    const hook = await load({ "a.ts": source(4), "b.ts": source(4) })

    await click(hook, "a.ts")

    expect(hook.src.reads).toEqual(["a.ts"])
    expect(hook.result.current.selected).toEqual(new Set(["a.ts"]))
  })

  it("does not re-read a file it has already measured", async () => {
    const hook = await load({ "a.ts": source(4) })

    await click(hook, "a.ts") // select
    await click(hook, "a.ts") // deselect
    await click(hook, "a.ts") // select again

    // Toggling has to stay cheap; in GitHub mode every re-read is a request.
    expect(hook.src.reads).toEqual(["a.ts"])
  })

  it("keeps the running total equal to paginating the measured selection", async () => {
    const hook = await load({ "a.ts": source(12), "b.ts": source(30) })

    await click(hook, "a.ts")
    await click(hook, "b.ts")

    await waitFor(() =>
      expect(hook.result.current.totalPages).toBe(
        paginate([measured("a.ts", 12), measured("b.ts", 30)], METRICS)
      )
    )
  })

  it("reports no pages at all when nothing is selected", async () => {
    const hook = await load({ "a.ts": source(12) })
    expect(hook.result.current.totalPages).toBe(0)
  })

  /**
   * The other way measuring fails: not a file that decodes to non-text (that is
   * marked `unsupported` above), but `readFile` itself rejecting mid-measure — a
   * grant revoked between listing and reading, a dropped connection. That has to
   * surface as the error banner, and measuring has to stop rather than hang.
   */
  it("surfaces an error banner when a file cannot be read mid-measure", async () => {
    const src: ContentSource = {
      listFiles: async () => [
        { path: "a.ts", name: "a.ts", sizeBytes: 40, status: "available" },
      ],
      readFile: async () => {
        throw new Error("the connection dropped")
      },
    }
    const hook = renderHook(() => useFileSelection())
    await act(async () => {
      hook.result.current.loadSource(src)
    })
    await waitFor(() => expect(hook.result.current.entries).toHaveLength(1))

    const node = findNode(hook.result.current.tree, "a.ts")
    await act(async () => {
      hook.result.current.handleToggleSelect(
        node,
        nodeState(node, hook.result.current.selected)
      )
    })

    await waitFor(() =>
      expect(hook.result.current.error).toBe("the connection dropped")
    )
    // The finally must clear it, or the tree reads as measuring forever.
    expect(hook.result.current.isMeasuring).toBe(false)
  })
})

/**
 * Reported from the running app: pressing a folder's checkbox surfaced an
 * error about `.DS_Store` and then left the folder stuck half-selected,
 * re-reporting the same error on every subsequent click.
 */
describe("a file that turns out not to be text", () => {
  const binary = new Uint8Array([0x00, 0x01, 0x02, 0x03])

  it("is marked unsupported rather than merely deselected", async () => {
    const hook = await load({ "src/a.ts": source(4), "src/.DS_Store": binary })

    await click(hook, "src")

    await waitFor(() =>
      expect(
        hook.result.current.entries.find((e) => e.path === "src/.DS_Store")
          ?.status
      ).toBe("unsupported")
    )
    expect(hook.result.current.selected.has("src/.DS_Store")).toBe(false)
  })

  it("explains why, once, not once per click", async () => {
    const hook = await load({ "src/a.ts": source(4), "src/.DS_Store": binary })

    await click(hook, "src") // select — fails
    await click(hook, "src") // deselect
    await click(hook, "src") // select again

    const rejected = hook.result.current.rejected.filter(
      (item) => item.path === "src/.DS_Store"
    )
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toMatch(/binary|NUL/i)
  })

  /** The actual defect: the folder could never reach fully-selected. */
  it("stops blocking the folder from reading as fully selected", async () => {
    const hook = await load({
      "src/a.ts": source(4),
      "src/b.ts": source(4),
      "src/.DS_Store": binary,
    })

    await click(hook, "src")
    await waitFor(() =>
      expect(
        hook.result.current.entries.find((e) => e.path === "src/.DS_Store")
          ?.status
      ).toBe("unsupported")
    )

    // One click settles it: the binary drops out of the selection *and* out of
    // what the folder counts as selectable, so the checkbox reads full rather
    // than hanging indeterminate.
    const folder = findNode(hook.result.current.tree, "src")
    expect(nodeState(folder, hook.result.current.selected)).toBe("all")
    expect(hook.result.current.selected.has("src/.DS_Store")).toBe(false)
  })

  it("stays out of the selection across a deselect and reselect", async () => {
    const hook = await load({
      "src/a.ts": source(4),
      "src/b.ts": source(4),
      "src/.DS_Store": binary,
    })

    await click(hook, "src") // select — the binary fails
    await waitFor(() =>
      expect(
        hook.result.current.entries.find((e) => e.path === "src/.DS_Store")
          ?.status
      ).toBe("unsupported")
    )
    await click(hook, "src") // deselect all
    await click(hook, "src") // select again

    const folder = findNode(hook.result.current.tree, "src")
    expect(nodeState(folder, hook.result.current.selected)).toBe("all")
    expect(hook.result.current.selected.has("src/.DS_Store")).toBe(false)
    // Never read a second time: the bulk select skips it outright rather than
    // re-adding it and discovering the same failure again.
    expect(hook.src.reads.filter((p) => p === "src/.DS_Store")).toHaveLength(1)
  })

  it("counts it as skipped in the notice, not as an error", async () => {
    const hook = await load({ "src/a.ts": source(4), "src/.DS_Store": binary })

    await click(hook, "src")
    await waitFor(() =>
      expect(
        hook.result.current.entries.find((e) => e.path === "src/.DS_Store")
          ?.status
      ).toBe("unsupported")
    )
    await click(hook, "src") // deselect
    await click(hook, "src") // select again

    expect(hook.result.current.notice).toMatch(/skipped 1 not text/)
  })
})

/**
 * Reported from the running app: a folder badge read 33 pages, the files it
 * contained added up to 31, and selecting everything exported 28.
 */
describe("a folder's exact page count", () => {
  it("is the files paginated as one flow, never the sum of their counts", async () => {
    const hook = await load({
      "src/a.ts": source(12, "a"),
      "src/b.ts": source(12, "b"),
      "src/c.ts": source(12, "c"),
    })

    await click(hook, "src")

    await waitFor(() =>
      expect(
        hook.result.current.countsFor(findNode(hook.result.current.tree, "src"))
          .exact
      ).toBeDefined()
    )

    const folder = findNode(hook.result.current.tree, "src")
    const files = ["a", "b", "c"].map((tag) => measured(`${tag}.ts`, 12))
    const asFlow = paginate(files, METRICS)
    const asSum = files.reduce((n, f) => n + paginate([f], METRICS), 0)

    expect(asFlow).toBeLessThan(asSum) // the case is worth testing
    expect(hook.result.current.countsFor(folder).exact).toBe(asFlow)
  })

  it("agrees with the running total when the whole folder is selected", async () => {
    const hook = await load({
      "src/a.ts": source(40, "a"),
      "src/b.ts": source(55, "b"),
      "src/c.ts": source(9, "c"),
    })

    await click(hook, "src")
    await waitFor(() =>
      expect(hook.result.current.totalPages).toBeGreaterThan(0)
    )

    const folder = findNode(hook.result.current.tree, "src")
    // The badge and the running total are two different code paths over the
    // same measurements. If they can disagree, the user sees exactly the
    // mismatch that was reported.
    expect(hook.result.current.countsFor(folder).exact).toBe(
      hook.result.current.totalPages
    )
  })

  /**
   * A partially measured folder must show no exact figure at all. Mixing an
   * exact count for some files with an estimate for the rest produces a number
   * that is neither, which is what made the reported figures look arbitrary.
   */
  it("is withheld until every file in the folder has been measured", async () => {
    const hook = await load({
      "src/a.ts": source(12, "a"),
      "src/b.ts": source(12, "b"),
    })

    await click(hook, "src/a.ts")
    await waitFor(() =>
      expect(
        hook.result.current.countsFor(
          findNode(hook.result.current.tree, "src/a.ts")
        ).exact
      ).toBeDefined()
    )

    const folder = findNode(hook.result.current.tree, "src")
    expect(hook.result.current.countsFor(folder).exact).toBeUndefined()
    expect(hook.result.current.countsFor(folder).estimated).toBeGreaterThan(0)
  })

  it("always offers an estimate, even before anything is measured", async () => {
    const hook = await load({ "src/a.ts": source(200, "a") })
    const folder = findNode(hook.result.current.tree, "src")

    expect(hook.result.current.countsFor(folder).estimated).toBeGreaterThan(0)
    expect(hook.result.current.countsFor(folder).exact).toBeUndefined()
  })
})

describe("warnings before adding a file", () => {
  const used = async () => {
    const hook = await load({ "a.ts": source(4), "b.ts": source(4) })
    const bytes = bytesOf(source(4))
    const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource)
    const hash = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")
    await act(async () => {
      hook.result.current.setUsedFiles([
        {
          path: "a.ts",
          contentHash: hash,
          commitSha: "head1",
          sizeBytes: bytes.length,
        },
      ])
    })
    return hook
  }

  it("warns instead of silently re-adding an already filed file", async () => {
    const hook = await used()

    await click(hook, "a.ts")

    expect(hook.result.current.pendingWarning).toMatchObject({
      path: "a.ts",
      kind: "used",
    })
    // Warned, not selected — and crucially not blocked either.
    expect(hook.result.current.selected.has("a.ts")).toBe(false)
  })

  it("adds the file once the warning is confirmed", async () => {
    const hook = await used()

    await click(hook, "a.ts")
    await act(async () => {
      hook.result.current.confirmWarning()
    })

    expect(hook.result.current.pendingWarning).toBeNull()
    expect(hook.result.current.selected.has("a.ts")).toBe(true)
  })

  it("warns before adding a vendored file", async () => {
    const hook = await load({
      ".gitattributes": "vendor/** linguist-vendored\n",
      "vendor/lib.ts": source(4),
    })
    await waitFor(() => expect(hook.result.current.vendoredCount).toBe(1))

    await click(hook, "vendor/lib.ts")

    expect(hook.result.current.pendingWarning).toMatchObject({
      path: "vendor/lib.ts",
      kind: "vendored",
    })
  })

  it("never warns on removal — taking a file out is always free", async () => {
    const hook = await used()

    await click(hook, "a.ts")
    await act(async () => {
      hook.result.current.confirmWarning()
    })
    await click(hook, "a.ts") // remove it again

    expect(hook.result.current.pendingWarning).toBeNull()
    expect(hook.result.current.selected.has("a.ts")).toBe(false)
  })
})

describe("rendering", () => {
  it("renders once and serves the same result for an unchanged selection", async () => {
    const hook = await load({ "a.ts": source(4) })
    await click(hook, "a.ts")

    let first!: Awaited<ReturnType<typeof hook.result.current.renderOnce>>
    let second!: typeof first
    await act(async () => {
      first = await hook.result.current.renderOnce()
    })
    await act(async () => {
      second = await hook.result.current.renderOnce()
    })

    // Not merely equal — the identical object. Two renders are two page
    // counts free to disagree.
    expect(second).toBe(first)
    expect(second.blob).toBe(first.blob)
    expect(
      workerSend.mock.calls.filter(([r]) => r.type === "render")
    ).toHaveLength(1)
  })

  it("renders again once the selection actually changes", async () => {
    const hook = await load({ "a.ts": source(4, "a"), "b.ts": source(9, "b") })
    await click(hook, "a.ts")
    await act(async () => {
      await hook.result.current.renderOnce()
    })

    await click(hook, "b.ts")
    await act(async () => {
      await hook.result.current.renderOnce()
    })

    expect(
      workerSend.mock.calls.filter(([r]) => r.type === "render")
    ).toHaveLength(2)
  })

  it("closes an open preview as soon as the selection moves on", async () => {
    const hook = await load({ "a.ts": source(4, "a"), "b.ts": source(4, "b") })
    await click(hook, "a.ts")
    await act(async () => {
      hook.result.current.setIsPreviewOpen(true)
    })

    await click(hook, "b.ts")

    // A stale preview is worse than none: it looks current and is not.
    expect(hook.result.current.isPreviewOpen).toBe(false)
  })

  it("rejects and clears isRendering when the worker fails to render", async () => {
    const hook = await load({ "a.ts": source(4) })
    await click(hook, "a.ts")

    // Measuring keeps working; only the render response comes back malformed.
    workerSend.mockImplementation(async (request: Record<string, unknown>) => {
      if (request.type === "measure") {
        const files = request.files as { name: string; text: string }[]
        return {
          type: "measured",
          metrics: METRICS,
          files: files.map((file) =>
            measured(file.name, countLines(file.text))
          ),
        }
      }
      return { type: "error" } // anything but "rendered"
    })

    let caught: unknown
    await act(async () => {
      try {
        await hook.result.current.renderOnce()
      } catch (error) {
        caught = error
      }
    })

    expect((caught as Error)?.message).toMatch(/Unexpected response/)
    // The finally must reset it, or the download button spins forever.
    expect(hook.result.current.isRendering).toBe(false)
  })
})

/**
 * The NDA constraint, asserted rather than trusted: what the ledger records
 * about a selection must be paths, hashes and sizes — never a byte of content.
 */
describe("describeSelection", () => {
  it("records path, content hash and size, and nothing else", async () => {
    const hook = await load({ "a.ts": source(4) })
    await click(hook, "a.ts")

    const described = await hook.result.current.describeSelection()

    expect(described).toHaveLength(1)
    expect(Object.keys(described[0]).sort()).toEqual([
      "contentHash",
      "path",
      "sizeBytes",
    ])
    expect(described[0].contentHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it("reuses the hash taken while measuring rather than re-reading", async () => {
    const hook = await load({ "a.ts": source(4) })
    await click(hook, "a.ts")

    const before = hook.src.reads.length
    await hook.result.current.describeSelection()

    expect(hook.src.reads.length).toBe(before)
  })

  it("hashes the raw bytes, so it matches what the ledger stores", async () => {
    const text = source(4)
    const hook = await load({ "a.ts": text })
    await click(hook, "a.ts")

    const described = await hook.result.current.describeSelection()
    const digest = await crypto.subtle.digest(
      "SHA-256",
      bytesOf(text) as BufferSource
    )
    const expected = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")

    expect(described[0].contentHash).toBe(expected)
  })
})

describe("manual vendored overrides", () => {
  it("reports every change so a mode with a database can persist it", async () => {
    const onOverrideChange = vi.fn()
    const src = fakeSource({ "src/a.ts": source(4), "README.md": source(2) })
    const hook = renderHook(() => useFileSelection({ onOverrideChange }))
    await act(async () => {
      hook.result.current.loadSource(src)
    })
    await waitFor(() => expect(hook.result.current.entries).toHaveLength(2))

    const node = findNode(hook.result.current.tree, "src/a.ts")
    await act(async () => {
      hook.result.current.handleToggleVendored(node, null)
    })

    expect(onOverrideChange).toHaveBeenCalledWith({
      path: "src/a.ts",
      scope: "file",
      vendored: true,
    })
    expect(hook.result.current.vendoredCount).toBe(1)
  })

  it("applies locally even when the caller has nowhere to persist it", async () => {
    const hook = await load({ "src/a.ts": source(4) })

    const node = findNode(hook.result.current.tree, "src/a.ts")
    await act(async () => {
      hook.result.current.handleToggleVendored(node, null)
    })

    // Anonymous mode passes no callback at all; the tree must still respond.
    expect(hook.result.current.vendoredCount).toBe(1)
  })

  it("lets an override flip a detected file back to selectable", async () => {
    const hook = await load({
      ".gitattributes": "vendor/** linguist-vendored\n",
      "vendor/lib.ts": source(4),
    })
    await waitFor(() => expect(hook.result.current.vendoredCount).toBe(1))

    const node = findNode(hook.result.current.tree, "vendor/lib.ts")
    await act(async () => {
      hook.result.current.handleToggleVendored(
        node,
        hook.result.current.verdictFor(node)
      )
    })

    expect(hook.result.current.vendoredCount).toBe(0)
  })
})
