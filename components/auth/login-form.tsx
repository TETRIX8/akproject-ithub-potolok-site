"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { LogIn } from "lucide-react"
import { api, ApiClientError } from "@/lib/client/api"
import { Button, Card, Spinner } from "@/components/ui/primitives"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      await api("/api/auth/login", { json: { email, password } })
      router.replace("/")
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Не удалось выполнить вход")
      setLoading(false)
    }
  }

  return (
    <Card className="w-full">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Email New LXP</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-border bg-surface-2/60 px-3 outline-none transition-colors focus:border-primary"
            placeholder="you@example.com"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Пароль</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 rounded-lg border border-border bg-surface-2/60 px-3 outline-none transition-colors focus:border-primary"
            placeholder="••••••••"
          />
        </label>
        {error ? (
          <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={loading || !email || !password}>
          {loading ? <Spinner className="border-primary-foreground/30 border-t-primary-foreground" /> : <LogIn className="h-5 w-5" />}
          Войти через New LXP
        </Button>
      </form>
    </Card>
  )
}
