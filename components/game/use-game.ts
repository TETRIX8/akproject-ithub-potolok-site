"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { api, ApiClientError, fetcher } from "@/lib/client/api"
import type { GameState, QuestView, SessionStartResponse, TapBatchResult } from "@/lib/game/types"

export type SessionStatus =
  | { kind: "connecting" }
  | { kind: "active"; sessionId: string }
  | { kind: "conflict"; deviceLabel: string | null; sameDevice: boolean; canTakeover: boolean }
  | { kind: "lost"; code: string; message: string }
  | { kind: "offline" }

export interface Toast {
  id: number
  tone: "success" | "warning" | "danger" | "info"
  title: string
  body?: string
}

const TAB_KEY = "tap-game:active-tab"

function randomId(len = 16) {
  const bytes = new Uint8Array(len)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"[b % 64]).join("")
}

/**
 * Owns the game loop on the client: server session lifecycle, tap batching with idempotent
 * batch ids, optimistic counters reconciled against server responses, and heartbeats.
 */
export function useGame() {
  const { data, mutate } = useSWR<{ ok: true; state: GameState }>("/api/game/state", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 2000,
  })
  const state = data?.state ?? null

  const [session, setSession] = useState<SessionStatus>({ kind: "connecting" })
  const [pending, setPending] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [challengeOpen, setChallengeOpen] = useState(false)
  const [completedQuest, setCompletedQuest] = useState<QuestView | null>(null)

  const sessionRef = useRef<string | null>(null)
  const tabIdRef = useRef<string>("")
  const buffer = useRef<{ count: number; first: number; last: number }>({ count: 0, first: 0, last: 0 })
  const inflight = useRef<{ batchId: string; taps: number; durationMs: number } | null>(null)
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastId = useRef(0)

  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastId.current
    setToasts((prev) => [...prev.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200)
  }, [])

  const applyServerState = useCallback(
    (patch: Partial<GameState>) => {
      void mutate((cur) => (cur ? { ok: true, state: { ...cur.state, ...patch } } : cur), { revalidate: false })
    },
    [mutate],
  )

  // ---- Session lifecycle ---------------------------------------------------------------
  const start = useCallback(
    async (takeover = false) => {
      setSession({ kind: "connecting" })
      try {
        const res = await api<SessionStartResponse>("/api/game/session/start", { json: { takeover } })
        if (res.ok) {
          sessionRef.current = res.sessionId
          setSession({ kind: "active", sessionId: res.sessionId })
          void mutate({ ok: true, state: res.state }, { revalidate: false })
          try {
            localStorage.setItem(TAB_KEY, JSON.stringify({ tabId: tabIdRef.current, sessionId: res.sessionId, at: Date.now() }))
          } catch {}
        }
      } catch (err) {
        if (err instanceof ApiClientError && err.code === "SESSION_ACTIVE") {
          setSession({
            kind: "conflict",
            deviceLabel: (err.extra.deviceLabel as string | null) ?? null,
            sameDevice: Boolean(err.extra.sameDevice),
            canTakeover: Boolean(err.extra.canTakeover),
          })
        } else if (err instanceof ApiClientError && err.status === 401) {
          window.location.href = "/login"
        } else {
          setSession({ kind: "offline" })
        }
      }
    },
    [mutate],
  )

  useEffect(() => {
    tabIdRef.current = randomId(8)
    void start(false)

    const onStorage = (e: StorageEvent) => {
      // Another tab of the same browser took the session: drop ours immediately (server also enforces this).
      if (e.key !== TAB_KEY || !e.newValue) return
      try {
        const v = JSON.parse(e.newValue) as { tabId: string; sessionId: string }
        if (v.tabId !== tabIdRef.current && sessionRef.current && v.sessionId !== sessionRef.current) {
          sessionRef.current = null
          setSession({ kind: "lost", code: "SESSION_TAKEN_OVER", message: "Игровая сессия была перехвачена в другом окне." })
        }
      } catch {}
    }
    window.addEventListener("storage", onStorage)

    const onPageHide = () => {
      const sid = sessionRef.current
      if (!sid) return
      try {
        navigator.sendBeacon("/api/game/session/end", new Blob([JSON.stringify({ sessionId: sid })], { type: "text/plain" }))
      } catch {}
    }
    window.addEventListener("pagehide", onPageHide)
    const onOnline = () => {
      if (!sessionRef.current) void start(false)
    }
    window.addEventListener("online", onOnline)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("pagehide", onPageHide)
      window.removeEventListener("online", onOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Heartbeat keeps the server session alive and detects takeover / expiry.
  useEffect(() => {
    if (session.kind !== "active") return
    const interval = state?.config.heartbeatIntervalMs ?? 15000
    const timer = setInterval(async () => {
      const sid = sessionRef.current
      if (!sid) return
      try {
        await api("/api/game/session/heartbeat", { json: { sessionId: sid } })
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          sessionRef.current = null
          setSession({ kind: "lost", code: err.code, message: err.message })
        } else if (err instanceof ApiClientError && err.status === 401) {
          window.location.href = "/login"
        }
      }
    }, interval)
    return () => clearInterval(timer)
  }, [session.kind, state?.config.heartbeatIntervalMs])

  // ---- Tap batching -----------------------------------------------------------------------
  const flush = useCallback(async () => {
    flushTimer.current = null
    const sid = sessionRef.current
    if (!sid) return
    if (inflight.current) {
      // A request is still in the air — keep buffering; we'll flush when it returns.
      return
    }
    const max = state?.config.maxTapsPerBatch ?? 25
    const b = buffer.current
    if (b.count === 0) return
    const taps = Math.min(b.count, max)
    const durationMs = taps > 1 ? Math.max(0, b.last - b.first) : 0
    buffer.current = b.count > taps ? { count: b.count - taps, first: b.last, last: b.last } : { count: 0, first: 0, last: 0 }
    const batch = { batchId: randomId(20), taps, durationMs }
    inflight.current = batch

    const send = async (attempt: number): Promise<void> => {
      try {
        const res = await api<TapBatchResult>("/api/game/tap", { json: { sessionId: sid, ...batch } })
        setPending((p) => Math.max(0, p - batch.taps))
        applyServerState({
          totalTaps: res.totalTaps,
          todayTaps: res.todayTaps,
          rank: res.rank,
          trustLevel: res.trustLevel,
          pausedUntil: res.pausedUntil,
          pauseReason: res.pauseReason,
          needsVerification: res.needsVerification,
          limits: res.limits,
        })
        if (res.rejected > 0 && res.pausedUntil) {
          pushToast({ tone: "warning", title: "Слишком высокая активность", body: res.pauseReason ?? undefined })
        }
        if (res.needsVerification) setChallengeOpen(true)
        if (res.newlyCompletedQuests.length) {
          setCompletedQuest(res.newlyCompletedQuests[0])
          void mutate()
        }
      } catch (err) {
        if (err instanceof ApiClientError) {
          setPending((p) => Math.max(0, p - batch.taps))
          if (err.code === "VERIFICATION_REQUIRED") {
            applyServerState({ needsVerification: true, trustLevel: (err.extra.trustLevel as GameState["trustLevel"]) ?? "verification" })
            setChallengeOpen(true)
          } else if (err.code === "COOLDOWN") {
            applyServerState({ pausedUntil: (err.extra.pausedUntil as string) ?? null, pauseReason: err.message, trustLevel: (err.extra.trustLevel as GameState["trustLevel"]) ?? "cooldown" })
            pushToast({ tone: "warning", title: "Пауза", body: err.message })
          } else if (err.code === "BLOCKED") {
            applyServerState({ trustLevel: "blocked", blockedReason: err.message })
          } else if (err.status === 409) {
            sessionRef.current = null
            setSession({ kind: "lost", code: err.code, message: err.message })
          } else if (err.status === 401) {
            window.location.href = "/login"
          } else if (err.code === "API_RATE_LIMITED") {
            pushToast({ tone: "danger", title: "Слишком много запросов", body: err.message })
          } else {
            pushToast({ tone: "danger", title: "Ошибка", body: err.message })
          }
          buffer.current = { count: 0, first: 0, last: 0 }
          setPending(0)
        } else if (attempt < 3) {
          // Network failure: retry the *same* batchId — the server dedupes it.
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)))
          return send(attempt + 1)
        } else {
          setPending((p) => Math.max(0, p - batch.taps))
          setSession({ kind: "offline" })
        }
      }
    }

    await send(0)
    inflight.current = null
    if (buffer.current.count > 0) void flush()
  }, [applyServerState, mutate, pushToast, state?.config.maxTapsPerBatch])

  const tap = useCallback(() => {
    if (session.kind !== "active" || !state) return false
    if (state.needsVerification || state.trustLevel === "blocked") return false
    if (state.pausedUntil && new Date(state.pausedUntil).getTime() > Date.now()) return false
    if (state.limits.dailyRemaining - pending <= 0) return false

    const now = performance.now()
    const b = buffer.current
    if (b.count === 0) buffer.current = { count: 1, first: now, last: now }
    else buffer.current = { count: b.count + 1, first: b.first, last: now }
    setPending((p) => p + 1)

    if (!flushTimer.current) flushTimer.current = setTimeout(() => void flush(), state.config.batchFlushMs)
    return true
  }, [flush, pending, session.kind, state])

  const refresh = useCallback(() => mutate(), [mutate])

  const dismissQuest = useCallback(() => setCompletedQuest(null), [])

  return {
    state,
    session,
    pending,
    toasts,
    challengeOpen,
    setChallengeOpen,
    completedQuest,
    dismissQuest,
    tap,
    start,
    refresh,
    pushToast,
    applyServerState,
  }
}

export type GameApi = ReturnType<typeof useGame>
