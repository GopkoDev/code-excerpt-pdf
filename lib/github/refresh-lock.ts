/**
 * Collapses concurrent work for the same key into a single run.
 *
 * Exists for exactly one reason: GitHub's user refresh tokens are single-use
 * and rotating. A page that fires several blob fetches at once will notice an
 * expired token several times at once, and two refreshes racing means the
 * loser presents a token the winner already consumed — the session dies. That
 * is the mechanism behind the random-logout reports against Auth.js
 * (nextauthjs/next-auth#7522).
 *
 * **Scope, and its limit.** This is an in-process map. It holds within one
 * lambda instance, which is what makes 3–5 parallel fetches from a single page
 * safe. It does *not* coordinate across instances, so the refresh route must
 * still tolerate losing the race — verify on a real deploy, not localhost,
 * where a single process hides the gap.
 */
export function createInFlightLock<T>() {
  const inFlight = new Map<string, Promise<T>>()

  return {
    run(key: string, task: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key)
      if (existing) return existing

      // Attach the cleanup before returning, so a rejection never leaves the
      // key poisoned — a failed refresh must be retryable.
      const started = task().finally(() => {
        inFlight.delete(key)
      })

      inFlight.set(key, started)
      return started
    },

    size() {
      return inFlight.size
    },
  }
}
