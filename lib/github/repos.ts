/**
 * The repositories the installed App can actually reach.
 *
 * Like `tree.ts`, this is untrusted JSON, so it is validated rather than cast:
 * GitHub can answer with an HTML error page or a shape that moved between API
 * versions, and a bare cast turns either into a crash far away from the cause.
 *
 * Only the fields the UI needs are carried forward. Everything else GitHub
 * sends about a repository — description, counts, URLs — is dropped at the
 * boundary so it can never end up somewhere it was not meant to be.
 */

import { z } from "zod"

const Installations = z.object({
  total_count: z.number(),
  installations: z.array(z.object({ id: z.number() })),
})

const Repository = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  private: z.boolean(),
  default_branch: z.string().optional(),
  owner: z.object({ login: z.string() }),
})

const Repositories = z.object({
  total_count: z.number().optional(),
  repositories: z.array(Repository),
})

export type InstallationList = {
  totalCount: number
  installationIds: number[]
}

export type RepoSummary = {
  id: number
  owner: string
  name: string
  fullName: string
  private: boolean
  /** Absent on some responses; the Trees call falls back to `HEAD`. */
  defaultBranch: string | undefined
}

export function parseInstallationsResponse(payload: unknown): InstallationList {
  const parsed = Installations.parse(payload)
  return {
    totalCount: parsed.total_count,
    installationIds: parsed.installations.map((installation) => installation.id),
  }
}

export function parseRepositoriesResponse(payload: unknown): RepoSummary[] {
  return Repositories.parse(payload).repositories.map((repository) => ({
    id: repository.id,
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    private: repository.private,
    defaultBranch: repository.default_branch,
  }))
}
