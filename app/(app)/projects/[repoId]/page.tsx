import { notFound } from "next/navigation"
import { GitBranchIcon } from "lucide-react"

import { auth } from "@/auth"
import { SignInButton } from "@/components/auth/auth-buttons"
import { RepoWorkspace } from "@/components/projects/repo-workspace"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { parseRepoId } from "@/lib/github/repo-id"

/**
 * One repository.
 *
 * The server does two things only: turn the `[repoId]` segment back into an
 * owner and a name, and establish that there is a session. The repository
 * itself is read by the client through `app/api/github/*`, never from here.
 */
export default async function RepoPage({
  params,
}: {
  params: Promise<{ repoId: string }>
}) {
  const { repoId } = await params
  const parts = parseRepoId(repoId)
  // A malformed id is a wrong URL, not an error worth a stack trace — and
  // refusing it here is what keeps it out of a GitHub API path.
  if (!parts) notFound()

  const session = await auth()
  if (!session?.user) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <GitBranchIcon />
            </EmptyMedia>
            <EmptyTitle>Sign in to open this repository</EmptyTitle>
            <EmptyDescription>
              Reading a repository needs the GitHub App. Local export needs no
              account at all.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <SignInButton redirectTo={`/projects/${repoId}`} />
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  return <RepoWorkspace owner={parts.owner} repo={parts.repo} />
}
