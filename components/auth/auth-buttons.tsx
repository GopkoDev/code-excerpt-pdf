import { LogInIcon, LogOutIcon } from "lucide-react"

import { signIn, signOut } from "@/auth"
import { Button } from "@/components/ui/button"

/**
 * Sign in and out as Server Actions.
 *
 * A form rather than an `onClick`: `signIn` and `signOut` write cookies, which
 * only a Server Action or a route handler may do. Doing it in a client handler
 * would need a client-side `next-auth/react` provider, one more place the
 * session could be read from, and a session shape on the client — none of
 * which this app wants, since the token deliberately never reaches the
 * browser.
 */

export function SignInButton({
  label = "Sign in with GitHub",
  variant = "default",
  redirectTo,
}: {
  label?: string
  variant?: "default" | "outline"
  redirectTo?: string
}) {
  return (
    <form
      action={async () => {
        "use server"
        await signIn("github", redirectTo ? { redirectTo } : undefined)
      }}
    >
      <Button type="submit" variant={variant} size="sm">
        <LogInIcon data-icon="inline-start" />
        {label}
      </Button>
    </form>
  )
}

export function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server"
        await signOut({ redirectTo: "/" })
      }}
    >
      <Button type="submit" variant="ghost" size="sm">
        <LogOutIcon data-icon="inline-start" />
        Sign out
      </Button>
    </form>
  )
}
