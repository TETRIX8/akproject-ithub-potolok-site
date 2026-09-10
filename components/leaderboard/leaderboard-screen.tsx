"use client"

import { useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Crown, Medal, TrendingDown, TrendingUp, Users } from "lucide-react"
import { fetcher } from "@/lib/client/api"
import type { LeaderboardEntry, LeaderboardResponse } from "@/lib/game/types"
import { Avatar, Card } from "@/components/ui/primitives"
import { cn, formatNumber } from "@/lib/utils"

type Response = LeaderboardResponse & { ok: true }

export function LeaderboardScreen() {
  const { data } = useSWR<Response>("/api/game/leaderboard", fetcher, { refreshInterval: 15000 })
  const prevRanks = useRef<Map<number, number>>(new Map())
  const [deltas, setDeltas] = useState<Map<number, number>>(new Map())

  useEffect(() => {
    if (!data) return
    const next = new Map<number, number>()
    const d = new Map<number, number>()
    for (const e of data.entries) {
      next.set(e.userId, e.rank)
      const prev = prevRanks.current.get(e.userId)
      if (prev !== undefined && prev !== e.rank) d.set(e.userId, prev - e.rank)
    }
    prevRanks.current = next
    if (d.size) {
      setDeltas(d)
      const t = setTimeout(() => setDeltas(new Map()), 4000)
      return () => clearTimeout(t)
    }
  }, [data])

  if (!data) {
    return (
      <div className="flex flex-col gap-3">
        <div className="glass h-40 rounded-xl shimmer" />
        <div className="glass h-16 rounded-xl shimmer" />
        <div className="glass h-16 rounded-xl shimmer" />
      </div>
    )
  }

  const [first, second, third, ...rest] = data.entries
  const meInList = data.entries.some((e) => e.isMe)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span className="flex items-center gap-2">
          <Users className="h-4 w-4" /> {formatNumber(data.playersCount)} игроков
        </span>
        <span>Обновляется автоматически</span>
      </div>

      {first ? <LeaderCard entry={first} /> : <Card className="text-center text-muted">Пока никто не тапал. Станьте первым!</Card>}

      {second || third ? (
        <div className="grid grid-cols-2 gap-3">
          {second ? <PodiumCard entry={second} tone="silver" /> : <span />}
          {third ? <PodiumCard entry={third} tone="bronze" /> : null}
        </div>
      ) : null}

      {rest.length ? (
        <ol className="glass flex flex-col divide-y divide-border rounded-xl">
          {rest.map((e) => (
            <Row key={e.userId} entry={e} delta={deltas.get(e.userId)} />
          ))}
        </ol>
      ) : null}

      {data.me && !meInList ? (
        <div className="sticky bottom-24 md:bottom-4">
          <div className="glass flex items-center gap-3 rounded-xl border-primary/40 p-3 shadow-[0_10px_40px_rgba(110,231,255,0.25)]">
            <span className="w-14 text-center text-sm font-bold text-primary">#{e2(data.me.rank)}</span>
            <Avatar name={data.me.displayName} src={data.me.avatarUrl} size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-semibold">Ваше место — #{formatNumber(data.me.rank)}</span>
              <span className="text-xs text-muted">{data.me.displayName}</span>
            </div>
            <span className="text-sm font-bold tabular-nums">{formatNumber(data.me.totalTaps)}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function e2(n: number) {
  return formatNumber(n)
}

function LeaderCard({ entry }: { entry: LeaderboardEntry }) {
  return (
    <div className={cn("glass animate-pop-in relative overflow-hidden rounded-xl border-gold/40 p-5", entry.isMe && "ring-2 ring-primary")}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" aria-hidden />
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={entry.displayName} src={entry.avatarUrl} size={72} className="ring-4 ring-gold/60" />
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-gold drop-shadow-[0_0_12px_rgba(245,197,66,0.8)]">
            <Crown className="h-7 w-7" />
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold">1 место · Лидер</span>
          <span className="truncate text-xl font-bold">{entry.displayName}</span>
          <span className="text-sm text-muted">{entry.isMe ? "Это вы" : "Чемпион таблицы"}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-black tabular-nums text-gold">{formatNumber(entry.totalTaps)}</span>
          <span className="text-xs text-muted">тапов</span>
        </div>
      </div>
    </div>
  )
}

function PodiumCard({ entry, tone }: { entry: LeaderboardEntry; tone: "silver" | "bronze" }) {
  return (
    <div className={cn("glass animate-pop-in flex flex-col items-center gap-2 rounded-xl p-4 text-center", tone === "silver" ? "border-silver/40" : "border-bronze/40", entry.isMe && "ring-2 ring-primary")}>
      <div className="relative">
        <Avatar name={entry.displayName} src={entry.avatarUrl} size={52} className={cn("ring-2", tone === "silver" ? "ring-silver/70" : "ring-bronze/70")} />
        <span className={cn("absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface", tone === "silver" ? "text-silver" : "text-bronze")}>
          <Medal className="h-5 w-5" />
        </span>
      </div>
      <span className={cn("text-xs font-semibold uppercase tracking-wide", tone === "silver" ? "text-silver" : "text-bronze")}>{entry.rank} место</span>
      <span className="w-full truncate text-sm font-semibold">{entry.displayName}</span>
      <span className="text-lg font-bold tabular-nums">{formatNumber(entry.totalTaps)}</span>
    </div>
  )
}

function Row({ entry, delta }: { entry: LeaderboardEntry; delta?: number }) {
  return (
    <li className={cn("flex items-center gap-3 p-3 transition-colors", entry.isMe && "bg-primary/10")}>
      <span className={cn("w-10 text-center text-sm font-bold tabular-nums", entry.isMe ? "text-primary" : "text-muted")}>{entry.rank}</span>
      <Avatar name={entry.displayName} src={entry.avatarUrl} size={36} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">
          {entry.displayName} {entry.isMe ? <span className="text-xs font-normal text-primary">(вы)</span> : null}
        </span>
      </div>
      {delta ? (
        <span className={cn("flex items-center gap-0.5 text-xs font-semibold", delta > 0 ? "text-success" : "text-danger")}>
          {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {Math.abs(delta)}
        </span>
      ) : null}
      <span className="text-sm font-bold tabular-nums">{formatNumber(entry.totalTaps)}</span>
    </li>
  )
}
