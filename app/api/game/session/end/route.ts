import { handleError, json } from "@/lib/api/respond"
import { getAuth } from "@/lib/auth/session"
import { endGameSession } from "@/lib/game/session"

/**
 * Called via navigator.sendBeacon on tab close; the body may be text/plain so we parse leniently.
 * Origin can be absent on beacons, so we rely on the cookie + sessionId ownership check instead.
 */
export async function POST(req: Request) {
  try {
    const ctx = await getAuth()
    if (!ctx) return json({ ok: true })
    let sessionId = ""
    try {
      const raw = await req.text()
      const parsed = JSON.parse(raw) as { sessionId?: unknown }
      sessionId = typeof parsed.sessionId === "string" ? parsed.sessionId : ""
    } catch {
      sessionId = ""
    }
    if (sessionId) await endGameSession(ctx.user.id, sessionId, "closed")
    return json({ ok: true })
  } catch (err) {
    return handleError(err)
  }
}
