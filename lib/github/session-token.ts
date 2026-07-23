import { getToken } from "next-auth/jwt"

/**
 * Reads the GitHub access token from the encrypted session cookie.
 *
 * This exists so route handlers never reach for the token any other way. It is
 * deliberately absent from the `Session` object — `/api/auth/session` is
 * readable by the browser, and SPEC forbids the token appearing in any RSC
 * payload or log.
 */
export async function readAccessToken(
  request: Request
): Promise<{ token: string; expired: boolean } | null> {
  const jwt = await getToken({
    req: request as never,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  })

  if (!jwt?.accessToken) return null
  return { token: jwt.accessToken, expired: jwt.error === "expired" }
}
