import { TriangleAlertIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/**
 * The banner both legal pages open with.
 *
 * Neither page was written by a lawyer. They are accurate about the technical
 * facts — every claim in them is pinned to the code by
 * `app/(marketing)/marketing.test.ts` — and unreviewed about everything else,
 * which is a combination a reader has to be told about up front rather than
 * infer. One component, so the two pages cannot disagree about how provisional
 * they are.
 */
export function DraftNotice({ document }: { document: string }) {
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>Draft — pending legal review</AlertTitle>
      <AlertDescription>
        <p>
          This {document} has not been reviewed by a lawyer and is not a binding
          agreement. It is published so the technical facts are on the record
          while the wording is still being worked out. Anything in square
          brackets is a placeholder the operator of this instance still has to
          fill in.
        </p>
        <p>
          The descriptions of what is stored, what is never stored, and what
          deletion does are accurate as of this build — they are checked against
          the source code by the test suite. The legal framing around them is
          not settled.
        </p>
      </AlertDescription>
    </Alert>
  )
}
