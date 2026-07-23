/**
 * Messages exchanged with the PDF worker.
 *
 * The split follows SPEC §3: measuring needs pdfkit, so it happens once per
 * file in the worker; the running total is then pure arithmetic on the main
 * thread (`paginate`), recomputed on every selection change without touching
 * the worker again.
 */

import type { Metrics, MeasuredFile } from "./measure"
import type { RenderedFile, SourceFile } from "./render"

export type WorkerRequest =
  | { id: number; type: "measure"; files: { name: string; text: string }[] }
  | { id: number; type: "render"; files: SourceFile[] }

export type WorkerResponse =
  | { id: number; type: "measured"; files: MeasuredFile[]; metrics: Metrics }
  | {
      id: number
      type: "rendered"
      blob: Blob
      pageCount: number
      files: RenderedFile[]
    }
  | { id: number; type: "failed"; message: string }
