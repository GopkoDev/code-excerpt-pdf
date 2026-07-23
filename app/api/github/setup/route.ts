import { NextResponse } from "next/server"

/**
 * The GitHub App's **Setup URL** — deliberately distinct from the auth
 * callback.
 *
 * The trap this avoids: if "Request user authorization (OAuth) during
 * installation" is checked, GitHub returns the user to the *auth callback*
 * after an install, without the `state` Auth.js issued. Auth.js correctly
 * rejects that as CSRF, so the user installs the App successfully and lands
 * on an error page — a failure that looks like a broken login.
 *
 * Keep that checkbox unchecked, point the Setup URL here, and treat this as
 * idempotent: GitHub also sends the user back through it when they merely
 * change which repositories are selected, and that must not look like an
 * error either.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  // installation_id and setup_action arrive here; neither is needed. Repo
  // access is read live from /user/installations, so there is nothing to
  // persist and nothing that can go stale.
  const action = url.searchParams.get("setup_action")

  return NextResponse.redirect(
    new URL(
      action === "request" ? "/projects?requested=1" : "/projects",
      url.origin
    )
  )
}
