import { GitBranchIcon } from "lucide-react"

import { auth } from "@/auth"
import { SignInButton } from "@/components/auth/auth-buttons"
import { RepoList } from "@/components/projects/repo-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * The repository picker.
 *
 * The session is read here, on the server, but the repository list itself is
 * fetched by the client from `/api/github/repos` — SPEC allows no GitHub call
 * from a Server Component.
 */
export default async function ProjectsPage() {
  const session = await auth()

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Repositories</h1>
        <p className="text-muted-foreground">
          Pick a repository, choose the files, watch the page count, export a
          print-ready PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Available to the app</CardTitle>
          <CardDescription>
            Only the repositories you granted at installation, with contents
            read-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session?.user ? (
            <RepoList appSlug={process.env.NEXT_PUBLIC_GITHUB_APP_SLUG} />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GitBranchIcon />
                </EmptyMedia>
                <EmptyTitle>Sign in to read your repositories</EmptyTitle>
                <EmptyDescription>
                  Or skip the account entirely and use local export — it never
                  uploads anything.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <SignInButton redirectTo="/projects" />
              </EmptyContent>
            </Empty>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
