import Link from "next/link"
import type { Metadata } from "next"

import { DraftNotice } from "@/components/marketing/draft-notice"
import { Separator } from "@/components/ui/separator"

export const metadata: Metadata = {
  title: "Terms — code-excerpt-pdf",
  description:
    "The terms this service is offered under. A draft, pending legal review.",
}

/**
 * The terms of service.
 *
 * Static, like the privacy notice: no `auth()`, no database read, nothing that
 * depends on who is looking.
 *
 * The technical statements here are the same ones the privacy notice makes and
 * are checked against the code by `app/(marketing)/marketing.test.ts`. The
 * legal framing is not — it is a draft, every party-specific detail is a
 * placeholder, and the banner at the top says so.
 */
export default function TermsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Terms of service</h1>
        <p className="text-muted-foreground">
          What this service does, what it does not promise, and how to stop
          using it.
        </p>
      </div>

      <DraftNotice document="document" />

      <Section title="1. Who is offering this service">
        <p>
          This software can be run by anyone. The instance you are using is
          operated by [OPERATOR — LEGAL NAME], reachable at [CONTACT ADDRESS].
          These terms are between you and that operator.
        </p>
      </Section>

      <Section title="2. What the service does">
        <p>
          It reads repositories you have given it access to, shows them as a
          file tree with an estimated page count next to every file, lets you
          select files until the running total is the length you need, and
          exports a paginated, print-ready PDF. Every file included is recorded,
          so it can be marked as already published the next time you build a
          listing.
        </p>
        <p>
          <Link href="/local">Local export</Link> does the same for files you
          drop from your own disk, with no account and nothing stored anywhere.
        </p>
      </Section>

      <Section title="3. Your account and your repositories">
        <p>
          Signing in uses your GitHub account. Access to repositories is granted
          through a GitHub App with <strong>Contents: Read-only</strong>, which
          you install yourself on the repositories you choose. The service can
          only ever read, can only ever read what you installed it on, and
          cannot grant itself anything further.
        </p>
        <p>
          You can change or withdraw that access at any time on GitHub, and
          withdrawing it takes effect immediately. It does not delete what has
          already been recorded — <Link href="/settings">Settings</Link> has the
          deletion for that.
        </p>
        <p>
          You are responsible for having the right to export the code you
          export. The service has no way to know what you are permitted to
          publish, and offers no opinion on it.
        </p>
      </Section>

      <Section title="4. Your code stays yours">
        <p>
          Nothing here claims any right over your code. The service stores no
          source code and no generated PDFs — only file paths, commit SHAs,
          content hashes and file sizes, as the{" "}
          <Link href="/privacy">privacy notice</Link> sets out in full. The
          documents you export are yours to do anything you like with.
        </p>
      </Section>

      <Section title="5. What is not promised">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            The service is provided as it is, with no warranty of availability,
            fitness for any particular purpose, or freedom from error.
          </li>
          <li>
            The record of which files have already been exported is a
            convenience, not a legal record. It is only as complete as the
            exports that went through this service, and deleting your account
            erases it.
          </li>
          <li>
            A page count is exact for the document that produced it. A
            repository moves on, so rebuilding a past export can legitimately
            produce a different number of pages — that difference is reported,
            never hidden and never silently corrected.
          </li>
          <li>
            Re-downloading a past export re-fetches it from GitHub. If the
            repository or the pinned commit no longer exists, the export cannot
            be rebuilt; keep your own copy of anything you may need again.
          </li>
        </ul>
      </Section>

      <Section title="6. Acceptable use">
        <p>
          Do not use the service to export code you have no right to export, to
          work around GitHub&rsquo;s own terms or rate limits, or to attempt to
          reach data belonging to another account. The operator may suspend
          access where any of that is happening.
        </p>
      </Section>

      <Section title="7. Ending it">
        <p>
          You can stop at any time: uninstall the GitHub App, and delete your
          account from <Link href="/settings">Settings</Link>. Deletion removes
          your account and every record attached to it, including the ledger
          that marks files as already exported. It cannot be undone.
        </p>
        <p>
          The operator may withdraw the service, with reasonable notice where
          that is possible: [NOTICE PERIOD AND HOW IT WILL BE GIVEN].
        </p>
      </Section>

      <Section title="8. Liability">
        <p>
          To the extent the law allows, the operator is not liable for indirect
          or consequential loss arising from use of the service, and total
          liability is limited to [LIABILITY CAP]. Nothing here limits liability
          that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>
          These terms are governed by the law of [JURISDICTION], and disputes
          are subject to the courts of [COURTS]. Consumer rights that apply
          where you live are unaffected.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          These terms will change — starting with the placeholders above.
          Material changes will be announced rather than made silently: [HOW
          CHANGES WILL BE COMMUNICATED].
        </p>
      </Section>

      <Separator />

      <p className="text-sm text-muted-foreground">
        See also the <Link href="/privacy">privacy notice</Link>.
      </p>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}
