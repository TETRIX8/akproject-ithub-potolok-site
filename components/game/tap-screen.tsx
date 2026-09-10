"use client"

import Link from "next/link"
import { Flame, Gauge, ShieldAlert, Timer, Trophy, ChevronRight } from "lucide-react"
import { Avatar, Badge, Card, Progress } from "@/components/ui/primitives"
import { formatNumber } from "@/lib/utils"
import { useGame } from "./use-game"
import { TapButton } from "./tap-button"
import { SessionGuard } from "./session-guard"
import { VerificationDialog } from "./verification-dialog"
import { QuestCompleteOverlay, Toasts } from "./notifications"
import { useCountdown } from "./use-countdown"
import { TRUST_LABELS } from "./trust"

export function TapScreen() {
  const game = useGame()
  const { state, session, pending } = game
  const cooldownLeft = useCountdown(state?.pausedUntil)

  if (!state) {
    return (
      <div className="flex flex-col gap-4">
        <div className="glass h-20 rounded-xl shimmer" />
        <div className="glass mx-auto h-64 w-64 rounded-full shimmer" />
        <div className="glass h-24 rounded-xl shimmer" />
      </div>
    )
  }

  const paused = cooldownLeft > 0
  const blocked = state.trustLevel === "blocked"
  const disabled = session.kind !== "active" || paused || blocked || state.needsVerification || state.limits.dailyRemaining - pending <= 0
  const shownTotal = state.totalTaps + pending
  const nextQuest = state.quests.find((q) => q.status === "in_progress") ?? state.quests.find((q) => q.status === "available")
  const trust = TRUST_LABELS[state.trustLevel]

  return (
    <div className="flex flex-col gap-4">
      <Toasts toasts={game.toasts} />
      <QuestCompleteOverlay quest={game.completedQuest} onClose={game.dismissQuest} />
      <VerificationDialog
        open={game.challengeOpen}
        onPassed={() => {
          game.setChallengeOpen(false)
          game.applyServerState({ needsVerification: false, trustLevel: "normal" })
          game.pushToast({ tone: "success", title: "Проверка пройдена", body: "Продолжайте играть." })
          void game.refresh()
        }}
        onFailed={(pausedUntil) => {
          game.applyServerState({ pausedUntil })
          if (pausedUntil) game.setChallengeOpen(false)
          void game.refresh()
        }}
      />

      {/* Player strip */}
      <Card className="flex items-center gap-3">
        <Avatar name={state.user.displayName} src={state.user.avatarUrl} size={44} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{state.user.displayName}</span>
          <span className="truncate text-xs text-muted">{state.user.email}</span>
        </div>
        <Link href="/leaderboard" className="flex items-center gap-1 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm font-semibold transition-colors hover:bg-surface-2">
          <Trophy className="h-4 w-4 text-gold" />#{state.rank}
        </Link>
      </Card>

      {/* Counter */}
      <div className="flex flex-col items-center gap-1 py-2 text-center">
        <span className="text-xs uppercase tracking-[0.3em] text-muted">Всего тапов</span>
        <span className="text-glow text-6xl font-black tabular-nums tracking-tight sm:text-7xl" aria-live="polite">
          {formatNumber(shownTotal)}
        </span>
        <div className="flex items-center gap-2">
          <Badge tone={trust.tone}>{trust.label}</Badge>
          {pending > 0 ? <Badge tone="muted">синхронизация +{pending}</Badge> : null}
        </div>
      </div>

      {/* Session / status gates */}
      {session.kind !== "active" ? <SessionGuard session={session} onStart={(t) => void game.start(t)} /> : null}

      {blocked ? (
        <Card className="flex items-start gap-3 border-danger/40">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-danger">Игровая функция заблокирована</span>
            <span className="text-sm text-muted">{state.blockedReason ?? state.pauseReason}</span>
          </div>
        </Card>
      ) : paused ? (
        <Card className="flex items-center gap-3 border-warning/40">
          <Timer className="h-6 w-6 shrink-0 text-warning" />
          <div className="flex flex-1 flex-col">
            <span className="font-semibold text-warning">Слишком высокая активность</span>
            <span className="text-sm text-muted">{state.pauseReason ?? "Попробуйте снова через"} {cooldownLeft} с.</span>
          </div>
          <span className="text-3xl font-black tabular-nums text-warning">{cooldownLeft}</span>
        </Card>
      ) : state.needsVerification && !game.challengeOpen ? (
        <Card className="flex items-center gap-3 border-accent/40">
          <ShieldAlert className="h-6 w-6 shrink-0 text-accent" />
          <div className="flex flex-1 flex-col">
            <span className="font-semibold">Требуется проверка</span>
            <span className="text-sm text-muted">Подтвердите, что вы человек, чтобы продолжить.</span>
          </div>
          <button type="button" onClick={() => game.setChallengeOpen(true)} className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">
            Пройти
          </button>
        </Card>
      ) : null}

      {/* The button */}
      <div className="flex justify-center py-4">
        <TapButton disabled={disabled} onTap={game.tap} />
      </div>

      {/* Limits */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            <Gauge className="h-4 w-4" /> Дневной лимит
          </div>
          <span className="text-lg font-bold tabular-nums">
            {formatNumber(Math.max(0, state.limits.dailyRemaining - pending))} <span className="text-sm font-normal text-muted">/ {formatNumber(state.limits.dailyLimit)}</span>
          </span>
          <Progress value={state.limits.dailyLimit - state.limits.dailyRemaining + pending} max={state.limits.dailyLimit} />
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            <Flame className="h-4 w-4" /> Сегодня
          </div>
          <span className="text-lg font-bold tabular-nums">{formatNumber(state.todayTaps + pending)}</span>
          <span className="text-xs text-muted">Серия: {state.streakDays} {state.streakDays === 1 ? "день" : state.streakDays < 5 ? "дня" : "дней"}</span>
        </Card>
      </div>

      {/* Next quest */}
      {nextQuest ? (
        <Link href="/quests" className="glass flex items-center gap-3 rounded-xl p-4 transition-colors hover:bg-surface-2/40">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold">{nextQuest.title}</span>
              <span className="text-xs tabular-nums text-muted">
                {formatNumber(Math.min(nextQuest.target, nextQuest.progress))} / {formatNumber(nextQuest.target)}
              </span>
            </div>
            <Progress value={nextQuest.progress} max={nextQuest.target} tone="accent" />
            <span className="text-xs text-muted">
              Квесты: {state.questsCompleted} / {state.questsTotal} выполнено
            </span>
          </div>
          <ChevronRight className="h-5 w-5 text-muted" />
        </Link>
      ) : null}
    </div>
  )
}
