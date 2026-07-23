/**
 * Whether the signed-in user has the App installed anywhere, and where.
 *
 * Authentication and installation are separate steps for a GitHub App: a user
 * can sign in perfectly well and still have granted access to no repositories
 * at all. Treating that as an error would be wrong — they need routing to the
 * install page, not a failure.
 *
 * The request goes through `client.ts` like every other, so a revoked grant or
 * an exhausted rate limit arrives as the same mapped `GitHubError` the route
 * handlers already translate into a status — and there stays exactly one place
 * that talks to api.github.com.
 */

import { githubFetch } from "./client"
import { parseInstallationsResponse } from "./repos"

export type InstallationState = {
  hasInstallation: boolean
  installationCount: number
  /** The repository list is per installation, so the ids are needed too. */
  installationIds: number[]
}

export function installUrl(appSlug: string | undefined): string {
  // Falls back to the apps index rather than a broken URL if the slug is unset.
  return appSlug
    ? `https://github.com/apps/${appSlug}/installations/new`
    : "https://github.com/settings/installations"
}

export async function fetchInstallationState(
  accessToken: string
): Promise<InstallationState> {
  const parsed = parseInstallationsResponse(
    await githubFetch("/user/installations", accessToken)
  )

  return {
    hasInstallation: parsed.totalCount > 0,
    installationCount: parsed.totalCount,
    installationIds: parsed.installationIds,
  }
}
