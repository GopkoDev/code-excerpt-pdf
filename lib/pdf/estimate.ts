/**
 * Page estimation for files whose content has not been fetched yet.
 *
 * This is the *lower* tier of the two-tier design in SPEC §3. Where content is
 * in hand, `lib/pdf/measure.ts` gives an exact count and this module must not
 * be used. It exists for the GitHub tree view, which knows every file's `size`
 * from one Trees call but has fetched no blobs — fetching them all just to
 * label the tree would blow the API budget.
 *
 * Worth knowing before tuning anything here: the estimate is a *browsing aid*
 * only. The running total the user stops at is computed from exact
 * measurements of the selected files, in GitHub mode too, because selecting a
 * file is what triggers its blob fetch. A wrong estimate therefore shows up as
 * a surprising jump when the file is selected — not as a short export.
 */

import { paginate, type Metrics } from "./measure"

/**
 * Assumed average bytes per source line.
 *
 * Calibrated against this repository: values run from 13 to 70 bytes per line
 * with a median near 30. Choosing a value *below* the median makes the estimate
 * lean high, which is the direction SPEC requires.
 *
 * 24 is not arbitrary. On this corpus the estimator first violates the "never
 * under by more than one page" rule at 28, so 24 keeps a deliberate margin
 * rather than sitting on the boundary.
 *
 * UTF-8 helps too: non-ASCII costs two bytes per column, so any file with
 * Cyrillic is over-estimated automatically.
 */
export const DEFAULT_BYTES_PER_LINE = 24

/**
 * Formats whose lines are structurally shorter than source code, so the code
 * average under-counts them badly.
 *
 * A deeply nested JSON file averages ~14 bytes per line: most of each line is
 * indentation plus a short key. Estimated at 24 it comes out tens of pages
 * short. Stylesheets have the same shape — one short declaration per line.
 *
 * **Known limits — do not read these numbers as a guarantee.** A size-only
 * estimate cannot bound its own error, because bytes carry no information
 * about line structure. Measured against synthetic shapes:
 *
 *  - sparse JSON (~14 b/line): was 24 pages short, now over by 3
 *  - stylesheets (~19 b/line): was 2 pages short, now over by 2
 *  - dense JSON (~62 b/line): over by ~4x — nothing helps, its lines are
 *    nothing like any constant we could pick
 *  - bullet-list markdown (~10 b/line): still under-counts by ~3 pages
 *  - a file that is half blank lines (~1.5 b/line): under-counts hopelessly,
 *    and no constant above 2 could ever cover it
 *
 * `json` and `css` are measured. The rest are reasoned from the same
 * structural argument — one short declaration or element per line — and are
 * not backed by a corpus.
 *
 * This is tolerable only because the estimate never feeds the running total:
 * that comes from exact measurements of the selected files. A bad estimate
 * costs a surprising jump when the file is selected, not a short export.
 */
const BYTES_PER_LINE_BY_EXTENSION: Record<string, number> = {
  json: 15,
  jsonc: 15,
  css: 16,
  scss: 16,
  less: 16,
  yaml: 16,
  yml: 16,
  toml: 18,
  md: 18,
  mdx: 18,
  html: 20,
  xml: 20,
  svg: 20,
}

export function bytesPerLineFor(fileName?: string): number {
  if (!fileName) return DEFAULT_BYTES_PER_LINE
  const parts = fileName.toLowerCase().split(".")
  if (parts.length < 2) return DEFAULT_BYTES_PER_LINE
  return BYTES_PER_LINE_BY_EXTENSION[parts.pop()!] ?? DEFAULT_BYTES_PER_LINE
}

export function estimateLines(sizeBytes: number, fileName?: string): number {
  return Math.ceil(sizeBytes / bytesPerLineFor(fileName))
}

/**
 * Estimated pages for a single file, routed through the real paginator so the
 * title line and inter-file spacing are accounted for the same way they are in
 * an exact count.
 */
export function estimatePages(
  sizeBytes: number,
  metrics: Metrics,
  fileName?: string
): number {
  return paginate(
    [
      {
        name: "",
        titleLines: 1,
        codeLines: estimateLines(sizeBytes, fileName),
      },
    ],
    metrics
  )
}

/**
 * Estimated pages for a whole folder, as ONE continuous flow.
 *
 * Never sum per-file estimates: each rounds up to a whole page, while the
 * export packs them end to end. See `measure.test.ts` § "pagination is a flow,
 * not a sum".
 */
export function estimatePagesForFiles(
  files: { name: string; sizeBytes: number }[],
  metrics: Metrics
): number {
  if (files.length === 0) return 0
  return paginate(
    files.map((file) => ({
      name: file.name,
      titleLines: 1,
      codeLines: estimateLines(file.sizeBytes, file.name),
    })),
    metrics
  )
}
