import { describe, expect, it } from "vitest"

import { createInFlightLock } from "@/lib/github/refresh-lock"

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createInFlightLock", () => {
  /**
   * The failure this exists to prevent: GitHub's refresh tokens are single-use
   * and rotating. Two refreshes racing means one of them presents a token the
   * other already consumed, and the session dies — the classic random-logout
   * report against Auth.js.
   */
  it("collapses concurrent calls for the same key into one run", async () => {
    const lock = createInFlightLock<string>()
    let runs = 0
    const gate = deferred<void>()

    const task = async () => {
      runs += 1
      await gate.promise
      return "token"
    }

    const all = Promise.all([
      lock.run("user-1", task),
      lock.run("user-1", task),
      lock.run("user-1", task),
      lock.run("user-1", task),
      lock.run("user-1", task),
    ])

    gate.resolve()
    expect(await all).toEqual(Array(5).fill("token"))
    expect(runs).toBe(1)
  })

  it("keeps different keys independent", async () => {
    const lock = createInFlightLock<string>()
    let runs = 0
    const task = async () => {
      runs += 1
      return "token"
    }

    await Promise.all([lock.run("user-1", task), lock.run("user-2", task)])
    expect(runs).toBe(2)
  })

  it("allows a fresh run once the first has settled", async () => {
    const lock = createInFlightLock<string>()
    let runs = 0
    const task = async () => {
      runs += 1
      return "token"
    }

    await lock.run("user-1", task)
    await lock.run("user-1", task)
    expect(runs).toBe(2)
  })

  it("delivers the same rejection to every waiter", async () => {
    const lock = createInFlightLock<string>()
    const gate = deferred<string>()
    const task = () => gate.promise

    const attempts = [lock.run("user-1", task), lock.run("user-1", task)]
    const settled = Promise.allSettled(attempts)
    gate.reject(new Error("refresh failed"))

    const results = await settled
    expect(results.every((r) => r.status === "rejected")).toBe(true)
  })

  /** A failed refresh must not poison the key — the user can try again. */
  it("does not cache a failure", async () => {
    const lock = createInFlightLock<string>()
    let runs = 0
    const task = async () => {
      runs += 1
      if (runs === 1) throw new Error("first attempt fails")
      return "token"
    }

    await expect(lock.run("user-1", task)).rejects.toThrow()
    await expect(lock.run("user-1", task)).resolves.toBe("token")
    expect(runs).toBe(2)
  })

  it("holds nothing once everything has settled", async () => {
    const lock = createInFlightLock<string>()
    await lock.run("user-1", async () => "token")
    expect(lock.size()).toBe(0)
  })
})
