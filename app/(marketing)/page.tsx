import type { Metadata } from "next"
import {
  CopyXIcon,
  EyeOffIcon,
  FileDownIcon,
  FolderTreeIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  SigmaIcon,
} from "lucide-react"

import { SignInButton } from "@/components/auth/auth-buttons"
import { Badge } from "@/components/ui/badge"
import { ButtonLink } from "@/components/ui/button-link"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export const metadata: Metadata = {
  title:
    "code-excerpt-pdf — print-ready code listings, never the same file twice",
  description:
    "Browse a repository as a file tree with a page count next to every file, pick files until the total is the length you need, and export a paginated PDF. Everything exported is recorded, so no file appears in two documents.",
}

/**
 * The landing page — and the app's `/`.
 *
 * It replaces the Next scaffold placeholder. Static, like the rest of
 * `(marketing)/`: no `auth()`, no database, nothing that depends on who is
 * looking, so the first page a stranger loads is prerendered.
 *
 * What it must get across is the product, not the stack: a page count next to
 * every file, a running total instead of a generate-and-count cycle, and a
 * ledger that makes "did I already submit this file?" a question nobody has to
 * answer from memory. Both doors are on it — `/local` needs no account at all,
 * and signing in is what adds repositories and the ledger.
 */
export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-16 p-8 py-16">
      <section className="flex flex-col items-start gap-6">
        <Badge variant="secondary">
          <SigmaIcon data-icon="inline-start" />
          Pick by page count, not by guesswork
        </Badge>

        <h1 className="text-4xl font-bold text-balance sm:text-5xl">
          Print-ready code listings, and never the same file twice.
        </h1>

        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          Browse a repository as a file tree with an estimated page count beside
          every file. Select files and watch the total accumulate until it is
          the length you actually need, then export one paginated, print-ready
          PDF. Every file that goes in is recorded, so it can never quietly turn
          up in the next document.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <SignInButton label="Sign in with GitHub" redirectTo="/projects" />
          <ButtonLink variant="outline" size="sm" href="/local">
            Try it with no account
          </ButtonLink>
        </div>

        <p className="text-sm text-muted-foreground">
          Local export works entirely inside your browser — drop a folder, get a
          PDF, nothing is uploaded and nothing is stored.
        </p>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">How it works</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Step
            icon={FolderTreeIcon}
            title="Open a repository"
            body="One listing call fetches the whole tree. Every file shows an estimated page count, and files that are vendored, generated or already exported are marked before you touch anything."
          />
          <Step
            icon={ListChecksIcon}
            title="Pick whole files"
            body="Selection is manual, by design — nothing auto-fills a quota. Selecting a folder adds only the files that are still available and tells you how many it skipped, and why."
          />
          <Step
            icon={SigmaIcon}
            title="Watch the real total"
            body="The running total is measured, not guessed: it is the page count of the document you are about to produce. There is no target field to fill in — you decide when the number is right."
          />
          <Step
            icon={FileDownIcon}
            title="Preview, then export"
            body="The preview is the very document the download saves, not a second render. A4, continuous flow, alphabetical, monospaced, Unicode — non-ASCII code renders and counts correctly."
          />
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">Why it is built this way</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <EyeOffIcon className="size-5 text-muted-foreground" />
              <CardTitle>Your code is never stored</CardTitle>
              <CardDescription>
                Not the files, not the PDFs. Only paths, commit SHAs, SHA-256
                content hashes and sizes — enough to know what was already
                published, and not enough to reconstruct any of it.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <ShieldCheckIcon className="size-5 text-muted-foreground" />
              <CardTitle>Read-only, on the repos you pick</CardTitle>
              <CardDescription>
                Access is a GitHub App with contents read-only, installed by you
                on individual repositories. It cannot write, cannot reach
                anything you did not select, and you revoke it on GitHub.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CopyXIcon className="size-5 text-muted-foreground" />
              <CardTitle>No fragment appears twice</CardTitle>
              <CardDescription>
                Exported files are marked used. Re-selecting one warns you
                instead of silently including it, and a file that changed since
                it was filed says so rather than pretending to be new.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="flex flex-col items-start gap-4 border-t pt-10">
        <h2 className="text-2xl font-semibold">
          Built for a listing you have to produce again next month
        </h2>
        <p className="max-w-2xl text-pretty text-muted-foreground">
          The recurring case: a batch of code of a specific length, which must
          not repeat the last one. That is what the ledger and the running total
          are for. Past exports stay on record and can be rebuilt from the exact
          commits they pinned — nothing is kept, so a rebuild re-fetches from
          GitHub rather than handing back a file we held on to.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SignInButton
            label="Get started with GitHub"
            redirectTo="/projects"
          />
          <ButtonLink variant="ghost" size="sm" href="/local">
            Or export a local folder
          </ButtonLink>
        </div>
      </section>
    </main>
  )
}

function Step({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
}) {
  return (
    <Card>
      <CardHeader>
        <Icon className="size-5 text-muted-foreground" />
        <CardTitle>{title}</CardTitle>
        <CardDescription>{body}</CardDescription>
      </CardHeader>
    </Card>
  )
}
