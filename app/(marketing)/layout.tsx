import Link from "next/link"
import { FileTextIcon } from "lucide-react"

import { SignInButton } from "@/components/auth/auth-buttons"
import { SiteFooter } from "@/components/site-footer"
import { ButtonLink } from "@/components/ui/button-link"

/**
 * The public shell: landing, terms, privacy.
 *
 * Deliberately **not** the app shell. `app/(app)/layout.tsx` calls `auth()` to
 * render a session-aware header, which makes every page under it dynamic —
 * fine there, wrong here. Nothing under this layout reads the session, so the
 * three pages prerender as static content (`○` in the build's route table) and
 * a signed-out visitor is the case they were designed for rather than a case
 * they tolerate.
 *
 * The header is therefore the same for everyone. The sign-in button is a
 * Server Action form, which is legal on a static page — the action runs on
 * request, nothing is read at render.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-4 p-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <FileTextIcon className="size-5" />
            code-excerpt-pdf
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <ButtonLink variant="ghost" size="sm" href="/local">
              Local export
            </ButtonLink>
            <SignInButton variant="outline" redirectTo="/projects" />
          </div>
        </div>
      </header>

      {children}

      <SiteFooter />
    </div>
  )
}
