import { describe, expect, it } from "vitest"

import { cn } from "@/lib/utils"

describe("cn", () => {
  it("resolves the @/* path alias inside Vitest", () => {
    expect(typeof cn).toBe("function")
  })

  it("merges conflicting tailwind classes, last one winning", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })

  it("drops falsy conditional classes", () => {
    expect(cn("flex", false && "hidden", undefined, "gap-2")).toBe("flex gap-2")
  })
})
