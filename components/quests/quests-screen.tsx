"use client"

import { useState } from "react"
import useSWR from "swr"
import { CheckCircle2, Gift, Lock, Sparkles } from "lucide-react"
import { api, fetcher } from "@/lib/client/api"
import type { GameState, QuestView } from "@/lib/game/types"
import { Badge, Button, Card, Progress, Spinner } from "@/components/ui/primitives"
import { cn, formatNumber } from "@/lib/utils"

const CATEGORY_LABEL: Record<string, string> = {
  taps: "Тапы",
  daily: "Ежедневные",
  streak: "Серия",
  special: "Особые",
  rank: "Рейтинг",
  general: "Общие",
}

export function QuestsScreen() {
  const { data, mutate } = useSWR<{ ok: true; state: GameState }>("/api/game/state", fetcher)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<string | null>(null)
  const state = data?.state

  if (!state) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass h-24 rounded-xl shimmer" />
        ))}
      </div>
    )
  }

  const claim = async (q: QuestView) => {
    setClaiming(q.id)
    try {
      const res = await api<{ ok: true; quest: QuestView; bonusPoints: number }>("/api/game/quests/claim", { json: { questId: q.id } })
      setJustClaimed(q.id)
      setTimeout(() => setJustClaimed(null), 1500)
      await mutate((cur) => (cur ? { ok: true, state: { ...cur.state, bonusPoints: res.bonusPoints, quests: cur.state.quests.map((x) => (x.id === q.id ? res.quest : x)) } } : cur), { revalidate: true })
    } finally {
      setClaiming(null)
    }
  }

  const order: QuestView["status"][] = ["completed", "in_progress", "available", "claimed"]
  const sorted = [...state.quests].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
  const claimable = state.quests.filter((q) => q.status === "completed").length

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <Sparkles className="h-6 w-6" />
        </span>
        <div className="flex flex-1 flex-col">
          <span className="text-xs uppercase tracking-wide text-muted">Бонусные очки</span>
          <span className="text-2xl font-bold tabular-nums">{formatNumber(state.bonusPoints)}</span>
        </div>
        <div className="flex flex-col items-end text-right">
          <span className="text-xs text-muted">Выполнено</span>
          <span className="font-bold tabular-nums">
            {state.questsCompleted} / {state.questsTotal}
          </span>
          {claimable > 0 ? <Badge tone="success">{claimable} к получению</Badge> : null}
        </div>
      </Card>

      <ul className="flex flex-col gap-3">
        {sorted.map((q) => {
          const done = q.status === "completed" || q.status === "claimed"
          return (
            <li key={q.id} className={cn("glass animate-pop-in flex flex-col gap-3 rounded-xl p-4 transition-all", q.status === "claimed" && "opacity-60", justClaimed === q.id && "ring-2 ring-success")}>
              <div className="flex items-start gap-3">
                <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", done ? "bg-success/15 text-success" : q.status === "in_progress" ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted")}>
                  {q.status === "claimed" ? <CheckCircle2 className="h-5 w-5" /> : q.status === "completed" ? <Gift className="h-5 w-5" /> : q.status === "in_progress" ? <Sparkles className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{q.title}</span>
                    <Badge tone="muted">{CATEGORY_LABEL[q.category] ?? q.category}</Badge>
                  </div>
                  <span className="text-sm text-muted">{q.description}</span>
                </div>
                <span className="shrink-0 text-sm font-semibold text-accent">+{formatNumber(q.rewardPoints)}</span>
              </div>
              <div className="flex items-center gap-3">
                <Progress value={q.progress} max={q.target} tone={done ? "success" : "primary"} className="flex-1" />
                <span className="w-24 text-right text-xs tabular-nums text-muted">
                  {formatNumber(Math.min(q.progress, q.target))} / {formatNumber(q.target)}
                </span>
              </div>
              {q.status === "completed" ? (
                <Button size="sm" variant="accent" onClick={() => claim(q)} disabled={claiming === q.id} className="self-end">
                  {claiming === q.id ? <Spinner className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                  Забрать награду
                </Button>
              ) : q.status === "claimed" ? (
                <span className="self-end text-xs font-semibold text-success">Награда получена</span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
