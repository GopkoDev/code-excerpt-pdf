/**
 * Whether the signed-in user has the App installed anywhere.
 *
 * Authentication and installation are separate steps for a GitHub App: a user
 * can sign in perfectly well and still have granted access to no repositories
 * at all. Treating that as an error would be wrong — they need routing to the
 * install page, not a failure.
 */

const GITHUB_API = "https://api.github.com"

export type InstallationState = {
  hasInstallation: boolean
  installationCount: number
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
  const response = await fetch(`${GITHUB_API}/user/installations`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    // Installation state changes out of band, so never serve it from a cache.
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error(`GitHub /user/installations returned ${response.status}`)
  }

  const body = (await response.json()) as { total_count?: number }
  const installationCount = body.total_count ?? 0

  return { hasInstallation: installationCount > 0, installationCount }
}
