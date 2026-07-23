import { describe, expect, it } from "vitest"

import {
  encodeRepoId,
  isValidOwner,
  isValidRepoName,
  parseRepoId,
} from "@/lib/github/repo-id"

describe("repo id", () => {
  it("round-trips owner and repo", () => {
    expect(parseRepoId(encodeRepoId("acme", "widgets"))).toEqual({
      owner: "acme",
      repo: "widgets",
    })
  })

  /**
   * A GitHub login may only contain alphanumerics and hyphens, so the first
   * underscore is an unambiguous separator even though repo names may contain
   * underscores of their own.
   */
  it("splits at the first underscore, so an underscore in the repo name survives", () => {
    expect(parseRepoId(encodeRepoId("acme", "my_great_repo"))).toEqual({
      owner: "acme",
      repo: "my_great_repo",
    })
  })

  it("keeps dots and hyphens in the repo name", () => {
    expect(parseRepoId(encodeRepoId("a-corp", "next.js-app"))).toEqual({
      owner: "a-corp",
      repo: "next.js-app",
    })
  })

  it("returns null when there is no separator", () => {
    expect(parseRepoId("justowner")).toBeNull()
  })

  /**
   * The parsed halves are interpolated into a GitHub API path. Anything that
   * could climb out of `/repos/{owner}/{repo}/…` has to be refused here, not
   * discovered as a request against some other endpoint.
   */
  it("refuses path traversal and slashes", () => {
    expect(parseRepoId("..%2F.._x")).toBeNull()
    expect(parseRepoId("../.._x")).toBeNull()
    expect(parseRepoId("acme_..")).toBeNull()
    expect(parseRepoId("acme_a/b")).toBeNull()
    expect(parseRepoId("acme_")).toBeNull()
  })

  it("validates the halves on their own too", () => {
    expect(isValidOwner("acme-corp")).toBe(true)
    expect(isValidOwner("acme_corp")).toBe(false)
    expect(isValidOwner("../etc")).toBe(false)
    expect(isValidRepoName("next.js_app-1")).toBe(true)
    expect(isValidRepoName("..")).toBe(false)
    expect(isValidRepoName("a/b")).toBe(false)
    expect(isValidRepoName("")).toBe(false)
  })
})
