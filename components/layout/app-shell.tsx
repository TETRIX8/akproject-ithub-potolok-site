"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Hand, ListChecks, Trophy, UserRound, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { api } from "@/lib/client/api"
import type { ReactNode } from "react"

const NAV = [
  { href: "/", label: "Тап", icon: Hand },
  { href: "/quests", label: "Квесты", icon: ListChecks },
  { href: "/leaderboard", label: "Рейтинг", icon: Trophy },
  { href: "/profile", label: "Профиль", icon: UserRound },
]

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST", json: {} })
    } finally {
      router.replace("/login")
    }
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Desktop sidebar */}
      <aside className="glass hidden w-60 shrink-0 flex-col gap-6 rounded-none border-y-0 border-l-0 p-5 md:sticky md:top-0 md:flex md:h-dvh">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-black">AK</span>
          <span className="flex flex-col leading-tight">
            <span className="font-bold">AK Project</span>
            <span className="text-xs text-muted">Tap Game</span>
          </span>
        </Link>
        <nav className="flex flex-col gap-1" aria-label="Основная навигация">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors", active ? "bg-primary/15 text-primary" : "text-muted hover:bg-surface-2 hover:text-foreground")}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
        </nav>
        <button type="button" onClick={logout} className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground">
          <LogOut className="h-5 w-5" /> Выйти
        </button>
      </aside>

      <div className="flex flex-1 flex-col">
        {/* Mobile header */}
        <header className="flex items-center justify-between px-4 pt-4 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-black">AK</span>
            <span className="font-bold">{title ?? "Tap Game"}</span>
          </Link>
          <button type="button" onClick={logout} className="rounded-lg p-2 text-muted hover:text-foreground" aria-label="Выйти">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 pb-28 pt-4 md:max-w-3xl md:px-8 md:pb-10 md:pt-8">
          {title ? <h1 className="hidden text-2xl font-bold md:block">{title}</h1> : null}
          {children}
        </main>

        {/* Mobile tab bar */}
        <nav className="glass fixed inset-x-0 bottom-0 z-30 flex justify-around rounded-t-xl border-x-0 border-b-0 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 md:hidden" aria-label="Основная навигация">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link key={href} href={href} className={cn("flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition-colors", active ? "text-primary" : "text-muted")} aria-current={active ? "page" : undefined}>
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
