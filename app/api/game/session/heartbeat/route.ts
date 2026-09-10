import { assertSameOrigin, fail, handleError, json, readJson } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { heartbeat } from "@/lib/game/session"

export async function POST(req: Request) {
  try {
    assertSameOrigin(req)
    const { user } = await requireAuth()
    const body = await readJson<{ sessionId?: unknown }>(req)
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : ""
    if (!sessionId) return fail(400, "BAD_PAYLOAD", "Нет идентификатора сессии")
    const res = await heartbeat(user.id, sessionId)
    if (!res.ok) return fail(409, res.code, "Игровая сессия недействительна")
    return json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
