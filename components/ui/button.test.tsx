// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Button } from "@/components/ui/button"

/**
 * Base UI's `Button` assumes the `render` prop produces a real `<button>` and
 * says so at runtime when it does not:
 *
 *   "A component that acts as a button expected a native <button> because the
 *    `nativeButton` prop is true. Rendering a non-<button> removes native
 *    button semantics, which can impact forms and accessibility."
 *
 * This project renders `Button` as a `Link` or an `<a>` in a dozen places —
 * every navigation button in the app shell, the repo list and the export
 * download. Left as it was, each of those lost native button semantics and
 * logged an error on every render.
 *
 * The wrapper answers it once rather than the call sites answering it twelve
 * times, so the next `render={<Link />}` is correct by default.
 */

const NATIVE_BUTTON_WARNING = /expected a native <button>/

let logged: string[] = []

beforeEach(() => {
  logged = []
  // Collected rather than read back off the spy: the warning is the assertion,
  // and swallowing it keeps a failing run's output readable.
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const warned = () => logged.some((line) => NATIVE_BUTTON_WARNING.test(line))

describe("Button", () => {
  it("renders a native button when nothing is passed to render", () => {
    render(<Button>Export</Button>)

    expect(screen.getByRole("button", { name: "Export" }).tagName).toBe(
      "BUTTON"
    )
    expect(warned()).toBe(false)
  })

  it("renders as a link without losing button semantics", () => {
    render(
      <Button render={<a href="https://example.com/projects" />}>
        Projects
      </Button>
    )

    const element = screen.getByRole("button", { name: "Projects" })
    expect(element.tagName).toBe("A")
    expect(element.getAttribute("href")).toBe("https://example.com/projects")
    // The whole point: an anchor styled as a button still announces itself as
    // one, and Base UI has nothing to complain about.
    expect(warned()).toBe(false)
  })

  it("keeps treating an explicit button element as native", () => {
    render(<Button render={<button type="submit" />}>Save</Button>)

    const element = screen.getByRole("button", { name: "Save" })
    expect(element.tagName).toBe("BUTTON")
    expect(element.getAttribute("type")).toBe("submit")
    expect(warned()).toBe(false)
  })

  it("lets a caller override the guess", () => {
    // A render function's output cannot be inspected ahead of time, so the
    // caller stays able to say what it produces.
    render(
      <Button nativeButton={false} render={<span />}>
        Custom
      </Button>
    )

    expect(screen.getByRole("button", { name: "Custom" }).tagName).toBe("SPAN")
    expect(warned()).toBe(false)
  })

  it("still applies its variant and size classes through render", () => {
    render(
      <Button
        variant="ghost"
        size="sm"
        render={<a href="https://example.com/local" />}
      >
        Local
      </Button>
    )

    // The wrapper's own job must survive the fix.
    const element = screen.getByRole("button", { name: "Local" })
    expect(element.getAttribute("data-slot")).toBe("button")
    expect(element.className).toContain("h-7")
  })
})
