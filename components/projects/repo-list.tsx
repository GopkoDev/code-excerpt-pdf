"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FolderGitIcon, LockIcon, PlusIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Spinner } from "@/components/ui/spinner"
import { installUrl } from "@/lib/github/installation"
import { githubApiFetch } from "@/lib/github/refreshing-fetch"
import { encodeRepoId } from "@/lib/github/repo-id"
import type { RepoSummary } from "@/lib/github/repos"

type State =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; totalCount: number; repositories: RepoSummary[] }

/**
 * The repositories the App can reach, read through `/api/github/repos`.
 *
 * A client component calling the app's own route, not a Server Component
 * calling GitHub: SPEC keeps every GitHub request under `app/api/github/*` so
 * the token never leaves the server and never lands in an RSC payload.
 */
export function RepoList({ appSlug }: { appSlug: string | undefined }) {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    let cancelled = false

    void githubApiFetch("/api/github/repos")
      .then(async (response) => {
        const body = (await response.json()) as {
          totalCount?: number
          repositories?: RepoSummary[]
          error?: string
        }
        if (cancelled) return
        if (!response.ok) {
          setState({
            status: "failed",
            message: body.error ?? "Could not list your repositories.",
          })
          return
        }
        setState({
          status: "ready",
          totalCount: body.totalCount ?? 0,
          repositories: body.repositories ?? [],
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setState({
          status: "failed",
          message: cause instanceof Error ? cause.message : String(cause),
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === "loading") {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Spinner />
          </EmptyMedia>
          <EmptyTitle>Looking for your repositories…</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  }

  if (state.status === "failed") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not reach GitHub</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    )
  }

  // Signed in with nothing installed is the ordinary first-run state: the App
  // is authorised, but no repository has been granted to it yet.
  if (state.totalCount === 0 || state.repositories.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGitIcon />
          </EmptyMedia>
          <EmptyTitle>
            {state.totalCount === 0
              ? "The app is not installed yet"
              : "No repositories are shared with the app"}
          </EmptyTitle>
          <EmptyDescription>
            Choose the repositories it may read. It asks for contents,
            read-only, on the repositories you pick — nothing else.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            render={
              <a href={installUrl(appSlug)} target="_blank" rel="noreferrer" />
            }
          >
            <PlusIcon data-icon="inline-start" />
            {state.totalCount === 0
              ? "Install on GitHub"
              : "Change repository access"}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y rounded-md border">
        {state.repositories.map((repository) => (
          <li key={repository.id}>
            <Link
              href={`/projects/${encodeRepoId(repository.owner, repository.name)}`}
              className="flex items-center gap-3 p-3 transition-colors hover:bg-accent"
            >
              <FolderGitIcon className="size-4 text-muted-foreground" />
              <span className="font-mono text-sm">{repository.fullName}</span>
              {repository.private && (
                <Badge variant="secondary">
                  <LockIcon data-icon="inline-start" />
                  private
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {repository.defaultBranch ?? "default branch"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="sm"
          render={
            <a href={installUrl(appSlug)} target="_blank" rel="noreferrer" />
          }
        >
          <PlusIcon data-icon="inline-start" />
          Add or remove repositories
        </Button>
      </div>
    </div>
  )
}
