import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"

import { unstable_update, type TokenUpdate } from "@/auth"
import { createInFlightLock } from "@/lib/github/refresh-lock"

/**
 * The **only** place a GitHub token is refreshed.
 *
 * Everything here follows from two facts: GitHub's user refresh tokens are
 * single-use and rotating, and Next forbids setting cookies during render.
 * Refreshing anywhere else — an RSC pass, the `jwt` callback, a Server
 * Component — computes a new token, fails to persist it, and leaves GitHub
 * having already invalidated the old one. The session then dies roughly eight
 * hours after a successful login, seemingly at random.
 *
 * A route handler *can* write cookies, so it happens here, once, behind a
 * lock.
 */

const lock = createInFlightLock<number>()

type GitHubTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  error?: string
}

export async function POST(request: Request) {
  const token = await getToken({
    // getToken reads and decrypts the cookie server-side, so the raw token
    // never has to travel through the session object to reach this handler.
    req: request as never,
    secret: process.env.AUTH_SECRET,
    secureCookie: process.env.NODE_ENV === "production",
  })

  if (!token) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 })
  }

  // Six months without a visit. A refresh cannot succeed, so say so rather
  // than letting GitHub return something opaque.
  if (
    typeof token.refreshTokenExpiresAt === "number" &&
    Math.floor(Date.now() / 1000) >= token.refreshTokenExpiresAt
  ) {
    return NextResponse.json({ error: "reauth-required" }, { status: 401 })
  }

  if (!token.refreshToken) {
    return NextResponse.json({ error: "no-refresh-token" }, { status: 401 })
  }

  const refreshToken = token.refreshToken
  const key = token.sub ?? "anonymous"

  try {
    const expiresAt = await lock.run(key, async () => {
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.AUTH_GITHUB_ID,
            client_secret: process.env.AUTH_GITHUB_SECRET,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        }
      )

      const body = (await response.json()) as GitHubTokenResponse

      // GitHub answers 200 with an `error` field rather than a failure status,
      // so the status alone cannot tell success from failure.
      if (!response.ok || body.error || !body.access_token) {
        throw new Error(body.error ?? `http-${response.status}`)
      }

      const now = Math.floor(Date.now() / 1000)
      const update: TokenUpdate = {
        accessToken: body.access_token,
        // Rotated on every use — dropping it would spend the next refresh on
        // a token GitHub has already retired.
        refreshToken: body.refresh_token,
        accessTokenExpiresAt: now + (body.expires_in ?? 8 * 60 * 60),
        refreshTokenExpiresAt: body.refresh_token_expires_in
          ? now + body.refresh_token_expires_in
          : undefined,
      }

      await unstable_update(update as never)
      return update.accessTokenExpiresAt
    })

    // The token itself is never returned. It stays in the encrypted cookie.
    return NextResponse.json({ ok: true, expiresAt })
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown"
    // Deliberately no token, no request body, no response body in the log.
    console.error(`[github/refresh] failed: ${reason}`)
    return NextResponse.json({ error: "refresh-failed" }, { status: 401 })
  }
}
