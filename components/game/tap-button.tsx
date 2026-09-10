"use client"

import { useCallback, useRef, useState, type PointerEvent } from "react"
import { cn } from "@/lib/utils"

interface Burst {
  id: number
  x: number
  y: number
}

export function TapButton({ disabled, onTap }: { disabled: boolean; onTap: () => boolean }) {
  const [bursts, setBursts] = useState<Burst[]>([])
  const [pressed, setPressed] = useState(false)
  const idRef = useRef(0)
  const lastPointerTs = useRef(0)

  const handlePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return
      // Guard against duplicate pointer + emulated mouse events on some mobile browsers.
      if (e.timeStamp - lastPointerTs.current < 15) return
      lastPointerTs.current = e.timeStamp
      if (!onTap()) return

      setPressed(true)
      const rect = e.currentTarget.getBoundingClientRect()
      const id = ++idRef.current
      const x = e.clientX ? e.clientX - rect.left : rect.width / 2
      const y = e.clientY ? e.clientY - rect.top : rect.height / 2
      setBursts((prev) => [...prev.slice(-11), { id, x, y }])
      setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 900)
    },
    [disabled, onTap],
  )

  return (
    <div className="relative flex items-center justify-center">
      <div className={cn("pointer-events-none absolute inset-0 rounded-full bg-primary/20 blur-3xl transition-opacity duration-500", disabled ? "opacity-20" : "opacity-70")} aria-hidden />
      <button
        type="button"
        aria-label="Тапнуть"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault()
            if (!disabled && onTap()) {
              const id = ++idRef.current
              setBursts((prev) => [...prev.slice(-11), { id, x: 128, y: 128 }])
              setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 900)
            }
          }
        }}
        className={cn(
          "tap-surface relative flex h-64 w-64 items-center justify-center rounded-full border-4 border-primary/40 text-primary-foreground outline-none transition-transform duration-75 focus-visible:ring-4 focus-visible:ring-primary/50 sm:h-72 sm:w-72",
          "bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),transparent_45%),linear-gradient(145deg,var(--primary),var(--accent))]",
          "shadow-[0_0_0_10px_rgba(110,231,255,0.08),0_30px_80px_rgba(110,231,255,0.35),inset_0_-14px_30px_rgba(0,0,0,0.25)]",
          pressed && !disabled && "scale-[0.94]",
          disabled && "cursor-not-allowed grayscale-[0.7] opacity-60",
        )}
      >
        <span className="flex flex-col items-center gap-1 select-none">
          <span className="text-6xl font-black tracking-tight drop-shadow-[0_4px_10px_rgba(0,0,0,0.3)]">TAP</span>
          <span className="text-xs font-semibold uppercase tracking-[0.3em] opacity-80">AK Project</span>
        </span>

        {bursts.map((b) => (
          <span key={b.id} className="pointer-events-none absolute" style={{ left: b.x, top: b.y }} aria-hidden>
            <span className="animate-float-up absolute -translate-x-1/2 text-2xl font-black text-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">+1</span>
          </span>
        ))}
        {pressed && !disabled ? <span className="animate-ring-pulse pointer-events-none absolute inset-0 rounded-full border-2 border-primary" aria-hidden /> : null}
      </button>
    </div>
  )
}
