"use client"

/**
 * SLICE 0 SPIKE — throwaway page, deleted once slice 1 lands the real UI.
 *
 * Runs automatically on mount and writes a machine-readable verdict into
 * #spike-verdict so it can be checked headlessly, not just by eyeball.
 */

import { useEffect, useState } from "react"

import type { SpikeReport } from "./render.worker"

export default function SpikePage() {
  const [report, setReport] = useState<SpikeReport | null>(null)

  useEffect(() => {
    const worker = new Worker(new URL("./render.worker.ts", import.meta.url))
    worker.addEventListener("message", (event: MessageEvent<SpikeReport>) =>
      setReport(event.data)
    )
    worker.addEventListener("error", (event) =>
      setReport({ ok: false, checks: [], error: event.message })
    )
    worker.postMessage("run")
    return () => worker.terminate()
  }, [])

  const verdict = report ? (report.ok ? "PASS" : "FAIL") : "RUNNING"

  return (
    <main className="mx-auto max-w-3xl p-8 font-mono text-sm">
      <h1 className="mb-6 font-sans text-2xl font-bold">Slice 0 spike</h1>

      <p className="mb-6">
        Verdict: <span id="spike-verdict">{verdict}</span>
      </p>

      {report?.error && (
        <pre className="mb-6 whitespace-pre-wrap text-destructive">
          {report.error}
        </pre>
      )}

      <ul className="space-y-2">
        {report?.checks.map((check) => (
          <li key={check.label}>
            <span className={check.pass ? "text-primary" : "text-destructive"}>
              {check.pass ? "PASS" : "FAIL"}
            </span>{" "}
            {check.label}
            <span className="text-muted-foreground"> — {check.detail}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
