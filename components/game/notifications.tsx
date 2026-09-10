"use client"

import { AlertTriangle, CheckCircle2, Info, XCircle, Trophy } from "lucide-react"
import type { QuestView } from "@/lib/game/types"
import type { Toast } from "./use-game"
import { cn, formatNumber } from "@/lib/utils"
import { Button } from "@/components/ui/primitives"

const ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info }

export function Toasts({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.tone]
        return (
          <div
            key={t.id}
            className={cn(
              "glass animate-slide-in-right pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg p-3",
              t.tone === "warning" && "border-warning/40",
              t.tone === "danger" && "border-danger/40",
              t.tone === "success" && "border-success/40",
            )}
          >
            <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", t.tone === "warning" && "text-warning", t.tone === "danger" && "text-danger", t.tone === "success" && "text-success", t.tone === "info" && "text-primary")} />
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{t.title}</span>
              {t.body ? <span className="text-xs text-muted">{t.body}</span> : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function QuestCompleteOverlay({ quest, onClose }: { quest: QuestView | null; onClose: () => void }) {
  if (!quest) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="glass animate-pop-in flex w-full max-w-sm flex-col items-center gap-4 rounded-xl p-6 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold shadow-[0_0_40px_rgba(245,197,66,0.35)]">
          <Trophy className="h-8 w-8" />
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-gold">Квест выполнен</span>
          <h2 className="text-xl font-bold">{quest.title}</h2>
          <p className="text-sm text-muted">{quest.description}</p>
        </div>
        <p className="text-sm">
          Награда: <span className="font-bold text-accent">+{formatNumber(quest.rewardPoints)} бонусных очков</span>
        </p>
        <p className="text-xs text-muted">Заберите её на странице квестов.</p>
        <Button onClick={onClose} className="w-full">
          Продолжить
        </Button>
      </div>
    </div>
  )
}
