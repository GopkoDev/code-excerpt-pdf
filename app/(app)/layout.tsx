import Link from "next/link"
import { FileTextIcon } from "lucide-react"

import { auth } from "@/auth"
import { SignInButton, SignOutButton } from "@/components/auth/auth-buttons"
import { SiteFooter } from "@/components/site-footer"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Shell for everything that is not marketing.
 *
 * It reads the session but never gates on it: anonymous mode lives under this
 * layout too, and SPEC keeps it usable with no account at all. Only the pages
 * that actually need GitHub ask for a session.
 *
 * `auth()` reads the session cookie, which is exactly why the token is not on
 * the `Session` object — this value is serialised into the RSC payload the
 * browser receives.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-4 p-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <FileTextIcon className="size-5" />
            code-excerpt-pdf
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            <Button
              variant="ghost"
              size="sm"
              render={<Link href="/projects" />}
            >
              Repositories
            </Button>
            <Button variant="ghost" size="sm" render={<Link href="/local" />}>
              Local export
            </Button>
            {/* Only meaningful with an account — local export keeps no
                history by design — so it is shown only when signed in. */}
            {session?.user && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/exports" />}
                >
                  Exports
                </Button>
                {/* Same rule: there is nothing to export or erase without an
                    account, so the page only exists when there is one. */}
                <Button
                  variant="ghost"
                  size="sm"
                  render={<Link href="/settings" />}
                >
                  Settings
                </Button>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {session?.user ? (
              <>
                <span className="hidden text-sm text-muted-foreground sm:inline">
                  {session.user.name}
                </span>
                <SignOutButton />
              </>
            ) : (
              <SignInButton variant="outline" redirectTo="/projects" />
            )}
          </div>
        </div>
      </header>

      {session?.error && (
        <div className="mx-auto w-full max-w-4xl px-8 pt-6">
          <Alert variant="destructive">
            <AlertTitle>
              {session.error === "reauth-required"
                ? "Your GitHub authorisation has run out"
                : "Your GitHub session needs refreshing"}
            </AlertTitle>
            <AlertDescription>
              Sign in again to keep reading repositories. Local export is
              unaffected.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {children}

      {/* The same footer the marketing shell renders — it is how the legal
          pages are reachable from inside the app, and it reads no session. */}
      <SiteFooter />
    </div>
  )
}
