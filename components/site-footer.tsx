import Link from "next/link"

/**
 * The one footer, rendered by both shells.
 *
 * It exists mainly so the legal pages are reachable from every page in the
 * app — a privacy notice nobody can navigate to is the actual failure mode,
 * and `app/(marketing)/marketing.test.ts` asserts both layouts render this.
 *
 * No session, no database, no client JavaScript: it must not be the thing that
 * makes a static marketing page dynamic.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <p className="max-w-md text-balance">
          No source code and no generated PDFs are ever stored — only file
          paths, commit SHAs, content hashes and sizes.
        </p>
        <nav className="flex flex-wrap items-center gap-4 sm:ml-auto">
          <Link href="/local" className="hover:text-foreground">
            Local export
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
