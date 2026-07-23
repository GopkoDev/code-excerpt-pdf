import {
  DownloadIcon,
  ExternalLinkIcon,
  SettingsIcon,
  ShieldCheckIcon,
} from "lucide-react"

import { auth } from "@/auth"
import { deleteAccountAction } from "./actions"
import { SignInButton } from "@/components/auth/auth-buttons"
import { DeleteAccountDialog } from "@/components/settings/delete-account-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { installUrl } from "@/lib/github/installation"

/**
 * Settings: repository access, the data export, and account deletion.
 *
 * Built last on purpose — it is the page that has to enumerate the *final*
 * schema, and enumerating a schema that is still growing is how a table ends
 * up outside a subject-access request.
 *
 * The server does two things here: establish the session and hand the deletion
 * Server Action to the dialog. It makes no GitHub call — SPEC keeps those in
 * `app/api/github/*` — and no database call either: the export is a download
 * from `/api/account/export`, so nothing personal is serialised into the RSC
 * payload just to render a page about it.
 */
export default async function SettingsPage() {
  const session = await auth()

  if (!session?.user) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
        <Header />
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SettingsIcon />
            </EmptyMedia>
            <EmptyTitle>Sign in to manage your account</EmptyTitle>
            <EmptyDescription>
              Local export has no account and no settings — it keeps nothing at
              all, so there is nothing here to export or erase.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <SignInButton redirectTo="/settings" />
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  const login = session.githubLogin

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <Header />

      <Card>
        <CardHeader>
          <CardTitle>Repository access</CardTitle>
          <CardDescription>
            Which repositories this app may read is decided on GitHub, not here.
            It holds a GitHub App installation with contents access, read-only,
            on the repositories you picked — and it has no way to grant itself
            another one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldCheckIcon />
            <AlertTitle>Revoking access is also done on GitHub</AlertTitle>
            <AlertDescription>
              Uninstalling the app stops every future read immediately. It does
              not erase what is already recorded here — use the deletion below
              for that.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            render={
              <a
                href={installUrl(process.env.NEXT_PUBLIC_GITHUB_APP_SLUG)}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            <ExternalLinkIcon data-icon="inline-start" />
            Manage repository access on GitHub
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>
            One JSON file containing every row this service holds about you:
            your account, your repositories, every export, the uniqueness ledger
            behind them, your manual classifications and any cached repository
            listings.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            What it cannot contain, because none of it is ever stored: your
            source code, the generated PDFs, and your GitHub token. The ledger
            is built from paths, commit SHAs, content hashes and file sizes —
            which is why a re-download re-fetches from GitHub instead of reading
            something we kept.
          </p>
        </CardContent>
        <CardFooter>
          <Button render={<a href="/api/account/export" download />}>
            <DownloadIcon data-icon="inline-start" />
            Download my data
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>
            Removes your account and everything hanging off it, permanently.
            Your GitHub repositories are untouched — this app has never had
            write access to them — but every record it kept about them is
            erased, including the ledger that stops a file being exported twice.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          {login ? (
            <DeleteAccountDialog login={login} action={deleteAccountAction} />
          ) : (
            <Alert variant="destructive">
              <AlertTitle>Sign in again first</AlertTitle>
              <AlertDescription>
                This session predates the identity fields deletion confirms
                against, so there is no name to type. Signing out and back in
                fixes it.
              </AlertDescription>
            </Alert>
          )}
        </CardFooter>
      </Card>
    </main>
  )
}

function Header() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground">
        Repository access, a full copy of your data, and the way out.
      </p>
    </div>
  )
}
