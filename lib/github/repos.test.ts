import { describe, expect, it } from "vitest"

import {
  parseInstallationsResponse,
  parseRepositoriesResponse,
} from "@/lib/github/repos"

describe("parseInstallationsResponse", () => {
  it("reads the installation ids and the count", () => {
    expect(
      parseInstallationsResponse({
        total_count: 2,
        installations: [{ id: 11 }, { id: 22 }],
      })
    ).toEqual({ totalCount: 2, installationIds: [11, 22] })
  })

  /** Authenticated with nothing installed is a normal state, not an error. */
  it("accepts an empty installation list", () => {
    expect(
      parseInstallationsResponse({ total_count: 0, installations: [] })
    ).toEqual({ totalCount: 0, installationIds: [] })
  })

  it("rejects a shape it does not recognise instead of guessing", () => {
    expect(() =>
      parseInstallationsResponse({ installations: "nope" })
    ).toThrow()
  })
})

describe("parseRepositoriesResponse", () => {
  const payload = {
    total_count: 2,
    repositories: [
      {
        id: 7,
        name: "widgets",
        full_name: "acme/widgets",
        private: true,
        default_branch: "main",
        owner: { login: "acme" },
      },
      {
        id: 8,
        name: "docs",
        full_name: "acme/docs",
        private: false,
        owner: { login: "acme" },
      },
    ],
  }

  it("maps the fields the tree view needs and nothing else", () => {
    const repos = parseRepositoriesResponse(payload)
    expect(repos).toEqual([
      {
        id: 7,
        owner: "acme",
        name: "widgets",
        fullName: "acme/widgets",
        private: true,
        defaultBranch: "main",
      },
      {
        id: 8,
        owner: "acme",
        name: "docs",
        fullName: "acme/docs",
        private: false,
        defaultBranch: undefined,
      },
    ])
  })

  it("rejects an unexpected shape rather than casting it", () => {
    expect(() =>
      parseRepositoriesResponse({ repositories: [{ id: "seven" }] })
    ).toThrow()
  })
})
