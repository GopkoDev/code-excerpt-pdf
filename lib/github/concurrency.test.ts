import { describe, expect, it } from "vitest"

import { mapWithConcurrency } from "@/lib/github/concurrency"

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms))

describe("mapWithConcurrency", () => {
  it("returns results in input order, not completion order", async () => {
    const result = await mapWithConcurrency(
      [30, 10, 20],
      async (ms) => {
        await tick(ms)
        return ms
      },
      2
    )
    expect(result).toEqual([30, 10, 20])
  })

  /**
   * GitHub applies secondary rate limits to bursts, which is why SPEC caps
   * content fetches at 3–5 rather than firing one request per selected file.
   */
  it("never exceeds the limit", async () => {
    let running = 0
    let peak = 0

    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        running += 1
        peak = Math.max(peak, running)
        await tick(5)
        running -= 1
      },
      4
    )

    expect(peak).toBeLessThanOrEqual(4)
    expect(peak).toBeGreaterThan(1)
  })

  it("keeps the pipe full rather than working in batches", async () => {
    // With batching, one slow item stalls three workers. With a proper queue,
    // the fast items keep flowing past it.
    const order: number[] = []
    await mapWithConcurrency(
      [50, 1, 1, 1, 1],
      async (ms, index) => {
        await tick(ms)
        order.push(index)
      },
      2
    )
    expect(order[order.length - 1]).toBe(0)
  })

  it("passes the index to the worker", async () => {
    const seen: number[] = []
    await mapWithConcurrency(
      ["a", "b", "c"],
      async (_item, index) => {
        seen.push(index)
      },
      2
    )
    expect(seen.sort()).toEqual([0, 1, 2])
  })

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], async () => 1, 3)).toEqual([])
  })

  it("handles a list shorter than the limit", async () => {
    expect(await mapWithConcurrency([1, 2], async (n) => n * 2, 10)).toEqual([
      2, 4,
    ])
  })

  it("rejects if any worker throws, without hanging", async () => {
    await expect(
      mapWithConcurrency(
        [1, 2, 3],
        async (n) => {
          if (n === 2) throw new Error("boom")
          return n
        },
        2
      )
    ).rejects.toThrow("boom")
  })

  it("treats a limit below one as one", async () => {
    let peak = 0
    let running = 0
    await mapWithConcurrency(
      [1, 2, 3],
      async () => {
        running += 1
        peak = Math.max(peak, running)
        await tick(1)
        running -= 1
      },
      0
    )
    expect(peak).toBe(1)
  })
})
