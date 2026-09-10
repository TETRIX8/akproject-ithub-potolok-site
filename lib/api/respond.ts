import "server-only"
import { NextResponse } from "next/server"
import { AuthError } from "@/lib/auth/session"
import { LxpError } from "@/lib/lxp/client"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) } })
}

export function fail(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error: { code, message, ...extra } }, { status })
}

export function handleError(err: unknown) {
  if (err instanceof ApiError) return fail(err.status, err.code, err.message, err.extra)
  if (err instanceof AuthError) return fail(401, "UNAUTHORIZED", "Требуется вход")
  if (err instanceof LxpError) {
    if (err.code === "INVALID_CREDENTIALS") return fail(401, "INVALID_CREDENTIALS", "Неверный email или пароль")
    return fail(502, err.code, "Сервис NewLXP временно недоступен. Попробуйте позже.")
  }
  console.error("[api] unhandled", err)
  return fail(500, "INTERNAL", "Внутренняя ошибка сервера")
}

/**
 * Same-origin guard for state-changing requests. Cookies are SameSite so a plain CSRF form
 * cannot carry them, but we additionally require the Origin/Referer to match the host.
 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin") ?? (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  if (!origin || !host) throw new ApiError(403, "BAD_ORIGIN", "Запрос отклонён")
  const originHost = new URL(origin).host
  if (originHost !== host) throw new ApiError(403, "BAD_ORIGIN", "Запрос отклонён")
}

export async function readJson<T>(req: Request, maxBytes = 4096): Promise<T> {
  const len = Number(req.headers.get("content-length") ?? 0)
  if (len > maxBytes) throw new ApiError(413, "TOO_LARGE", "Слишком большой запрос")
  try {
    return (await req.json()) as T
  } catch {
    throw new ApiError(400, "BAD_JSON", "Некорректный JSON")
  }
}
