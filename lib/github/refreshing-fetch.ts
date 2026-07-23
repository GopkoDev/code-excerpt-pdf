/**
 * A `fetch` that survives the eight-hour token expiring mid-session.
 *
 * The routes under `app/api/github/*` answer `401 token-expired` rather than
 * refreshing inline, because only `app/api/github/refresh/route.ts` may rotate
 * a token — GitHub's refresh tokens are single-use, and a route handler is the
 * only place allowed to write the resulting cookie. This is the other half of
 * that contract: notice the marker, refresh once, retry once.
 *
 * The single-flight promise matters as much as the retry. Selecting a folder
 * fires several blob reads at once; without coalescing, each would post its
 * own refresh, and every refresh after the first would present a token GitHub
 * had already retired. The server holds an in-flight lock of its own, but the
 * client should not lean on that to avoid sending the requests at all.
 */

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

async function isExpired(response: Response): Promise<boolean> {
  if (response.status !== 401) return false
  try {
    // Cloned so the caller still gets an unread body if this is not an expiry.
    const body = (await response.clone().json()) as { error?: string }
    return body.error === "token-expired"
  } catch {
    return false
  }
}

/**
 * Wrapped rather than passed by reference: a detached `fetch` has no receiver,
 * which some browsers reject outright.
 */
const globalFetch: Fetcher = (input, init) => fetch(input, init)

export function createRefreshingFetch(
  underlying: Fetcher = globalFetch
): Fetcher {
  let inFlight: Promise<boolean> | null = null

  const refresh = () => {
    inFlight ??= underlying("/api/github/refresh", { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  return async (input, init) => {
    const response = await underlying(input, init)
    if (!(await isExpired(response))) return response

    // A failed refresh means re-authentication, not a retry loop: return the
    // original 401 and let the page say so.
    if (!(await refresh())) return response

    return underlying(input, init)
  }
}

/**
 * The app's client-side fetcher. A single instance per tab, so the
 * single-flight window is shared by the repository list, the tree and every
 * blob read rather than being per component.
 */
export const githubApiFetch = createRefreshingFetch()
