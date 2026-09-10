export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

interface ErrorEnvelope {
  ok: false
  error: { code: string; message: string } & Record<string, unknown>
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(path, {
    ...rest,
    method: rest.method ?? (json !== undefined ? "POST" : "GET"),
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
    cache: "no-store",
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok || (data && typeof data === "object" && (data as { ok?: boolean }).ok === false)) {
    const env = data as ErrorEnvelope | null
    const { code = "HTTP_ERROR", message = res.statusText, ...extra } = env?.error ?? {}
    throw new ApiClientError(res.status, code, message || "Ошибка запроса", extra)
  }
  return data as T
}

export const fetcher = <T,>(path: string) => api<T>(path)
