"use client"

import { MonitorSmartphone, WifiOff, RefreshCw, Unplug } from "lucide-react"
import { Button, Spinner } from "@/components/ui/primitives"
import type { SessionStatus } from "./use-game"

export function SessionGuard({ session, onStart }: { session: SessionStatus; onStart: (takeover: boolean) => void }) {
  if (session.kind === "active") return null

  return (
    <div className="glass animate-pop-in flex flex-col items-center gap-4 rounded-xl p-6 text-center">
      {session.kind === "connecting" ? (
        <>
          <Spinner className="h-8 w-8" />
          <p className="text-sm text-muted">Подключаем игровую сессию…</p>
        </>
      ) : session.kind === "conflict" ? (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-warning/15 text-warning">
            <MonitorSmartphone className="h-7 w-7" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Игровая сессия уже активна в другом окне</h2>
            <p className="text-sm text-muted">
              {session.sameDevice ? "Открыта другая вкладка этого браузера." : `Активна на другом устройстве${session.deviceLabel ? ` (${session.deviceLabel})` : ""}.`} Тапы засчитываются только в одном месте.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
            {session.canTakeover ? (
              <Button onClick={() => onStart(true)}>Играть здесь</Button>
            ) : null}
            <Button variant="ghost" onClick={() => onStart(false)}>
              <RefreshCw className="h-4 w-4" /> Проверить снова
            </Button>
          </div>
        </>
      ) : session.kind === "lost" ? (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/15 text-danger">
            <Unplug className="h-7 w-7" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Сессия завершена</h2>
            <p className="text-sm text-muted">{session.message}</p>
          </div>
          <Button onClick={() => onStart(false)}>Переподключиться</Button>
        </>
      ) : (
        <>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted/15 text-muted">
            <WifiOff className="h-7 w-7" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">Нет соединения</h2>
            <p className="text-sm text-muted">Проверьте интернет. Ваш прогресс сохранён на сервере.</p>
          </div>
          <Button onClick={() => onStart(false)}>
            <RefreshCw className="h-4 w-4" /> Повторить
          </Button>
        </>
      )}
    </div>
  )
}
