import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth/session"
import { LoginForm } from "@/components/auth/login-form"

export const dynamic = "force-dynamic"

export default async function LoginPage() {
  const auth = await getAuth()
  if (auth) redirect("/")
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-black text-primary-foreground shadow-[0_10px_40px_rgba(110,231,255,0.4)]">AK</span>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">AK Project · Tap Game</h1>
            <p className="text-balance text-sm text-muted">Войдите через аккаунт New LXP, чтобы продолжить игру с сохранённым прогрессом.</p>
          </div>
        </div>
        <LoginForm />
        <p className="text-center text-xs text-muted">Пароль передаётся только на сервер игры и напрямую в New LXP. Мы его не храним.</p>
      </div>
    </main>
  )
}
