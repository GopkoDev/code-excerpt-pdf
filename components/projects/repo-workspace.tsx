"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, ScissorsIcon } from "lucide-react"

import { SelectionPanel } from "@/components/selection/selection-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useFileSelection } from "@/hooks/use-file-selection"
import { githubApiFetch } from "@/lib/github/refreshing-fetch"
import { getGitHubSource } from "@/lib/sources/github-cache"

/**
 * A repository, browsed exactly the way a dropped folder is.
 *
 * Everything below the heading is the same `SelectionPanel` anonymous mode
 * renders, driven by the same `useFileSelection` hook. The only GitHub-shaped
 * things here are which `ContentSource` is loaded and the truncation warning,
 * which has no local equivalent.
 */
export function RepoWorkspace({
  owner,
  repo,
}: {
  owner: string
  repo: string
}) {
  const selection = useFileSelection()
  const { loadSource } = selection
  const [isTruncated, setIsTruncated] = useState(false)

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
          Files are read one at a time, only once you select them. Nothing is
          stored.
        </p>
      </div>

      <SelectionPanel
        selection={selection}
        emptyTitle="No files in this repository"
        emptyDescription="Nothing in the default branch could be listed as a file."
        banner={
          isTruncated ? (
            <Alert>
              <ScissorsIcon />
              <AlertTitle>GitHub truncated this tree</AlertTitle>
              <AlertDescription>
                The repository is larger than one Trees response can carry, so
                some files are missing from the list below. What is shown is
                accurate; it is simply not everything.
              </AlertDescription>
            </Alert>
          ) : null
        }
      />
    </main>
  )
}
