"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/client/api"
import type { GameState } from "@/lib/game/types"
import { Avatar, Badge, Card, Stat } from "@/components/ui/primitives"
import { formatNumber } from "@/lib/utils"
import { TRUST_LABELS } from "@/components/game/trust"

export function ProfileScreen() {
  const { data } = useSWR<{ ok: true; state: GameState }>("/api/game/state", fetcher)
  const state = data?.state

  if (!state) {
    return (
      <div className="flex flex-col gap-3">
        <div className="glass h-24 rounded-xl shimmer" />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="glass h-24 rounded-xl shimmer" />
          ))}
        </div>
      </div>
    )
  }

  const trust = TRUST_LABELS[state.trustLevel]

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center gap-4">
        <Avatar name={state.user.displayName} src={state.user.avatarUrl} size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-xl font-bold">{state.user.displayName}</span>
          <span className="truncate text-sm text-muted">{state.user.email}</span>
          <div className="flex flex-wrap gap-2">
            <Badge tone={trust.tone}>{trust.label}</Badge>
            <Badge tone="muted">Аккаунт New LXP</Badge>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Всего тапов" value={formatNumber(state.totalTaps)} />
        <Stat label="Сегодня" value={formatNumber(state.todayTaps)} hint={`Лимит ${formatNumber(state.limits.dailyLimit)}`} />
        <Stat label="Текущее место" value={`#${formatNumber(state.rank)}`} hint={`из ${formatNumber(state.playersCount)}`} />
        <Stat label="Лучшее место" value={state.bestRank ? `#${formatNumber(state.bestRank)}` : "—"} />
        <Stat label="Лучший день" value={formatNumber(state.bestDayTaps)} hint="тапов за день" />
        <Stat label="Серия дней" value={state.streakDays} hint="подряд в игре" />
        <Stat label="Квесты" value={`${state.questsCompleted} / ${state.questsTotal}`} hint="выполнено" />
        <Stat label="Бонусные очки" value={formatNumber(state.bonusPoints)} />
        <Stat label="Проверок пройдено" value={state.verificationsPassed} />
      </div>
    </div>
  )
}
