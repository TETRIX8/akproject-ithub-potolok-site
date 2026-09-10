"use client"

import { cn, hueFrom, initials } from "@/lib/utils"
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react"

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass rounded-xl p-4", className)} {...props} />
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "accent" | "danger"
  size?: "sm" | "md" | "lg"
}

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-transform duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-9 px-3 text-sm",
        size === "md" && "h-11 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-base",
        variant === "primary" && "bg-primary text-primary-foreground shadow-[0_8px_30px_rgba(110,231,255,0.35)] hover:brightness-110",
        variant === "accent" && "bg-accent text-accent-foreground shadow-[0_8px_30px_rgba(167,139,250,0.35)] hover:brightness-110",
        variant === "ghost" && "border border-border bg-surface-2/60 text-foreground hover:bg-surface-2",
        variant === "danger" && "bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25",
        className,
      )}
      {...props}
    />
  )
}

export function Avatar({ name, src, size = 40, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const hue = hueFrom(name)
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-foreground", className)}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.36),
        background: `linear-gradient(135deg, hsl(${hue} 80% 55%), hsl(${(hue + 60) % 360} 80% 45%))`,
      }}
      aria-hidden={!src}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  )
}

export function Badge({ children, tone = "primary", className }: { children: ReactNode; tone?: "primary" | "accent" | "success" | "warning" | "danger" | "muted"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary",
        tone === "accent" && "border-accent/30 bg-accent/10 text-accent",
        tone === "success" && "border-success/30 bg-success/10 text-success",
        tone === "warning" && "border-warning/30 bg-warning/10 text-warning",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        tone === "muted" && "border-border bg-surface-2/60 text-muted",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Progress({ value, max, tone = "primary", className }: { value: number; max: number; tone?: "primary" | "accent" | "success"; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          tone === "primary" && "bg-primary",
          tone === "accent" && "bg-accent",
          tone === "success" && "bg-success",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="text-2xl font-bold tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </Card>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary", className)} aria-label="Загрузка" />
}
