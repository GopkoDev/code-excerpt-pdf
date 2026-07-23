import { getToken } from "next-auth/jwt"

/**
 * Reads the GitHub access token from the encrypted session cookie.
 *
 * This exists so route handlers never reach for the token any other way. It is
 * deliberately absent from the `Session` object — `/api/auth/session` is
 * readable by the browser, and SPEC forbids the token appearing in any RSC
 * payload or log.
 */
export async function readAccessToken(request: Request): Promise<{
  token: string
  expired: boolean
  /**
   * The GitHub identity riding on the same JWT.
   *
   * Returned here rather than fetched with a second `auth()` call: both read
   * and decrypt the same cookie, and a route that needs the token *and* a
   * `userId` — the tree route, once it caches — would otherwise pay for that
   * twice on its hottest path. Still not on the `Session`; this is the raw
   * JWT, which the browser cannot read.
   */
  githubId?: string
  githubLogin?: string
} | null> {
  const jwt = await getToken({
    req: request as never,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  })

  if (!jwt?.accessToken) return null
  return {
    token: jwt.accessToken,
    expired: jwt.error === "expired",
    githubId: jwt.githubId,
    githubLogin: jwt.githubLogin,
  }
}
