import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"

import { exportsDb } from "@/lib/db/exports-db"
import { upsertUser } from "@/lib/db/exports"

/**
 * Auth.js v5 against a **GitHub App** — not a classic OAuth App.
 *
 * SPEC forbids the classic app outright: it grants read *and write* to every
 * private repository. A GitHub App uses fine-grained per-repo permissions and
 * is installed only on the repos the user picks.
 *
 * No adapter, deliberately. `@auth/prisma-adapter` declares no Prisma 7
 * support, and the JWT session strategy needs no adapter at all — the `User`
 * row is upserted from the `signIn` callback instead (slice 6).
 */

declare module "next-auth" {
  /**
   * Note what is NOT here: the access token.
   *
   * The session object is readable by the browser through
   * `/api/auth/session`, so anything on it is effectively public to the page.
   * SPEC requires no token in any log or RSC payload, and every GitHub call
   * goes through `app/api/github/*` anyway, where the raw JWT is read
   * server-side with `getToken()`. The client only needs to know whether the
   * session is healthy.
   */
  interface Session {
    error?: "expired" | "reauth-required"
    /**
     * GitHub's numeric account id, as a string — the join key to the `User`
     * row. Public information, unlike the token: it is what a profile URL
     * resolves to. Auth.js puts no id on `session.user` under the JWT
     * strategy, so it is carried explicitly.
     */
    githubId?: string
    githubLogin?: string
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    accessToken?: string
    refreshToken?: string
    /** Epoch seconds. */
    accessTokenExpiresAt?: number
    refreshTokenExpiresAt?: number
    error?: "expired" | "reauth-required"
    githubId?: string
    githubLogin?: string
  }
}

/** The two public fields of a GitHub profile this app keeps. */
function githubIdentity(profile: unknown) {
  const value = profile as { id?: number | string; login?: string } | undefined
  if (value?.id === undefined || typeof value.login !== "string") return null
  return { githubId: String(value.id), login: value.login }
}

const nowInSeconds = () => Math.floor(Date.now() / 1000)

/** Refreshed tokens arrive here from app/api/github/refresh/route.ts. */
export type TokenUpdate = {
  accessToken: string
  refreshToken?: string
  accessTokenExpiresAt: number
  refreshTokenExpiresAt?: number
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,

      /**
       * TRAP 1 — the provider defaults to `scope: "read:user user:email"`.
       * A GitHub App ignores scopes entirely (permissions come from the
       * installation), so requesting any is useless and misleading.
       * Overriding to "" means nothing in this file ever reads as asking for
       * a scope: `grep -rn "repo" auth.ts` must find nothing.
       */
      authorization: { params: { scope: "" } },

      /**
       * TRAP 2 — the default `userinfo` falls back to `/user/emails` when the
       * profile email is null, which 403s unless the App holds the
       * account-level *Email addresses: Read* permission. Users who hide their
       * email hit this. Your own account probably does not, so it passes
       * manual testing and fails in production.
       *
       * Nothing here needs the email, so tolerate null.
       */
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email ?? null,
          image: profile.avatar_url,
        }
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    /**
     * The `User` row, created here because there is no adapter.
     *
     * `@auth/prisma-adapter` declares no Prisma 7 support and the JWT session
     * strategy needs none, so this one upsert is the whole of what an adapter
     * would have done. The rest of the schema hangs off it.
     *
     * A database hiccup must not cost the user their sign-in: local export
     * needs no account at all, and reading a repository needs no row either.
     * `POST /api/exports` upserts again before recording, so the row is
     * self-healing and the only thing lost here is an early write.
     */
    async signIn({ profile }) {
      const identity = githubIdentity(profile)
      if (identity) {
        try {
          await upsertUser(exportsDb, identity)
        } catch {
          // Deliberately swallowed — see above. Nothing loggable either: the
          // error could carry the connection string.
        }
      }
      return true
    },

    /**
     * TRAP 3 — this callback performs **no network I/O**, ever.
     *
     * Refreshing here is the documented cause of random logouts: Next forbids
     * setting cookies during render, so a rotated refresh token computed in an
     * RSC pass is discarded while GitHub has already invalidated the old one.
     * This only *marks* expiry. `app/api/github/refresh/route.ts` is the one
     * place allowed to act on it, and it feeds the result back through the
     * `update` trigger below.
     */
    async jwt({ token, account, profile, trigger, session }) {
      if (trigger === "update" && session) {
        const update = session as Partial<TokenUpdate>
        if (update.accessToken) {
          token.accessToken = update.accessToken
          token.accessTokenExpiresAt = update.accessTokenExpiresAt
          token.error = undefined
          // GitHub rotates the refresh token on every use. Dropping the new
          // one here would mean the next refresh presents a spent token.
          if (update.refreshToken) token.refreshToken = update.refreshToken
          if (update.refreshTokenExpiresAt) {
            token.refreshTokenExpiresAt = update.refreshTokenExpiresAt
          }
        }
        return token
      }

      if (account) {
        const extras = account as unknown as {
          refresh_token_expires_in?: number
        }
        // The identity, kept on the token because the session is rebuilt from
        // it on every request and the `User` row is looked up by it.
        const identity = githubIdentity(profile)
        if (identity) {
          token.githubId = identity.githubId
          token.githubLogin = identity.login
        }
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.accessTokenExpiresAt =
          typeof account.expires_at === "number"
            ? account.expires_at
            : nowInSeconds() + 8 * 60 * 60
        // GitHub returns refresh_token_expires_in (six months). Tracking it
        // turns an inactive user's return into a clean re-auth instead of a
        // 500 from a refresh that could never have worked.
        token.refreshTokenExpiresAt =
          typeof extras.refresh_token_expires_in === "number"
            ? nowInSeconds() + extras.refresh_token_expires_in
            : undefined
        token.error = undefined
        return token
      }

      if (
        typeof token.refreshTokenExpiresAt === "number" &&
        nowInSeconds() >= token.refreshTokenExpiresAt
      ) {
        token.error = "reauth-required"
        return token
      }

      if (
        typeof token.accessTokenExpiresAt === "number" &&
        nowInSeconds() >= token.accessTokenExpiresAt - 60
      ) {
        token.error = "expired"
      }

      return token
    },

    async session({ session, token }) {
      session.error = token.error
      // Still no access token here — only the two public identity fields the
      // exports pages need. See the `Session` declaration above.
      session.githubId = token.githubId
      session.githubLogin = token.githubLogin
      return session
    },
  },
})
