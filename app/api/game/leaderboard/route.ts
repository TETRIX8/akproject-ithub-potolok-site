import { handleError, json } from "@/lib/api/respond"
import { requireAuth } from "@/lib/auth/session"
import { leaderboard } from "@/lib/game/leaderboard"
import { consumeApiRequest } from "@/lib/game/rate-limit"

export async function GET() {
  try {
    const { user } = await requireAuth()
    await consumeApiRequest(user.id)
    return json({ ok: true, ...(await leaderboard(user.id)) })
  } catch (err) {
    return handleError(err)
  }
}
