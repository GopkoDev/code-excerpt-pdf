"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ScissorsIcon } from "lucide-react"

import { RepoStats } from "@/components/projects/repo-stats"
import { SelectionPanel } from "@/components/selection/selection-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useFileSelection } from "@/hooks/use-file-selection"
import { githubApiFetch } from "@/lib/github/refreshing-fetch"
import type { RenderResult } from "@/lib/pdf/render"
import { getGitHubSource } from "@/lib/sources/github-cache"
import type { UsedFileRecord } from "@/lib/uniqueness/status"

/**
 * A repository, browsed exactly the way a dropped folder is.
 *
 * Everything below the heading is the same `SelectionPanel` anonymous mode
 * renders, driven by the same `useFileSelection` hook. What is GitHub-shaped
 * here is only what has no local equivalent: which `ContentSource` is loaded,
 * the truncation warning, and the export ledger — anonymous mode persists
 * nothing, so it has nothing to mark files against.
 */
export function RepoWorkspace({
  owner,
  repo,
}: {
  owner: string
  repo: string
}) {
  const selection = useFileSelection()
  const { loadSource, setUsedFiles, describeSelection } = selection
  const [isTruncated, setIsTruncated] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)

  useEffect(() => {
    // Cached in module scope, so coming back to this repo in the same session
    // re-uses the one Trees call rather than issuing another.
    const source = getGitHubSource({ owner, repo }, { fetcher: githubApiFetch })
    loadSource(source)

    // Costs nothing: the source hands back the tree it already resolved.
    void source
      .listFiles()
      .then(() => setIsTruncated(source.isTruncated()))
      .catch(() => setIsTruncated(false))
  }, [owner, repo, loadSource])

  /**
   * Our own database, not GitHub — a plain `fetch`, and nothing counted
   * against the API budget.
   */
  const loadLedger = useCallback(async () => {
    const params = new URLSearchParams({ owner, repo })
    const response = await fetch(`/api/exports/used?${params}`)
    const body = (await response.json()) as {
      usedFiles?: UsedFileRecord[]
      error?: string
    }
    if (!response.ok || !body.usedFiles) {
      throw new Error(body.error ?? "Could not read your export history.")
    }
    setUsedFiles(body.usedFiles)
  }, [owner, repo, setUsedFiles])

  useEffect(() => {
    // A ledger that fails to load must not read as "nothing was ever
    // exported" — that is precisely the mistake this feature exists to
    // prevent, so it is said out loud instead.
    void loadLedger().catch((cause) =>
      setLedgerError(cause instanceof Error ? cause.message : String(cause))
    )
  }, [loadLedger])

  /**
   * Records what the user just took away.
   *
   * Runs after the file is saved, with the page count of the very run that
   * produced those bytes. The commit SHA comes from the tree already fetched,
   * so a past export can be rebuilt by re-fetching rather than by storing what
   * it contained.
   */
  const recordExport = useCallback(
    async (result: RenderResult) => {
      const source = getGitHubSource(
        { owner, repo },
        { fetcher: githubApiFetch }
      )
      const commitSha = source.headSha()
      if (!commitSha) {
        throw new Error(
          "The repository revision is not known yet, so this export was not recorded."
        )
      }

      const described = await describeSelection()
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repo: { owner, name: repo },
          actualPages: result.pageCount,
          files: described.map((file) => ({ ...file, commitSha })),
        }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(body.error ?? "Could not record this export.")
      }

      // Re-read rather than patch the local list: the server is the ledger,
      // and a locally guessed copy would drift the moment a write partly
      // failed.
      await loadLedger()
    },
    [describeSelection, loadLedger, owner, repo]
  )

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          render={<Link href="/projects" />}
        >
          <ChevronLeftIcon data-icon="inline-start" />
          All repositories
        </Button>
        <h1 className="font-mono text-2xl font-bold">
          {owner}/{repo}
        </h1>
        <p className="text-muted-foreground">
          Files are read one at a time, only once you select them. Only paths,
          revisions and hashes are ever stored — never your code.
        </p>
        <RepoStats stats={selection.stats} />
      </div>

      <SelectionPanel
        selection={selection}
        emptyTitle="No files in this repository"
        emptyDescription="Nothing in the default branch could be listed as a file."
        onExported={recordExport}
        banner={
          <>
            {ledgerError && (
              <Alert variant="destructive">
                <AlertTitle>
                  Could not load what you have already exported
                </AlertTitle>
                <AlertDescription>
                  {ledgerError} Nothing below is marked as used, so treat the
                  tree as unverified until this loads.
                </AlertDescription>
              </Alert>
            )}
            {isTruncated && (
              <Alert>
                <ScissorsIcon />
                <AlertTitle>GitHub truncated this tree</AlertTitle>
                <AlertDescription>
                  The repository is larger than one Trees response can carry, so
                  some files are missing from the list below. What is shown is
                  accurate; it is simply not everything.
                </AlertDescription>
              </Alert>
            )}
          </>
        }
      />
    </main>
  )
}
