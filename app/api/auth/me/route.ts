import { handleError, json } from "@/lib/api/respond"
import { getAuth } from "@/lib/auth/session"
import { publicUser } from "@/lib/game/state"

export async function GET() {
  try {
    const ctx = await getAuth()
    if (!ctx) return json({ ok: true, user: null })
    return json({ ok: true, user: publicUser(ctx.user) })
  } catch (err) {
    return handleError(err)
  }
}
