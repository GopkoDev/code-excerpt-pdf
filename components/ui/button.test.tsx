// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Button } from "@/components/ui/button"

/**
 * `Button` is for controls that behave like buttons. Navigation that looks like
 * a button lives in `ButtonLink` (see `button-link.test.tsx`) precisely so an
 * anchor is never forced through Base UI's button role — the regression this
 * split fixed. These tests therefore only cover the real-button behaviour.
 */
describe("Button", () => {
  it("renders a native button by default", () => {
    render(<Button>Export</Button>)

    expect(screen.getByRole("button", { name: "Export" }).tagName).toBe(
      "BUTTON"
    )
  })

  it("keeps native button semantics for an explicit button element", () => {
    render(<Button render={<button type="submit" />}>Save</Button>)

    const element = screen.getByRole("button", { name: "Save" })
    expect(element.tagName).toBe("BUTTON")
    expect(element.getAttribute("type")).toBe("submit")
  })

  it("applies its variant and size classes", () => {
    render(
      <Button variant="ghost" size="sm">
        Local
      </Button>
    )

    const element = screen.getByRole("button", { name: "Local" })
    expect(element.getAttribute("data-slot")).toBe("button")
    expect(element.className).toContain("h-7") // the `sm` size
  })
})
