"use client"

import { useCallback, useEffect, useRef } from "react"

import type { WorkerRequest, WorkerResponse } from "@/lib/pdf/worker-protocol"

type Pending = {
  resolve: (response: WorkerResponse) => void
  reject: (error: Error) => void
}

/**
 * Owns the PDF worker for the lifetime of the component and turns its
 * message passing into promises.
 *
 * The worker is created lazily on first use, so simply opening the page costs
 * nothing — pdfkit is fetched only when there is something to measure.
 */
export function usePdfWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef(new Map<number, Pending>())
  const nextIdRef = useRef(0)

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current

    const worker = new Worker(
      new URL("../components/pdf/render.worker.ts", import.meta.url)
    )

    worker.addEventListener(
      "message",
      (event: MessageEvent<WorkerResponse>) => {
        const pending = pendingRef.current.get(event.data.id)
        if (!pending) return
        pendingRef.current.delete(event.data.id)
        if (event.data.type === "failed") {
          pending.reject(new Error(event.data.message))
        } else {
          pending.resolve(event.data)
        }
      }
    )

    worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "The PDF worker crashed.")
      pendingRef.current.forEach((pending) => pending.reject(error))
      pendingRef.current.clear()
    })

    workerRef.current = worker
    return worker
  }, [])

  const send = useCallback(
    (request: Omit<WorkerRequest, "id">): Promise<WorkerResponse> => {
      const worker = getWorker()
      const id = ++nextIdRef.current
      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject })
        worker.postMessage({ ...request, id } as WorkerRequest)
      })
    },
    [getWorker]
  )

  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      pending.clear()
    }
  }, [])

  return { send }
}
