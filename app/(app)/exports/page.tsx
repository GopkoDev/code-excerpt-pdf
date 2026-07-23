import { HistoryIcon } from "lucide-react"

import { auth } from "@/auth"
import { SignInButton } from "@/components/auth/auth-buttons"
import { ExportsList } from "@/components/exports/exports-list"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * Past exports.
 *
 * The server does one thing: establish that there is a session. The history
 * itself is read by the client from `/api/exports`, and a rebuild goes through
 * `app/api/github/*` — SPEC allows no GitHub call from a Server Component, and
 * this page would otherwise be the easiest place to break that rule.
 */
export default async function ExportsPage() {
  const session = await auth()

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Exports</h1>
        <p className="text-muted-foreground">
          Every listing you have filed, newest first. No PDF is stored — a
          re-download rebuilds the document from the exact commits it was pinned
          to.
        </p>
      </div>

      {session?.user ? (
        <ExportsList />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>Sign in to see your exports</EmptyTitle>
            <EmptyDescription>
              Exports are recorded per account. Local export keeps no history at
              all, by design.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <SignInButton redirectTo="/exports" />
          </EmptyContent>
        </Empty>
      )}
    </main>
  )
}
