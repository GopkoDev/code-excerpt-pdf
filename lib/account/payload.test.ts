import { describe, expect, it } from "vitest"

import { parseDeleteAccountRequest } from "@/lib/account/payload"

/**
 * The confirmation is a server-side rule, not a UI flourish.
 *
 * The dialog makes the user type their login, but a dialog is markup: anything
 * that can send a `DELETE` can skip it. Since the operation is irreversible and
 * has no undo, the rule is enforced where it cannot be bypassed, and these
 * tests are what say so.
 */
describe("parseDeleteAccountRequest", () => {
  it("accepts the login the session belongs to", () => {
    expect(
      parseDeleteAccountRequest({ confirm: "octocat" }, "octocat")
    ).toEqual({ ok: true })
  })

  it("refuses a different name", () => {
    const result = parseDeleteAccountRequest({ confirm: "octo" }, "octocat")
    expect(result.ok).toBe(false)
  })

  it("refuses an empty confirmation", () => {
    expect(parseDeleteAccountRequest({ confirm: "" }, "octocat").ok).toBe(false)
    expect(parseDeleteAccountRequest({}, "octocat").ok).toBe(false)
    expect(parseDeleteAccountRequest(null, "octocat").ok).toBe(false)
  })

  /**
   * GitHub logins are case-insensitive and the field is a deliberateness
   * check, not a spelling test — but surrounding whitespace is a paste
   * artefact, not intent, so it is trimmed rather than rejected.
   */
  it("tolerates case and surrounding whitespace", () => {
    expect(
      parseDeleteAccountRequest({ confirm: "  OctoCat " }, "octocat").ok
    ).toBe(true)
  })

  /** A session with no login cannot confirm anything — fail closed. */
  it("refuses when the session carries no login", () => {
    expect(
      parseDeleteAccountRequest({ confirm: "octocat" }, undefined).ok
    ).toBe(false)
    expect(parseDeleteAccountRequest({ confirm: "" }, "").ok).toBe(false)
  })
})
