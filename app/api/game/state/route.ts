import { handleError, json } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { consumeApiRequest } from "@/lib/game/rate-limit"
import { buildGameState } from "@/lib/game/state"

export async function GET() {
  try {
    const { user } = await requireAuth()
    await consumeApiRequest(user.id)
    return json({ ok: true, state: await buildGameState(user.id) })
  } catch (err) {
    return handleError(err)
  }
}
