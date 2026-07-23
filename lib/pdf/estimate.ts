/**
 * Page estimation for files whose content has not been fetched yet.
 *
 * This is the *lower* tier of the two-tier design in SPEC §3. Where content is
 * in hand, `lib/pdf/measure.ts` gives an exact count and this module must not
 * be used. It exists for the GitHub tree view, which knows every file's `size`
 * from one Trees call but has fetched no blobs — fetching them all just to
 * label the tree would blow the API budget.
 *
 * The bias is deliberate and one-directional: over-estimating merely prompts
 * the user to add another file, while under-estimating costs a whole
 * generate → too-few-pages → regenerate cycle.
 */

import { paginate, type Metrics } from "./measure"

/**
 * Assumed average bytes per source line.
 *
 * Calibrated against this repository: observed values run from 13 to 70 bytes
 * per line with a median near 30. Choosing a value *below* the median makes
 * the estimate lean high, which is the safe direction.
 *
 * 24 is not arbitrary. On this corpus the estimator first violates the
 * "never under by more than one page" rule at 28, so 24 keeps a deliberate
 * margin rather than sitting on the boundary. Raising it tightens the
 * estimate and eats that margin — `estimate.test.ts` is what tells you when
 * it has run out.
 *
 * UTF-8 helps here too: non-ASCII costs two bytes per column, so any file
 * with Cyrillic is over-estimated automatically.
 */
export const ESTIMATED_BYTES_PER_LINE = 24

export function estimateLines(sizeBytes: number): number {
  return Math.ceil(sizeBytes / ESTIMATED_BYTES_PER_LINE)
}

/**
 * Estimated pages for a single file, routed through the real paginator so the
 * title line and inter-file spacing are accounted for the same way they are in
 * an exact count.
 */
export function estimatePages(sizeBytes: number, metrics: Metrics): number {
  return paginate(
    [{ name: "", titleLines: 1, codeLines: estimateLines(sizeBytes) }],
    metrics
  )
}

/** Estimated pages for a whole folder, as one continuous flow. */
export function estimatePagesForSizes(
  sizes: number[],
  metrics: Metrics
): number {
  if (sizes.length === 0) return 0
  return paginate(
    sizes.map((sizeBytes, index) => ({
      name: String(index),
      titleLines: 1,
      codeLines: estimateLines(sizeBytes),
    })),
    metrics
  )
}
