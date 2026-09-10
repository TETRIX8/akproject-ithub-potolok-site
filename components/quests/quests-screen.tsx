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
  daily: "За день",
  streak: "Серия",
  special: "Особые",
  rank: "Рейтинг",
  general: "Общие",
}

const CATEGORY_ORDER = ["taps", "daily", "streak", "rank", "general", "special"]

type Filter = "all" | "active" | "done" | (typeof CATEGORY_ORDER)[number]

export function QuestsScreen() {
  const { data, mutate } = useSWR<{ ok: true; state: GameState }>("/api/game/state", fetcher)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [justClaimed, setJustClaimed] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("all")
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
  const categories = CATEGORY_ORDER.filter((c) => state.quests.some((q) => q.category === c))

  const visible = sorted.filter((q) => {
    if (filter === "all") return true
    if (filter === "active") return q.status === "completed" || q.status === "in_progress"
    if (filter === "done") return q.status === "claimed"
    return q.category === filter
  })

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Все", count: state.quests.length },
    { key: "active", label: "В процессе", count: state.quests.filter((q) => q.status === "completed" || q.status === "in_progress").length },
    ...categories.map((c) => ({ key: c as Filter, label: CATEGORY_LABEL[c] ?? c, count: state.quests.filter((q) => q.category === c).length })),
    { key: "done", label: "Получено", count: state.quests.filter((q) => q.status === "claimed").length },
  ]

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

      <div role="tablist" aria-label="Фильтр квестов" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((c) => {
          const active = filter === c.key
          return (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(c.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "glass border-transparent text-muted hover:text-foreground",
              )}
            >
              {c.label}
              <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>{c.count}</span>
            </button>
          )
        })}
      </div>

      {visible.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-8 text-center">
          <Lock className="h-6 w-6 text-muted" />
          <span className="text-sm text-muted">Здесь пока пусто</span>
        </Card>
      ) : null}

      <ul className="flex flex-col gap-3">
        {visible.map((q) => {
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
