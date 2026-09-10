"use client"

import { useEffect, useState } from "react"
import { ShieldCheck, ShieldAlert, RefreshCw } from "lucide-react"
import { api, ApiClientError } from "@/lib/client/api"
import type { ChallengeView } from "@/lib/game/types"
import type { VerifyResult } from "@/lib/game/verification"
import { Button, Spinner } from "@/components/ui/primitives"
import { useCountdown } from "./use-countdown"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onPassed: () => void
  onFailed: (pausedUntil: string | null) => void
}

export function VerificationDialog({ open, onPassed, onFailed }: Props) {
  const [challenge, setChallenge] = useState<ChallengeView | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<"passed" | "failed" | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const expiresIn = useCountdown(challenge?.expiresAt)

  const load = async () => {
    setLoading(true)
    setError(null)
    setSelected(null)
    try {
      const res = await api<{ ok: true; challenge: ChallengeView }>("/api/game/verify")
      setChallenge(res.challenge)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить задание")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      setResult(null)
      void load()
    }
  }, [open])

  useEffect(() => {
    if (open && challenge && expiresIn === 0 && !result && !loading) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresIn])

  if (!open) return null

  const answer = async (idx: number) => {
    if (!challenge || loading || result === "passed") return
    setSelected(idx)
    setLoading(true)
    try {
      const res = await api<{ ok: true; result: VerifyResult }>("/api/game/verify", { json: { challengeId: challenge.id, answerIndex: idx } })
      if (res.result.passed) {
        setResult("passed")
        setTimeout(onPassed, 900)
      } else {
        setResult("failed")
        setTimeout(() => {
          setResult(null)
          if (res.result.next) {
            setChallenge(res.result.next)
            setSelected(null)
          } else {
            setChallenge((c) => (c ? { ...c, attemptsLeft: res.result.attemptsLeft } : c))
            setSelected(null)
          }
          onFailed(res.result.pausedUntil)
        }, 1100)
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 410) void load()
      else setError(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-labelledby="verify-title">
      <div className="glass animate-pop-in w-full max-w-md rounded-xl p-6">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-11 w-11 items-center justify-center rounded-full", result === "passed" ? "bg-success/15 text-success" : result === "failed" ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent")}>
            {result === "failed" ? <ShieldAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
          </span>
          <div className="flex flex-col">
            <h2 id="verify-title" className="text-lg font-bold">
              Подтвердите, что вы человек
            </h2>
            <p className="text-sm text-muted">Мы заметили очень высокую активность. Ответьте на вопрос, чтобы продолжить.</p>
          </div>
        </div>

        <div className="mt-6 flex min-h-32 flex-col gap-4">
          {loading && !challenge ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <p className="text-sm text-danger">{error}</p>
              <Button variant="ghost" size="sm" onClick={load}>
                <RefreshCw className="h-4 w-4" /> Повторить
              </Button>
            </div>
          ) : challenge ? (
            <>
              <p className="text-balance text-center text-xl font-semibold">{challenge.prompt}</p>
              <div className="grid grid-cols-2 gap-3">
                {challenge.options.map((opt, i) => (
                  <button
                    key={`${challenge.id}-${i}`}
                    type="button"
                    disabled={loading || result !== null}
                    onClick={() => answer(i)}
                    className={cn(
                      "h-14 rounded-lg border text-lg font-bold transition-all active:scale-95 disabled:cursor-default",
                      selected === i && result === "passed" && "border-success bg-success/20 text-success",
                      selected === i && result === "failed" && "border-danger bg-danger/20 text-danger",
                      selected !== i && "border-border bg-surface-2/60 hover:border-primary/50 hover:bg-surface-2",
                      selected === i && result === null && "border-primary bg-primary/15",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>Попыток: {challenge.attemptsLeft}</span>
                <span>Осталось {expiresIn} с</span>
              </div>
              {result === "passed" ? <p className="text-center text-sm font-semibold text-success">Верно! Возвращаемся в игру…</p> : null}
              {result === "failed" ? <p className="text-center text-sm font-semibold text-danger">Неверно. Тапалка временно приостановлена.</p> : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
