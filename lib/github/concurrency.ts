/**
 * Runs an async worker over a list with a hard cap on parallelism.
 *
 * SPEC caps content fetches at 3–5. That is not politeness: GitHub applies
 * *secondary* rate limits to bursts, which fail differently from the primary
 * 5000/hr budget and are easy to trip by firing one request per selected file.
 *
 * A queue rather than batching, deliberately. `Promise.all` over chunks stalls
 * every worker in a chunk on its slowest member; a shared cursor keeps the
 * pipe full.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  const workers = Math.max(1, Math.min(limit, items.length))
  let cursor = 0

  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        // Read and advance in one synchronous step: there is no await between
        // them, so two workers can never claim the same index.
        const index = cursor++
        results[index] = await worker(items[index], index)
      }
    })
  )

  return results
}
