"use client"

import { useEffect, useState } from "react"

/** Seconds remaining until `until` (ISO). Returns 0 when passed or null. */
export function useCountdown(until: string | null | undefined): number {
  const target = until ? new Date(until).getTime() : 0
  const [left, setLeft] = useState(() => (target ? Math.max(0, Math.ceil((target - Date.now()) / 1000)) : 0))

  useEffect(() => {
    if (!target) {
      setLeft(0)
      return
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((target - Date.now()) / 1000)))
    tick()
    const timer = setInterval(tick, 250)
    return () => clearInterval(timer)
  }, [target])

  return left
}
