import Link from "next/link"
import type { Metadata } from "next"

import { DraftNotice } from "@/components/marketing/draft-notice"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { STORED_DATA } from "./stored-data"

export const metadata: Metadata = {
  title: "Privacy — code-excerpt-pdf",
  description:
    "What this service stores, what it never stores, and what deletion does.",
}

/**
 * The privacy notice.
 *
 * A static page on purpose: it calls no `auth()` and reads no database, so it
 * renders for a signed-out visitor and Next can prerender it. Nothing on it
 * depends on who is looking.
 *
 * The inventory it renders comes from `./stored-data`, which is pinned
 * column-for-column to `prisma/schema.prisma` by
 * `app/(marketing)/marketing.test.ts`. Everything else here is prose, and the
 * prose is deliberately narrow: it states technical facts that are true of
 * this code, and leaves every legal and operational question the operator has
 * to answer as a visible placeholder.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Privacy</h1>
        <p className="text-muted-foreground">
          What this service stores, when it stores it, and what happens when you
          ask for it back or ask for it gone.
        </p>
      </div>

      <DraftNotice document="privacy notice" />

      <Section title="The short version">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            Your source code is never stored. Neither are the PDFs you generate.
            The service keeps file paths, commit SHAs, SHA-256 content hashes
            and file sizes — enough to know what has already been exported and
            to re-fetch it from GitHub, and not enough to reconstruct a line of
            it.
          </li>
          <li>
            Reading your repositories happens through a GitHub App with{" "}
            <strong>Contents: Read-only</strong>, installed by you on the
            repositories you pick. It can never write to them, and it can never
            grant itself another one.
          </li>
          <li>
            Local export keeps nothing at all. It needs no account, uploads
            nothing, and the PDF is built inside your browser.
          </li>
          <li>
            Opening a repository is recorded, not only exporting from one. See{" "}
            <a href="#opening">below</a> — it is the one thing on this page that
            usually surprises people.
          </li>
        </ul>
      </Section>

      <Section title="Who is responsible for your data">
        <p>
          This software can be run by anyone. The operator of the instance you
          are using is the data controller, and is the party to contact:
        </p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Operator: [OPERATOR — LEGAL NAME]</li>
          <li>Contact: [CONTACT ADDRESS]</li>
          <li>Established in: [JURISDICTION]</li>
        </ul>
        <p>
          The rest of this page describes the software, which behaves the same
          way wherever it is run.
        </p>
      </Section>

      <Section title="Everything that is stored">
        <p>
          Six tables, listed here field by field. This list is generated from
          the same schema the database is built from, and the test suite fails
          if the two ever disagree — so it cannot quietly fall behind.
        </p>
        <div className="flex flex-col gap-4">
          {Object.entries(STORED_DATA).map(([model, category]) => (
            <Card key={model}>
              <CardHeader>
                <CardTitle>{category.title}</CardTitle>
                <CardDescription>
                  <span className="font-mono">{model}</span> —{" "}
                  {category.written}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {category.fields.map((field) => (
                    <Badge key={field} variant="secondary">
                      <span className="font-mono">{field}</span>
                    </Badge>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground">{category.why}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="What is never stored" id="never">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Source code.</strong> No table has a column that could hold
            it, and the two write paths a browser can reach accept only the
            fields listed above — anything else is discarded before it reaches
            the database.
          </li>
          <li>
            <strong>Generated PDFs.</strong> They are built in your browser and
            handed to your download folder. Re-downloading a past export
            re-fetches the pinned commits from GitHub and renders again.
          </li>
          <li>
            <strong>Your GitHub token.</strong> It lives in an encrypted session
            cookie, is never written to the database, and is never placed on
            anything the browser page can read.
          </li>
          <li>
            <strong>Your email address.</strong> The sign-in deliberately
            tolerates a hidden email and keeps only your GitHub username and
            numeric account id.
          </li>
        </ul>
      </Section>

      <Section title="Opening a repository is recorded" id="opening">
        <p>
          When you open a repository, its file listing is fetched from GitHub
          once and cached so that a second tab or a restarted server does not
          spend another call. That cache row is attached to a repository row —
          so the database learns which repositories you <em>looked at</em>, not
          only which ones you exported from.
        </p>
        <p>
          What the cache holds is the listing, not the repository: one entry per
          file with its path, its size and its Git blob SHA. It is replaced when
          the repository&rsquo;s head commit moves, and it is stated here rather
          than left to be discovered, because a listing of paths does describe
          the shape of private work.
        </p>
      </Section>

      <Section title="Local export sends nothing anywhere">
        <p>
          <Link href="/local">Local export</Link> reads the files you drop
          straight from your own disk, measures and renders them in a Web Worker
          inside the page, and hands you the PDF. There is no account, no
          upload, and no row written anywhere. It is the mode to use if none of
          this page should apply to you at all.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Only the ones signing in requires. The important one is the encrypted
          session cookie, which keeps you signed in and is where the GitHub
          token lives, readable by the server and never by the page. Alongside
          it the sign-in flow sets the usual short-lived helpers — a CSRF token,
          the URL to return to, and a one-time code verifier.
        </p>
        <p>
          There are no analytics cookies, no tracking pixels and no third-party
          scripts in this application. Nothing here counts visitors.
        </p>
        <p>
          The operator&rsquo;s hosting provider may keep its own request logs,
          which this software neither controls nor can see: [HOSTING PROVIDER
          AND ITS LOG RETENTION].
        </p>
      </Section>

      <Section title="Who else sees your data">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>GitHub</strong> — every repository read is a request made
            with your own installation token, so GitHub sees it exactly as it
            sees you browsing your own repositories.
          </li>
          <li>
            <strong>The database provider</strong> — the six tables above are
            stored in a hosted Postgres database: [DATABASE PROVIDER AND
            REGION].
          </li>
          <li>
            <strong>The hosting provider</strong> — [HOSTING PROVIDER AND
            REGION].
          </li>
        </ul>
        <p>
          Nothing is sold, and nothing is shared with anyone else. There is no
          analytics vendor and no error-reporting service receiving payloads.
        </p>
      </Section>

      <Section title="Getting your data, and getting rid of it">
        <p>
          <Link href="/settings">Settings</Link> holds both. The export hands
          you one JSON file containing every row from every one of the six
          tables above. Deletion removes your account and everything hanging off
          it: your repositories, your exports, the uniqueness ledger, your
          overrides and any cached listings — each table deleted explicitly, not
          left to a cascade.
        </p>
        <p>Two consequences worth knowing before you press it:</p>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Deletion erases the uniqueness ledger,</strong> so files you
            previously exported become selectable again. The record that they
            were used no longer exists — which is the point of an erasure, but
            it does mean the protection against exporting something twice starts
            over.
          </li>
          <li>
            <strong>Database backups are not reached by a row deletion.</strong>{" "}
            The hosted database keeps its own backups and a
            point-in-time-recovery window, and deleting rows in the live
            database does not rewrite them. They age out on the provider&rsquo;s
            schedule: [BACKUP AND POINT-IN-TIME-RECOVERY RETENTION WINDOW].
          </li>
        </ul>
        <p>
          Uninstalling the GitHub App is a separate action, taken on GitHub. It
          stops every future read immediately but erases nothing that was
          already recorded — use the deletion for that.
        </p>
      </Section>

      <Section title="Changes to this notice">
        <p>
          This is a draft and will change, in particular once the placeholders
          above are filled in. Material changes will be described here rather
          than made silently: [HOW CHANGES WILL BE COMMUNICATED].
        </p>
      </Section>

      <Separator />

      <p className="text-sm text-muted-foreground">
        See also the <Link href="/terms">terms of service</Link>.
      </p>
    </main>
  )
}

function Section({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="flex scroll-mt-8 flex-col gap-3 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4"
    >
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}
