// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ButtonLink } from "@/components/ui/button-link"

/**
 * The reason this component exists instead of `<Button render={<Link />}>`.
 *
 * A `Button` rendered as an anchor is styled as a button but, through Base UI,
 * announces itself as `role="button"` — which strips the link semantics from a
 * control that navigates to a URL (WCAG 4.1.2). `ButtonLink` is a real link
 * wearing the button's clothes: `buttonVariants` for the look, an `<a>` for the
 * role.
 */
describe("ButtonLink", () => {
  it("navigates as a link, never announcing as a button", () => {
    render(<ButtonLink href="/projects">Repositories</ButtonLink>)

    const link = screen.getByRole("link", { name: "Repositories" })
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("href")).toBe("/projects")
    // The whole point of the migration: navigation keeps link semantics.
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("wears the button's variant and size classes", () => {
    render(
      <ButtonLink variant="ghost" size="sm" href="/local">
        Local
      </ButtonLink>
    )

    const link = screen.getByRole("link", { name: "Local" })
    expect(link.getAttribute("data-slot")).toBe("button")
    expect(link.className).toContain("h-7") // the `sm` size
  })

  it("merges a caller's className rather than dropping it", () => {
    render(
      <ButtonLink href="/projects" className="self-start">
        Back
      </ButtonLink>
    )

    expect(screen.getByRole("link", { name: "Back" }).className).toContain(
      "self-start"
    )
  })
})
