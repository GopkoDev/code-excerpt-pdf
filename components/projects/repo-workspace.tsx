"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ChevronLeftIcon, RefreshCwIcon, ScissorsIcon } from "lucide-react"

import { RepoStats } from "@/components/projects/repo-stats"
import { SelectionPanel } from "@/components/selection/selection-panel"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useFileSelection } from "@/hooks/use-file-selection"
import { githubApiFetch } from "@/lib/github/refreshing-fetch"
import type { RenderResult } from "@/lib/pdf/render"
import { getGitHubSource } from "@/lib/sources/github-cache"
import type { UsedFileRecord } from "@/lib/uniqueness/status"
import type { ManualOverride } from "@/lib/vendored"

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
  const [isTruncated, setIsTruncated] = useState(false)
  const [isCached, setIsCached] = useState(false)
  const [ledgerError, setLedgerError] = useState<string | null>(null)
  const [overridesError, setOverridesError] = useState<string | null>(null)

  /**
   * A re-classification is written through immediately, so it survives a
   * reload — the difference between this and anonymous mode.
   *
   * Fire-and-report rather than await-and-block: the tree has already moved,
   * and making the checkbox wait on a round trip would make the common case
   * feel broken to fix the rare one. A failure is named instead of swallowed,
   * because an override that silently did not save is the kind of thing the
   * user only discovers a month later, in a listing that is now wrong.
   */
  const persistOverride = useCallback(
    (override: ManualOverride) => {
      setOverridesError(null)
      void fetch("/api/classifications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repo: { owner, name: repo }, override }),
      })
        .then((response) => {
          if (!response.ok) throw new Error("The server refused it.")
        })
        .catch(() =>
          setOverridesError(
            `“${override.path}” was re-classified here, but the change could not be saved and will be lost on reload.`
          )
        )
    },
    [owner, repo]
  )

  const selection = useFileSelection({ onOverrideChange: persistOverride })
  const { loadSource, setUsedFiles, setOverrides, describeSelection } =
    selection

  const openSource = useCallback(() => {
    // Cached in module scope, so coming back to this repo in the same session
    // re-uses the one Trees call rather than issuing another.
    const source = getGitHubSource({ owner, repo }, { fetcher: githubApiFetch })
    loadSource(source)

    // Costs nothing: the source hands back the tree it already resolved.
    void source
      .listFiles()
      .then(() => {
        setIsTruncated(source.isTruncated())
        setIsCached(source.isCached())
      })
      .catch(() => {
        setIsTruncated(false)
        setIsCached(false)
      })
  }, [owner, repo, loadSource])

  useEffect(openSource, [openSource])

  /**
   * The manual escape hatch from both cache tiers.
   *
   * The database tier is served without asking GitHub what the head SHA is
   * now — that is the entire saving — so a listing can be up to the TTL behind
   * a push. This is how a user who has just committed insists on the truth.
   * It costs exactly one Trees call, which is why it is a button rather than
   * something the page does on its own.
   */
  const handleRefresh = useCallback(() => {
    getGitHubSource({ owner, repo }, { fetcher: githubApiFetch }).refresh()
    openSource()
  }, [owner, repo, openSource])

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
   * The user's own classifications, restored before the first paint of the
   * tree — the resolver takes them as its highest-precedence layer, so a file
   * un-marked last month is authored again the moment they arrive.
   *
   * Also our own database, not GitHub: no API budget is spent.
   */
  useEffect(() => {
    const params = new URLSearchParams({ owner, repo })
    void fetch(`/api/classifications?${params}`)
      .then(async (response) => {
        const body = (await response.json()) as {
          overrides?: ManualOverride[]
          error?: string
        }
        if (!response.ok || !body.overrides) {
          throw new Error(body.error ?? "Could not read your classifications.")
        }
        setOverrides(body.overrides)
      })
      .catch((cause) =>
        setOverridesError(
          `${cause instanceof Error ? cause.message : String(cause)} Files you previously re-classified are shown with the automatic verdict instead.`
        )
      )
  }, [owner, repo, setOverrides])

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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold">
            {owner}/{repo}
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={selection.isLoading}
          >
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>
          {isCached && (
            <span className="text-muted-foreground text-sm">
              Showing a saved listing — refresh to re-read the repository.
            </span>
          )}
        </div>
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
            {overridesError && (
              <Alert variant="destructive">
                <AlertTitle>Your classifications are not in sync</AlertTitle>
                <AlertDescription>{overridesError}</AlertDescription>
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
